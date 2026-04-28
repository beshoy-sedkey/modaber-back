import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { PrismaModule } from 'src/shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
