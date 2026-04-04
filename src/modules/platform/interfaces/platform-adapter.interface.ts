export interface PlatformProduct {
  platformProductId: string;
  name: string;
  description?: string;
  price: number;
  compareAtPrice?: number;
  currency: string;
  stockQuantity: number;
  category?: string;
  brand?: string;
  attributes?: Record<string, unknown>;
  images?: string[];
  isActive: boolean;
}

export interface PlatformOrderItem {
  platformProductId: string;
  variantId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface PlatformOrder {
  platformOrderId: string;
  customerPhone?: string;
  customerEmail?: string;
  customerName?: string;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  total: number;
  currency: string;
  shippingAddress?: Record<string, unknown>;
  items: PlatformOrderItem[];
  notes?: string;
  createdAt: Date;
}

export interface PlatformCustomer {
  platformCustomerId: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  totalOrders: number;
  totalSpent: number;
}

export interface StoreInfo {
  name: string;
  email: string;
  phone?: string;
  currency: string;
  timezone?: string;
  domain?: string;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  storeId: string;
  storeInfo: StoreInfo;
}

export interface PlatformAdapter {
  getInstallUrl(state: string): string;

  exchangeCodeForToken(code: string, shop?: string): Promise<TokenResult>;

  refreshAccessToken(
    merchantId: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt?: Date }>;

  fetchProducts(
    accessToken: string,
    storeId: string,
    page?: number,
    limit?: number,
  ): Promise<PlatformProduct[]>;

  fetchProduct(
    accessToken: string,
    storeId: string,
    productId: string,
  ): Promise<PlatformProduct>;

  fetchOrders(
    accessToken: string,
    storeId: string,
    page?: number,
    limit?: number,
  ): Promise<PlatformOrder[]>;

  fetchOrder(
    accessToken: string,
    storeId: string,
    orderId: string,
  ): Promise<PlatformOrder>;

  updateOrderStatus(
    accessToken: string,
    storeId: string,
    orderId: string,
    status: string,
  ): Promise<void>;

  fetchCustomers(
    accessToken: string,
    storeId: string,
    page?: number,
    limit?: number,
  ): Promise<PlatformCustomer[]>;

  registerWebhooks(accessToken: string, storeId: string): Promise<void>;

  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean;

  getStoreInfo(accessToken: string, storeId: string): Promise<StoreInfo>;
}
