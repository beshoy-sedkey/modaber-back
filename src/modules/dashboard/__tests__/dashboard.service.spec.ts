import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from '../dashboard.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';

const MERCHANT_ID = 'merchant-uuid-1';
const OTHER_MERCHANT_ID = 'merchant-uuid-2';

describe('DashboardService', () => {
  let service: DashboardService;
  let prisma: {
    order: {
      count: jest.Mock;
      aggregate: jest.Mock;
      findMany: jest.Mock;
    };
    product: {
      count: jest.Mock;
    };
    customer: {
      count: jest.Mock;
    };
    shipment: {
      count: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        count: jest.fn(),
        aggregate: jest.fn(),
        findMany: jest.fn(),
      },
      product: {
        count: jest.fn(),
      },
      customer: {
        count: jest.fn(),
      },
      shipment: {
        count: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getOverview ────────────────────────────────────────────────────────────

  describe('getOverview', () => {
    it('should return overview KPIs filtered by merchantId', async () => {
      prisma.order.count
        .mockResolvedValueOnce(15)   // totalOrders
        .mockResolvedValueOnce(3)    // pendingOrders
      prisma.product.count
        .mockResolvedValueOnce(10)   // totalProducts
        .mockResolvedValueOnce(2);   // lowStockProducts
      prisma.customer.count.mockResolvedValue(5);
      prisma.shipment.count.mockResolvedValue(4);
      prisma.order.aggregate
        .mockResolvedValueOnce({ _count: { id: 2 }, _sum: { total: 500 } }) // today
        .mockResolvedValueOnce({ _sum: { total: 12000 } });                  // total revenue

      const result = await service.getOverview(MERCHANT_ID);

      expect(result.totalOrders).toBe(15);
      expect(result.totalProducts).toBe(10);
      expect(result.totalCustomers).toBe(5);
      expect(result.pendingOrders).toBe(3);
      expect(result.activeShipments).toBe(4);
      expect(result.ordersToday).toBe(2);
      expect(result.revenueToday).toBe(500);
      expect(result.totalRevenue).toBe(12000);
      expect(result.lowStockProducts).toBe(2);

      // Verify merchantId is always passed
      expect(prisma.order.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ merchantId: MERCHANT_ID }) }),
      );
      expect(prisma.shipment.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ merchantId: MERCHANT_ID }) }),
      );
    });

    it('should return zero values when no data exists for a merchant', async () => {
      prisma.order.count.mockResolvedValue(0);
      prisma.product.count.mockResolvedValue(0);
      prisma.customer.count.mockResolvedValue(0);
      prisma.shipment.count.mockResolvedValue(0);
      prisma.order.aggregate.mockResolvedValue({ _count: { id: 0 }, _sum: { total: null } });

      const result = await service.getOverview(OTHER_MERCHANT_ID);

      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.revenueToday).toBe(0);
    });
  });

  // ── getSalesChart ──────────────────────────────────────────────────────────

  describe('getSalesChart', () => {
    it('should return daily revenue rows for the given period', async () => {
      const mockDate = new Date('2026-04-01T00:00:00.000Z');
      prisma.$queryRaw.mockResolvedValue([
        { date: mockDate, revenue: '1500.00', orders: '3' },
        { date: new Date('2026-04-02T00:00:00.000Z'), revenue: '2200.50', orders: '5' },
      ]);

      const result = await service.getSalesChart(MERCHANT_ID, '7d');

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2026-04-01');
      expect(result[0].revenue).toBe(1500);
      expect(result[0].orders).toBe(3);
    });

    it('should return empty array when no orders exist', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getSalesChart(MERCHANT_ID, '30d');

      expect(result).toEqual([]);
    });
  });

  // ── getTopProducts ─────────────────────────────────────────────────────────

  describe('getTopProducts', () => {
    it('should return top products filtered by merchantId', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { product_id: 'prod-1', name: 'Smart Watch', total_quantity: '8', total_revenue: '4792.00' },
        { product_id: 'prod-2', name: 'Oud Perfume', total_quantity: '5', total_revenue: '1750.00' },
      ]);

      const result = await service.getTopProducts(MERCHANT_ID, 5);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
      expect(result[0].productId).toBe('prod-1');
      expect(result[0].name).toBe('Smart Watch');
      expect(result[0].totalQuantity).toBe(8);
      expect(result[0].totalRevenue).toBe(4792);
    });

    it('should return empty array when there are no order items', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getTopProducts(OTHER_MERCHANT_ID, 5);

      expect(result).toEqual([]);
    });
  });

  // ── getRecentOrders ────────────────────────────────────────────────────────

  describe('getRecentOrders', () => {
    it('should return recent orders filtered by merchantId', async () => {
      const mockOrders = [
        {
          id: 'order-1',
          platformOrderId: 'SEED-ORDER-1',
          total: 748,
          status: 'pending',
          createdAt: new Date(),
          customer: { name: 'Ahmed Ali' },
        },
      ];
      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getRecentOrders(MERCHANT_ID, 10);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: MERCHANT_ID },
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].customerName).toBe('Ahmed Ali');
      expect(result[0].total).toBe(748);
    });

    it('should return empty array for a merchant with no orders', async () => {
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.getRecentOrders(OTHER_MERCHANT_ID, 10);

      expect(result).toEqual([]);
    });
  });

  // ── getOrderStatusBreakdown ────────────────────────────────────────────────

  describe('getOrderStatusBreakdown', () => {
    it('should return order counts per status filtered by merchantId', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { status: 'pending', count: '3' },
        { status: 'delivered', count: '8' },
        { status: 'shipped', count: '2' },
      ]);

      const result = await service.getOrderStatusBreakdown(MERCHANT_ID);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
      expect(result[0].status).toBe('pending');
      expect(result[0].count).toBe(3);
    });

    it('should return empty array when merchant has no orders', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getOrderStatusBreakdown(OTHER_MERCHANT_ID);

      expect(result).toEqual([]);
    });
  });
});
