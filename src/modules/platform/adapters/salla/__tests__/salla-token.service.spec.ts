import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { SallaTokenService } from '../salla-token.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { QUEUE_SALLA_WEBHOOKS } from '../../../platform.module';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    set: jest.fn(),
    del: jest.fn(),
  }));
});

// Mock axios
jest.mock('axios', () => ({
  post: jest.fn(),
}));

import axios from 'axios';

describe('SallaTokenService', () => {
  let service: SallaTokenService;
  let prisma: jest.Mocked<PrismaService>;
  let redisInstance: { set: jest.Mock; del: jest.Mock };

  const mockQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const Redis = jest.requireMock('ioredis') as jest.Mock;
    redisInstance = { set: jest.fn(), del: jest.fn() };
    Redis.mockImplementation(() => redisInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SallaTokenService,
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def = '') => {
              const map: Record<string, string> = {
                SALLA_CLIENT_ID: 'client-id',
                SALLA_CLIENT_SECRET: 'client-secret',
                REDIS_URL: 'redis://localhost:6379',
              };
              return map[key] ?? def;
            }),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: getQueueToken(QUEUE_SALLA_WEBHOOKS), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SallaTokenService>(SallaTokenService);
    prisma = module.get(PrismaService);
  });

  it('should refresh token successfully when mutex is acquired', async () => {
    redisInstance.set.mockResolvedValue('OK');
    redisInstance.del.mockResolvedValue(1);

    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
      id: 'merchant-1',
      platformRefreshToken: 'old-refresh-token',
    });

    (axios.post as jest.Mock).mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 86400 },
    });

    (prisma.merchant.update as jest.Mock).mockResolvedValue({});

    const token = await service.refreshToken('merchant-1');
    expect(token).toBe('new-access');
    expect(prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ platformAccessToken: 'new-access' }),
      }),
    );
  });

  it('should return existing token when mutex is busy (concurrent refresh)', async () => {
    // Reset all mocks for clean state
    jest.clearAllMocks();
    redisInstance.set.mockResolvedValue(null); // mutex not acquired — another process holds it

    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
      id: 'merchant-1',
      platformAccessToken: 'existing-token',
      platformRefreshToken: 'old-token',
    });

    const token = await service.refreshToken('merchant-1');
    expect(token).toBe('existing-token');
    // Mutex was not acquired so no HTTP token exchange should happen
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('should emit MerchantReauthRequiredEvent on refresh failure', async () => {
    const events = service['events'] as jest.Mocked<EventEmitter2>;
    redisInstance.set.mockResolvedValue('OK');
    redisInstance.del.mockResolvedValue(1);

    (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
      id: 'merchant-1',
      platformRefreshToken: 'old-refresh',
    });
    (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));
    (prisma.merchant.update as jest.Mock).mockResolvedValue({});

    await expect(service.refreshToken('merchant-1')).rejects.toThrow('Network error');
    expect(events.emit).toHaveBeenCalledWith('merchant.reauth.required', expect.any(Object));
  });
});
