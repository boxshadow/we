import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import path from 'path';
import fs from 'fs';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const adminIndex = path.resolve(process.cwd(), 'public', 'admin-dist', 'index.html');
  // Admin SPA 路由重定向与 HTML5 History 模式回退支持 (兼容 Express 5 / path-to-regexp v8，规避 .gemini dotfile 拦截)
  app.use((req: any, res: any, next: any) => {
    if (req.path === '/admin' || req.path === '/admin/') {
      return res.redirect('/admin-dist/');
    }
    if (req.method === 'GET' && req.path.startsWith('/admin-dist') && !req.path.includes('.')) {
      if (fs.existsSync(adminIndex)) {
        return res.type('html').send(fs.readFileSync(adminIndex, 'utf-8'));
      }
    }
    next();
  });

  app.useStaticAssets(path.join(process.cwd(), 'public'));
  app.setGlobalPrefix('api');
  app.enableCors();

  // Configure OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Multi-Chain Web3 Backend API')
    .setDescription(
      '生产级多链模块化服务端框架 API 文档（EVM / Solana / Tron），涵盖 Web3 鉴权、充提转账、多链中台配置、锁仓、DEX、发币与实时行情。',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: '输入从 /api/auth/login 获取的 accessToken',
        in: 'header',
      },
      'JWT-Auth',
    )
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);



  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`Multi-chain Web3 Backend is running on: http://localhost:${port}/api`);
  logger.log(`Admin Portal (Vue 3 + Naive UI) is available on: http://localhost:${port}/admin`);
  logger.log(`Web3 Login Test Page is available on: http://localhost:${port}/demo.html`);
  logger.log(`Swagger API Documentation is available on: http://localhost:${port}/api/docs`);
}

await bootstrap();
