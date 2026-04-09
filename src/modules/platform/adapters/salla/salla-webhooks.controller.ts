import {
  Controller,
  Post,
  Headers,
  Body,
  HttpCode,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_SALLA_WEBHOOKS } from '../../platform.module';

interface SallaWebhookBody {
  event: string;
  merchant: number;
  data: Record<string, unknown>;
  created_at?: string;
}

@Controller('webhooks/salla')
export class SallaWebhooksController {
  private readonly logger = new Logger(SallaWebhooksController.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectQueue(QUEUE_SALLA_WEBHOOKS) private readonly queue: Queue,
    private readonly config: ConfigService,
  ) {
    this.webhookSecret = this.config.get<string>('SALLA_WEBHOOK_SECRET', '');
  }

  @Post()
  @HttpCode(200)
  async handle(
    @Headers('authorization') authHeader: string,
    @Body() body: SallaWebhookBody,
  ): Promise<{ received: boolean }> {
    // Salla uses Authorization header token comparison
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || token !== this.webhookSecret) {
      this.logger.warn(`Invalid Salla webhook token for event: ${body?.event}`);
      throw new UnauthorizedException('Invalid webhook token');
    }

    const { event, merchant: merchantStoreId, data } = body;
    if (!event) {
      throw new UnauthorizedException('Missing event type');
    }

    await this.queue.add(
      event,
      { event, merchantStoreId: String(merchantStoreId), data },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    this.logger.log(`Salla webhook queued: ${event} for store: ${merchantStoreId}`);
    return { received: true };
  }
}
