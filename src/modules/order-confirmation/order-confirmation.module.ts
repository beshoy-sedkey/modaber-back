import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { WhatsAppModule } from 'src/modules/whatsapp/whatsapp.module';
import { ORDER_CONFIRMATION_QUEUE, OrderConfirmationService } from './order-confirmation.service';
import { OrderConfirmationAgentService } from './order-confirmation-agent.service';
import { OrderConfirmationProcessor } from './order-confirmation.processor';
import { OrderConfirmationController } from './order-confirmation.controller';

@Module({
  imports: [
    PrismaModule,
    WhatsAppModule,
    BullModule.registerQueue({ name: ORDER_CONFIRMATION_QUEUE }),
  ],
  controllers: [OrderConfirmationController],
  providers: [
    OrderConfirmationService,
    OrderConfirmationAgentService,
    OrderConfirmationProcessor,
  ],
  exports: [OrderConfirmationService],
})
export class OrderConfirmationModule {}
