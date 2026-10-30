import { Module, Global } from '@nestjs/common';
import { BalanceService } from './balance.service.js';
import { BalanceController } from './balance.controller.js';

@Global()
@Module({
  controllers: [BalanceController],
  providers: [BalanceService],
  exports: [BalanceService],
})
export class BalanceModule {}
