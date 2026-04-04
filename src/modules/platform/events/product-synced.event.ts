export class ProductSyncedEvent {
  constructor(
    public readonly merchantId: string,
    public readonly platformProductId: string,
    public readonly productId: string,
  ) {}
}
