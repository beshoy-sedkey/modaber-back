export class OrderUpdatedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly orderId: string,
    public readonly status: string,
  ) {}
}
