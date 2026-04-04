import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, Request } from 'express';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // ── Security ──────────────────────────────────────────────────────────────
  app.use(helmet());
  app.enableCors();

  // ── Raw body capture for webhook HMAC verification ────────────────────────
  app.use(
    json({
      verify: (req: Request, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );

  // ── Global validation pipe ────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,       // strip unknown properties
      transform: true,       // auto-transform plain objects to DTO instances
      forbidNonWhitelisted: false,
    }),
  );

  // ── Swagger ───────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('E-Commerce AI Automation API')
    .setDescription(
      'AI-powered e-commerce automation platform integrating Shopify & Salla',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // ── Start ─────────────────────────────────────────────────────────────────
  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs:              http://localhost:${port}/api/docs`);
}

bootstrap();
