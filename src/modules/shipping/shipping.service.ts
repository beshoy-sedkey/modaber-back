import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { EncryptionService } from 'src/shared/encryption/encryption.service';
import { Prisma, ShipmentStatus } from '@prisma/client';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';

export const SHIPPING_QUEUE = 'shipping';
export const JOB_SHIPPING_ASSIGN = 'shipping-assign';
export const JOB_SHIPPING_TRACK = 'shipping-track';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    @InjectQueue(SHIPPING_QUEUE) private readonly shippingQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Carriers ──────────────────────────────────────────────────────────────

  async listCarriers(merchantId: string) {
    return this.prisma.shippingCarrier.findMany({
      where: { merchantId },
      orderBy: { priority: 'asc' },
      select: {
        id: true,
        merchantId: true,
        carrierName: true,
        isActive: true,
        priority: true,
        coverageAreas: true,
        apiCredentials: true,
        createdAt: true,
        updatedAt: true,
        // never return apiKeyEncrypted
      },
    });
  }

  async createCarrier(merchantId: string, dto: CreateCarrierDto) {
    const apiKeyEncrypted =
      dto.apiKey ? this.encryption.encrypt(dto.apiKey) : null;

    return this.prisma.shippingCarrier.create({
      data: {
        merchantId,
        carrierName: dto.carrierName,
        apiKeyEncrypted,
        apiCredentials: (dto.apiCredentials ?? {}) as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
        priority: dto.priority ?? 1,
        coverageAreas: (dto.coverageAreas ?? {}) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        merchantId: true,
        carrierName: true,
        isActive: true,
        priority: true,
        coverageAreas: true,
        apiCredentials: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async updateCarrier(
    merchantId: string,
    carrierId: string,
    dto: UpdateCarrierDto,
  ) {
    const carrier = await this.prisma.shippingCarrier.findFirst({
      where: { id: carrierId, merchantId },
    });

    if (!carrier) {
      throw new NotFoundException(
        `Carrier ${carrierId} not found for this merchant`,
      );
    }

    const apiKeyEncrypted = dto.apiKey
      ? this.encryption.encrypt(dto.apiKey)
      : undefined;

    return this.prisma.shippingCarrier.update({
      where: { id: carrierId },
      data: {
        ...(apiKeyEncrypted !== undefined ? { apiKeyEncrypted } : {}),
        ...(dto.apiCredentials !== undefined
          ? { apiCredentials: dto.apiCredentials as Prisma.InputJsonValue }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.coverageAreas !== undefined
          ? { coverageAreas: dto.coverageAreas as Prisma.InputJsonValue }
          : {}),
      },
      select: {
        id: true,
        merchantId: true,
        carrierName: true,
        isActive: true,
        priority: true,
        coverageAreas: true,
        apiCredentials: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteCarrier(merchantId: string, carrierId: string): Promise<void> {
    const carrier = await this.prisma.shippingCarrier.findFirst({
      where: { id: carrierId, merchantId },
    });

    if (!carrier) {
      throw new NotFoundException(
        `Carrier ${carrierId} not found for this merchant`,
      );
    }

    await this.prisma.shippingCarrier.delete({ where: { id: carrierId } });
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(merchantId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [shipments, total] = await Promise.all([
      this.prisma.shipment.findMany({
        where: { merchantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          carrier: {
            select: {
              id: true,
              carrierName: true,
              priority: true,
            },
          },
          order: {
            select: {
              id: true,
              status: true,
              total: true,
              currency: true,
            },
          },
        },
      }),
      this.prisma.shipment.count({ where: { merchantId } }),
    ]);

    return { shipments, total, page, limit };
  }

  async getShipment(merchantId: string, shipmentId: string) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, merchantId },
      include: {
        carrier: {
          select: {
            id: true,
            carrierName: true,
            priority: true,
            coverageAreas: true,
          },
        },
        order: {
          include: {
            customer: {
              select: { name: true, phone: true, email: true },
            },
            items: {
              include: {
                product: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!shipment) {
      throw new NotFoundException(
        `Shipment ${shipmentId} not found for this merchant`,
      );
    }

    return shipment;
  }

  async assignCarrier(merchantId: string, orderId: string) {
    // Check order belongs to merchant
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId },
    });

    if (!order) {
      throw new NotFoundException(
        `Order ${orderId} not found for this merchant`,
      );
    }

    // Check no shipment already assigned
    const existing = await this.prisma.shipment.findUnique({
      where: { orderId },
    });

    if (existing) {
      throw new BadRequestException(
        `Order ${orderId} already has a shipment assigned`,
      );
    }

    // Pick highest-priority (lowest priority number) active carrier
    const carrier = await this.prisma.shippingCarrier.findFirst({
      where: { merchantId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!carrier) {
      throw new NotFoundException(
        'No active shipping carriers configured for this merchant',
      );
    }

    // Create shipment record
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId,
        merchantId,
        carrierId: carrier.id,
        status: ShipmentStatus.pending,
      },
      include: {
        carrier: {
          select: { id: true, carrierName: true, priority: true },
        },
      },
    });

    // Enqueue async BullMQ job
    await this.shippingQueue.add(JOB_SHIPPING_ASSIGN, {
      shipmentId: shipment.id,
      merchantId,
      orderId,
      carrierId: carrier.id,
    });

    // Emit event for other modules
    this.eventEmitter.emit('shipping.assigned', {
      shipmentId: shipment.id,
      orderId,
      merchantId,
      carrierId: carrier.id,
      carrierName: carrier.carrierName,
    });

    this.logger.log(
      `Shipment ${shipment.id} assigned to carrier ${carrier.carrierName} for order ${orderId}`,
    );

    return shipment;
  }

  async updateShipment(
    merchantId: string,
    shipmentId: string,
    dto: UpdateShipmentDto,
  ) {
    const shipment = await this.prisma.shipment.findFirst({
      where: { id: shipmentId, merchantId },
    });

    if (!shipment) {
      throw new NotFoundException(
        `Shipment ${shipmentId} not found for this merchant`,
      );
    }

    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        ...(dto.trackingNumber !== undefined
          ? { trackingNumber: dto.trackingNumber }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.labelUrl !== undefined ? { labelUrl: dto.labelUrl } : {}),
        ...(dto.estimatedCost !== undefined
          ? { estimatedCost: dto.estimatedCost }
          : {}),
        ...(dto.actualCost !== undefined ? { actualCost: dto.actualCost } : {}),
        ...(dto.weightKg !== undefined ? { weightKg: dto.weightKg } : {}),
        ...(dto.estimatedDelivery !== undefined
          ? { estimatedDelivery: new Date(dto.estimatedDelivery) }
          : {}),
        ...(dto.shippedAt !== undefined
          ? { shippedAt: new Date(dto.shippedAt) }
          : {}),
        ...(dto.deliveredAt !== undefined
          ? { deliveredAt: new Date(dto.deliveredAt) }
          : {}),
      },
      include: {
        carrier: {
          select: { id: true, carrierName: true },
        },
      },
    });
  }
}
