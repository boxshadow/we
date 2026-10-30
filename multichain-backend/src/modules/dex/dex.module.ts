import { Module } from '@nestjs/common';
import { DexService } from './dex.service.js';
import { DexController } from './dex.controller.js';
import { AdaptersModule } from '../adapters/adapters.module.js';

@Module({
  imports: [AdaptersModule],
  controllers: [DexController],
  providers: [DexService],
  exports: [DexService],
})
export class DexModule {}
