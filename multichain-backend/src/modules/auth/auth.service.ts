import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import { UserService } from '../user/user.service.js';
import { UserEntity, UserStatus } from '../user/entities/user.entity.js';
import { SignatureVerifierService } from './signature-verifier.service.js';
import {
  LoginWalletDto,
  BindWalletDto,
  UnbindWalletDto,
} from './dto/auth.dto.js';
import {
  NonceChallenge,
  JwtPayload,
  AuthTokens,
  LoginResponse,
} from './interfaces/auth.interface.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // Nonce in-memory cache: `${chain}:${address.toLowerCase()}` -> NonceChallenge
  private readonly nonceCache = new Map<string, NonceChallenge>();
  private readonly NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  constructor(
    private readonly userService: UserService,
    private readonly signatureVerifierService: SignatureVerifierService,
    private readonly jwtService: JwtService,
  ) {}

  private getNonceKey(chain: ChainType, address: string): string {
    return `${chain}:${address.trim().toLowerCase()}`;
  }

  /**
   * 1. 生成防重放随机数与标准 EIP-4361 挑战消息
   */
  async generateNonce(
    chain: ChainType,
    address: string,
    networkId?: string,
  ): Promise<NonceChallenge> {
    const cleanAddress = address.trim();
    const nonce = randomBytes(16).toString('hex');
    const now = Date.now();
    const expiresAt = now + this.NONCE_TTL_MS;

    const domain = process.env.APP_DOMAIN || 'localhost';
    const uri = process.env.APP_URI || 'http://localhost:3000';
    const chainLabel = networkId ? `${chain} (${networkId})` : chain;

    // Standard EIP-4361 (SIWE / SIWS) Human-Readable Message Format
    const message = [
      `${domain} wants you to sign in with your ${chainLabel} account:`,
      cleanAddress,
      '',
      'Sign in with your Web3 wallet to authenticate.',
      '',
      `URI: ${uri}`,
      'Version: 1',
      `Chain: ${chain}`,
      `Nonce: ${nonce}`,
      `Issued At: ${new Date(now).toISOString()}`,
      `Expiration Time: ${new Date(expiresAt).toISOString()}`,
    ].join('\n');

    const challenge: NonceChallenge = {
      nonce,
      message,
      chain,
      address: cleanAddress,
      domain,
      uri,
      issuedAt: now,
      expiresAt,
    };

    const key = this.getNonceKey(chain, cleanAddress);
    this.nonceCache.set(key, challenge);

    this.logger.log(
      `Generated login challenge for [${chain}] ${cleanAddress} (Nonce: ${nonce})`,
    );
    return challenge;
  }

  /**
   * 2. 钱包登录：校验签名、单次消费随机数、查找或自动注册主账号
   */
  async loginWithWallet(dto: LoginWalletDto): Promise<LoginResponse> {
    const key = this.getNonceKey(dto.chain, dto.address);
    const challenge = this.nonceCache.get(key);

    if (!challenge) {
      throw new BadRequestException(
        'Login challenge not found or already consumed. Please request a new nonce.',
      );
    }

    // 立即注销/消费 Nonce（防重放攻击）
    this.nonceCache.delete(key);

    if (Date.now() > challenge.expiresAt) {
      throw new BadRequestException('Login challenge has expired.');
    }

    if (!dto.message.includes(challenge.nonce)) {
      throw new BadRequestException('Invalid login message: nonce mismatch.');
    }

    if (dto.address.trim().toLowerCase() !== challenge.address.toLowerCase()) {
      throw new BadRequestException('Address mismatch with challenge.');
    }

    // 多链密码学签名验证（支持 EVM EOA + EIP-1271 合约钱包、Solana ed25519、Tron）
    const isValid = await this.signatureVerifierService.verifySignature(
      dto.chain,
      dto.address,
      dto.message,
      dto.signature,
      dto.networkId,
    );

    if (!isValid) {
      this.logger.warn(
        `Wallet login failed: Invalid signature for [${dto.chain}] ${dto.address}`,
      );
      throw new UnauthorizedException('Invalid wallet signature');
    }

    // 查询是否已有主账号（通过绑定的任意链地址查找）
    let user = await this.userService.findUserByWallet(dto.chain, dto.address);

    if (!user) {
      // 首次登录，自动注册主账号并绑定该首发钱包
      user = await this.userService.createUserWithWallet(
        dto.chain,
        dto.address,
        dto.networkId,
      );
    }

    if (user.status === UserStatus.BANNED) {
      throw new ForbiddenException('Account has been suspended.');
    }

    await this.userService.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user, dto.address, dto.chain);

    this.logger.log(
      ` Wallet login successful: User [${user.id}], Login Wallet: [${dto.chain}] ${dto.address}`,
    );

    return { user, tokens };
  }

  /**
   * 3. 跨链钱包绑定：为当前已登录的主账号绑定新钱包地址
   */
  async bindWallet(userId: string, dto: BindWalletDto): Promise<UserEntity> {
    const user = await this.userService.findUserById(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    const key = this.getNonceKey(dto.chain, dto.address);
    const challenge = this.nonceCache.get(key);

    if (!challenge) {
      throw new BadRequestException(
        'Bind challenge not found. Please request a nonce for this address first.',
      );
    }

    // 立即注销 Nonce
    this.nonceCache.delete(key);

    if (Date.now() > challenge.expiresAt) {
      throw new BadRequestException('Bind challenge has expired.');
    }

    if (!dto.message.includes(challenge.nonce)) {
      throw new BadRequestException('Message nonce mismatch.');
    }

    // 校验新钱包的所有权签名
    const isValid = await this.signatureVerifierService.verifySignature(
      dto.chain,
      dto.address,
      dto.message,
      dto.signature,
      dto.networkId,
    );

    if (!isValid) {
      throw new UnauthorizedException(
        `Invalid signature for target wallet to bind [${dto.chain}] ${dto.address}`,
      );
    }

    return this.userService.bindWalletToUser(
      userId,
      dto.chain,
      dto.address,
      dto.networkId,
    );
  }

  /**
   * 4. 解绑钱包
   */
  async unbindWallet(userId: string, dto: UnbindWalletDto): Promise<UserEntity> {
    return this.userService.unbindWalletFromUser(userId, dto.chain, dto.address);
  }

  /**
   * 5. 刷新 JWT Access Token
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload: JwtPayload = await this.jwtService.verifyAsync(refreshToken);
      const user = await this.userService.findUserById(payload.sub);

      if (!user || user.status === UserStatus.BANNED) {
        throw new UnauthorizedException('User account invalid or suspended');
      }

      return this.generateTokens(user, payload.address, payload.chain);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * 签发双 Token (Access Token 2小时, Refresh Token 7天)
   */
  private async generateTokens(
    user: UserEntity,
    currentAddress: string,
    currentChain: ChainType,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      address: currentAddress,
      chain: currentChain,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...payload, jti: randomBytes(16).toString('hex') },
        { expiresIn: '2h' },
      ),
      this.jwtService.signAsync(
        { ...payload, jti: randomBytes(16).toString('hex') },
        { expiresIn: '7d' },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 7200, // 2 hours in seconds
    };
  }
}
