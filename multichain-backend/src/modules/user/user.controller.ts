import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserService } from './user.service.js';
import type { UserEntity } from './entities/user.entity.js';

@ApiTags('Users - 用户画像与多链绑定数据库')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({
    summary: '获取全部主账号及绑定的多链钱包 (数据库全量画像)',
    description: '查看当前系统数据库中所有已注册的主账号 (Master Accounts) 以及每个账号绑定的多链钱包矩阵 (EVM / Solana / Tron)。',
  })
  @ApiResponse({ status: 200, description: '成功返回主账号档案列表' })
  @Get('all')
  async getAllUsers(): Promise<UserEntity[]> {
    return this.userService.reloadFromDisk();
  }

  @ApiOperation({
    summary: '重新从磁盘刷新读取数据库 (Reload from Disk)',
    description: '立即重新读取磁盘中的 data/users.json 文件并同步至内存索引。',
  })
  @Post('reload')
  async reload(): Promise<UserEntity[]> {
    return this.userService.reloadFromDisk();
  }

  @ApiOperation({
    summary: '清空/重置数据库 (Reset Database)',
    description: '清空当前所有注册用户与绑定记录，并将 data/users.json 归零。',
  })
  @Post('reset')
  async reset(): Promise<UserEntity[]> {
    return this.userService.resetDatabase();
  }
}
