import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus, CustomerSegment } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { OrderConfirmationService } from '../order-confirmation.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { WhatsAppService } from 'src/modules/whatsapp/whatsapp.service';

function buildMockOrder(overrides: {
  phone?: string | null;
  total?: number;
}) {
  const { phone = '+966500000000', total = 300 } = overrides;

  return {
    id: 'order-1',
    merchantId: 'merchant-1',
    customerId: 'customer-1',
    platformOrderId: 'PLT-1',
    status: OrderStatus.pending,
    subtotal: new Decimal(total),
    discountAmount: new Decimal(0),
    shippingCost: new Decimal(0),
    total: new Decimal(total),
    currency: 'SAR',
    authenticityScore: null,
    paymentMethod: 'cod',
    paymentStatus: PaymentStatus.pending,
    shippingAddress: null,
    notes: null,
    confirmedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: 'customer-1',
      merchantId: 'merchant-1',
      name: 'Test Customer',
      phone,
      email: 'test@example.com',
      addressEncrypted: null,
      city: null,
      country: null,
      loyaltyPoints: 0,
      totalOrders: 1,
      totalSpent: new Decimal(0),
      segment: CustomerSegment.new_customer,
      sourceChannel: 'web',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        productId: 'product-1',
        variantId: null,
        quantity: 1,
        unitPrice: new Decimal(total),
        totalPrice: new Decimal(total),
      },
    ],
  };
}

describe('OrderConfirmationService', () => {
  let service: OrderConfirmationService;
  let prisma: jest.Mocked<PrismaService>;
  let whatsapp: jest.Mocked<WhatsAppService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderConfirmationService,
        {
          provide: PrismaService,
          useValue: {
            order: {
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: WhatsAppService,
          useValue: {
            enqueueSendTemplate: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrderConfirmationService>(OrderConfirmationService);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    whatsapp = module.get(WhatsAppService) as jest.Mocked<WhatsAppService>;
    eventEmitter = module.get(EventEmitter2) as jest.Mocked<EventEmitter2>;
  });

  describe('manualConfirm', () => {
    it('confirms order and sends WhatsApp when customer has a phone', async () => {
      const order = buildMockOrder({ phone: '+966500000000' });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue({ ...order, status: OrderStatus.confirmed });

      await service.manualConfirm('merchant-1', 'order-1', 'approved manually');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.confirmed,
            confirmedAt: expect.any(Date),
            notes: 'approved manually',
          }),
        }),
      );
      expect(whatsapp.enqueueSendTemplate).toHaveBeenCalledWith(
        'merchant-1',
        '+966500000000',
        'order_confirmation',
        'ar',
        expect.any(Array),
      );
    });

    it('confirms order without WhatsApp when phone is missing', async () => {
      const order = buildMockOrder({ phone: null });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue(order);

      await service.manualConfirm('merchant-1', 'order-1');

      expect(prisma.order.update).toHaveBeenCalled();
      expect(whatsapp.enqueueSendTemplate).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when order not found', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.manualConfirm('merchant-1', 'bad-id')).rejects.toThrow(NotFoundException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('emits order.updated event after confirmation', async () => {
      const order = buildMockOrder({ phone: null });
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.order.update as jest.Mock).mockResolvedValue(order);

      await service.manualConfirm('merchant-1', 'order-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'order.updated',
        expect.objectContaining({ merchantId: 'merchant-1', orderId: 'order-1' }),
      );
    });
  });

  describe('manualFlag', () => {
    it('flags order for manual review', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({ id: 'order-1' });
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await service.manualFlag('merchant-1', 'order-1', 'suspicious address');

      expect(prisma.order.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: OrderStatus.confirming,
            notes: 'suspicious address',
          }),
        }),
      );
    });

    it('throws NotFoundException for unknown order', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.manualFlag('merchant-1', 'bad-id')).rejects.toThrow(NotFoundException);
    });

    it('emits order.updated event after flagging', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue({ id: 'order-1' });
      (prisma.order.update as jest.Mock).mockResolvedValue({});

      await service.manualFlag('merchant-1', 'order-1');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'order.updated',
        expect.objectContaining({ orderId: 'order-1' }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('manualConfirm queries with merchantId filter', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.manualConfirm('merchant-A', 'order-1')).rejects.toThrow(NotFoundException);

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ merchantId: 'merchant-A' }),
        }),
      );
    });

    it('manualFlag throws NotFoundException when order belongs to different merchant', async () => {
      (prisma.order.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.manualFlag('merchant-B', 'order-1')).rejects.toThrow(NotFoundException);
    });
  });
});
