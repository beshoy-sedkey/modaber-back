import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ORDER_CONFIRMATION_QUEUE } from './order-confirmation.service';
import {
  OrderConfirmationAgentService,
  JOB_START_CONVERSATION,
  JOB_EXPIRE_CONVERSATION,
} from './order-confirmation-agent.service';

interface ConversationJobData {
  readonly merchantId: string;
  readonly orderId: string;
}

@Processor(ORDER_CONFIRMATION_QUEUE)
export class OrderConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderConfirmationProcessor.name);

  constructor(private readonly agentService: OrderConfirmationAgentService) {
    super();
  }

  async process(job: Job<ConversationJobData>): Promise<void> {
    const { merchantId, orderId } = job.data;

    switch (job.name) {
      case JOB_START_CONVERSATION:
        this.logger.log(`Starting conversation: orderId=${orderId} merchantId=${merchantId}`);
        await this.agentService.startConversation(merchantId, orderId);
        break;

      case JOB_EXPIRE_CONVERSATION:
        this.logger.log(`Expiring conversation: orderId=${orderId} merchantId=${merchantId}`);
        await this.agentService.expireConversation(merchantId, orderId);
        break;

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }
}
