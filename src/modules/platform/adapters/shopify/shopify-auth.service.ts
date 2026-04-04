import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import axios from 'axios';

export interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
}

@Injectable()
export class ShopifyAuthService {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly scopes: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('SHOPIFY_API_KEY', '');
    this.apiSecret = this.config.get<string>('SHOPIFY_API_SECRET', '');
    this.scopes = this.config.get<string>(
      'SHOPIFY_SCOPES',
      'read_products,write_products,read_orders,write_orders,read_customers',
    );
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  buildInstallUrl(shop: string): string {
    const redirectUri = `${this.appUrl}/auth/shopify/callback`;
    const nonce = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.apiKey,
      scope: this.scopes,
      redirect_uri: redirectUri,
      state: nonce,
    });
    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  verifyHmac(query: Record<string, string>): boolean {
    const { hmac, ...rest } = query;
    if (!hmac) return false;

    const message = Object.keys(rest)
      .sort()
      .map((key) => `${key}=${rest[key]}`)
      .join('&');

    const digest = crypto
      .createHmac('sha256', this.apiSecret)
      .update(message)
      .digest('hex');

    if (digest.length !== hmac.length) return false;
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
  }

  async exchangeCode(shop: string, code: string): Promise<ShopifyTokenResponse> {
    const url = `https://${shop}/admin/oauth/access_token`;
    try {
      const response = await axios.post<ShopifyTokenResponse>(url, {
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        code,
      });
      return response.data;
    } catch {
      throw new UnauthorizedException('Failed to exchange Shopify OAuth code');
    }
  }
}
