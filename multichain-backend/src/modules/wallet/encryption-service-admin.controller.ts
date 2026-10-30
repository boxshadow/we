import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { EncryptionServiceService } from './encryption-service.service.js';
import type {
  UpdateEncryptionServiceDto,
  TestConnectionDto,
  TestSignDto,
} from './encryption-service.interface.js';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard.js';

@ApiTags('Admin Encryption Service - 三方加密与外部签名服务配置 (Admin Only)')
@ApiBearerAuth('JWT-Admin-Auth')
@UseGuards(AdminJwtAuthGuard)
@Controller('admin/encryption-service')
export class EncryptionServiceAdminController {
  constructor(private readonly encryptionService: EncryptionServiceService) {}

  @ApiOperation({
    summary: '查询三方加密与外部签名服务配置',
    description: '获取当前配置的远程 KMS / MPC Custody 加密服务地址、JWT 鉴权凭证（脱敏）、超时机制与健康状态。',
  })
  @ApiResponse({ status: 200, description: '成功返回三方加密服务配置详情' })
  @Get()
  async getConfig() {
    return this.encryptionService.getConfig();
  }

  @ApiOperation({
    summary: '更新三方加密与外部签名服务配置',
    description: '配置远程加密签名服务地址、JWT Token 凭证、提供商类型、超时时间及容灾熔断策略。',
  })
  @ApiResponse({ status: 200, description: '配置已成功更新' })
  @Put()
  async updateConfig(@Body() dto: UpdateEncryptionServiceDto) {
    return this.encryptionService.updateConfig(dto);
  }

  @ApiOperation({
    summary: '测试三方加密服务连通性与 JWT 凭证握手',
    description: '即时向配置的目标加密节点发送握手心跳，验证 JWT 鉴权有效性，返回网络往返延迟 (ms) 与 HSM 节点状态。',
  })
  @ApiResponse({ status: 200, description: '握手连通性探测完成' })
  @Post('test')
  async testConnection(@Body() dto?: TestConnectionDto) {
    return this.encryptionService.testConnection(dto);
  }

  @ApiOperation({
    summary: '发起仿真加密/签名测试 (免出金沙箱压测)',
    description: '使用当前配置的三方加密服务与凭证，对指定公链的待签名消息进行仿真签名，验证全链路可用性。',
  })
  @ApiResponse({ status: 200, description: '仿真签名完成' })
  @Post('sign-test')
  async testSign(@Body() dto: TestSignDto) {
    return this.encryptionService.testSign(dto);
  }

  @ApiOperation({
    summary: '查询 Enclave 密钥金库清单',
    description: '获取当前在外部加密服务或 Rust KMS 内存金库中托管的密钥公开元数据与地址。',
  })
  @ApiResponse({ status: 200, description: '成功返回托管密钥清单' })
  @Get('keys')
  async listKeys() {
    return this.encryptionService.listEnclaveKeys();
  }

  @ApiOperation({
    summary: '安全导入私钥至外部 KMS Enclave 物理内存',
    description: '将 EVM / Solana / TRON 私钥导入到远程安全 Enclave 内存金库中，自动推导公链地址并施加 Zeroize 内存保护。',
  })
  @ApiResponse({ status: 200, description: '私钥导入成功' })
  @Post('keys/import')
  async importKey(@Body() dto: { chain: string; privateKey: string; keyId?: string }) {
    return this.encryptionService.importEnclaveKey(dto);
  }

  @ApiOperation({
    summary: '从 Enclave 物理内存中销毁指定密钥',
    description: '从独立 Rust KMS 内存中永久抹除指定私钥，触发 ZeroizeOnDrop 内存覆写置零，销毁后将无法再执行签名。',
  })
  @ApiResponse({ status: 200, description: '密钥销毁成功' })
  @Delete('keys/:keyId')
  async deleteKey(@Param('keyId') keyId: string) {
    return this.encryptionService.deleteEnclaveKey(keyId);
  }
}
