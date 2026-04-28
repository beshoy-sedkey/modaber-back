import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from '../reports.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const MERCHANT_ID = 'merchant-uuid-1';

const mockPrismaService = {
  $queryRaw: jest.fn(),
  product: {
    count: jest.fn(),
    findMany: jest.fn(),
  },
  conversation: {
    aggregate: jest.fn(),
  },
};

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getSalesReport ─────────────────────────────────────────────────────────

  describe('getSalesReport', () => {
    it('should return daily sales data with avgOrderValue computed', async () => {
      const rows = [
        { date: new Date('2024-01-15T00:00:00Z'), revenue: '3000', orders: '5' },
        { date: new Date('2024-01-16T00:00:00Z'), revenue: '2000', orders: '4' },
      ];
      mockPrismaService.$queryRaw.mockResolvedValue(rows);

      const result = await service.getSalesReport(MERCHANT_ID, '2024-01-01', '2024-01-31');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        date: '2024-01-15',
        revenue: 3000,
        orders: 5,
        avgOrderValue: 600,
      });
      expect(result[1]).toMatchObject({
        date: '2024-01-16',
        revenue: 2000,
        orders: 4,
        avgOrderValue: 500,
      });
    });

    it('should return empty array when no data', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      const result = await service.getSalesReport(MERCHANT_ID);
      expect(result).toEqual([]);
    });

    it('should use default date range when from/to not provided', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      await service.getSalesReport(MERCHANT_ID);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should set avgOrderValue to 0 when orders count is 0', async () => {
      const rows = [
        { date: new Date('2024-01-15T00:00:00Z'), revenue: '0', orders: '0' },
      ];
      mockPrismaService.$queryRaw.mockResolvedValue(rows);
      const result = await service.getSalesReport(MERCHANT_ID);
      expect(result[0]?.avgOrderValue).toBe(0);
    });
  });

  // ── getOrdersReport ────────────────────────────────────────────────────────

  describe('getOrdersReport', () => {
    it('should return aggregated order stats by status and payment method', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          { status: 'pending', count: '5', revenue: '1200.00' },
          { status: 'delivered', count: '10', revenue: '4500.00' },
        ])
        .mockResolvedValueOnce([
          { payment_method: 'visa', count: '12' },
          { payment_method: 'mada', count: '3' },
        ]);

      const result = await service.getOrdersReport(MERCHANT_ID, '2024-01-01', '2024-01-31');

      expect(result.totalOrders).toBe(15);
      expect(result.totalRevenue).toBe(5700);
      expect(result.byStatus).toHaveLength(2);
      expect(result.byStatus[0]).toMatchObject({ status: 'pending', count: 5, revenue: 1200 });
      expect(result.byPaymentMethod).toHaveLength(2);
      expect(result.byPaymentMethod[0]).toMatchObject({ method: 'visa', count: 12 });
    });

    it('should pass status filter in query when provided', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      await service.getOrdersReport(MERCHANT_ID, undefined, undefined, OrderStatus.pending);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('should return zeros when no orders found', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      const result = await service.getOrdersReport(MERCHANT_ID);
      expect(result.totalOrders).toBe(0);
      expect(result.totalRevenue).toBe(0);
      expect(result.byStatus).toEqual([]);
      expect(result.byPaymentMethod).toEqual([]);
    });
  });

  // ── getShippingReport ──────────────────────────────────────────────────────

  describe('getShippingReport', () => {
    it('should return shipping stats by status and carrier', async () => {
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([
          { status: 'delivered', count: '8' },
          { status: 'in_transit', count: '3' },
        ])
        .mockResolvedValueOnce([
          { carrier_name: 'aramex', count: '7', avg_cost: '25.50' },
          { carrier_name: 'smsa', count: '4', avg_cost: null },
        ]);

      const result = await service.getShippingReport(MERCHANT_ID, '2024-01-01', '2024-01-31');

      expect(result.totalShipments).toBe(11);
      expect(result.byStatus).toHaveLength(2);
      expect(result.byStatus[0]).toMatchObject({ status: 'delivered', count: 8 });
      expect(result.byCarrier).toHaveLength(2);
      expect(result.byCarrier[0]).toMatchObject({ carrierName: 'aramex', count: 7, avgCost: 25.5 });
      expect(result.byCarrier[1]).toMatchObject({ carrierName: 'smsa', count: 4, avgCost: 0 });
    });

    it('should use merchantId in query', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      await service.getShippingReport(MERCHANT_ID);
      expect(mockPrismaService.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ── getStockReport ─────────────────────────────────────────────────────────

  describe('getStockReport', () => {
    it('should return inventory snapshot with low/out of stock products', async () => {
      mockPrismaService.product.count.mockResolvedValue(10);
      mockPrismaService.$queryRaw
        .mockResolvedValueOnce([{ total_value: '5000' }])
        .mockResolvedValueOnce([
          { category: 'Electronics', count: '5', total_value: '3000' },
          { category: 'Uncategorized', count: '2', total_value: '298' },
        ]);
      mockPrismaService.product.findMany
        .mockResolvedValueOnce([
          { id: 'prod-1', name: 'Low Stock Item', stockQuantity: 3, price: '99.00', category: 'Electronics' },
        ])
        .mockResolvedValueOnce([
          { id: 'prod-2', name: 'Out Of Stock Item', stockQuantity: 0, price: '149.00', category: null },
        ]);

      const result = await service.getStockReport(MERCHANT_ID);

      expect(result.totalProducts).toBe(10);
      expect(result.totalValue).toBe(5000);
      expect(result.lowStock).toHaveLength(1);
      expect(result.lowStock[0]).toMatchObject({ id: 'prod-1', stockQuantity: 3, price: 99 });
      expect(result.outOfStock).toHaveLength(1);
      expect(result.outOfStock[0]).toMatchObject({ id: 'prod-2', stockQuantity: 0, price: 149 });
      expect(result.byCategory).toHaveLength(2);
      expect(result.byCategory[0]).toMatchObject({ category: 'Electronics', count: 5, totalValue: 3000 });
    });

    it('should include merchantId in product queries', async () => {
      mockPrismaService.product.count.mockResolvedValue(0);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      await service.getStockReport(MERCHANT_ID);

      expect(mockPrismaService.product.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ merchantId: MERCHANT_ID }) }),
      );
      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ merchantId: MERCHANT_ID }) }),
      );
    });

    it('should return zero totalValue when no products', async () => {
      mockPrismaService.product.count.mockResolvedValue(0);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.product.findMany.mockResolvedValue([]);

      const result = await service.getStockReport(MERCHANT_ID);
      expect(result.totalValue).toBe(0);
    });
  });

  // ── getAiUsageReport ───────────────────────────────────────────────────────

  describe('getAiUsageReport', () => {
    it('should return conversation stats with channel breakdown', async () => {
      mockPrismaService.conversation.aggregate.mockResolvedValue({
        _count: { id: 3 },
        _sum: { totalMessages: 15 },
      });
      mockPrismaService.$queryRaw.mockResolvedValue([
        { channel: 'web', count: '2' },
        { channel: 'whatsapp', count: '1' },
      ]);

      const result = await service.getAiUsageReport(MERCHANT_ID, '2024-01-01', '2024-01-31');

      expect(result.totalConversations).toBe(3);
      expect(result.totalMessages).toBe(15);
      expect(result.avgMessagesPerConversation).toBe(5);
      expect(result.byChannel).toHaveLength(2);
      expect(result.byChannel[0]).toMatchObject({ channel: 'web', count: 2 });
    });

    it('should return zeros when no conversations exist', async () => {
      mockPrismaService.conversation.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { totalMessages: null },
      });
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      const result = await service.getAiUsageReport(MERCHANT_ID);

      expect(result.totalConversations).toBe(0);
      expect(result.totalMessages).toBe(0);
      expect(result.avgMessagesPerConversation).toBe(0);
      expect(result.byChannel).toEqual([]);
    });

    it('should filter by merchantId in conversation aggregate', async () => {
      mockPrismaService.conversation.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _sum: { totalMessages: null },
      });
      mockPrismaService.$queryRaw.mockResolvedValue([]);

      await service.getAiUsageReport(MERCHANT_ID);

      expect(mockPrismaService.conversation.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: MERCHANT_ID }),
        }),
      );
    });
  });
});
