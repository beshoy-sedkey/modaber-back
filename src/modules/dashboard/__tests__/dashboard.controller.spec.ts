import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DashboardController } from '../dashboard.controller';
import { DashboardService } from '../dashboard.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';

const MERCHANT_ID = 'merchant-uuid-1';

const mockJwtPayload = {
  merchantId: MERCHANT_ID,
  sub: MERCHANT_ID,
};

const mockOverview = {
  totalRevenue: 15000,
  totalOrders: 20,
  totalProducts: 10,
  totalCustomers: 5,
  pendingOrders: 3,
  activeShipments: 2,
  revenueToday: 500,
  ordersToday: 2,
  lowStockProducts: 1,
};

const mockSalesChart = [
  { date: '2026-04-01', revenue: 1500, orders: 3 },
  { date: '2026-04-02', revenue: 2200, orders: 5 },
];

const mockTopProducts = [
  { productId: 'prod-1', name: 'Smart Watch', totalQuantity: 8, totalRevenue: 4792 },
  { productId: 'prod-2', name: 'Oud Perfume', totalQuantity: 5, totalRevenue: 1750 },
];

const mockRecentOrders = [
  {
    id: 'order-1',
    platformOrderId: 'SEED-ORDER-1',
    customerName: 'Ahmed Ali',
    total: 748,
    status: 'pending',
    createdAt: new Date().toISOString(),
  },
];

const mockStatusBreakdown = [
  { status: 'pending', count: 3 },
  { status: 'delivered', count: 8 },
];

const mockDashboardService = {
  getOverview: jest.fn().mockResolvedValue(mockOverview),
  getSalesChart: jest.fn().mockResolvedValue(mockSalesChart),
  getTopProducts: jest.fn().mockResolvedValue(mockTopProducts),
  getRecentOrders: jest.fn().mockResolvedValue(mockRecentOrders),
  getOrderStatusBreakdown: jest.fn().mockResolvedValue(mockStatusBreakdown),
};

const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = mockJwtPayload;
    return true;
  }),
};

describe('DashboardController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        { provide: DashboardService, useValue: mockDashboardService },
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

  // ── GET /dashboard/overview ────────────────────────────────────────────────

  describe('GET /dashboard/overview', () => {
    it('should return overview KPIs with success: true', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/overview')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalRevenue: 15000,
        totalOrders: 20,
        pendingOrders: 3,
        activeShipments: 2,
      });
      expect(mockDashboardService.getOverview).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);

      await request(app.getHttpServer())
        .get('/dashboard/overview')
        .expect(403);
    });
  });

  // ── GET /dashboard/sales-chart ─────────────────────────────────────────────

  describe('GET /dashboard/sales-chart', () => {
    it('should return sales chart data with default 30d period', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/sales-chart')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ date: '2026-04-01', revenue: 1500 });
      expect(mockDashboardService.getSalesChart).toHaveBeenCalledWith(MERCHANT_ID, '30d');
    });

    it('should pass the period query param to service', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/sales-chart?period=7d')
        .expect(200);

      expect(mockDashboardService.getSalesChart).toHaveBeenCalledWith(MERCHANT_ID, '7d');
    });

    it('should return 400 for invalid period value', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/sales-chart?period=invalid')
        .expect(400);
    });
  });

  // ── GET /dashboard/top-products ────────────────────────────────────────────

  describe('GET /dashboard/top-products', () => {
    it('should return top products with default limit of 5', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/top-products')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ productId: 'prod-1', name: 'Smart Watch' });
      expect(mockDashboardService.getTopProducts).toHaveBeenCalledWith(MERCHANT_ID, 5);
    });

    it('should pass custom limit to service', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/top-products?limit=3')
        .expect(200);

      expect(mockDashboardService.getTopProducts).toHaveBeenCalledWith(MERCHANT_ID, 3);
    });

    it('should return 400 for limit exceeding max', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/top-products?limit=200')
        .expect(400);
    });
  });

  // ── GET /dashboard/recent-orders ───────────────────────────────────────────

  describe('GET /dashboard/recent-orders', () => {
    it('should return recent orders with default limit of 10', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/recent-orders')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0]).toMatchObject({ customerName: 'Ahmed Ali', total: 748 });
      expect(mockDashboardService.getRecentOrders).toHaveBeenCalledWith(MERCHANT_ID, 10);
    });

    it('should pass custom limit to service', async () => {
      await request(app.getHttpServer())
        .get('/dashboard/recent-orders?limit=5')
        .expect(200);

      expect(mockDashboardService.getRecentOrders).toHaveBeenCalledWith(MERCHANT_ID, 5);
    });
  });

  // ── GET /dashboard/order-status-breakdown ──────────────────────────────────

  describe('GET /dashboard/order-status-breakdown', () => {
    it('should return order status counts', async () => {
      const res = await request(app.getHttpServer())
        .get('/dashboard/order-status-breakdown')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0]).toMatchObject({ status: 'pending', count: 3 });
      expect(mockDashboardService.getOrderStatusBreakdown).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('should return 403 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);

      await request(app.getHttpServer())
        .get('/dashboard/order-status-breakdown')
        .expect(403);
    });
  });
});
