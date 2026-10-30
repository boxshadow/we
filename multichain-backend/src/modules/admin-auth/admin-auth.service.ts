import {
  Injectable,
  OnModuleInit,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  AdminRole,
  type AdminUser,
  type AdminLoginDto,
  type AdminLoginResponse,
  type AdminLoginSuccessResponse,
  type TwoFactorSetupRequiredResponse,
  type TwoFactorCodeRequiredResponse,
  type ConfirmTwoFactorSetupDto,
  type AdminProfile,
  type AdminJwtPayload,
  type TwoFactorSetupResponse,
} from './interfaces/admin-auth.interface.js';
import {
  verifyTOTP,
  generateTOTP,
  generateTwoFactorSecret,
  getOtpAuthUri,
  generateQrCodeDataUrl,
} from './utils/totp.util.js';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly storagePath = path.resolve(process.cwd(), 'data', 'admin-users.json');
  private adminUsers: Map<string, AdminUser> = new Map();

  constructor(private readonly jwtService: JwtService) {}

  onModuleInit() {
    this.ensureStorageAndSeed();
  }

  /**
   * 初始化数据持久化与超级管理员种子账号
   */
  private ensureStorageAndSeed() {
    try {
      const dataDir = path.dirname(this.storagePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf-8');
        const list: AdminUser[] = JSON.parse(raw);
        for (const u of list) {
          this.adminUsers.set(u.id, u);
        }
        this.logger.log(`已从本地持久化文件加载 ${this.adminUsers.size} 个管理后台账号: ${this.storagePath}`);

        // 确保初始化 founder 账号存在
        const hasFounder = Array.from(this.adminUsers.values()).some(
          (u) => u.username.toLowerCase() === 'founder',
        );
        if (!hasFounder) {
          this.seedFounderAccount();
        }
      } else {
        this.seedDefaultSuperAdmin();
      }
    } catch (err) {
      this.logger.error(`加载管理员账号存储异常，执行默认初始化: ${(err as Error).message}`);
      this.seedDefaultSuperAdmin();
    }
  }

  /**
   * 预置初始 Founder 账号 (founder / FounderPassword2026! / 强制未绑定 2FA)
   */
  seedFounderAccount() {
    const salt = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const passwordHash = this.hashPassword('FounderPassword2026!', salt);

    const founderUser: AdminUser = {
      id: 'adm-founder-0000-4000-8000-000000000001',
      username: 'founder',
      passwordHash,
      salt,
      twoFactorSecret: '',
      isTwoFactorEnabled: false, // 强制未绑定，首次登录必须扫码绑定 Google 2FA
      role: AdminRole.FOUNDER,
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.adminUsers.set(founderUser.id, founderUser);
    this.saveToStorage();
    this.logger.log(`初始化预置管理后台 Founder: [账号: founder, 角色: FOUNDER, Google 2FA: 强制未激活，首次登录必须绑定]`);
  }

  /**
   * 预置默认超级管理员与 Founder 初始账号
   */
  seedDefaultSuperAdmin() {
    this.seedFounderAccount();

    const salt = 'f8a4e912c03b41d7e59a68c42b10df9e';
    const passwordHash = this.hashPassword('AdminPassword2026!', salt);
    // 标准 Base32 密钥，可直接导入 Google Authenticator 或 Microsoft Authenticator
    const default2faSecret = 'JBSWY3DPEHPK3PXP';

    const defaultAdmin: AdminUser = {
      id: 'adm-00000000-0000-4000-8000-000000000001',
      username: 'admin',
      passwordHash,
      salt,
      twoFactorSecret: default2faSecret,
      isTwoFactorEnabled: true,
      role: AdminRole.SUPER_ADMIN,
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.adminUsers.set(defaultAdmin.id, defaultAdmin);
    this.saveToStorage();
    this.logger.log(`初始化预置管理后台超级管理员: [账号: admin, 角色: SUPER_ADMIN, Google 2FA: 已启用]`);
  }

  /**
   * 重置或恢复默认初始超级管理员 (用于测试与重置隔离)
   */
  resetToDefaultSeed() {
    this.seedDefaultSuperAdmin();
  }

  private saveToStorage() {
    try {
      const list = Array.from(this.adminUsers.values());
      fs.writeFileSync(this.storagePath, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`持久化保存管理员账号失败: ${(err as Error).message}`);
    }
  }

  /**
   * PBKDF2 安全口令哈希计算 (NIST SP 800-132 标准)
   */
  hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  /**
   * 恒定时间校验密码
   */
  verifyPassword(password: string, salt: string, expectedHash: string): boolean {
    const calculatedHash = this.hashPassword(password, salt);
    const bufA = Buffer.from(calculatedHash, 'hex');
    const bufB = Buffer.from(expectedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * 账号 + 密码 + Google 二次验证登录核心逻辑
   */
  async login(dto: AdminLoginDto, clientIp?: string): Promise<AdminLoginResponse> {
    const { username, password, twoFactorCode } = dto;

    if (!username || !password) {
      throw new BadRequestException('管理员账号与密码不能为空');
    }

    // 1. 查找对应管理员
    const admin = Array.from(this.adminUsers.values()).find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    );

    if (!admin) {
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    if (admin.status !== 'ACTIVE') {
      throw new ForbiddenException('该管理员账号已处于禁用状态，拒绝访问');
    }

    // 2. 校验口令
    const isPasswordValid = this.verifyPassword(password, admin.salt, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('管理员账号或密码错误');
    }

    // 3. 判断是否尚未绑定 Google 身份验证器 (首次登录引导绑定)
    if (!admin.isTwoFactorEnabled) {
      // 生成新的随机 Base32 密钥
      const newSecret = generateTwoFactorSecret();
      admin.tempTwoFactorSecret = newSecret;
      this.adminUsers.set(admin.id, admin);
      this.saveToStorage();

      const otpAuthUri = getOtpAuthUri(admin.username, newSecret, 'CyberCustody');
      const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUri);

      // 签发 15 分钟有效的 2FA 首次绑定专用凭据
      const setupToken = await this.jwtService.signAsync(
        {
          sub: admin.id,
          username: admin.username,
          tempSecret: newSecret,
          type: 'ADMIN_SETUP_2FA',
        },
        { expiresIn: '15m' },
      );

      this.logger.log(`管理员 [${admin.username}] 口令验证成功，触发首次登录绑定 Google 2FA 流程`);

      return {
        requireTwoFactorSetup: true,
        setupToken,
        username: admin.username,
        secret: newSecret,
        otpAuthUri,
        qrCodeDataUrl,
        message: '首次登录需要绑定 Google 身份验证器，请使用手机 App 扫码并输入 6 位动态验证码确认激活',
      };
    }

    // 4. 已启用 2FA 的账号：如未提供 2FA 动态码，提示前端需要输入
    if (!twoFactorCode || twoFactorCode.trim().length === 0) {
      return {
        requireTwoFactorCode: true,
        username: admin.username,
        message: '请输入 Google 身份验证器 6 位动态验证码',
      };
    }

    // 5. 校验 6 位 TOTP
    if (twoFactorCode.trim().length !== 6) {
      throw new UnauthorizedException('Google 二次验证码错误或已过期，请核对手机时间同步');
    }

    const isTotpValid = verifyTOTP(twoFactorCode, admin.twoFactorSecret, 1);
    if (!isTotpValid) {
      throw new UnauthorizedException('Google 二次验证码错误或已过期，请核对手机时间同步');
    }

    // 4. 更新登录审计状态
    admin.lastLoginAt = Date.now();
    admin.lastLoginIp = clientIp || '127.0.0.1';
    admin.updatedAt = Date.now();
    this.adminUsers.set(admin.id, admin);
    this.saveToStorage();

    // 5. 签发具备严格管理员权限的 JWT
    const payload: AdminJwtPayload = {
      sub: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'ADMIN',
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: '8h',
    });

    this.logger.log(`管理员登录成功: [${admin.username}] 角色: ${admin.role}, IP: ${admin.lastLoginIp}`);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 8 * 3600,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        isTwoFactorEnabled: admin.isTwoFactorEnabled,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }

  /**
   * 获取当前登录管理员画像
   */
  async getProfile(adminId: string): Promise<AdminProfile> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) {
      throw new NotFoundException('管理员档案不存在');
    }

    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      isTwoFactorEnabled: admin.isTwoFactorEnabled,
      createdAt: admin.createdAt,
      lastLoginAt: admin.lastLoginAt,
    };
  }

  /**
   * 获取默认超级管理员当前的实时 6 位 TOTP 动态码 (用于开发演示辅助)
   */
  getCurrentDefaultTotp(): string {
    const defaultSecret = 'JBSWY3DPEHPK3PXP';
    return generateTOTP(defaultSecret);
  }

  /**
   * 生成/查看 Google 2FA 绑定信息 (密钥、URI、二维码、实时码)
   */
  async getTwoFactorSetup(adminId: string): Promise<TwoFactorSetupResponse> {
    const admin = this.adminUsers.get(adminId);
    if (!admin) {
      throw new NotFoundException('管理员档案不存在');
    }

    const secret = admin.twoFactorSecret;
    const otpAuthUri = getOtpAuthUri(admin.username, secret, 'CyberCustody');
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpAuthUri);
    const currentCode = generateTOTP(secret);

    return {
      secret,
      otpAuthUri,
      qrCodeDataUrl,
      currentCode,
    };
  }

  /**
   * 首次登录绑定并激活 Google 2FA，激活成功后自动签发正式 Admin JWT 并登入
   */
  async confirmTwoFactorSetup(
    dto: ConfirmTwoFactorSetupDto,
    clientIp?: string,
  ): Promise<AdminLoginSuccessResponse> {
    const { setupToken, twoFactorCode } = dto;
    if (!setupToken || !twoFactorCode) {
      throw new BadRequestException('绑定凭证与 6 位动态验证码不能为空');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(setupToken);
    } catch {
      throw new UnauthorizedException('2FA 绑定会话已过期，请重新登录并发起绑定');
    }

    if (payload.type !== 'ADMIN_SETUP_2FA') {
      throw new UnauthorizedException('无效的 2FA 绑定令牌');
    }

    const admin = this.adminUsers.get(payload.sub);
    if (!admin) {
      throw new NotFoundException('管理员档案不存在');
    }

    const secretToVerify = payload.tempSecret || admin.tempTwoFactorSecret;
    if (!secretToVerify) {
      throw new BadRequestException('未找到待绑定的 2FA 密钥，请重新登录发起绑定');
    }

    const isTotpValid = verifyTOTP(twoFactorCode, secretToVerify, 1);
    if (!isTotpValid) {
      throw new BadRequestException('动态验证码验证失败，请确认 App 中显示的 6 位数字并在 30 秒内输入');
    }

    // 绑定成功，正式激活 2FA
    admin.twoFactorSecret = secretToVerify;
    admin.isTwoFactorEnabled = true;
    delete admin.tempTwoFactorSecret;
    admin.lastLoginAt = Date.now();
    admin.lastLoginIp = clientIp || '127.0.0.1';
    admin.updatedAt = Date.now();
    this.adminUsers.set(admin.id, admin);
    this.saveToStorage();

    this.logger.log(`管理员 [${admin.username}] 成功完成首次 Google 2FA 绑定并激活登录`);

    const adminJwtPayload: AdminJwtPayload = {
      sub: admin.id,
      username: admin.username,
      role: admin.role,
      type: 'ADMIN',
    };

    const accessToken = await this.jwtService.signAsync(adminJwtPayload, {
      expiresIn: '8h',
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 8 * 3600,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
        isTwoFactorEnabled: true,
        lastLoginAt: admin.lastLoginAt,
      },
    };
  }

  /**
   * 重置指定管理员账号为首次未绑定状态 (供演示与测试首次扫码绑定闭环)
   */
  async resetTwoFactorToUnbound(username: string = 'admin'): Promise<{ success: boolean; message: string }> {
    const admin = Array.from(this.adminUsers.values()).find(
      (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
    );

    if (!admin) {
      throw new NotFoundException(`管理员 [${username}] 不存在`);
    }

    admin.isTwoFactorEnabled = false;
    delete admin.tempTwoFactorSecret;
    admin.updatedAt = Date.now();
    this.adminUsers.set(admin.id, admin);
    this.saveToStorage();

    this.logger.log(`管理员 [${admin.username}] 已重置为首次未绑定状态 (下次登录将触发扫码绑定)`);

    return {
      success: true,
      message: `管理员 [${admin.username}] 已成功重置为未绑定状态，下次登录将强制引导扫码绑定`,
    };
  }

  /**
   * 计算指定 Base32 密钥当前的实时动态验证码 (用于演示环境快速调试)
   */
  getTotpForSecret(secret: string): string {
    return generateTOTP(secret);
  }
}
