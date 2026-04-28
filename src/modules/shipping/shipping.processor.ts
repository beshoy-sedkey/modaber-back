import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SHIPPING_QUEUE, JOB_SHIPPING_ASSIGN, JOB_SHIPPING_TRACK } from './shipping.service';

interface ShippingAssignJobData {
  shipmentId: string;
  merchantId: string;
  orderId: string;
  carrierId: string;
}

interface ShippingTrackJobData {
  shipmentId: string;
  merchantId: string;
  trackingNumber: string;
}

type ShippingJobData = ShippingAssignJobData | ShippingTrackJobData;

@Processor(SHIPPING_QUEUE)
export class ShippingProcessor extends WorkerHost {
  private readonly logger = new Logger(ShippingProcessor.name);

  async process(job: Job<ShippingJobData>): Promise<void> {
    switch (job.name) {
      case JOB_SHIPPING_ASSIGN:
        await this.handleAssign(job as Job<ShippingAssignJobData>);
        break;
      case JOB_SHIPPING_TRACK:
        await this.handleTrack(job as Job<ShippingTrackJobData>);
        break;
      default:
        this.logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async handleAssign(job: Job<ShippingAssignJobData>): Promise<void> {
    const { shipmentId, merchantId, orderId, carrierId } = job.data;
    this.logger.log(
      `[shipping-assign] Processing shipment=${shipmentId} order=${orderId} merchant=${merchantId} carrier=${carrierId}`,
    );
    // Stub: real implementation would call carrier API to create shipment
    // and update the shipment record with trackingNumber / labelUrl
  }

  private async handleTrack(job: Job<ShippingTrackJobData>): Promise<void> {
    const { shipmentId, merchantId, trackingNumber } = job.data;
    this.logger.log(
      `[shipping-track] Tracking shipment=${shipmentId} tracking=${trackingNumber} merchant=${merchantId}`,
    );
    // Stub: real implementation would poll carrier tracking API
    // and update ShipmentStatus accordingly
  }
}
