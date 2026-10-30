import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { UserService } from '../user/user.service.js';
import {
  LoginWalletDto,
  BindWalletDto,
  UnbindWalletDto,
  RefreshTokenDto,
} from './dto/auth.dto.js';
import type {
  LoginResponse,
  AuthTokens,
  NonceChallenge,
  JwtPayload,
} from './interfaces/auth.interface.js';
import type { UserEntity } from '../user/entities/user.entity.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { ChainType } from '../../common/enums/chain-type.enum.js';

@ApiTags('Auth - Web3 钱包登录与多链身份管理')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
  ) {}

  /**
   * 1. 获取防重放 Nonce 与标准待签名报文 (Challenge)
   */
  @ApiOperation({
    summary: '获取登录或绑定挑战消息 (Nonce Challenge)',
    description: '生成符合 EIP-4361 (SIWE/SIWS) 标准的人类可读挑战文本，携带 5 分钟有效期的防重放随机数。',
  })
  @ApiQuery({ name: 'chain', enum: ChainType, description: '公链生态类型 (EVM / SOLANA / TRON)' })
  @ApiQuery({ name: 'address', type: String, description: '钱包地址' })
  @ApiQuery({ name: 'networkId', type: String, required: false, description: '具体网络标识符 (如 ethereum, bsc, solana)' })
  @ApiResponse({ status: 200, description: '成功返回 Nonce 挑战与待签名文本' })
  @Get('nonce')
  async getNonce(
    @Query('chain') chain: ChainType,
    @Query('address') address: string,
    @Query('networkId') networkId?: string,
  ): Promise<NonceChallenge> {
    return this.authService.generateNonce(
      chain.toUpperCase() as ChainType,
      address,
      networkId,
    );
  }

  /**
   * 2. 钱包签名登录 (Wallet Connect / Extension)
   */
  @ApiOperation({
    summary: 'Web3 钱包免密登录 / 自动注册',
    description: '通过密码学验证钱包私钥对 Nonce 的签名。新地址自动创建主账号，已绑定的多链地址无缝识别为主账号并签发 JWT 双 Token。',
  })
  @ApiResponse({ status: 200, description: '登录成功，返回 User 信息及 access/refresh token' })
  @ApiResponse({ status: 400, description: 'Nonce 已失效或不存在 (防重放拦截)' })
  @ApiResponse({ status: 401, description: '签名无效' })
  @Post('login')
  async login(@Body() dto: LoginWalletDto): Promise<LoginResponse> {
    return this.authService.loginWithWallet({
      ...dto,
      chain: dto.chain.toUpperCase() as ChainType,
    });
  }

  /**
   * 3. 获取当前登录用户信息及所有绑定的多链钱包 (受 JWT 保护)
   */
  @ApiOperation({
    summary: '获取当前登录用户画像及多链绑定钱包列表',
    description: '查看主账号基本信息 (ID, 角色, 状态) 及名下已绑定的全部链地址 (EVM, Solana, Tron)。',
  })
  @ApiBearerAuth('JWT-Auth')
  @ApiResponse({ status: 200, description: '成功获取用户详细档案' })
  @ApiResponse({ status: 401, description: '未登录或 Token 无效/过期' })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@CurrentUser() jwtPayload: JwtPayload): Promise<UserEntity> {
    const user = await this.userService.findUserById(jwtPayload.sub);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  /**
   * 4. 绑定新的多链钱包到同一个主账号 (受 JWT 保护)
   */
  @ApiOperation({
    summary: '绑定新链钱包至当前主账号',
    description: '将新公链钱包（如 Solana / Tron / 新 EVM 地址）绑定至同一主账号，需提供新地址对 Nonce 的签名证明所有权。',
  })
  @ApiBearerAuth('JWT-Auth')
  @ApiResponse({ status: 200, description: '绑定成功，返回更新后的主账号信息' })
  @ApiResponse({ status: 409, description: '该地址已被其他主账号绑定' })
  @Post('bind-wallet')
  @UseGuards(JwtAuthGuard)
  async bindWallet(
    @CurrentUser('sub') userId: string,
    @Body() dto: BindWalletDto,
  ): Promise<UserEntity> {
    return this.authService.bindWallet(userId, {
      ...dto,
      chain: dto.chain.toUpperCase() as ChainType,
    });
  }

  /**
   * 5. 解绑指定钱包 (受 JWT 保护)
   */
  @ApiOperation({
    summary: '解绑已绑定的指定钱包',
    description: '从当前主账号移除指定钱包地址。安全保护机制：禁止解绑初始主钱包或账号下唯一的钱包。',
  })
  @ApiBearerAuth('JWT-Auth')
  @ApiResponse({ status: 200, description: '解绑成功，返回更新后的主账号信息' })
  @ApiResponse({ status: 400, description: '违反安全保护规则（如解绑主钱包或唯一钱包）' })
  @Post('unbind-wallet')
  @UseGuards(JwtAuthGuard)
  async unbindWallet(
    @CurrentUser('sub') userId: string,
    @Body() dto: UnbindWalletDto,
  ): Promise<UserEntity> {
    return this.authService.unbindWallet(userId, {
      ...dto,
      chain: dto.chain.toUpperCase() as ChainType,
    });
  }

  /**
   * 6. 刷新令牌
   */
  @ApiOperation({
    summary: '刷新访问令牌 (Refresh Token)',
    description: '使用有效的 Refresh Token (7天有效期) 换取全新的 Access Token (2小时有效期)。',
  })
  @ApiResponse({ status: 200, description: '成功换取新令牌' })
  @ApiResponse({ status: 401, description: 'Refresh Token 无效或已过期' })
  @Post('refresh')
  async refreshToken(@Body() dto: RefreshTokenDto): Promise<AuthTokens> {
    return this.authService.refreshTokens(dto.refreshToken);
  }
}
