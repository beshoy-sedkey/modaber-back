import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  WHATSAPP_QUEUE,
  JOB_SEND_TEXT,
  JOB_SEND_TEMPLATE,
  JOB_SEND_INTERACTIVE,
  SendTextJobData,
  SendTemplateJobData,
  SendInteractiveJobData,
  WhatsAppJobData,
} from './whatsapp.service';
import { WhatsAppService } from './whatsapp.service';

@Processor(WHATSAPP_QUEUE)
export class WhatsAppProcessor extends WorkerHost {
  private readonly logger = new Logger(WhatsAppProcessor.name);

  constructor(private readonly whatsappService: WhatsAppService) {
    super();
  }

  async process(job: Job<WhatsAppJobData>): Promise<void> {
    switch (job.name) {
      case JOB_SEND_TEXT:
        await this.handleSendText(job as Job<SendTextJobData>);
        break;
      case JOB_SEND_TEMPLATE:
        await this.handleSendTemplate(job as Job<SendTemplateJobData>);
        break;
      case JOB_SEND_INTERACTIVE:
        await this.handleSendInteractive(job as Job<SendInteractiveJobData>);
        break;
      default:
        this.logger.warn(`Unknown WhatsApp job type: ${job.name}`);
    }
  }

  private async handleSendText(job: Job<SendTextJobData>): Promise<void> {
    const { merchantId, to, message, previewUrl } = job.data;
    this.logger.log(`[send-text] merchant=${merchantId} to=${to}`);

    await this.whatsappService.sendTextMessage(
      merchantId,
      to,
      message,
      previewUrl ?? false,
    );

    this.logger.log(`[send-text] Delivered to=${to} merchant=${merchantId}`);
  }

  private async handleSendTemplate(job: Job<SendTemplateJobData>): Promise<void> {
    const { merchantId, to, templateName, languageCode, components } = job.data;
    this.logger.log(
      `[send-template] merchant=${merchantId} to=${to} template=${templateName}`,
    );

    await this.whatsappService.sendTemplateMessage(
      merchantId,
      to,
      templateName,
      languageCode,
      components,
    );

    this.logger.log(`[send-template] Delivered to=${to} merchant=${merchantId}`);
  }

  private async handleSendInteractive(
    job: Job<SendInteractiveJobData>,
  ): Promise<void> {
    const { merchantId, to, interactive } = job.data;
    this.logger.log(`[send-interactive] merchant=${merchantId} to=${to}`);

    await this.whatsappService.sendInteractiveMessage(merchantId, to, interactive);

    this.logger.log(`[send-interactive] Delivered to=${to} merchant=${merchantId}`);
  }
}
