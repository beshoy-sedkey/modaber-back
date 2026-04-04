import {
  Controller,
  Post,
  Headers,
  Req,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { QUEUE_SHOPIFY_WEBHOOKS } from '../../platform.module';

@Controller('webhooks/shopify')
export class ShopifyWebhookController {
  private readonly logger = new Logger(ShopifyWebhookController.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectQueue(QUEUE_SHOPIFY_WEBHOOKS) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>('SHOPIFY_API_SECRET', '');
  }

  @Post()
  @HttpCode(200)
  async handle(
    @Headers('x-shopify-hmac-sha256') hmacHeader: string,
    @Headers('x-shopify-topic') topic: string,
    @Headers('x-shopify-shop-domain') shop: string,
    @Req() req: Request,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody) throw new UnauthorizedException('Missing raw body');

    const digest = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('base64');

    if (!hmacHeader || digest !== hmacHeader) {
      this.logger.warn(`Invalid Shopify webhook HMAC from shop: ${shop}`);
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    const payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;

    await this.queue.add(topic, { topic, shop, payload }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 } });
    this.logger.log(`Shopify webhook queued: ${topic} from ${shop}`);

    return { received: true };
  }
}
