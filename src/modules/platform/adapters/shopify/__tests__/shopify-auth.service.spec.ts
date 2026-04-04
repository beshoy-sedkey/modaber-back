import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ShopifyAuthService } from '../shopify-auth.service';

describe('ShopifyAuthService', () => {
  let service: ShopifyAuthService;
  const apiSecret = 'test-shopify-secret';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyAuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: string) => {
              const map: Record<string, string> = {
                SHOPIFY_API_KEY: 'test-api-key',
                SHOPIFY_API_SECRET: apiSecret,
                SHOPIFY_SCOPES: 'read_products,read_orders',
                APP_URL: 'https://app.example.com',
              };
              return map[key] ?? def ?? '';
            }),
          },
        },
      ],
    }).compile();

    service = module.get<ShopifyAuthService>(ShopifyAuthService);
  });

  describe('buildInstallUrl', () => {
    it('should build a valid Shopify OAuth URL', () => {
      const url = service.buildInstallUrl('test-store.myshopify.com');
      expect(url).toContain('https://test-store.myshopify.com/admin/oauth/authorize');
      expect(url).toContain('client_id=test-api-key');
      expect(url).toContain('redirect_uri=');
    });
  });

  describe('verifyHmac', () => {
    it('should return true for a valid HMAC', () => {
      const params: Record<string, string> = {
        shop: 'test-store.myshopify.com',
        code: 'abc123',
        timestamp: '1234567890',
      };
      const message = Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join('&');
      const hmac = crypto
        .createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex');

      expect(service.verifyHmac({ ...params, hmac })).toBe(true);
    });

    it('should return false for an invalid HMAC', () => {
      const params = {
        shop: 'test-store.myshopify.com',
        code: 'abc123',
        hmac: 'invalid-hmac',
      };
      expect(service.verifyHmac(params)).toBe(false);
    });

    it('should return false when hmac is missing', () => {
      const params = { shop: 'test-store.myshopify.com', code: 'abc123' };
      expect(service.verifyHmac(params)).toBe(false);
    });
  });
});
