import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { OrderStatus, PaymentStatus, PlatformType } from '@prisma/client';
import { QUEUE_SHOPIFY_WEBHOOKS } from '../../platform.module';
import { OrderReceivedEvent } from '../../events/order-received.event';
import { ProductSyncedEvent } from '../../events/product-synced.event';
import { AppUninstalledEvent } from '../../events/app-uninstalled.event';
import { mapShopifyProduct, mapShopifyOrder } from './shopify-mapper';

interface WebhookJobData {
  topic: string;
  shop: string;
  payload: Record<string, unknown>;
}

@Processor(QUEUE_SHOPIFY_WEBHOOKS)
export class ShopifyWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyWebhookProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { topic, shop, payload } = job.data;
    this.logger.log(`Processing Shopify webhook: ${topic} for ${shop}`);

    const merchant = await this.prisma.merchant.findFirst({
      where: { platformStoreId: shop, platformType: PlatformType.shopify },
    });
    if (!merchant) {
      this.logger.warn(`No merchant found for shop: ${shop}`);
      return;
    }

    switch (topic) {
      case 'orders/create':
        await this.handleOrderCreate(merchant.id, payload);
        break;
      case 'orders/updated':
        await this.handleOrderUpdate(merchant.id, payload);
        break;
      case 'products/create':
      case 'products/update':
        await this.handleProductUpsert(merchant.id, payload);
        break;
      case 'products/delete':
        await this.handleProductDelete(merchant.id, payload);
        break;
      case 'app/uninstalled':
        await this.handleAppUninstalled(merchant.id, shop);
        break;
      default:
        this.logger.log(`Unhandled topic: ${topic}`);
    }
  }

  private async handleOrderCreate(merchantId: string, payload: Record<string, unknown>): Promise<void> {
    const mapped = mapShopifyOrder(payload as unknown as Parameters<typeof mapShopifyOrder>[0]);

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
        shippingAddress: mapped.shippingAddress ? JSON.parse(JSON.stringify(mapped.shippingAddress)) : undefined,
        notes: mapped.notes,
      },
    });

    this.events.emit('order.received', new OrderReceivedEvent(merchantId, mapped.platformOrderId, order.id));
    this.logger.log(`Order created: ${order.id} for merchant: ${merchantId}`);
  }

  private async handleOrderUpdate(merchantId: string, payload: Record<string, unknown>): Promise<void> {
    const mapped = mapShopifyOrder(payload as unknown as Parameters<typeof mapShopifyOrder>[0]);

    await this.prisma.order.updateMany({
      where: { merchantId, platformOrderId: mapped.platformOrderId },
      data: {
        paymentStatus: mapped.paymentStatus === 'paid' ? PaymentStatus.paid : PaymentStatus.pending,
      },
    });
  }

  private async handleProductUpsert(merchantId: string, payload: Record<string, unknown>): Promise<void> {
    const mapped = mapShopifyProduct(payload as unknown as Parameters<typeof mapShopifyProduct>[0]);

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

  private async handleProductDelete(merchantId: string, payload: Record<string, unknown>): Promise<void> {
    const productId = String((payload as { id: number }).id);
    await this.prisma.product.updateMany({
      where: { merchantId, platformProductId: productId },
      data: { isActive: false },
    });
  }

  private async handleAppUninstalled(merchantId: string, shop: string): Promise<void> {
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { isActive: false, needsReauth: true },
    });
    this.events.emit('app.uninstalled', new AppUninstalledEvent(merchantId, shop));
    this.logger.log(`Merchant deactivated: ${merchantId}`);
  }
}
