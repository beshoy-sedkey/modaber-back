export interface ShipmentRequest {
  orderId: string;
  merchantId: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  city: string;
  country: string;
  weightKg?: number;
  description?: string;
}

export interface ShipmentResponse {
  trackingNumber: string;
  labelUrl?: string;
  estimatedCost?: number;
  estimatedDelivery?: Date;
}

export interface TrackingInfo {
  trackingNumber: string;
  status: string;
  events: TrackingEvent[];
  estimatedDelivery?: Date;
}

export interface TrackingEvent {
  timestamp: Date;
  location?: string;
  description: string;
}

export interface CarrierAdapter {
  createShipment(shipmentData: ShipmentRequest): Promise<ShipmentResponse>;
  trackShipment(trackingNumber: string): Promise<TrackingInfo>;
}
