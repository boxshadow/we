import { Module, Global } from '@nestjs/common';
import { WalletPoolService } from './wallet-pool.service.js';
import { WalletSignerManager } from './wallet-signer.manager.js';
import { LocalSignerProvider } from './providers/local-signer.provider.js';
import { RemoteKmsSignerProvider } from './providers/remote-kms-signer.provider.js';
import { EncryptedDbSignerProvider } from './providers/encrypted-db-signer.provider.js';
import { DepositWalletService } from './deposit-wallet.service.js';
import { DepositWalletAdminController } from './deposit-wallet-admin.controller.js';
import { WithdrawWalletService } from './withdraw-wallet.service.js';
import { WithdrawWalletAdminController } from './withdraw-wallet-admin.controller.js';
import { EncryptionServiceService } from './encryption-service.service.js';
import { EncryptionServiceAdminController } from './encryption-service-admin.controller.js';

@Global()
@Module({
  controllers: [
    DepositWalletAdminController,
    WithdrawWalletAdminController,
    EncryptionServiceAdminController,
  ],
  providers: [
    EncryptionServiceService,
    LocalSignerProvider,
    RemoteKmsSignerProvider,
    EncryptedDbSignerProvider,
    WalletSignerManager,
    WalletPoolService,
    DepositWalletService,
    WithdrawWalletService,
  ],
  exports: [
    EncryptionServiceService,
    LocalSignerProvider,
    RemoteKmsSignerProvider,
    EncryptedDbSignerProvider,
    WalletSignerManager,
    WalletPoolService,
    DepositWalletService,
    WithdrawWalletService,
  ],
})
export class WalletModule {}
