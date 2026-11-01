import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard.js';
import { CurrentAdmin } from './decorators/current-admin.decorator.js';
import type {
  AdminLoginDto,
  AdminLoginResponse,
  AdminLoginSuccessResponse,
  ConfirmTwoFactorSetupDto,
  AdminProfile,
  AdminJwtPayload,
  TwoFactorSetupResponse,
} from './interfaces/admin-auth.interface.js';

@ApiTags('Admin Auth - 管理后台账号密码与 Google 2FA 认证')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @ApiOperation({
    summary: '管理后台管理员登录 (账号 + 密码 + Google 二次验证)',
    description: '采用企业级账号密码与 Google 身份验证器 (RFC 6238 TOTP) 双因素认证，签发 8 小时有效期的管理员专属 JWT。',
  })
  @ApiResponse({ status: 200, description: '登录成功，返回 Admin JWT 令牌与身份信息' })
  @ApiResponse({ status: 400, description: '参数格式不完整' })
  @ApiResponse({ status: 401, description: '口令或 Google 2FA 动态码错误' })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: AdminLoginDto,
    @Req() req: Request,
  ): Promise<AdminLoginResponse> {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';
    return this.adminAuthService.login(dto, clientIp);
  }

  @ApiOperation({
    summary: '首次登录激活：确认绑定 Google 身份验证器并登入',
    description: '提交首次登录获得的 setupToken 及手机 Authenticator App 显示的 6 位动态验证码，完成绑定并签发正式 Admin JWT。',
  })
  @ApiResponse({ status: 200, description: '绑定并激活成功，签发管理员 JWT' })
  @ApiResponse({ status: 400, description: '动态验证码错误或会话已失效' })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/confirm-setup')
  async confirmTwoFactorSetup(
    @Body() dto: ConfirmTwoFactorSetupDto,
    @Req() req: Request,
  ): Promise<AdminLoginSuccessResponse> {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket?.remoteAddress || '127.0.0.1';
    return this.adminAuthService.confirmTwoFactorSetup(dto, clientIp);
  }

  @ApiOperation({
    summary: '重置管理员为未绑定 2FA 状态 (开发演示与测试首次登录流程用)',
    description: '将指定管理员 (默认 admin) 重置为未绑定 2FA 状态，方便随时测试首次登录扫码绑定全流程。仅在开发/测试环境下开放。',
  })
  @HttpCode(HttpStatus.OK)
  @Post('2fa/reset-demo')
  async resetDemo(@Body('username') username?: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('生产环境已关闭 2FA 演示重置接口');
    }
    return this.adminAuthService.resetTwoFactorToUnbound(username || 'admin');
  }

  @ApiOperation({
    summary: '获取指定密钥的实时 TOTP (演示辅助)',
    description: '用于在开发环境下快速获取当前扫码生成的临时密钥的实时 6 位验证码。仅在开发/测试环境下开放。',
  })
  @Get('2fa/live-code')
  getLiveCode(@Req() req: Request) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('生产环境已关闭实时 TOTP 查询接口');
    }
    const secret = req.query.secret as string;
    if (!secret) {
      return { code: this.adminAuthService.getCurrentDefaultTotp() };
    }
    return { code: this.adminAuthService.getTotpForSecret(secret) };
  }

  @ApiOperation({
    summary: '获取当前登录管理员身份画像',
    description: '受 Admin JWT 保护，返回当前管理员 ID、用户名、权限角色以及 2FA 启用状态。',
  })
  @ApiBearerAuth('JWT-Admin-Auth')
  @ApiResponse({ status: 200, description: '获取管理员档案成功' })
  @ApiResponse({ status: 401, description: '未授权或 Token 已过期' })
  @UseGuards(AdminJwtAuthGuard)
  @Get('me')
  async getProfile(@CurrentAdmin() admin: AdminJwtPayload): Promise<AdminProfile> {
    return this.adminAuthService.getProfile(admin.sub);
  }

  @ApiOperation({
    summary: '获取 Google 身份验证器 2FA 绑定密钥与二维码',
    description: '返回管理员专属 Base32 密钥、otpauth URI、二维码图像 DataURL 以及当前计算出的实时验证码。',
  })
  @ApiBearerAuth('JWT-Admin-Auth')
  @ApiResponse({ status: 200, description: '成功返回 2FA 绑定要素' })
  @UseGuards(AdminJwtAuthGuard)
  @Get('2fa/setup')
  async getTwoFactorSetup(
    @CurrentAdmin() admin: AdminJwtPayload,
  ): Promise<TwoFactorSetupResponse> {
    return this.adminAuthService.getTwoFactorSetup(admin.sub);
  }

  @ApiOperation({
    summary: '管理员安全登出',
    description: '注销管理后台客户端会话。',
  })
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout() {
    return {
      success: true,
      message: '管理员会话已安全注销',
      timestamp: Date.now(),
    };
  }

  @ApiOperation({
    summary: '获取开发环境演示凭据与实时 TOTP 动态码 (仅供快速调试/演示)',
    description: '返回默认测试管理员账号、口令、Base32 密钥及当前时间窗口计算出的 6 位动态验证码。',
  })
  @Get('demo-credentials')
  getDemoCredentials() {
    return {
      username: 'admin',
      password: 'AdminPassword2026!',
      secret: 'JBSWY3DPEHPK3PXP',
      currentTotp: this.adminAuthService.getCurrentDefaultTotp(),
      timeStepSeconds: 30,
    };
  }
}
