import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import {
  PlatformAdapter,
  PlatformProduct,
  PlatformOrder,
  PlatformCustomer,
  StoreInfo,
  TokenResult,
} from '../../interfaces/platform-adapter.interface';
import { ShopifyAuthService } from './shopify-auth.service';
import { mapShopifyProduct, mapShopifyOrder, mapShopifyCustomer } from './shopify-mapper';

const SHOPIFY_API_VERSION = '2024-01';

@Injectable()
export class ShopifyAdapter implements PlatformAdapter {
  private readonly logger = new Logger(ShopifyAdapter.name);

  constructor(
    private readonly config: ConfigService,
    private readonly shopifyAuth: ShopifyAuthService,
  ) {}

  private buildClient(accessToken: string, shop: string): AxiosInstance {
    return axios.create({
      baseURL: `https://${shop}/admin/api/${SHOPIFY_API_VERSION}`,
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 429) {
        const retryAfter = Number(error.response.headers['retry-after'] ?? 2);
        this.logger.warn(`Shopify rate limit hit, retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return fn();
      }
      throw error;
    }
  }

  getInstallUrl(state: string): string {
    return this.shopifyAuth.buildInstallUrl(state);
  }

  async exchangeCodeForToken(code: string, shop?: string): Promise<TokenResult> {
    const tokenData = await this.shopifyAuth.exchangeCode(shop ?? '', code);
    const storeInfo = await this.getStoreInfo(tokenData.access_token, shop ?? '');
    return {
      accessToken: tokenData.access_token,
      storeId: shop ?? '',
      storeInfo,
    };
  }

  async refreshAccessToken(
    _merchantId: string,
    _refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt?: Date }> {
    // Shopify uses permanent tokens — no refresh needed
    throw new Error('Shopify does not support token refresh');
  }

  async fetchProducts(
    accessToken: string,
    storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformProduct[]> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ products: unknown[] }>('/products.json', {
        params: { limit, page },
      });
      return res.data.products.map((p) => mapShopifyProduct(p as Parameters<typeof mapShopifyProduct>[0]));
    });
  }

  async fetchProduct(
    accessToken: string,
    storeId: string,
    productId: string,
  ): Promise<PlatformProduct> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ product: unknown }>(`/products/${productId}.json`);
      return mapShopifyProduct(res.data.product as Parameters<typeof mapShopifyProduct>[0]);
    });
  }

  async fetchOrders(
    accessToken: string,
    storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformOrder[]> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ orders: unknown[] }>('/orders.json', {
        params: { limit, page, status: 'any' },
      });
      return res.data.orders.map((o) => mapShopifyOrder(o as Parameters<typeof mapShopifyOrder>[0]));
    });
  }

  async fetchOrder(
    accessToken: string,
    storeId: string,
    orderId: string,
  ): Promise<PlatformOrder> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ order: unknown }>(`/orders/${orderId}.json`);
      return mapShopifyOrder(res.data.order as Parameters<typeof mapShopifyOrder>[0]);
    });
  }

  async updateOrderStatus(
    accessToken: string,
    storeId: string,
    orderId: string,
    status: string,
  ): Promise<void> {
    const client = this.buildClient(accessToken, storeId);
    await this.withRetry(() =>
      client.post(`/orders/${orderId}/fulfillments.json`, {
        fulfillment: { status },
      }),
    );
  }

  async fetchCustomers(
    accessToken: string,
    storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformCustomer[]> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ customers: unknown[] }>('/customers.json', {
        params: { limit, page },
      });
      return res.data.customers.map((c) => mapShopifyCustomer(c as Parameters<typeof mapShopifyCustomer>[0]));
    });
  }

  async registerWebhooks(accessToken: string, storeId: string): Promise<void> {
    const client = this.buildClient(accessToken, storeId);
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const webhooks = [
      { topic: 'orders/create',   address: `${appUrl}/webhooks/shopify` },
      { topic: 'orders/updated',  address: `${appUrl}/webhooks/shopify` },
      { topic: 'products/create', address: `${appUrl}/webhooks/shopify` },
      { topic: 'products/update', address: `${appUrl}/webhooks/shopify` },
      { topic: 'app/uninstalled', address: `${appUrl}/webhooks/shopify` },
    ];

    for (const webhook of webhooks) {
      await this.withRetry(() =>
        client.post('/webhooks.json', { webhook: { ...webhook, format: 'json' } }),
      ).catch((err: AxiosError) => {
        // 422 = webhook already exists
        if (err.response?.status !== 422) throw err;
      });
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return this.shopifyAuth.verifyHmac({ hmac: signature, body: rawBody.toString('base64') });
  }

  async getStoreInfo(accessToken: string, storeId: string): Promise<StoreInfo> {
    const client = this.buildClient(accessToken, storeId);
    return this.withRetry(async () => {
      const res = await client.get<{ shop: { name: string; email: string; phone?: string; currency: string; timezone?: string; domain?: string } }>('/shop.json');
      const shop = res.data.shop;
      return {
        name: shop.name,
        email: shop.email,
        phone: shop.phone ?? undefined,
        currency: shop.currency,
        timezone: shop.timezone ?? undefined,
        domain: shop.domain ?? undefined,
      };
    });
  }
}
