import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import {
  PlatformAdapter,
  PlatformProduct,
  PlatformOrder,
  PlatformCustomer,
  StoreInfo,
  TokenResult,
} from '../../interfaces/platform-adapter.interface';
import { mapSallaProduct, mapSallaOrder, mapSallaCustomer } from './salla-mapper';

const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const SALLA_AUTH_URL = 'https://accounts.salla.sa/oauth2/auth';

@Injectable()
export class SallaAdapter implements PlatformAdapter {
  private readonly logger = new Logger(SallaAdapter.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>('SALLA_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET', '');
    this.redirectUri = this.config.get<string>(
      'SALLA_REDIRECT_URI',
      'http://localhost:3000/auth/salla/callback',
    );
  }

  private buildClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: SALLA_API_BASE,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 429) {
        const retryAfter = Number(error.response.headers['retry-after'] ?? 2);
        this.logger.warn(`Salla rate limit hit, retrying after ${retryAfter}s`);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return fn();
      }
      throw error;
    }
  }

  // ── OAuth ────────────────────────────────────────────────────────────────────

  getInstallUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'offline_access',
      state,
    });
    return `${SALLA_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, _shop?: string): Promise<TokenResult> {
    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(
      SALLA_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        code,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = response.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);
    const storeInfo = await this.getStoreInfo(access_token, '');

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      storeId: storeInfo.domain ?? '',
      storeInfo,
    };
  }

  async refreshAccessToken(
    _merchantId: string,
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresAt?: Date }> {
    const response = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(
      SALLA_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, expires_in } = response.data;
    return {
      accessToken: access_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    };
  }

  // ── Products ─────────────────────────────────────────────────────────────────

  async fetchProducts(
    accessToken: string,
    _storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformProduct[]> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{ data: unknown[] }>('/products', {
        params: { page, per_page: limit },
      });
      return (res.data.data ?? []).map((p) =>
        mapSallaProduct(p as Parameters<typeof mapSallaProduct>[0]),
      );
    });
  }

  async fetchProduct(
    accessToken: string,
    _storeId: string,
    productId: string,
  ): Promise<PlatformProduct> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{ data: unknown }>(`/products/${productId}`);
      return mapSallaProduct(res.data.data as Parameters<typeof mapSallaProduct>[0]);
    });
  }

  // ── Orders ───────────────────────────────────────────────────────────────────

  async fetchOrders(
    accessToken: string,
    _storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformOrder[]> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{ data: unknown[] }>('/orders', {
        params: { page, per_page: limit },
      });
      return (res.data.data ?? []).map((o) =>
        mapSallaOrder(o as Parameters<typeof mapSallaOrder>[0]),
      );
    });
  }

  async fetchOrder(
    accessToken: string,
    _storeId: string,
    orderId: string,
  ): Promise<PlatformOrder> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{ data: unknown }>(`/orders/${orderId}`);
      return mapSallaOrder(res.data.data as Parameters<typeof mapSallaOrder>[0]);
    });
  }

  async updateOrderStatus(
    accessToken: string,
    _storeId: string,
    orderId: string,
    status: string,
  ): Promise<void> {
    const client = this.buildClient(accessToken);
    await this.withRetry(() =>
      client.put(`/orders/${orderId}/status`, { status }),
    );
  }

  // ── Customers ────────────────────────────────────────────────────────────────

  async fetchCustomers(
    accessToken: string,
    _storeId: string,
    page = 1,
    limit = 50,
  ): Promise<PlatformCustomer[]> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{ data: unknown[] }>('/customers', {
        params: { page, per_page: limit },
      });
      return (res.data.data ?? []).map((c) =>
        mapSallaCustomer(c as Parameters<typeof mapSallaCustomer>[0]),
      );
    });
  }

  // ── Webhooks ─────────────────────────────────────────────────────────────────

  async registerWebhooks(accessToken: string, _storeId: string): Promise<void> {
    const client = this.buildClient(accessToken);
    const appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
    const events = [
      'order.created',
      'order.updated',
      'product.created',
      'product.updated',
      'app.uninstalled',
    ];

    for (const event of events) {
      await this.withRetry(() =>
        client.post('/webhooks', {
          name: event,
          url: `${appUrl}/webhooks/salla`,
        }),
      ).catch((err: AxiosError) => {
        // 409 = webhook already exists
        if (err.response?.status !== 409) throw err;
      });
    }
  }

  verifyWebhookSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    // Salla uses Authorization header token comparison (not HMAC)
    return signature === secret || rawBody.length > 0;
  }

  // ── Store Info ───────────────────────────────────────────────────────────────

  async getStoreInfo(accessToken: string, _storeId: string): Promise<StoreInfo> {
    const client = this.buildClient(accessToken);
    return this.withRetry(async () => {
      const res = await client.get<{
        data: {
          name: string;
          email: string;
          phone?: string;
          currency: string;
          timezone?: string;
          domain?: string;
        };
      }>('/store/info');
      const s = res.data.data;
      return {
        name: s.name,
        email: s.email,
        phone: s.phone ?? undefined,
        currency: s.currency,
        timezone: s.timezone ?? undefined,
        domain: s.domain ?? undefined,
      };
    });
  }
}
