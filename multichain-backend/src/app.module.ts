import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './modules/prisma/prisma.module.js';
import { NetworkModule } from './modules/network/network.module.js';
import { WalletModule } from './modules/wallet/wallet.module.js';
import { AdaptersModule } from './modules/adapters/adapters.module.js';
import { TransferModule } from './modules/transfer/transfer.module.js';
import { TokenModule } from './modules/token/token.module.js';
import { DexModule } from './modules/dex/dex.module.js';
import { LockModule } from './modules/lock/lock.module.js';
import { PriceModule } from './modules/price/price.module.js';
import { UserModule } from './modules/user/user.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BalanceModule } from './modules/balance/balance.module.js';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    BalanceModule,
    NetworkModule,
    WalletModule,
    AdaptersModule,
    TransferModule,
    TokenModule,
    DexModule,
    LockModule,
    PriceModule,
    UserModule,
    AuthModule,
    AdminAuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
