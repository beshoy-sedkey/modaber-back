import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { PrismaModule } from 'src/shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController],
})
export class OrdersModule {}
