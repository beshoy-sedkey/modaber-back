import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ShopifySyncService } from '../shopify-sync.service';
import { ShopifyAdapter } from '../shopify.adapter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { QUEUE_PRODUCT_SYNC } from '../../../platform.module';
import { PlatformType } from '@prisma/client';

describe('ShopifySyncService', () => {
  let service: ShopifySyncService;
  let prisma: jest.Mocked<PrismaService>;
  let adapter: jest.Mocked<ShopifyAdapter>;

  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifySyncService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            product: {
              upsert: jest.fn(),
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: ShopifyAdapter,
          useValue: {
            fetchProducts: jest.fn(),
          },
        },
        {
          provide: getQueueToken(QUEUE_PRODUCT_SYNC),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<ShopifySyncService>(ShopifySyncService);
    prisma = module.get(PrismaService);
    adapter = module.get(ShopifyAdapter);
  });

  describe('syncAllProducts', () => {
    it('should sync products and return count', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-1',
        platformAccessToken: 'token',
        platformStoreId: 'test.myshopify.com',
      });
      (adapter.fetchProducts as jest.Mock).mockResolvedValueOnce([
        { platformProductId: 'p1', name: 'P1', price: 10, currency: 'SAR', stockQuantity: 5, isActive: true },
      ]).mockResolvedValueOnce([]);
      (prisma.product.upsert as jest.Mock).mockResolvedValue({});
      (prisma.product.updateMany as jest.Mock).mockResolvedValue({});

      const result = await service.syncAllProducts('merchant-1');
      expect(result.synced).toBe(1);
      expect(prisma.product.upsert).toHaveBeenCalledTimes(1);
    });

    it('should throw when merchant not found', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.syncAllProducts('bad-id')).rejects.toThrow('Merchant not found');
    });
  });

  describe('scheduleSyncForAllMerchants', () => {
    it('should schedule sync jobs for all active Shopify merchants', async () => {
      (prisma.merchant.findMany as jest.Mock).mockResolvedValue([
        { id: 'merchant-1' },
        { id: 'merchant-2' },
      ]);

      await service.scheduleSyncForAllMerchants();
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'shopify-product-sync',
        { merchantId: 'merchant-1' },
        expect.objectContaining({ jobId: 'shopify-sync-merchant-1' }),
      );
    });
  });
});
