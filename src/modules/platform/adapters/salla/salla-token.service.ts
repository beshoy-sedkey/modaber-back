import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import Redis from 'ioredis';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { MerchantReauthRequiredEvent } from '../../events/merchant-reauth-required.event';
import { QUEUE_SALLA_WEBHOOKS } from '../../platform.module';

const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const MUTEX_TTL_SECONDS = 30;

@Injectable()
export class SallaTokenService {
  private readonly logger = new Logger(SallaTokenService.name);
  private readonly redis: Redis;
  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    @InjectQueue(QUEUE_SALLA_WEBHOOKS) private readonly queue: Queue,
  ) {
    this.clientId = this.config.get<string>('SALLA_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET', '');
    this.redis = new Redis(this.config.get<string>('REDIS_URL', 'redis://localhost:6379'));
  }

  async refreshToken(merchantId: string): Promise<string> {
    const mutexKey = `salla:refresh:mutex:${merchantId}`;

    // Acquire mutex — SET NX EX (only one refresh at a time)
    const acquired = await this.redis.set(mutexKey, '1', 'EX', MUTEX_TTL_SECONDS, 'NX');
    if (!acquired) {
      // Another process is already refreshing — wait and return current token
      this.logger.log(`Mutex busy for merchant ${merchantId}, waiting for refresh`);
      await new Promise((r) => setTimeout(r, 2000));
      const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
      return merchant?.platformAccessToken ?? '';
    }

    try {
      const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId } });
      if (!merchant?.platformRefreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await axios.post<{
        access_token: string;
        refresh_token: string;
        expires_in: number;
      }>(SALLA_TOKEN_URL, new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: merchant.platformRefreshToken,
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const { access_token, refresh_token, expires_in } = response.data;
      const expiresAt = new Date(Date.now() + expires_in * 1000);

      await this.prisma.merchant.update({
        where: { id: merchantId },
        data: {
          platformAccessToken: access_token,
          platformRefreshToken: refresh_token,
          tokenExpiresAt: expiresAt,
          needsReauth: false,
        },
      });

      // Schedule next refresh 1 day before expiry
      const refreshDelay = Math.max(0, expires_in * 1000 - 24 * 60 * 60 * 1000);
      await this.queue.add(
        'salla-token-refresh',
        { merchantId },
        { delay: refreshDelay, jobId: `salla-refresh-${merchantId}` },
      );

      this.logger.log(`Token refreshed for merchant: ${merchantId}`);
      return access_token;
    } catch (err) {
      this.logger.error(`Token refresh failed for merchant ${merchantId}`, err);
      await this.prisma.merchant.update({
        where: { id: merchantId },
        data: { needsReauth: true },
      });
      this.events.emit('merchant.reauth.required', new MerchantReauthRequiredEvent(merchantId, 'token_refresh_failed'));
      throw err;
    } finally {
      await this.redis.del(mutexKey);
    }
  }
}
