import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ReportsController } from '../reports.controller';
import { ReportsService } from '../reports.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';

const MERCHANT_ID = 'merchant-uuid-1';

const mockJwtPayload = {
  merchantId: MERCHANT_ID,
  sub: MERCHANT_ID,
};

const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = mockJwtPayload;
    return true;
  }),
};

const mockSalesData = [
  { date: '2024-01-15', revenue: 3000, orders: 5, avgOrderValue: 600 },
];

const mockOrdersData = {
  totalOrders: 15,
  totalRevenue: 5700,
  byStatus: [{ status: 'delivered', count: 10, revenue: 4500 }],
  byPaymentMethod: [{ method: 'visa', count: 12 }],
};

const mockShippingData = {
  totalShipments: 11,
  byStatus: [{ status: 'delivered', count: 8 }],
  byCarrier: [{ carrierName: 'aramex', count: 7, avgCost: 25.5 }],
};

const mockStockData = {
  totalProducts: 10,
  totalValue: 5000,
  lowStock: [{ id: 'prod-1', name: 'Low Item', stockQuantity: 3, price: 99, category: 'Electronics' }],
  outOfStock: [],
  byCategory: [{ category: 'Electronics', count: 5, totalValue: 3000 }],
};

const mockAiUsageData = {
  totalConversations: 3,
  totalMessages: 15,
  avgMessagesPerConversation: 5,
  byChannel: [{ channel: 'web', count: 2 }],
};

const mockReportsService = {
  getSalesReport: jest.fn().mockResolvedValue(mockSalesData),
  getOrdersReport: jest.fn().mockResolvedValue(mockOrdersData),
  getShippingReport: jest.fn().mockResolvedValue(mockShippingData),
  getStockReport: jest.fn().mockResolvedValue(mockStockData),
  getAiUsageReport: jest.fn().mockResolvedValue(mockAiUsageData),
};

describe('ReportsController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  // ── GET /reports/sales ─────────────────────────────────────────────────────

  describe('GET /reports/sales', () => {
    it('should return sales data with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/sales?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ date: '2024-01-15', revenue: 3000, orders: 5 });
      expect(mockReportsService.getSalesReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        '2024-01-01',
        '2024-01-31',
      );
    });

    it('should work without date params (uses defaults in service)', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/sales')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockReportsService.getSalesReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        undefined,
        undefined,
      );
    });

    it('should return 400 for invalid date format', async () => {
      await request(app.getHttpServer())
        .get('/reports/sales?from=not-a-date')
        .expect(400);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .get('/reports/sales')
        .expect(403);
    });
  });

  // ── GET /reports/orders ────────────────────────────────────────────────────

  describe('GET /reports/orders', () => {
    it('should return order stats with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/orders?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalOrders: 15,
        totalRevenue: 5700,
        byStatus: expect.any(Array),
        byPaymentMethod: expect.any(Array),
      });
      expect(mockReportsService.getOrdersReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        '2024-01-01',
        '2024-01-31',
        undefined,
      );
    });

    it('should forward status filter to service', async () => {
      await request(app.getHttpServer())
        .get('/reports/orders?status=pending')
        .expect(200);

      expect(mockReportsService.getOrdersReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        undefined,
        undefined,
        'pending',
      );
    });

    it('should return 400 for invalid status enum value', async () => {
      await request(app.getHttpServer())
        .get('/reports/orders?status=invalid_status')
        .expect(400);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .get('/reports/orders')
        .expect(403);
    });
  });

  // ── GET /reports/shipping ──────────────────────────────────────────────────

  describe('GET /reports/shipping', () => {
    it('should return shipping stats with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/shipping?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalShipments: 11,
        byStatus: expect.any(Array),
        byCarrier: expect.any(Array),
      });
      expect(mockReportsService.getShippingReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        '2024-01-01',
        '2024-01-31',
      );
    });

    it('should work without query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/shipping')
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .get('/reports/shipping')
        .expect(403);
    });
  });

  // ── GET /reports/stock ─────────────────────────────────────────────────────

  describe('GET /reports/stock', () => {
    it('should return stock snapshot with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/stock')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalProducts: 10,
        totalValue: 5000,
        lowStock: expect.any(Array),
        outOfStock: expect.any(Array),
        byCategory: expect.any(Array),
      });
      expect(mockReportsService.getStockReport).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .get('/reports/stock')
        .expect(403);
    });
  });

  // ── GET /reports/ai-usage ──────────────────────────────────────────────────

  describe('GET /reports/ai-usage', () => {
    it('should return AI usage stats with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/ai-usage?from=2024-01-01&to=2024-01-31')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalConversations: 3,
        totalMessages: 15,
        avgMessagesPerConversation: 5,
        byChannel: expect.any(Array),
      });
      expect(mockReportsService.getAiUsageReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        '2024-01-01',
        '2024-01-31',
      );
    });

    it('should work without query params', async () => {
      const res = await request(app.getHttpServer())
        .get('/reports/ai-usage')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockReportsService.getAiUsageReport).toHaveBeenCalledWith(
        MERCHANT_ID,
        undefined,
        undefined,
      );
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);
      await request(app.getHttpServer())
        .get('/reports/ai-usage')
        .expect(403);
    });
  });
});
