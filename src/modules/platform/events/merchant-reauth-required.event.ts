export class MerchantReauthRequiredEvent {
  constructor(
    public readonly merchantId: string,
    public readonly reason: string,
  ) {}
}
