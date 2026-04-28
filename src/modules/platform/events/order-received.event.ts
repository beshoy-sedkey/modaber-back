export class OrderReceivedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly platformOrderId: string,
    public readonly orderId: string,
  ) {}
}
