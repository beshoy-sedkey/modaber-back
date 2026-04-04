import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlatformAdapterFactory } from './platform-adapter.factory';

export const QUEUE_SHOPIFY_WEBHOOKS = 'shopify-webhooks';
export const QUEUE_SALLA_WEBHOOKS = 'salla-webhooks';
export const QUEUE_PRODUCT_SYNC = 'product-sync';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.get<string>('REDIS_URL'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_SHOPIFY_WEBHOOKS },
      { name: QUEUE_SALLA_WEBHOOKS },
      { name: QUEUE_PRODUCT_SYNC },
    ),
  ],
  providers: [PlatformAdapterFactory],
  exports: [
    PlatformAdapterFactory,
    BullModule,
  ],
})
export class PlatformModule {}
