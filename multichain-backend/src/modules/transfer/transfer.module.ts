import { Module } from '@nestjs/common';
import { TransferService } from './transfer.service.js';
import { DepositService } from './deposit.service.js';
import { WithdrawService } from './withdraw.service.js';
import { SweepService } from './sweep.service.js';
import { AutoSweepCronService } from './auto-sweep-cron.service.js';
import { WithdrawalReconciliationService } from './withdrawal-reconciliation.service.js';
import { TransferController } from './transfer.controller.js';
import { SweepAdminController } from './sweep-admin.controller.js';
import { LedgerAdminController } from './ledger-admin.controller.js';
import { AdaptersModule } from '../adapters/adapters.module.js';
import { TokenModule } from '../token/token.module.js';

@Module({
  imports: [AdaptersModule, TokenModule],
  controllers: [TransferController, SweepAdminController, LedgerAdminController],
  providers: [
    TransferService,
    DepositService,
    WithdrawService,
    SweepService,
    AutoSweepCronService,
    WithdrawalReconciliationService,
  ],
  exports: [
    TransferService,
    DepositService,
    WithdrawService,
    SweepService,
    AutoSweepCronService,
    WithdrawalReconciliationService,
  ],
})
export class TransferModule {}
