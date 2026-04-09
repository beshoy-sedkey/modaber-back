import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { SallaSyncService } from '../salla-sync.service';
import { SallaAdapter } from '../salla.adapter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { QUEUE_PRODUCT_SYNC } from '../../../platform.module';
import { PlatformType } from '@prisma/client';

describe('SallaSyncService', () => {
  let service: SallaSyncService;
  let prisma: jest.Mocked<PrismaService>;
  let adapter: jest.Mocked<SallaAdapter>;

  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SallaSyncService,
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
          provide: SallaAdapter,
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

    service = module.get<SallaSyncService>(SallaSyncService);
    prisma = module.get(PrismaService);
    adapter = module.get(SallaAdapter);
    mockQueue.add.mockClear();
  });

  describe('syncAllProducts', () => {
    it('should sync products and return count with merchantId filter', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-1',
        platformAccessToken: 'salla-token',
        platformStoreId: 'my-salla-store',
      });
      (adapter.fetchProducts as jest.Mock)
        .mockResolvedValueOnce([
          { platformProductId: 'sp1', name: 'Product 1', price: 50, currency: 'SAR', stockQuantity: 10, isActive: true },
          { platformProductId: 'sp2', name: 'Product 2', price: 75, currency: 'SAR', stockQuantity: 5, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      (prisma.product.upsert as jest.Mock).mockResolvedValue({});
      (prisma.product.updateMany as jest.Mock).mockResolvedValue({});

      const result = await service.syncAllProducts('merchant-1');

      expect(result.synced).toBe(2);
      expect(prisma.product.upsert).toHaveBeenCalledTimes(2);
      // Verify merchantId isolation: each upsert uses the correct merchantId
      expect(prisma.product.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId_platformProductId: { merchantId: 'merchant-1', platformProductId: 'sp1' } },
          create: expect.objectContaining({ merchantId: 'merchant-1' }),
        }),
      );
    });

    it('should handle pagination correctly — stops when page returns fewer than PAGE_SIZE', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-2',
        platformAccessToken: 'token',
        platformStoreId: 'store-2',
      });
      // Return exactly 50 products on page 1, then 20 on page 2 (stops because < 50)
      const page1 = Array.from({ length: 50 }, (_, i) => ({
        platformProductId: `p${i}`,
        name: `P${i}`,
        price: 10,
        currency: 'SAR',
        stockQuantity: 1,
        isActive: true,
      }));
      const page2 = Array.from({ length: 20 }, (_, i) => ({
        platformProductId: `p${50 + i}`,
        name: `P${50 + i}`,
        price: 10,
        currency: 'SAR',
        stockQuantity: 1,
        isActive: true,
      }));

      (adapter.fetchProducts as jest.Mock)
        .mockResolvedValueOnce(page1)
        .mockResolvedValueOnce(page2);
      (prisma.product.upsert as jest.Mock).mockResolvedValue({});
      (prisma.product.updateMany as jest.Mock).mockResolvedValue({});

      const result = await service.syncAllProducts('merchant-2');

      expect(result.synced).toBe(70);
      expect(adapter.fetchProducts).toHaveBeenCalledTimes(2);
    });

    it('should deactivate stale products after sync', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-3',
        platformAccessToken: 'token',
        platformStoreId: 'store-3',
      });
      (adapter.fetchProducts as jest.Mock).mockResolvedValueOnce([
        { platformProductId: 'active-p', name: 'Active', price: 10, currency: 'SAR', stockQuantity: 1, isActive: true },
      ]).mockResolvedValueOnce([]);
      (prisma.product.upsert as jest.Mock).mockResolvedValue({});
      (prisma.product.updateMany as jest.Mock).mockResolvedValue({});

      await service.syncAllProducts('merchant-3');

      // Verify stale product removal uses merchantId
      expect(prisma.product.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: 'merchant-3' }),
          data: { isActive: false },
        }),
      );
    });

    it('should throw when merchant not found', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.syncAllProducts('non-existent')).rejects.toThrow('Merchant not found');
    });

    it('should handle empty product list without stale deactivation', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-4',
        platformAccessToken: 'token',
        platformStoreId: 'store-4',
      });
      (adapter.fetchProducts as jest.Mock).mockResolvedValueOnce([]);
      (prisma.product.updateMany as jest.Mock).mockResolvedValue({});

      const result = await service.syncAllProducts('merchant-4');

      expect(result.synced).toBe(0);
      // removeStaleProducts exits early if syncedIds is empty — no updateMany call
      expect(prisma.product.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('scheduleSyncForAllMerchants', () => {
    it('should schedule sync jobs only for active Salla merchants', async () => {
      (prisma.merchant.findMany as jest.Mock).mockResolvedValue([
        { id: 'salla-merchant-1' },
        { id: 'salla-merchant-2' },
      ]);

      await service.scheduleSyncForAllMerchants();

      expect(prisma.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true, platformType: PlatformType.salla },
        }),
      );
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'salla-product-sync',
        { merchantId: 'salla-merchant-1' },
        expect.objectContaining({ jobId: 'salla-sync-salla-merchant-1' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        'salla-product-sync',
        { merchantId: 'salla-merchant-2' },
        expect.objectContaining({ jobId: 'salla-sync-salla-merchant-2' }),
      );
    });

    it('should do nothing when no Salla merchants found', async () => {
      (prisma.merchant.findMany as jest.Mock).mockResolvedValue([]);
      await service.scheduleSyncForAllMerchants();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });
});
