import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SallaOauthController } from './salla-oauth.controller';
import { SallaTokenService } from './salla-token.service';
import { AuthModule } from 'src/modules/auth/auth.module';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { QUEUE_SALLA_WEBHOOKS } from '../../platform.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
    BullModule.registerQueue({ name: QUEUE_SALLA_WEBHOOKS }),
  ],
  controllers: [SallaOauthController],
  providers: [SallaTokenService],
  exports: [SallaTokenService],
})
export class SallaOauthModule {}
