import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  Headers,
  Req,
  Res,
  HttpCode,
  UseGuards,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Request, Response } from 'express';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { WhatsAppConfigDto } from './dto/whatsapp-config.dto';
import { WhatsAppWebhookPayload } from './interfaces/whatsapp-message.interface';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(private readonly whatsappService: WhatsAppService) {}

  // ── Public: Meta webhook verification (GET) ───────────────────────────────

  @Get('webhook')
  @ApiOperation({
    summary: 'Meta webhook verification challenge — public endpoint',
  })
  @ApiQuery({ name: 'hub.mode', required: true })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Query('hub.phone_number_id') phoneNumberId: string,
    @Res() res: Response,
  ): Promise<void> {
    // Attempt to find matching config by verify token
    // For global verification we accept if mode = subscribe and challenge present.
    // Per-merchant verification is enforced by matching the verify token in the config.
    if (mode !== 'subscribe' || !challenge) {
      res.status(403).send('Forbidden');
      return;
    }

    if (phoneNumberId) {
      const cfg =
        await this.whatsappService.getConfigByPhoneNumberId(phoneNumberId);
      if (!cfg || cfg.webhookVerifyToken !== verifyToken) {
        this.logger.warn(
          `Webhook verify token mismatch for phoneNumberId=${phoneNumberId}`,
        );
        res.status(403).send('Forbidden');
        return;
      }
    } else if (!verifyToken) {
      res.status(403).send('Forbidden');
      return;
    }

    res.status(200).send(challenge);
  }

  // ── Public: receive incoming messages (POST) ───────────────────────────────

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive incoming WhatsApp messages from Meta — public endpoint',
  })
  async receiveWebhook(
    @Headers('x-hub-signature-256') signatureHeader: string,
    @Req() req: Request,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body');
    }

    const payload = JSON.parse(rawBody.toString()) as WhatsAppWebhookPayload;

    // Determine phoneNumberId from payload for per-merchant HMAC verification
    const phoneNumberId =
      payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (phoneNumberId && signatureHeader) {
      const cfg =
        await this.whatsappService.getConfigByPhoneNumberId(phoneNumberId);

      if (cfg?.appSecret) {
        const expectedSig =
          'sha256=' +
          crypto
            .createHmac('sha256', cfg.appSecret)
            .update(rawBody)
            .digest('hex');

        if (expectedSig !== signatureHeader) {
          this.logger.warn(
            `Invalid X-Hub-Signature-256 for phoneNumberId=${phoneNumberId}`,
          );
          throw new UnauthorizedException('Invalid webhook signature');
        }
      }
    }

    if (payload.object === 'whatsapp_business_account' && phoneNumberId) {
      await this.whatsappService.processIncomingWebhook(phoneNumberId, payload);
    } else {
      this.logger.debug(`Ignored webhook object=${payload.object}`);
    }

    return { received: true };
  }

  // ── Protected: send message ───────────────────────────────────────────────

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Enqueue a WhatsApp message for async delivery' })
  async sendMessage(
    @CurrentMerchant() merchant: JwtPayload,
    @Body() dto: SendMessageDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.whatsappService.enqueueSendMessage(
      merchant.merchantId,
      dto.type,
      dto.to,
      {
        message: dto.message,
        previewUrl: dto.previewUrl,
        templateName: dto.templateName,
        languageCode: dto.languageCode,
        components: dto.components,
        interactive: dto.interactive,
      },
    );

    return { success: true, message: 'Message queued for delivery' };
  }

  // ── Protected: config ────────────────────────────────────────────────────

  @Get('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Get WhatsApp config for the current merchant' })
  async getConfig(
    @CurrentMerchant() merchant: JwtPayload,
  ): Promise<{ success: boolean; data: object }> {
    const data = await this.whatsappService.getConfig(merchant.merchantId);
    return { success: true, data };
  }

  @Put('config')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Save WhatsApp config for the current merchant' })
  async saveConfig(
    @CurrentMerchant() merchant: JwtPayload,
    @Body() dto: WhatsAppConfigDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.whatsappService.saveConfig(merchant.merchantId, dto);
    return { success: true, message: 'WhatsApp configuration saved' };
  }
}
