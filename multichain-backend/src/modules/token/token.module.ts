import { Module } from '@nestjs/common';
import { TokenService } from './token.service.js';
import { TokenController } from './token.controller.js';
import { TokenConfigService } from './token-config.service.js';
import { TokenAdminController } from './token-admin.controller.js';
import { TokenPublicController } from './token-public.controller.js';
import { AdaptersModule } from '../adapters/adapters.module.js';
import { WalletModule } from '../wallet/wallet.module.js';

@Module({
  imports: [AdaptersModule, WalletModule],
  controllers: [TokenController, TokenAdminController, TokenPublicController],
  providers: [TokenService, TokenConfigService],
  exports: [TokenService, TokenConfigService],
})
export class TokenModule {}
