import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { EncryptionModule } from 'src/shared/encryption/encryption.module';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService, WHATSAPP_QUEUE } from './whatsapp.service';
import { WhatsAppProcessor } from './whatsapp.processor';

@Module({
  imports: [
    PrismaModule,
    EncryptionModule,
    BullModule.registerQueue({ name: WHATSAPP_QUEUE }),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppProcessor],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
