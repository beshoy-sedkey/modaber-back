import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { ShippingController } from '../shipping.controller';
import { ShippingService } from '../shipping.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CarrierName, ShipmentStatus } from '@prisma/client';

const MERCHANT_ID = 'merchant-uuid-1';
const CARRIER_ID = 'carrier-uuid-1';
const ORDER_ID = 'order-uuid-1';
const SHIPMENT_ID = 'shipment-uuid-1';

const mockJwtPayload = {
  merchantId: MERCHANT_ID,
  sub: MERCHANT_ID,
};

const mockCarrier = {
  id: CARRIER_ID,
  merchantId: MERCHANT_ID,
  carrierName: CarrierName.aramex,
  isActive: true,
  priority: 1,
  coverageAreas: {},
  apiCredentials: {},
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const mockShipment = {
  id: SHIPMENT_ID,
  orderId: ORDER_ID,
  merchantId: MERCHANT_ID,
  carrierId: CARRIER_ID,
  trackingNumber: null,
  status: ShipmentStatus.pending,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  carrier: { id: CARRIER_ID, carrierName: CarrierName.aramex, priority: 1 },
};

const mockShippingService = {
  listCarriers: jest.fn().mockResolvedValue([mockCarrier]),
  createCarrier: jest.fn().mockResolvedValue(mockCarrier),
  updateCarrier: jest.fn().mockResolvedValue(mockCarrier),
  deleteCarrier: jest.fn().mockResolvedValue(undefined),
  listShipments: jest.fn().mockResolvedValue({
    shipments: [mockShipment],
    total: 1,
    page: 1,
    limit: 20,
  }),
  getShipment: jest.fn().mockResolvedValue(mockShipment),
  assignCarrier: jest.fn().mockResolvedValue(mockShipment),
  updateShipment: jest.fn().mockResolvedValue(mockShipment),
};

// Mock JwtAuthGuard to inject fake merchant
const mockJwtAuthGuard = {
  canActivate: jest.fn().mockImplementation((context) => {
    const req = context.switchToHttp().getRequest();
    req.user = mockJwtPayload;
    return true;
  }),
};

describe('ShippingController (integration)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShippingController],
      providers: [
        { provide: ShippingService, useValue: mockShippingService },
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

  // ── GET /shipping/carriers ─────────────────────────────────────────────────

  describe('GET /shipping/carriers', () => {
    it('should return list of carriers', async () => {
      const res = await request(app.getHttpServer())
        .get('/shipping/carriers')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(mockShippingService.listCarriers).toHaveBeenCalledWith(MERCHANT_ID);
    });

    it('should return 401 when not authenticated', async () => {
      mockJwtAuthGuard.canActivate.mockReturnValueOnce(false);

      await request(app.getHttpServer())
        .get('/shipping/carriers')
        .expect(403);
    });
  });

  // ── POST /shipping/carriers ────────────────────────────────────────────────

  describe('POST /shipping/carriers', () => {
    it('should create a carrier', async () => {
      const res = await request(app.getHttpServer())
        .post('/shipping/carriers')
        .send({ carrierName: 'aramex' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(CARRIER_ID);
      expect(mockShippingService.createCarrier).toHaveBeenCalledWith(
        MERCHANT_ID,
        expect.objectContaining({ carrierName: 'aramex' }),
      );
    });

    it('should return 400 for invalid carrier name', async () => {
      await request(app.getHttpServer())
        .post('/shipping/carriers')
        .send({ carrierName: 'invalid-carrier' })
        .expect(400);
    });
  });

  // ── PUT /shipping/carriers/:id ─────────────────────────────────────────────

  describe('PUT /shipping/carriers/:id', () => {
    it('should update a carrier', async () => {
      const res = await request(app.getHttpServer())
        .put(`/shipping/carriers/${CARRIER_ID}`)
        .send({ isActive: false })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockShippingService.updateCarrier).toHaveBeenCalledWith(
        MERCHANT_ID,
        CARRIER_ID,
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  // ── DELETE /shipping/carriers/:id ─────────────────────────────────────────

  describe('DELETE /shipping/carriers/:id', () => {
    it('should delete a carrier', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/shipping/carriers/${CARRIER_ID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockShippingService.deleteCarrier).toHaveBeenCalledWith(
        MERCHANT_ID,
        CARRIER_ID,
      );
    });
  });

  // ── GET /shipping/shipments ────────────────────────────────────────────────

  describe('GET /shipping/shipments', () => {
    it('should return paginated shipments', async () => {
      const res = await request(app.getHttpServer())
        .get('/shipping/shipments?page=1&limit=10')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta).toMatchObject({ page: 1, total: 1 });
      expect(mockShippingService.listShipments).toHaveBeenCalledWith(
        MERCHANT_ID,
        1,
        10,
      );
    });
  });

  // ── GET /shipping/shipments/:id ────────────────────────────────────────────

  describe('GET /shipping/shipments/:id', () => {
    it('should return a single shipment', async () => {
      const res = await request(app.getHttpServer())
        .get(`/shipping/shipments/${SHIPMENT_ID}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SHIPMENT_ID);
      expect(mockShippingService.getShipment).toHaveBeenCalledWith(
        MERCHANT_ID,
        SHIPMENT_ID,
      );
    });
  });

  // ── POST /shipping/shipments/:orderId/assign ───────────────────────────────

  describe('POST /shipping/shipments/:orderId/assign', () => {
    it('should auto-assign carrier to order', async () => {
      const res = await request(app.getHttpServer())
        .post(`/shipping/shipments/${ORDER_ID}/assign`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(SHIPMENT_ID);
      expect(mockShippingService.assignCarrier).toHaveBeenCalledWith(
        MERCHANT_ID,
        ORDER_ID,
      );
    });
  });

  // ── PUT /shipping/shipments/:id ────────────────────────────────────────────

  describe('PUT /shipping/shipments/:id', () => {
    it('should update a shipment', async () => {
      const res = await request(app.getHttpServer())
        .put(`/shipping/shipments/${SHIPMENT_ID}`)
        .send({ trackingNumber: 'TRACK-123', status: 'in_transit' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(mockShippingService.updateShipment).toHaveBeenCalledWith(
        MERCHANT_ID,
        SHIPMENT_ID,
        expect.objectContaining({ trackingNumber: 'TRACK-123' }),
      );
    });
  });
});
