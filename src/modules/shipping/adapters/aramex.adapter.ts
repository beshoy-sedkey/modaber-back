import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  CarrierAdapter,
  ShipmentRequest,
  ShipmentResponse,
  TrackingInfo,
} from './carrier-adapter.interface';

@Injectable()
export class AramexAdapter implements CarrierAdapter {
  async createShipment(_shipmentData: ShipmentRequest): Promise<ShipmentResponse> {
    // Stub: real implementation would call Aramex SOAP/REST API
    throw new NotImplementedException('Aramex createShipment not yet implemented');
  }

  async trackShipment(_trackingNumber: string): Promise<TrackingInfo> {
    // Stub: real implementation would call Aramex tracking API
    throw new NotImplementedException('Aramex trackShipment not yet implemented');
  }
}
