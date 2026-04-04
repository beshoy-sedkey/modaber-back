import { Global, Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { EncryptionModule } from './encryption/encryption.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ResponseInterceptor } from './interceptors/response.interceptor';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

@Global()
@Module({
  imports: [PrismaModule, EncryptionModule],
  providers: [JwtAuthGuard, ResponseInterceptor, GlobalExceptionFilter],
  exports: [PrismaModule, EncryptionModule, JwtAuthGuard, ResponseInterceptor, GlobalExceptionFilter],
})
export class SharedModule {}
