import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ShippingService, SHIPPING_QUEUE } from '../shipping.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { EncryptionService } from 'src/shared/encryption/encryption.service';
import { CarrierName, ShipmentStatus } from '@prisma/client';
import { CreateCarrierDto } from '../dto/create-carrier.dto';
import { UpdateCarrierDto } from '../dto/update-carrier.dto';
import { UpdateShipmentDto } from '../dto/update-shipment.dto';

const MERCHANT_ID = 'merchant-uuid-1';
const OTHER_MERCHANT_ID = 'merchant-uuid-2';
const CARRIER_ID = 'carrier-uuid-1';
const ORDER_ID = 'order-uuid-1';
const SHIPMENT_ID = 'shipment-uuid-1';

const mockCarrier = {
  id: CARRIER_ID,
  merchantId: MERCHANT_ID,
  carrierName: CarrierName.aramex,
  apiKeyEncrypted: null,
  apiCredentials: {},
  isActive: true,
  priority: 1,
  coverageAreas: {},
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockShipment = {
  id: SHIPMENT_ID,
  orderId: ORDER_ID,
  merchantId: MERCHANT_ID,
  carrierId: CARRIER_ID,
  trackingNumber: null,
  status: ShipmentStatus.pending,
  labelUrl: null,
  estimatedCost: null,
  actualCost: null,
  weightKg: null,
  estimatedDelivery: null,
  shippedAt: null,
  deliveredAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  carrier: { id: CARRIER_ID, carrierName: CarrierName.aramex, priority: 1 },
};

const mockOrder = {
  id: ORDER_ID,
  merchantId: MERCHANT_ID,
  status: 'confirmed',
  total: 100,
};

describe('ShippingService', () => {
  let service: ShippingService;
  let prisma: {
    shippingCarrier: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    shipment: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
    order: {
      findFirst: jest.Mock;
    };
  };
  let encryption: { encrypt: jest.Mock; decrypt: jest.Mock };
  let queue: { add: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      shippingCarrier: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      shipment: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
    };

    encryption = {
      encrypt: jest.fn().mockReturnValue('encrypted-key'),
      decrypt: jest.fn().mockReturnValue('decrypted-key'),
    };

    queue = { add: jest.fn().mockResolvedValue(undefined) };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EncryptionService, useValue: encryption },
        { provide: getQueueToken(SHIPPING_QUEUE), useValue: queue },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ShippingService>(ShippingService);
  });

  // ── listCarriers ──────────────────────────────────────────────────────────

  describe('listCarriers', () => {
    it('should return carriers filtered by merchantId', async () => {
      prisma.shippingCarrier.findMany.mockResolvedValue([mockCarrier]);

      const result = await service.listCarriers(MERCHANT_ID);

      expect(prisma.shippingCarrier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: MERCHANT_ID } }),
      );
      expect(result).toEqual([mockCarrier]);
    });

    it('should not return other merchant carriers (tenant isolation)', async () => {
      prisma.shippingCarrier.findMany.mockResolvedValue([]);

      const result = await service.listCarriers(OTHER_MERCHANT_ID);

      expect(prisma.shippingCarrier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: OTHER_MERCHANT_ID } }),
      );
      expect(result).toEqual([]);
    });
  });

  // ── createCarrier ─────────────────────────────────────────────────────────

  describe('createCarrier', () => {
    it('should create a carrier and encrypt the API key', async () => {
      const dto: CreateCarrierDto = {
        carrierName: CarrierName.aramex,
        apiKey: 'my-api-key',
      };
      prisma.shippingCarrier.create.mockResolvedValue(mockCarrier);

      await service.createCarrier(MERCHANT_ID, dto);

      expect(encryption.encrypt).toHaveBeenCalledWith('my-api-key');
      expect(prisma.shippingCarrier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: MERCHANT_ID,
            carrierName: CarrierName.aramex,
            apiKeyEncrypted: 'encrypted-key',
          }),
        }),
      );
    });

    it('should create a carrier without an API key', async () => {
      const dto: CreateCarrierDto = { carrierName: CarrierName.smsa };
      prisma.shippingCarrier.create.mockResolvedValue(mockCarrier);

      await service.createCarrier(MERCHANT_ID, dto);

      expect(encryption.encrypt).not.toHaveBeenCalled();
      expect(prisma.shippingCarrier.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ apiKeyEncrypted: null }),
        }),
      );
    });
  });

  // ── updateCarrier ─────────────────────────────────────────────────────────

  describe('updateCarrier', () => {
    it('should update carrier for correct merchant', async () => {
      prisma.shippingCarrier.findFirst.mockResolvedValue(mockCarrier);
      prisma.shippingCarrier.update.mockResolvedValue({
        ...mockCarrier,
        isActive: false,
      });

      const dto: UpdateCarrierDto = { isActive: false };
      const result = await service.updateCarrier(MERCHANT_ID, CARRIER_ID, dto);

      expect(prisma.shippingCarrier.findFirst).toHaveBeenCalledWith({
        where: { id: CARRIER_ID, merchantId: MERCHANT_ID },
      });
      expect(result.isActive).toBe(false);
    });

    it('should throw NotFoundException for wrong merchant (tenant isolation)', async () => {
      prisma.shippingCarrier.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCarrier(OTHER_MERCHANT_ID, CARRIER_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── deleteCarrier ─────────────────────────────────────────────────────────

  describe('deleteCarrier', () => {
    it('should delete carrier for correct merchant', async () => {
      prisma.shippingCarrier.findFirst.mockResolvedValue(mockCarrier);
      prisma.shippingCarrier.delete.mockResolvedValue(mockCarrier);

      await service.deleteCarrier(MERCHANT_ID, CARRIER_ID);

      expect(prisma.shippingCarrier.delete).toHaveBeenCalledWith({
        where: { id: CARRIER_ID },
      });
    });

    it('should throw NotFoundException for wrong merchant (tenant isolation)', async () => {
      prisma.shippingCarrier.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteCarrier(OTHER_MERCHANT_ID, CARRIER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── listShipments ─────────────────────────────────────────────────────────

  describe('listShipments', () => {
    it('should return paginated shipments filtered by merchantId', async () => {
      prisma.shipment.findMany.mockResolvedValue([mockShipment]);
      prisma.shipment.count.mockResolvedValue(1);

      const result = await service.listShipments(MERCHANT_ID, 1, 20);

      expect(prisma.shipment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: MERCHANT_ID } }),
      );
      expect(result.total).toBe(1);
      expect(result.shipments).toHaveLength(1);
    });
  });

  // ── getShipment ───────────────────────────────────────────────────────────

  describe('getShipment', () => {
    it('should return shipment for correct merchant', async () => {
      prisma.shipment.findFirst.mockResolvedValue(mockShipment);

      const result = await service.getShipment(MERCHANT_ID, SHIPMENT_ID);

      expect(prisma.shipment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SHIPMENT_ID, merchantId: MERCHANT_ID },
        }),
      );
      expect(result.id).toBe(SHIPMENT_ID);
    });

    it('should throw NotFoundException for wrong merchant (tenant isolation)', async () => {
      prisma.shipment.findFirst.mockResolvedValue(null);

      await expect(
        service.getShipment(OTHER_MERCHANT_ID, SHIPMENT_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── assignCarrier ─────────────────────────────────────────────────────────

  describe('assignCarrier', () => {
    it('should assign lowest-priority carrier to order', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.shipment.findUnique.mockResolvedValue(null);
      prisma.shippingCarrier.findFirst.mockResolvedValue(mockCarrier);
      prisma.shipment.create.mockResolvedValue(mockShipment);

      const result = await service.assignCarrier(MERCHANT_ID, ORDER_ID);

      expect(prisma.shippingCarrier.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { merchantId: MERCHANT_ID, isActive: true },
          orderBy: { priority: 'asc' },
        }),
      );
      expect(queue.add).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'shipping.assigned',
        expect.objectContaining({ shipmentId: SHIPMENT_ID }),
      );
      expect(result.id).toBe(SHIPMENT_ID);
    });

    it('should throw NotFoundException when order does not belong to merchant (tenant isolation)', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.assignCarrier(OTHER_MERCHANT_ID, ORDER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when shipment already assigned', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.shipment.findUnique.mockResolvedValue(mockShipment);

      await expect(
        service.assignCarrier(MERCHANT_ID, ORDER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when no active carriers exist', async () => {
      prisma.order.findFirst.mockResolvedValue(mockOrder);
      prisma.shipment.findUnique.mockResolvedValue(null);
      prisma.shippingCarrier.findFirst.mockResolvedValue(null);

      await expect(
        service.assignCarrier(MERCHANT_ID, ORDER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── updateShipment ────────────────────────────────────────────────────────

  describe('updateShipment', () => {
    it('should update shipment for correct merchant', async () => {
      const updated = {
        ...mockShipment,
        trackingNumber: 'TRACK-123',
        status: ShipmentStatus.in_transit,
      };
      prisma.shipment.findFirst.mockResolvedValue(mockShipment);
      prisma.shipment.update.mockResolvedValue(updated);

      const dto: UpdateShipmentDto = {
        trackingNumber: 'TRACK-123',
        status: ShipmentStatus.in_transit,
      };
      const result = await service.updateShipment(MERCHANT_ID, SHIPMENT_ID, dto);

      expect(prisma.shipment.findFirst).toHaveBeenCalledWith({
        where: { id: SHIPMENT_ID, merchantId: MERCHANT_ID },
      });
      expect(result.trackingNumber).toBe('TRACK-123');
    });

    it('should throw NotFoundException for wrong merchant (tenant isolation)', async () => {
      prisma.shipment.findFirst.mockResolvedValue(null);

      await expect(
        service.updateShipment(OTHER_MERCHANT_ID, SHIPMENT_ID, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
