import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SallaAdapter } from '../salla.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SallaAdapter', () => {
  let adapter: SallaAdapter;
  let mockAxiosInstance: { get: jest.Mock; post: jest.Mock; put: jest.Mock };

  beforeEach(async () => {
    mockAxiosInstance = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SallaAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def: string) => {
              const map: Record<string, string> = {
                SALLA_CLIENT_ID: 'test-client-id',
                SALLA_CLIENT_SECRET: 'test-client-secret',
                SALLA_REDIRECT_URI: 'http://localhost:3000/auth/salla/callback',
                APP_URL: 'http://localhost:3000',
              };
              return map[key] ?? def;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<SallaAdapter>(SallaAdapter);
  });

  afterEach(() => jest.clearAllMocks());

  // ── getInstallUrl ────────────────────────────────────────────────────────────

  describe('getInstallUrl', () => {
    it('should return Salla auth URL with correct params', () => {
      const url = adapter.getInstallUrl('test-state');
      expect(url).toContain('accounts.salla.sa/oauth2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=test-state');
      expect(url).toContain('response_type=code');
    });
  });

  // ── fetchProducts ────────────────────────────────────────────────────────────

  describe('fetchProducts', () => {
    it('should return mapped products', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 101,
              name: 'Coffee Maker',
              price: { amount: 149, currency: 'SAR' },
              quantity: 10,
              status: 'sale',
            },
          ],
        },
      });

      const products = await adapter.fetchProducts('token', 'store-id');
      expect(products).toHaveLength(1);
      expect(products[0].platformProductId).toBe('101');
      expect(products[0].name).toBe('Coffee Maker');
      expect(products[0].price).toBe(149);
      expect(products[0].isActive).toBe(true);
    });

    it('should return empty array when data is empty', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({ data: { data: [] } });
      const products = await adapter.fetchProducts('token', 'store-id');
      expect(products).toHaveLength(0);
    });
  });

  // ── fetchOrders ──────────────────────────────────────────────────────────────

  describe('fetchOrders', () => {
    it('should return mapped orders', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 5001,
              status: { slug: 'pending' },
              amounts: {
                subtotal: { amount: 200 },
                discount: { amount: 0 },
                shipping: { amount: 15 },
                total: { amount: 215 },
              },
              currency: 'SAR',
              items: [],
            },
          ],
        },
      });

      const orders = await adapter.fetchOrders('token', 'store-id');
      expect(orders).toHaveLength(1);
      expect(orders[0].platformOrderId).toBe('5001');
      expect(orders[0].status).toBe('pending');
      expect(orders[0].total).toBe(215);
    });
  });

  // ── fetchCustomers ───────────────────────────────────────────────────────────

  describe('fetchCustomers', () => {
    it('should return mapped customers', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 200,
              name: 'Ahmed Ali',
              email: 'ahmed@test.com',
              mobile: '+966501234567',
              orders_count: 3,
              total_spent: { amount: 750 },
            },
          ],
        },
      });

      const customers = await adapter.fetchCustomers('token', 'store-id');
      expect(customers).toHaveLength(1);
      expect(customers[0].platformCustomerId).toBe('200');
      expect(customers[0].name).toBe('Ahmed Ali');
      expect(customers[0].totalOrders).toBe(3);
      expect(customers[0].totalSpent).toBe(750);
    });
  });

  // ── getStoreInfo ─────────────────────────────────────────────────────────────

  describe('getStoreInfo', () => {
    it('should return store info', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          data: {
            name: 'My Salla Store',
            email: 'store@test.com',
            currency: 'SAR',
            domain: 'mystore.salla.sa',
          },
        },
      });

      const info = await adapter.getStoreInfo('token', '');
      expect(info.name).toBe('My Salla Store');
      expect(info.email).toBe('store@test.com');
      expect(info.currency).toBe('SAR');
      expect(info.domain).toBe('mystore.salla.sa');
    });
  });

  // ── verifyWebhookSignature ───────────────────────────────────────────────────

  describe('verifyWebhookSignature', () => {
    it('should return true when signature matches secret', () => {
      const result = adapter.verifyWebhookSignature(
        Buffer.from('body'),
        'my-secret',
        'my-secret',
      );
      expect(result).toBe(true);
    });
  });
});
