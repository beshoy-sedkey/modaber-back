export class AppUninstalledEvent {
  constructor(
    public readonly merchantId: string,
    public readonly platformStoreId: string,
  ) {}
}
