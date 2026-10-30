import { Module, Global } from '@nestjs/common';
import { NetworkRegistryService } from './network-registry.service.js';
import { NetworkAdminController } from './network-admin.controller.js';
import { NetworkPublicController } from './network-public.controller.js';

@Global()
@Module({
  controllers: [NetworkAdminController, NetworkPublicController],
  providers: [NetworkRegistryService],
  exports: [NetworkRegistryService],
})
export class NetworkModule {}
