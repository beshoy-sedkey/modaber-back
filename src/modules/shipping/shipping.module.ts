import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ShippingController } from './shipping.controller';
import { ShippingService, SHIPPING_QUEUE } from './shipping.service';
import { ShippingProcessor } from './shipping.processor';
import { AramexAdapter } from './adapters/aramex.adapter';
import { SmsaAdapter } from './adapters/smsa.adapter';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { EncryptionModule } from 'src/shared/encryption/encryption.module';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    BullModule.registerQueue({ name: SHIPPING_QUEUE }),
  ],
  controllers: [ShippingController],
  providers: [ShippingService, ShippingProcessor, AramexAdapter, SmsaAdapter],
  exports: [ShippingService],
})
export class ShippingModule {}
