import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AdminAuthService } from '../src/modules/admin-auth/admin-auth.service.js';
import { generateTOTP } from '../src/modules/admin-auth/utils/totp.util.js';

describe('Admin Authentication & Google 2FA (账号 + 密码 + TOTP 2FA RBAC 验证)', () => {
  let app: INestApplication;
  let authService: AdminAuthService;
  const validSecret = 'JBSWY3DPEHPK3PXP';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    authService = app.get(AdminAuthService);
    authService.resetToDefaultSeed();
  });

  afterAll(async () => {
    if (authService) {
      authService.resetToDefaultSeed();
    }
    await app.close();
  });

  it('1. 密码错误应被直接拦截 (401 Unauthorized)', async () => {
    const currentCode = generateTOTP(validSecret);
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'WrongPassword!',
        twoFactorCode: currentCode,
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('管理员账号或密码错误');
  });

  it('2. 账号存在但 Google 2FA 动态码错误时应被拦截 (401 Unauthorized)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
        twoFactorCode: '000000',
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Google 二次验证码错误或已过期');
  });

  it('3. 正确账号 + 密码 + 实时 Google 2FA 应成功签发 Admin JWT (200 OK)', async () => {
    const currentCode = generateTOTP(validSecret);
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
        twoFactorCode: currentCode,
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.tokenType).toBe('Bearer');
    expect(res.body.admin.username).toBe('admin');
    expect(res.body.admin.role).toBe('SUPER_ADMIN');
    expect(res.body.admin.isTwoFactorEnabled).toBe(true);
  });

  it('4. 未携带 Token 访问高危管理接口应被严格阻断 (401 Unauthorized)', async () => {
    const res = await request(app.getHttpServer()).get('/api/admin/deposit-wallets');
    expect(res.status).toBe(401);
    expect(res.body.message).toContain('管理后台访问凭证缺失');
  });

  it('5. 携带普通 DApp 用户 Token 访问管理接口应被禁止 (403 Forbidden)', async () => {
    // 伪造或获取一个没有 ADMIN 权限的 Token
    const jwtService = app.get(JwtService);
    const userToken = await jwtService.signAsync({
      sub: 'normal-user-uuid',
      role: 'USER',
      type: 'USER',
    });

    const res = await request(app.getHttpServer())
      .get('/api/admin/deposit-wallets')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('非管理后台专用鉴权凭证');
  });

  it('6. 携带有效 Admin JWT 访问管理接口应顺利放行 (200 OK)', async () => {
    const currentCode = generateTOTP(validSecret);
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
        twoFactorCode: currentCode,
      });

    const adminToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/api/admin/deposit-wallets')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('7. 查询当前管理员画像与 Google 2FA 绑定要素应成功 (200 OK)', async () => {
    const currentCode = generateTOTP(validSecret);
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
        twoFactorCode: currentCode,
      });

    const adminToken = loginRes.body.accessToken;

    const meRes = await request(app.getHttpServer())
      .get('/api/admin/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.username).toBe('admin');

    const setupRes = await request(app.getHttpServer())
      .get('/api/admin/auth/2fa/setup')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(setupRes.status).toBe(200);
    expect(setupRes.body.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(setupRes.body.otpAuthUri).toContain('otpauth://totp/');
    expect(setupRes.body.qrCodeDataUrl).toContain('data:image/png;base64');
  });

  it('8. 重置为未绑定状态后首次登录，应返回二维码绑定引导与 setupToken (200 OK)', async () => {
    // 1. 重置为未绑定
    const resetRes = await request(app.getHttpServer())
      .post('/api/admin/auth/2fa/reset-demo')
      .send({ username: 'admin' });
    expect(resetRes.status).toBe(200);

    // 2. 账号密码登录 (未绑定 2FA)
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requireTwoFactorSetup).toBe(true);
    expect(loginRes.body.setupToken).toBeDefined();
    expect(loginRes.body.secret).toBeDefined();
    expect(loginRes.body.qrCodeDataUrl).toContain('data:image/png;base64');
    expect(loginRes.body.otpAuthUri).toContain('otpauth://totp/');
  });

  it('9. 首次绑定时输入错误动态码应被拒绝 (400 BadRequest)', async () => {
    // 获取 setupToken
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
      });

    const setupToken = loginRes.body.setupToken;

    const confirmRes = await request(app.getHttpServer())
      .post('/api/admin/auth/2fa/confirm-setup')
      .send({
        setupToken,
        twoFactorCode: '999999',
      });

    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.message).toContain('动态验证码验证失败');
  });

  it('10. 首次绑定输入正确 2FA 动态码应激活成功并签发正式 Admin JWT (200 OK)', async () => {
    // 1. 获取 setupToken 与 secret
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
      });

    const setupToken = loginRes.body.setupToken;
    const secret = loginRes.body.secret;
    const validCode = generateTOTP(secret);

    // 2. 确认绑定
    const confirmRes = await request(app.getHttpServer())
      .post('/api/admin/auth/2fa/confirm-setup')
      .send({
        setupToken,
        twoFactorCode: validCode,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.accessToken).toBeDefined();
    expect(confirmRes.body.tokenType).toBe('Bearer');
    expect(confirmRes.body.admin.isTwoFactorEnabled).toBe(true);

    // 3. 验证后续已可直接使用账号密码 + 新 2FA 登录
    const subsequentCode = generateTOTP(secret);
    const subsequentLogin = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'admin',
        password: 'AdminPassword2026!',
        twoFactorCode: subsequentCode,
      });

    expect(subsequentLogin.status).toBe(200);
    expect(subsequentLogin.body.accessToken).toBeDefined();
  });

  it('11. 初始 Founder 账号登录必须绑定 Google 2FA：首次输入密码直接阻断签发 Token 并返回二维码', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'founder',
        password: 'FounderPassword2026!',
      });

    expect(res.status).toBe(200);
    expect(res.body.requireTwoFactorSetup).toBe(true);
    expect(res.body.accessToken).toBeUndefined(); // 绝对不可提前签发正式 Token
    expect(res.body.setupToken).toBeDefined();
    expect(res.body.secret).toBeDefined();
    expect(res.body.qrCodeDataUrl).toContain('data:image/png;base64');
    expect(res.body.otpAuthUri).toContain('founder');
  });

  it('12. Founder 首次绑定时验证码错误应被拒绝 (400)', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'founder',
        password: 'FounderPassword2026!',
      });

    const setupToken = loginRes.body.setupToken;

    const confirmRes = await request(app.getHttpServer())
      .post('/api/admin/auth/2fa/confirm-setup')
      .send({
        setupToken,
        twoFactorCode: '111111',
      });

    expect(confirmRes.status).toBe(400);
    expect(confirmRes.body.message).toContain('动态验证码验证失败');
  });

  it('13. Founder 首次输入正确 2FA 动态码完成绑定，激活 FOUNDER 最高权限并可访问管理接口', async () => {
    // 1. 获取 setupToken 与 secret
    const loginRes = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'founder',
        password: 'FounderPassword2026!',
      });

    const setupToken = loginRes.body.setupToken;
    const secret = loginRes.body.secret;
    const validCode = generateTOTP(secret);

    // 2. 确认绑定
    const confirmRes = await request(app.getHttpServer())
      .post('/api/admin/auth/2fa/confirm-setup')
      .send({
        setupToken,
        twoFactorCode: validCode,
      });

    expect(confirmRes.status).toBe(200);
    expect(confirmRes.body.accessToken).toBeDefined();
    expect(confirmRes.body.admin.username).toBe('founder');
    expect(confirmRes.body.admin.role).toBe('FOUNDER');
    expect(confirmRes.body.admin.isTwoFactorEnabled).toBe(true);

    const founderToken = confirmRes.body.accessToken;

    // 3. 验证 FOUNDER 角色访问管理接口
    const apiRes = await request(app.getHttpServer())
      .get('/api/admin/deposit-wallets')
      .set('Authorization', `Bearer ${founderToken}`);

    expect(apiRes.status).toBe(200);
    expect(Array.isArray(apiRes.body)).toBe(true);

    // 4. 后续登录必须携带 2FA 码
    const nextCode = generateTOTP(secret);
    const subsequentLogin = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .send({
        username: 'founder',
        password: 'FounderPassword2026!',
        twoFactorCode: nextCode,
      });

    expect(subsequentLogin.status).toBe(200);
    expect(subsequentLogin.body.accessToken).toBeDefined();
  });
});
