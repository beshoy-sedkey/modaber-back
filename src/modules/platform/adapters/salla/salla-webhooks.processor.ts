import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { OrderStatus, PaymentStatus, PlatformType } from '@prisma/client';
import { QUEUE_SALLA_WEBHOOKS } from '../../platform.module';
import { OrderReceivedEvent } from '../../events/order-received.event';
import { OrderUpdatedEvent } from '../../events/order-updated.event';
import { ProductSyncedEvent } from '../../events/product-synced.event';
import { AppUninstalledEvent } from '../../events/app-uninstalled.event';
import { mapSallaProduct, mapSallaOrder, mapSallaCustomer } from './salla-mapper';

interface WebhookJobData {
  event: string;
  merchantStoreId: string;
  data: Record<string, unknown>;
}

@Processor(QUEUE_SALLA_WEBHOOKS)
export class SallaWebhooksProcessor extends WorkerHost {
  private readonly logger = new Logger(SallaWebhooksProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { event, merchantStoreId, data } = job.data;
    this.logger.log(`Processing Salla webhook: ${event} for store: ${merchantStoreId}`);

    const merchant = await this.prisma.merchant.findFirst({
      where: { platformStoreId: merchantStoreId, platformType: PlatformType.salla },
    });

    if (!merchant) {
      this.logger.warn(`No merchant found for Salla store: ${merchantStoreId}`);
      return;
    }

    switch (event) {
      case 'order.created':
        await this.handleOrderCreate(merchant.id, data);
        break;
      case 'order.updated':
        await this.handleOrderUpdate(merchant.id, data);
        break;
      case 'order.status.updated':
        await this.handleOrderStatusUpdate(merchant.id, data);
        break;
      case 'product.created':
      case 'product.updated':
        await this.handleProductUpsert(merchant.id, data);
        break;
      case 'product.deleted':
        await this.handleProductDelete(merchant.id, data);
        break;
      case 'customer.created':
        await this.handleCustomerCreate(merchant.id, data);
        break;
      case 'app.uninstalled':
        await this.handleAppUninstalled(merchant.id, merchantStoreId);
        break;
      case 'app.subscription.started':
        await this.handleSubscriptionStarted(merchant.id);
        break;
      case 'app.subscription.canceled':
        await this.handleSubscriptionCanceled(merchant.id);
        break;
      default:
        this.logger.log(`Unhandled Salla event: ${event}`);
    }
  }

  private async handleOrderCreate(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const mapped = mapSallaOrder(data as unknown as Parameters<typeof mapSallaOrder>[0]);

    // Find or create customer by phone/email
    let customer = await this.prisma.customer.findFirst({
      where: {
        merchantId,
        ...(mapped.customerPhone ? { phone: mapped.customerPhone } : { email: mapped.customerEmail }),
      },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          merchantId,
          name: mapped.customerName ?? 'Unknown',
          phone: mapped.customerPhone,
          email: mapped.customerEmail,
        },
      });
    }

    // Idempotency check
    const existing = await this.prisma.order.findUnique({
      where: { merchantId_platformOrderId: { merchantId, platformOrderId: mapped.platformOrderId } },
    });
    if (existing) return;

    const order = await this.prisma.order.create({
      data: {
        merchantId,
        customerId: customer.id,
        platformOrderId: mapped.platformOrderId,
        status: OrderStatus.pending,
        paymentStatus: mapped.paymentStatus === 'paid' ? PaymentStatus.paid : PaymentStatus.pending,
        paymentMethod: mapped.paymentMethod,
        subtotal: mapped.subtotal,
        discountAmount: mapped.discountAmount,
        shippingCost: mapped.shippingCost,
        total: mapped.total,
        currency: mapped.currency,
        shippingAddress: mapped.shippingAddress
          ? JSON.parse(JSON.stringify(mapped.shippingAddress))
          : undefined,
        notes: mapped.notes,
      },
    });

    this.events.emit('order.received', new OrderReceivedEvent(merchantId, mapped.platformOrderId, order.id));
    this.logger.log(`Order created: ${order.id} for merchant: ${merchantId}`);
  }

  private async handleOrderUpdate(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const mapped = mapSallaOrder(data as unknown as Parameters<typeof mapSallaOrder>[0]);

    await this.prisma.order.updateMany({
      where: { merchantId, platformOrderId: mapped.platformOrderId },
      data: {
        paymentStatus: mapped.paymentStatus === 'paid' ? PaymentStatus.paid : PaymentStatus.pending,
      },
    });

    this.events.emit('order.updated', new OrderUpdatedEvent(merchantId, mapped.platformOrderId, mapped.status));
  }

  private async handleOrderStatusUpdate(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const orderId = String((data as { id?: number }).id ?? '');
    const statusData = (data as { status?: { slug?: string; name?: string } | string }).status;
    const slug =
      typeof statusData === 'object' && statusData !== null
        ? statusData.slug ?? statusData.name ?? 'pending'
        : String(statusData ?? 'pending');

    const orderStatusMap: Record<string, OrderStatus> = {
      pending: OrderStatus.pending,
      processing: OrderStatus.processing,
      shipped: OrderStatus.shipped,
      delivered: OrderStatus.delivered,
      cancelled: OrderStatus.cancelled,
      canceled: OrderStatus.cancelled,
      returned: OrderStatus.returned,
    };

    const newStatus = orderStatusMap[slug] ?? OrderStatus.pending;

    await this.prisma.order.updateMany({
      where: { merchantId, platformOrderId: orderId },
      data: { status: newStatus },
    });

    this.logger.log(`Order ${orderId} status updated to ${newStatus} for merchant: ${merchantId}`);
  }

  private async handleProductUpsert(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const mapped = mapSallaProduct(data as unknown as Parameters<typeof mapSallaProduct>[0]);

    const product = await this.prisma.product.upsert({
      where: { merchantId_platformProductId: { merchantId, platformProductId: mapped.platformProductId } },
      create: {
        merchantId,
        platformProductId: mapped.platformProductId,
        name: mapped.name,
        description: mapped.description,
        price: mapped.price,
        compareAtPrice: mapped.compareAtPrice,
        currency: mapped.currency,
        stockQuantity: mapped.stockQuantity,
        category: mapped.category,
        brand: mapped.brand,
        images: mapped.images ?? [],
        isActive: mapped.isActive,
        syncedAt: new Date(),
      },
      update: {
        name: mapped.name,
        description: mapped.description,
        price: mapped.price,
        stockQuantity: mapped.stockQuantity,
        isActive: mapped.isActive,
        syncedAt: new Date(),
      },
    });

    this.events.emit('product.synced', new ProductSyncedEvent(merchantId, mapped.platformProductId, product.id));
  }

  private async handleProductDelete(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const productId = String((data as { id?: number }).id ?? '');
    await this.prisma.product.updateMany({
      where: { merchantId, platformProductId: productId },
      data: { isActive: false },
    });
  }

  private async handleCustomerCreate(merchantId: string, data: Record<string, unknown>): Promise<void> {
    const mapped = mapSallaCustomer(data as unknown as Parameters<typeof mapSallaCustomer>[0]);

    const existing = await this.prisma.customer.findFirst({
      where: {
        merchantId,
        ...(mapped.phone ? { phone: mapped.phone } : { email: mapped.email }),
      },
    });

    if (!existing) {
      await this.prisma.customer.create({
        data: {
          merchantId,
          name: mapped.name,
          phone: mapped.phone,
          email: mapped.email,
          city: mapped.city,
          country: mapped.country,
          totalOrders: mapped.totalOrders,
          totalSpent: mapped.totalSpent,
        },
      });
      this.logger.log(`Customer created for merchant: ${merchantId}`);
    }
  }

  private async handleAppUninstalled(merchantId: string, storeId: string): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: false, needsReauth: true },
    });
    this.events.emit('app.uninstalled', new AppUninstalledEvent(merchantId, storeId));
    this.logger.log(`Merchant deactivated: ${merchantId}`);
  }

  private async handleSubscriptionStarted(merchantId: string): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: true },
    });
    this.logger.log(`Subscription started for merchant: ${merchantId}`);
  }

  private async handleSubscriptionCanceled(merchantId: string): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: false },
    });
    this.logger.log(`Subscription canceled for merchant: ${merchantId}`);
  }
}
