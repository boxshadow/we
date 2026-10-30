import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NetworkRegistryService } from './network-registry.service.js';
import type { NetworkConfigEntity } from './interfaces/network-config.interface.js';

@ApiTags('Networks - 前端支持网络列表')
@Controller('networks')
export class NetworkPublicController {
  constructor(private readonly networkRegistryService: NetworkRegistryService) {}

  @ApiOperation({
    summary: '获取前端支持的公链网络列表',
    description: '公开接口，供 Web3 前端 DApp 获取当前系统支持的公链列表及状态。',
  })
  @ApiResponse({ status: 200, description: '成功返回网络列表' })
  @Get()
  getSupportedNetworks(): NetworkConfigEntity[] {
    return this.networkRegistryService.getAllNetworks();
  }
}
