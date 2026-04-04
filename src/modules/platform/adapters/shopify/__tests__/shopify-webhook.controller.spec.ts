import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import * as crypto from 'crypto';
import { ShopifyWebhookController } from '../shopify-webhook.controller';
import { QUEUE_SHOPIFY_WEBHOOKS } from '../../../platform.module';
import { Request } from 'express';

describe('ShopifyWebhookController', () => {
  let controller: ShopifyWebhookController;
  const webhookSecret = 'test-webhook-secret';

  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShopifyWebhookController],
      providers: [
        {
          provide: getQueueToken(QUEUE_SHOPIFY_WEBHOOKS),
          useValue: mockQueue,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def = '') =>
              key === 'SHOPIFY_API_SECRET' ? webhookSecret : def,
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<ShopifyWebhookController>(ShopifyWebhookController);
    mockQueue.add.mockClear();
  });

  function buildHmac(body: string): string {
    return crypto.createHmac('sha256', webhookSecret).update(body).digest('base64');
  }

  it('should return 200 and queue the job for valid HMAC', async () => {
    const body = JSON.stringify({ id: 123 });
    const hmac = buildHmac(body);
    const req = { rawBody: Buffer.from(body) } as unknown as Request;

    const result = await controller.handle(hmac, 'orders/create', 'test.myshopify.com', req);

    expect(result).toEqual({ received: true });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'orders/create',
      expect.objectContaining({ topic: 'orders/create', shop: 'test.myshopify.com' }),
      expect.any(Object),
    );
  });

  it('should throw UnauthorizedException for invalid HMAC', async () => {
    const req = { rawBody: Buffer.from(JSON.stringify({ id: 123 })) } as unknown as Request;
    await expect(
      controller.handle('invalid-hmac', 'orders/create', 'test.myshopify.com', req),
    ).rejects.toThrow('Invalid HMAC signature');
  });

  it('should throw UnauthorizedException when rawBody is missing', async () => {
    const req = {} as Request;
    await expect(
      controller.handle('any-hmac', 'orders/create', 'test.myshopify.com', req),
    ).rejects.toThrow('Missing raw body');
  });
});
