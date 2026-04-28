import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor!: ReturnType<typeof createAdapter>;

  // Keep a typed reference to the app so we can retrieve ConfigService
  private readonly nestApp: INestApplication;

  constructor(app: INestApplication) {
    super(app);
    this.nestApp = app;
  }

  async connectToRedis(): Promise<void> {
    const config = this.nestApp.get(ConfigService);
    const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');

    const pubClient = new Redis(redisUrl);
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err: unknown) => {
      this.logger.error(`Redis pub client error: ${String(err)}`);
    });
    subClient.on('error', (err: unknown) => {
      this.logger.error(`Redis sub client error: ${String(err)}`);
    });

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Redis IO adapter connected');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    (server as { adapter: (a: ReturnType<typeof createAdapter>) => void }).adapter(
      this.adapterConstructor,
    );
    return server;
  }
}
