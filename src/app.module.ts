import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { validateEnv } from './config/env.validation';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ShopifyOauthModule } from './modules/platform/adapters/shopify/shopify-oauth.module';
import { SallaOauthModule } from './modules/platform/adapters/salla/salla-oauth.module';
import { ProductsModule } from './modules/products/products.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ReportsModule } from './modules/reports/reports.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      cache: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    SharedModule,
    AuthModule,
    PlatformModule,
    ShopifyOauthModule,
    SallaOauthModule,
    ProductsModule,
    OrdersModule,
    ShippingModule,
    DashboardModule,
    ReportsModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
