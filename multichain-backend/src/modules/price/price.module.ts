import { Module } from '@nestjs/common';
import { PriceService } from './price.service.js';
import { PriceMonitorService } from './price-monitor.service.js';
import { PriceController } from './price.controller.js';
import { AdaptersModule } from '../adapters/adapters.module.js';

@Module({
  imports: [AdaptersModule],
  controllers: [PriceController],
  providers: [PriceService, PriceMonitorService],
  exports: [PriceService, PriceMonitorService],
})
export class PriceModule {}
