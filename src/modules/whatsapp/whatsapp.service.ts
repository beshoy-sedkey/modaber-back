import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { EncryptionService } from 'src/shared/encryption/encryption.service';
import { WhatsAppConfigDto } from './dto/whatsapp-config.dto';
import {
  WhatsAppSendRequest,
  WhatsAppSendResponse,
  WhatsAppTemplate,
  WhatsAppInteractive,
  WhatsAppWebhookPayload,
  WhatsAppMessageReceivedEvent,
} from './interfaces/whatsapp-message.interface';
import { SendMessageType } from './dto/send-message.dto';

export const WHATSAPP_QUEUE = 'whatsapp-messages';
export const JOB_SEND_TEXT = 'send-text';
export const JOB_SEND_TEMPLATE = 'send-template';
export const JOB_SEND_INTERACTIVE = 'send-interactive';

// 24 hours in milliseconds — Meta rule: free-form messages only within 24h
// of the last user inbound message. Outside this window, only templates allowed.
const WHATSAPP_24H_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SendTextJobData {
  readonly merchantId: string;
  readonly to: string;
  readonly message: string;
  readonly previewUrl?: boolean;
}

export interface SendTemplateJobData {
  readonly merchantId: string;
  readonly to: string;
  readonly templateName: string;
  readonly languageCode: string;
  readonly components?: WhatsAppTemplate['components'];
}

export interface SendInteractiveJobData {
  readonly merchantId: string;
  readonly to: string;
  readonly interactive: WhatsAppInteractive;
}

export type WhatsAppJobData =
  | SendTextJobData
  | SendTemplateJobData
  | SendInteractiveJobData;

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly config: ConfigService,
    @InjectQueue(WHATSAPP_QUEUE) private readonly queue: Queue,
  ) {
    this.apiVersion = this.config.get<string>('WHATSAPP_API_VERSION', 'v18.0');
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  // ── Config management ─────────────────────────────────────────────────────

  async saveConfig(merchantId: string, dto: WhatsAppConfigDto): Promise<void> {
    const encryptedToken = this.encryption.encrypt(dto.accessToken);
    const encryptedAppSecret = dto.appSecret
      ? this.encryption.encrypt(dto.appSecret)
      : null;

    await this.prisma.whatsAppConfig.upsert({
      where: { merchantId },
      create: {
        merchantId,
        phoneNumberId: dto.phoneNumberId,
        accessToken: encryptedToken,
        webhookVerifyToken: dto.webhookVerifyToken,
        businessAccountId: dto.businessAccountId,
        appSecret: encryptedAppSecret,
        isActive: dto.isActive ?? true,
      },
      update: {
        phoneNumberId: dto.phoneNumberId,
        accessToken: encryptedToken,
        webhookVerifyToken: dto.webhookVerifyToken,
        businessAccountId: dto.businessAccountId,
        ...(encryptedAppSecret !== null ? { appSecret: encryptedAppSecret } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    this.logger.log(`WhatsApp config saved for merchant ${merchantId}`);
  }

  async getConfig(merchantId: string): Promise<{
    id: string;
    merchantId: string;
    phoneNumberId: string;
    accessTokenMasked: string;
    webhookVerifyToken: string;
    businessAccountId: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { merchantId },
    });

    if (!cfg) {
      throw new NotFoundException('WhatsApp configuration not found for this merchant');
    }

    return {
      id: cfg.id,
      merchantId: cfg.merchantId,
      phoneNumberId: cfg.phoneNumberId,
      accessTokenMasked: '****' + cfg.accessToken.slice(-4),
      webhookVerifyToken: cfg.webhookVerifyToken,
      businessAccountId: cfg.businessAccountId,
      isActive: cfg.isActive,
      createdAt: cfg.createdAt,
      updatedAt: cfg.updatedAt,
    };
  }

  async getPhoneNumberId(merchantId: string): Promise<string> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { merchantId },
      select: { phoneNumberId: true, isActive: true },
    });

    if (!cfg || !cfg.isActive) {
      throw new NotFoundException(
        'Active WhatsApp configuration not found for this merchant',
      );
    }

    return cfg.phoneNumberId;
  }

  // ── Webhook verification ──────────────────────────────────────────────────

  verifyWebhookToken(
    token: string,
    mode: string,
    challenge: string,
    verifyToken: string,
  ): string {
    if (mode !== 'subscribe' || token !== verifyToken) {
      throw new BadRequestException('Webhook verification failed: token mismatch');
    }
    return challenge;
  }

  // ── Message sending (sync — for use by processor) ─────────────────────────

  async sendTextMessage(
    merchantId: string,
    to: string,
    message: string,
    previewUrl = false,
  ): Promise<WhatsAppSendResponse> {
    await this.assertWithin24hWindow(merchantId, to);

    const { phoneNumberId, accessToken } = await this.getActiveConfig(merchantId);

    const payload: WhatsAppSendRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message, preview_url: previewUrl },
    };

    return this.callMetaApi(phoneNumberId, accessToken, payload);
  }

  async sendTemplateMessage(
    merchantId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: WhatsAppTemplate['components'],
  ): Promise<WhatsAppSendResponse> {
    const { phoneNumberId, accessToken } = await this.getActiveConfig(merchantId);

    const payload: WhatsAppSendRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components ? { components } : {}),
      },
    };

    return this.callMetaApi(phoneNumberId, accessToken, payload);
  }

  async sendInteractiveMessage(
    merchantId: string,
    to: string,
    interactive: WhatsAppInteractive,
  ): Promise<WhatsAppSendResponse> {
    await this.assertWithin24hWindow(merchantId, to);

    const { phoneNumberId, accessToken } = await this.getActiveConfig(merchantId);

    const payload: WhatsAppSendRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive,
    };

    return this.callMetaApi(phoneNumberId, accessToken, payload);
  }

  // ── Async enqueue (for controller use) ───────────────────────────────────

  async enqueueSendText(
    merchantId: string,
    to: string,
    message: string,
    previewUrl?: boolean,
  ): Promise<void> {
    const data: SendTextJobData = { merchantId, to, message, previewUrl };
    await this.queue.add(JOB_SEND_TEXT, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    this.logger.log(`Enqueued send-text job for merchant=${merchantId} to=${to}`);
  }

  async enqueueSendTemplate(
    merchantId: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: WhatsAppTemplate['components'],
  ): Promise<void> {
    const data: SendTemplateJobData = { merchantId, to, templateName, languageCode, components };
    await this.queue.add(JOB_SEND_TEMPLATE, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    this.logger.log(`Enqueued send-template job for merchant=${merchantId} to=${to}`);
  }

  async enqueueSendInteractive(
    merchantId: string,
    to: string,
    interactive: WhatsAppInteractive,
  ): Promise<void> {
    const data: SendInteractiveJobData = { merchantId, to, interactive };
    await this.queue.add(JOB_SEND_INTERACTIVE, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    this.logger.log(`Enqueued send-interactive job for merchant=${merchantId} to=${to}`);
  }

  // ── Incoming webhook processing ───────────────────────────────────────────

  async processIncomingWebhook(
    phoneNumberId: string,
    payload: WhatsAppWebhookPayload,
  ): Promise<void> {
    const cfg = await this.prisma.whatsAppConfig.findFirst({
      where: { phoneNumberId, isActive: true },
    });

    if (!cfg) {
      this.logger.warn(`No active config for phoneNumberId=${phoneNumberId}`);
      return;
    }

    const { merchantId } = cfg;

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { messages, statuses } = change.value;

        if (statuses?.length) {
          // Status updates (delivered, read) — log only
          for (const status of statuses) {
            this.logger.debug(
              `WhatsApp status update: msgId=${status.id} status=${status.status} merchant=${merchantId}`,
            );
          }
        }

        if (messages?.length) {
          for (const msg of messages) {
            const content = this.extractMessageContent(msg);
            const timestamp = new Date(Number(msg.timestamp) * 1000);

            // Persist incoming message for 24h window tracking
            await this.prisma.whatsAppMessage.create({
              data: {
                merchantId,
                whatsappMsgId: msg.id,
                from: msg.from,
                to: change.value.metadata.phone_number_id,
                messageType: msg.type,
                content,
                direction: 'inbound',
                timestamp,
                rawPayload: payload as unknown as import('@prisma/client').Prisma.InputJsonValue,
                configId: cfg.id,
              },
            });

            const event: WhatsAppMessageReceivedEvent = {
              merchantId,
              configId: cfg.id,
              from: msg.from,
              messageId: msg.id,
              messageType: msg.type,
              content,
              timestamp,
              rawPayload: payload,
            };

            this.eventEmitter.emit('whatsapp.message.received', event);

            this.logger.log(
              `Received WhatsApp message from=${msg.from} type=${msg.type} merchant=${merchantId}`,
            );
          }
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getActiveConfig(
    merchantId: string,
  ): Promise<{ phoneNumberId: string; accessToken: string }> {
    const cfg = await this.prisma.whatsAppConfig.findUnique({
      where: { merchantId },
      select: {
        phoneNumberId: true,
        accessToken: true,
        isActive: true,
      },
    });

    if (!cfg || !cfg.isActive) {
      throw new NotFoundException(
        'Active WhatsApp configuration not found for this merchant',
      );
    }

    return {
      phoneNumberId: cfg.phoneNumberId,
      accessToken: this.encryption.decrypt(cfg.accessToken),
    };
  }

  private async assertWithin24hWindow(
    merchantId: string,
    to: string,
  ): Promise<void> {
    // Meta's 24h rule: free-form messages only allowed within 24h of last inbound
    const cutoff = new Date(Date.now() - WHATSAPP_24H_WINDOW_MS);
    const lastInbound = await this.prisma.whatsAppMessage.findFirst({
      where: {
        merchantId,
        from: to,
        direction: 'inbound',
        timestamp: { gte: cutoff },
      },
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    if (!lastInbound) {
      throw new BadRequestException(
        `Cannot send free-form message to ${to}: no inbound message within the last 24 hours. ` +
          'Use sendTemplateMessage instead.',
      );
    }
  }

  private async callMetaApi(
    phoneNumberId: string,
    accessToken: string,
    payload: WhatsAppSendRequest,
  ): Promise<WhatsAppSendResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;

    try {
      const response = await axios.post<WhatsAppSendResponse>(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      });
      return response.data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Meta API error: ${message}`, { phoneNumberId, payload });
      throw new BadRequestException(`Failed to send WhatsApp message: ${message}`);
    }
  }

  private extractMessageContent(msg: {
    type: string;
    text?: { body: string };
    interactive?: {
      type: string;
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
  }): string {
    if (msg.type === 'text' && msg.text) {
      return msg.text.body;
    }
    if (msg.type === 'interactive' && msg.interactive) {
      const reply =
        msg.interactive.button_reply ?? msg.interactive.list_reply;
      return reply ? reply.title : msg.type;
    }
    return msg.type;
  }

  async getConfigByPhoneNumberId(
    phoneNumberId: string,
  ): Promise<{ webhookVerifyToken: string; appSecret: string | null } | null> {
    const cfg = await this.prisma.whatsAppConfig.findFirst({
      where: { phoneNumberId, isActive: true },
      select: { webhookVerifyToken: true, appSecret: true },
    });

    if (!cfg) return null;

    return {
      webhookVerifyToken: cfg.webhookVerifyToken,
      appSecret: cfg.appSecret ? this.encryption.decrypt(cfg.appSecret) : null,
    };
  }

  async enqueueSendMessage(
    merchantId: string,
    type: SendMessageType,
    to: string,
    options: {
      message?: string;
      previewUrl?: boolean;
      templateName?: string;
      languageCode?: string;
      components?: WhatsAppTemplate['components'];
      interactive?: WhatsAppInteractive;
    },
  ): Promise<void> {
    switch (type) {
      case SendMessageType.text:
        if (!options.message) {
          throw new BadRequestException('message is required for type=text');
        }
        await this.enqueueSendText(merchantId, to, options.message, options.previewUrl);
        break;

      case SendMessageType.template:
        if (!options.templateName || !options.languageCode) {
          throw new BadRequestException(
            'templateName and languageCode are required for type=template',
          );
        }
        await this.enqueueSendTemplate(
          merchantId,
          to,
          options.templateName,
          options.languageCode,
          options.components,
        );
        break;

      case SendMessageType.interactive:
        if (!options.interactive) {
          throw new BadRequestException('interactive is required for type=interactive');
        }
        await this.enqueueSendInteractive(merchantId, to, options.interactive);
        break;

      default:
        throw new BadRequestException(`Unknown message type`);
    }
  }
}
