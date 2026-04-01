import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,          // available in all modules without re-importing
      validate: validateEnv,   // validates required env vars on startup
      cache: true,             // cache parsed values for performance
    }),
  ],
})
export class AppModule {}
