import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SallaOauthController } from './salla-oauth.controller';
import { SallaTokenService } from './salla-token.service';
import { SallaAdapter } from './salla.adapter';
import { SallaWebhooksController } from './salla-webhooks.controller';
import { SallaWebhooksProcessor } from './salla-webhooks.processor';
import { SallaSyncService } from './salla-sync.service';
import { SallaSyncController } from './salla-sync.controller';
import { AuthModule } from 'src/modules/auth/auth.module';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { QUEUE_SALLA_WEBHOOKS, QUEUE_PRODUCT_SYNC } from '../../platform.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BullModule.registerQueue(
      { name: QUEUE_SALLA_WEBHOOKS },
      { name: QUEUE_PRODUCT_SYNC },
    ),
  ],
  controllers: [SallaOauthController, SallaWebhooksController, SallaSyncController],
  providers: [SallaTokenService, SallaAdapter, SallaWebhooksProcessor, SallaSyncService],
  exports: [SallaTokenService, SallaAdapter, SallaSyncService],
})
export class SallaOauthModule {}
