import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  CarrierAdapter,
  ShipmentRequest,
  ShipmentResponse,
  TrackingInfo,
} from './carrier-adapter.interface';

@Injectable()
export class SmsaAdapter implements CarrierAdapter {
  async createShipment(_shipmentData: ShipmentRequest): Promise<ShipmentResponse> {
    // Stub: real implementation would call SMSA Express API
    throw new NotImplementedException('SMSA createShipment not yet implemented');
  }

  async trackShipment(_trackingNumber: string): Promise<TrackingInfo> {
    // Stub: real implementation would call SMSA tracking API
    throw new NotImplementedException('SMSA trackShipment not yet implemented');
  }
}
