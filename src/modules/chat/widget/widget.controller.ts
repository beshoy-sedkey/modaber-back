import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiBody } from '@nestjs/swagger';
import { Response } from 'express';
import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ChatService } from '../chat.service';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class WidgetMessageDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  sessionId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * Public endpoints for the embeddable chat widget.
 *
 * Routes:
 *   GET  /widget/:apiKey/chat.js   — serves the compiled widget bundle
 *   POST /widget/:apiKey/message   — processes visitor messages
 *
 * Both routes are intentionally public (no JwtAuthGuard) because they
 * are called from storefront pages in the visitor's browser.
 * The apiKey (merchant UUID) acts as the public tenant identifier.
 *
 * CORS: app.enableCors() in main.ts covers all routes. The * origin allows
 * Shopify / Salla storefronts to call these endpoints cross-origin.
 */
@ApiTags('Widget')
@Controller('widget')
export class WidgetController {
  private readonly logger = new Logger(WidgetController.name);

  constructor(private readonly chatService: ChatService) {}

  // ── GET /widget/:apiKey/chat.js ───────────────────────────────────────────

  @Get(':apiKey/chat.js')
  @ApiOperation({
    summary: 'Serve the embeddable chat widget JavaScript',
    description:
      'Returns a self-contained JavaScript bundle. Merchants embed it via ' +
      '<script src="/widget/{apiKey}/chat.js"></script>. The apiKey is the merchant UUID.',
  })
  @ApiParam({ name: 'apiKey', description: 'Merchant UUID (public identifier)' })
  async serveWidget(
    @Param('apiKey') apiKey: string,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.debug(`Widget requested for apiKey=${apiKey}`);

    const script = await this.chatService.getWidgetScript(apiKey);

    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(script);
  }

  // ── POST /widget/:apiKey/message ──────────────────────────────────────────

  @Post(':apiKey/message')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Handle a visitor chat message',
    description:
      'Receives a visitor message from the embedded widget, persists it, ' +
      'and returns an AI-generated (or stub) reply.',
  })
  @ApiParam({ name: 'apiKey', description: 'Merchant UUID (public identifier)' })
  @ApiBody({ type: WidgetMessageDto })
  async handleMessage(
    @Param('apiKey') apiKey: string,
    @Body() dto: WidgetMessageDto,
  ): Promise<{
    success: boolean;
    data: { reply: string; conversationId: string; sessionId: string };
  }> {
    if (!dto.sessionId || !dto.message) {
      throw new BadRequestException('sessionId and message are required');
    }

    const result = await this.chatService.handleMessage(
      apiKey,
      dto.sessionId,
      dto.message,
    );

    return { success: true, data: result };
  }
}
