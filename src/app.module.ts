import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { validateEnv } from './config/env.validation';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ShopifyOauthModule } from './modules/platform/adapters/shopify/shopify-oauth.module';
import { SallaOauthModule } from './modules/platform/adapters/salla/salla-oauth.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    EventEmitterModule.forRoot(),
    SharedModule,
    AuthModule,
    PlatformModule,
    ShopifyOauthModule,
    SallaOauthModule,
    ProductsModule,
    OrdersModule,
  ],
})
export class AppModule {}
