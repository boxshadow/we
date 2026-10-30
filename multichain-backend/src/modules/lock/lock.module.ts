import { Module } from '@nestjs/common';
import { LockService } from './lock.service.js';
import { LockController } from './lock.controller.js';
import { AdaptersModule } from '../adapters/adapters.module.js';

@Module({
  imports: [AdaptersModule],
  controllers: [LockController],
  providers: [LockService],
  exports: [LockService],
})
export class LockModule {}
