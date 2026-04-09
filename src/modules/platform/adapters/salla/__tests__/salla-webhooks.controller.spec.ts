import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { UnauthorizedException } from '@nestjs/common';
import { SallaWebhooksController } from '../salla-webhooks.controller';
import { QUEUE_SALLA_WEBHOOKS } from '../../../platform.module';

describe('SallaWebhooksController', () => {
  let controller: SallaWebhooksController;
  const webhookSecret = 'test-salla-webhook-secret';

  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SallaWebhooksController],
      providers: [
        {
          provide: getQueueToken(QUEUE_SALLA_WEBHOOKS),
          useValue: mockQueue,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def = '') =>
              key === 'SALLA_WEBHOOK_SECRET' ? webhookSecret : def,
            ),
          },
        },
      ],
    }).compile();

    controller = module.get<SallaWebhooksController>(SallaWebhooksController);
    mockQueue.add.mockClear();
  });

  const sampleBody = {
    event: 'order.created',
    merchant: 12345,
    data: { id: 9001, status: 'pending' },
  };

  it('should return { received: true } and enqueue the job for a valid token', async () => {
    const result = await controller.handle(`Bearer ${webhookSecret}`, sampleBody);

    expect(result).toEqual({ received: true });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({ event: 'order.created', merchantStoreId: '12345' }),
      expect.any(Object),
    );
  });

  it('should accept token without Bearer prefix', async () => {
    const result = await controller.handle(webhookSecret, sampleBody);
    expect(result).toEqual({ received: true });
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('should throw UnauthorizedException for invalid token', async () => {
    await expect(
      controller.handle('Bearer wrong-secret', sampleBody),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when authorization header is missing', async () => {
    await expect(
      controller.handle('', sampleBody),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when event is missing', async () => {
    const bodyWithoutEvent = { event: '', merchant: 12345, data: {} };
    await expect(
      controller.handle(`Bearer ${webhookSecret}`, bodyWithoutEvent),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should enqueue product.created webhook correctly', async () => {
    const body = {
      event: 'product.created',
      merchant: 12345,
      data: { id: 5001, name: 'Test Product' },
    };

    const result = await controller.handle(`Bearer ${webhookSecret}`, body);
    expect(result).toEqual({ received: true });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'product.created',
      expect.objectContaining({ event: 'product.created', merchantStoreId: '12345' }),
      expect.any(Object),
    );
  });

  it('should enqueue app.uninstalled webhook correctly', async () => {
    const body = {
      event: 'app.uninstalled',
      merchant: 12345,
      data: {},
    };

    const result = await controller.handle(`Bearer ${webhookSecret}`, body);
    expect(result).toEqual({ received: true });
    expect(mockQueue.add).toHaveBeenCalledWith(
      'app.uninstalled',
      expect.objectContaining({ event: 'app.uninstalled' }),
      expect.any(Object),
    );
  });
});
