import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { UserAdminController } from './user-admin.controller.js';
import { TransferModule } from '../transfer/transfer.module.js';

@Module({
  imports: [TransferModule],
  controllers: [UserController, UserAdminController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
