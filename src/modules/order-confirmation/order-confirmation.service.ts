import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { WhatsAppService } from 'src/modules/whatsapp/whatsapp.service';
import { OrderUpdatedEvent } from 'src/modules/platform/events/order-updated.event';
import { OrderStatus, Prisma } from '@prisma/client';

export const ORDER_CONFIRMATION_QUEUE = 'order-confirmation';

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { customer: true; items: true };
}>;

@Injectable()
export class OrderConfirmationService {
  private readonly logger = new Logger(OrderConfirmationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappService: WhatsAppService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async manualConfirm(merchantId: string, orderId: string, notes?: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
      include: { customer: true, items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.confirmed,
        confirmedAt: new Date(),
        ...(notes ? { notes } : {}),
      },
    });

    this.eventEmitter.emit(
      'order.updated',
      new OrderUpdatedEvent(merchantId, orderId, OrderStatus.confirmed),
    );

    if (order.customer.phone) {
      await this.sendConfirmationWhatsApp(order);
    }

    this.logger.log(`Order manually confirmed: orderId=${orderId} merchantId=${merchantId}`);
  }

  async manualFlag(merchantId: string, orderId: string, notes?: string): Promise<void> {
    const exists = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
      select: { id: true },
    });

    if (!exists) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.confirming,
        ...(notes ? { notes } : {}),
      },
    });

    this.eventEmitter.emit(
      'order.updated',
      new OrderUpdatedEvent(merchantId, orderId, OrderStatus.confirming),
    );

    this.logger.log(`Order manually flagged: orderId=${orderId} merchantId=${merchantId}`);
  }

  private async sendConfirmationWhatsApp(order: OrderWithRelations): Promise<void> {
    const phone = order.customer.phone;
    if (!phone) return;

    const components = [
      {
        type: 'body' as const,
        parameters: [
          { type: 'text' as const, text: order.customer.name },
          {
            type: 'text' as const,
            text: `${Number(order.total).toFixed(2)} ${order.currency}`,
          },
        ],
      },
    ];

    try {
      await this.whatsappService.enqueueSendTemplate(
        order.merchantId,
        phone,
        'order_confirmation',
        'ar',
        components,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to enqueue WhatsApp confirmation: orderId=${order.id} error=${message}`,
      );
    }
  }
}
