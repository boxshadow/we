import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { NetworkRegistryService } from './network-registry.service.js';
import { CreateNetworkDto, UpdateNetworkDto } from './dto/network.dto.js';
import type {
  NetworkConfigEntity,
  RpcHealthTestResult,
} from './interfaces/network-config.interface.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Networks - 管理后台多链中台与双通道节点配置 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/networks')
export class NetworkAdminController {
  constructor(
    private readonly networkRegistryService: NetworkRegistryService,
  ) {}

  @ApiOperation({
    summary: '获取所有链网络配置列表',
    description: '【管理后台专属】获取系统中所有已注册并激活的公链配置，包含 HTTP 与 WebSocket 双通道节点、合约地址及熔断状态。',
  })
  @ApiResponse({ status: 200, description: '成功返回已配置的网络列表' })
  @Get()
  getAllNetworks(): NetworkConfigEntity[] {
    return this.networkRegistryService.getAllNetworks();
  }

  @ApiOperation({
    summary: '获取指定网络详情',
    description: '【管理后台专属】根据 networkId 查询该网络的详细双通道节点参数与合约信息。',
  })
  @ApiParam({ name: 'id', description: '网络标识符 (如 ethereum, bsc, solana, tron)' })
  @ApiResponse({ status: 200, description: '返回网络配置实体' })
  @Get(':id')
  getNetwork(@Param('id') id: string): NetworkConfigEntity {
    return this.networkRegistryService.getNetwork(id);
  }

  @ApiOperation({
    summary: '动态添加新公链网络',
    description: '【管理后台专属】在后台动态注册全新公链或 EVM L2（如 Base, Arbitrum, Optimism 等），无需修改源码或重启服务。',
  })
  @ApiResponse({ status: 201, description: '注册成功，返回新增网络实体' })
  @Post()
  registerNetwork(@Body() dto: CreateNetworkDto): NetworkConfigEntity {
    return this.networkRegistryService.registerNetwork(dto);
  }

  @ApiOperation({
    summary: '热更新网络节点配置',
    description: '【管理后台专属】热更新指定网络的主备 HTTP/WS 节点、超时时间、常用协议合约等参数，即刻生效。',
  })
  @ApiParam({ name: 'id', description: '网络标识符' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @Put(':id')
  updateNetwork(
    @Param('id') id: string,
    @Body() dto: UpdateNetworkDto,
  ): NetworkConfigEntity {
    return this.networkRegistryService.updateNetwork(id, dto);
  }

  @ApiOperation({
    summary: '双通道节点健康与测速诊断 (Test RPC)',
    description: '【管理后台专属】实时对指定网络配置的 HTTP 节点和 WebSocket 节点发起探针拨测，返回 HTTP 响应延迟与 WS 握手成功率。',
  })
  @ApiParam({ name: 'id', description: '网络标识符' })
  @ApiResponse({ status: 200, description: '返回双通道健康度体检结果' })
  @Post(':id/test-rpc')
  async testRpc(@Param('id') id: string): Promise<RpcHealthTestResult> {
    return this.networkRegistryService.testNetworkRpc(id);
  }

  @ApiOperation({
    summary: '网络紧急熔断控制 (Pause / Resume)',
    description: '【管理后台专属】一键暂停或恢复指定公链的全部出入金与交易交互（当节点硬分叉、维护或突发黑天鹅风险时使用）。',
  })
  @ApiParam({ name: 'id', description: '网络标识符' })
  @ApiBody({ schema: { type: 'object', properties: { paused: { type: 'boolean', example: true } } } })
  @ApiResponse({ status: 200, description: '熔断状态更新成功' })
  @Patch(':id/pause')
  pauseNetwork(
    @Param('id') id: string,
    @Body('paused') paused: boolean,
  ): NetworkConfigEntity {
    return this.networkRegistryService.pauseNetwork(id, paused ?? true);
  }

  @ApiOperation({
    summary: '删除自定义网络',
    description: '【管理后台专属】从系统中安全卸载自定义网络。',
  })
  @ApiParam({ name: 'id', description: '网络标识符' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @Delete(':id')
  deleteNetwork(@Param('id') id: string): { success: boolean; networkId: string } {
    const success = this.networkRegistryService.deleteNetwork(id);
    return { success, networkId: id };
  }
}
