import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { SallaAdapter } from './salla.adapter';
import { QUEUE_PRODUCT_SYNC } from '../../platform.module';
import { PlatformType } from '@prisma/client';

const PAGE_SIZE = 50;

@Injectable()
export class SallaSyncService {
  private readonly logger = new Logger(SallaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sallaAdapter: SallaAdapter,
    @InjectQueue(QUEUE_PRODUCT_SYNC) private readonly syncQueue: Queue,
  ) {}

  async syncAllProducts(merchantId: string): Promise<{ synced: number }> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });
    if (!merchant) throw new Error(`Merchant not found: ${merchantId}`);

    const syncedIds = new Set<string>();
    let page = 1;
    let hasMore = true;
    let totalSynced = 0;

    while (hasMore) {
      const products = await this.sallaAdapter.fetchProducts(
        merchant.platformAccessToken,
        merchant.platformStoreId,
        page,
        PAGE_SIZE,
      );

      if (products.length === 0) {
        hasMore = false;
        break;
      }

      for (const p of products) {
        await this.prisma.product.upsert({
          where: {
            merchantId_platformProductId: {
              merchantId,
              platformProductId: p.platformProductId,
            },
          },
          create: {
            merchantId,
            platformProductId: p.platformProductId,
            name: p.name,
            description: p.description,
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            currency: p.currency,
            stockQuantity: p.stockQuantity,
            category: p.category,
            brand: p.brand,
            images: p.images ?? [],
            isActive: p.isActive,
            syncedAt: new Date(),
          },
          update: {
            name: p.name,
            description: p.description,
            price: p.price,
            compareAtPrice: p.compareAtPrice,
            stockQuantity: p.stockQuantity,
            isActive: p.isActive,
            syncedAt: new Date(),
          },
        });
        syncedIds.add(p.platformProductId);
        totalSynced++;
      }

      hasMore = products.length === PAGE_SIZE;
      page++;
    }

    await this.removeStaleProducts(merchantId, syncedIds);
    this.logger.log(`Synced ${totalSynced} products for Salla merchant: ${merchantId}`);
    return { synced: totalSynced };
  }

  async removeStaleProducts(merchantId: string, activePlatformIds: Set<string>): Promise<void> {
    if (activePlatformIds.size === 0) return;

    await this.prisma.product.updateMany({
      where: {
        merchantId,
        isActive: true,
        platformProductId: { notIn: Array.from(activePlatformIds) },
      },
      data: { isActive: false },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async scheduleSyncForAllMerchants(): Promise<void> {
    const merchants = await this.prisma.merchant.findMany({
      where: { isActive: true, platformType: PlatformType.salla },
      select: { id: true },
    });

    for (const merchant of merchants) {
      await this.syncQueue.add(
        'salla-product-sync',
        { merchantId: merchant.id },
        {
          repeat: { every: 60 * 60 * 1000 }, // every hour
          jobId: `salla-sync-${merchant.id}`,
        },
      );
    }

    this.logger.log(`Scheduled sync for ${merchants.length} Salla merchants`);
  }
}
