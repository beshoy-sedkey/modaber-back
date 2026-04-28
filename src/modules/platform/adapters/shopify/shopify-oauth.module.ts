import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ShopifyAuthService } from './shopify-auth.service';
import { ShopifyAdapter } from './shopify.adapter';
import { ShopifyOauthController } from './shopify-oauth.controller';
import { ShopifyWebhookController } from './shopify-webhook.controller';
import { ShopifyWebhookProcessor } from './shopify-webhook.processor';
import { ShopifySyncService } from './shopify-sync.service';
import { ShopifySyncController } from './shopify-sync.controller';
import { AuthModule } from 'src/modules/auth/auth.module';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { QUEUE_SHOPIFY_WEBHOOKS, QUEUE_PRODUCT_SYNC } from '../../platform.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BullModule.registerQueue(
      { name: QUEUE_SHOPIFY_WEBHOOKS },
      { name: QUEUE_PRODUCT_SYNC },
    ),
  ],
  controllers: [ShopifyOauthController, ShopifyWebhookController, ShopifySyncController],
  providers: [ShopifyAuthService, ShopifyAdapter, ShopifyWebhookProcessor, ShopifySyncService],
  exports: [ShopifyAuthService, ShopifyAdapter, ShopifySyncService],
})
export class ShopifyOauthModule {}
