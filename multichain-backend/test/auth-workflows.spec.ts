import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { UserService } from '../src/modules/user/user.service.js';
import { SignatureVerifierService } from '../src/modules/auth/signature-verifier.service.js';
import { JwtAuthGuard } from '../src/modules/auth/guards/jwt-auth.guard.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';

describe('AuthModule - Web3 WalletConnect 登录与多链身份认证', () => {
  let authService: AuthService;
  let userService: UserService;
  let signatureVerifier: SignatureVerifierService;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;

  const evmAddress = '0x1111111111111111111111111111111111111111';
  const solanaAddress = 'SolanaAddress111111111111111111111111111111';

  beforeEach(() => {
    userService = new UserService();

    jwtService = new JwtService({
      secret: 'test-multichain-secret-key-1234567890',
      signOptions: { expiresIn: '2h' },
    });

    signatureVerifier = {
      verifySignature: vi.fn().mockImplementation(async (chain, address, message, signature) => {
        // 模拟：只要 signature 以 'valid' 开头即判定密码学验签通过
        return typeof signature === 'string' && signature.startsWith('valid');
      }),
    } as any;

    authService = new AuthService(userService, signatureVerifier, jwtService);
    jwtGuard = new JwtAuthGuard(jwtService);
  });

  describe('1. Nonce 挑战生成 (Challenge / EIP-4361)', () => {
    it('应生成标准的 EIP-4361 挑战消息，包含随机数与时效性', async () => {
      const challenge = await authService.generateNonce(ChainType.EVM, evmAddress, 'ethereum');

      expect(challenge.nonce).toBeDefined();
      expect(challenge.nonce.length).toBeGreaterThan(10);
      expect(challenge.message).toContain(evmAddress);
      expect(challenge.message).toContain(challenge.nonce);
      expect(challenge.message).toContain('Issued At:');
      expect(challenge.message).toContain('Expiration Time:');
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('2. 钱包登录与防重放攻击 (Login & Anti-Replay)', () => {
    it('正确签名通过后，成功创建用户并签发 JWT 访问令牌', async () => {
      const challenge = await authService.generateNonce(ChainType.EVM, evmAddress);

      const loginRes = await authService.loginWithWallet({
        chain: ChainType.EVM,
        address: evmAddress,
        signature: 'valid_signature_from_metamask',
        message: challenge.message,
      });

      expect(loginRes.user).toBeDefined();
      expect(loginRes.user.primaryWallet.address).toBe(evmAddress);
      expect(loginRes.tokens.accessToken).toBeDefined();
      expect(loginRes.tokens.refreshToken).toBeDefined();
      expect(loginRes.tokens.tokenType).toBe('Bearer');

      // 验证签发的 JWT Token 可以被解密验证
      const decoded: any = await jwtService.verifyAsync(loginRes.tokens.accessToken);
      expect(decoded.sub).toBe(loginRes.user.id);
      expect(decoded.address).toBe(evmAddress);
      expect(decoded.chain).toBe(ChainType.EVM);
    });

    it('防重放攻击：同一个 Nonce 签名只能消费一次，第二次提交直接拒绝', async () => {
      const challenge = await authService.generateNonce(ChainType.EVM, evmAddress);

      // 第一次登录成功
      await authService.loginWithWallet({
        chain: ChainType.EVM,
        address: evmAddress,
        signature: 'valid_signature_1',
        message: challenge.message,
      });

      // 黑客抓包后尝试再次提交相同的签名与挑战
      await expect(
        authService.loginWithWallet({
          chain: ChainType.EVM,
          address: evmAddress,
          signature: 'valid_signature_1',
          message: challenge.message,
        }),
      ).rejects.toThrow('Login challenge not found or already consumed');
    });

    it('签名无效时严格拒绝登录', async () => {
      const challenge = await authService.generateNonce(ChainType.EVM, evmAddress);

      await expect(
        authService.loginWithWallet({
          chain: ChainType.EVM,
          address: evmAddress,
          signature: 'invalid_bad_sig',
          message: challenge.message,
        }),
      ).rejects.toThrow('Invalid wallet signature');
    });
  });

  describe('3. 多链身份打通：绑定新钱包与通用登录', () => {
    it('用户登录 EVM 主账号后，可绑定 Solana 钱包；之后用 Solana 登录能直接认出是同一个账号', async () => {
      // 1. 用户使用 EVM 登录
      const evmChallenge = await authService.generateNonce(ChainType.EVM, evmAddress);
      const evmLogin = await authService.loginWithWallet({
        chain: ChainType.EVM,
        address: evmAddress,
        signature: 'valid_evm_sig',
        message: evmChallenge.message,
      });
      const userId = evmLogin.user.id;

      // 2. 绑定 Solana 钱包
      const solChallenge = await authService.generateNonce(ChainType.SOLANA, solanaAddress);
      const userAfterBind = await authService.bindWallet(userId, {
        chain: ChainType.SOLANA,
        address: solanaAddress,
        signature: 'valid_solana_sig',
        message: solChallenge.message,
      });

      expect(userAfterBind.wallets).toHaveLength(2);

      // 3. 核心场景：用户下次在只装了 Phantom 钱包的浏览器上，直接用 Solana 钱包登录
      const nextSolChallenge = await authService.generateNonce(ChainType.SOLANA, solanaAddress);
      const solLogin = await authService.loginWithWallet({
        chain: ChainType.SOLANA,
        address: solanaAddress,
        signature: 'valid_solana_sig_2',
        message: nextSolChallenge.message,
      });

      // 必须是同一个 userId！而不是创建新的空白账号！
      expect(solLogin.user.id).toBe(userId);
      expect(solLogin.user.wallets).toHaveLength(2);
    });
  });

  describe('4. Token 刷新与 AuthGuard 路由守卫', () => {
    it('可以使用 Refresh Token 换取新的 Access Token', async () => {
      const challenge = await authService.generateNonce(ChainType.EVM, evmAddress);
      const loginRes = await authService.loginWithWallet({
        chain: ChainType.EVM,
        address: evmAddress,
        signature: 'valid_sig',
        message: challenge.message,
      });

      const newTokens = await authService.refreshTokens(loginRes.tokens.refreshToken);
      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(loginRes.tokens.accessToken);
    });

    it('JwtAuthGuard 守卫拦截无 Token 或伪造 Token 的请求', async () => {
      const mockContextNoToken = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
          }),
        }),
      } as any;

      await expect(jwtGuard.canActivate(mockContextNoToken)).rejects.toThrow(
        'Authentication token required',
      );

      const mockContextFakeToken = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { authorization: 'Bearer fake_invalid_jwt_string' },
          }),
        }),
      } as any;

      await expect(jwtGuard.canActivate(mockContextFakeToken)).rejects.toThrow(
        'Invalid or expired authentication token',
      );
    });
  });
});
