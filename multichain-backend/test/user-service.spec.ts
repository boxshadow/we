import { describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '../src/modules/user/user.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';

describe('UserService - 多链地址绑定同一主账号体系', () => {
  let userService: UserService;

  const evmAddress = '0x1111111111111111111111111111111111111111';
  const solanaAddress = 'SolanaAddress111111111111111111111111111111';
  const tronAddress = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

  beforeEach(() => {
    userService = new UserService();
  });

  describe('1. 首次创建主账号', () => {
    it('使用初始钱包（如 EVM）创建主账号，自动作为 Primary Wallet', async () => {
      const user = await userService.createUserWithWallet(ChainType.EVM, evmAddress, 'ethereum');

      expect(user.id).toBeDefined();
      expect(user.primaryWallet.chain).toBe(ChainType.EVM);
      expect(user.primaryWallet.address).toBe(evmAddress);
      expect(user.wallets).toHaveLength(1);
      expect(user.wallets[0].isPrimary).toBe(true);

      // 通过该地址反查用户
      const found = await userService.findUserByWallet(ChainType.EVM, evmAddress);
      expect(found?.id).toBe(user.id);
    });

    it('重复创建相同地址的钱包账号应抛出 ConflictException', async () => {
      await userService.createUserWithWallet(ChainType.EVM, evmAddress);
      await expect(
        userService.createUserWithWallet(ChainType.EVM, evmAddress),
      ).rejects.toThrow('already associated');
    });
  });

  describe('2. 多链钱包绑定到同一个主账号 (Account Linking)', () => {
    it('支持为同一个主账号绑定 Solana 钱包与 Tron 钱包', async () => {
      const user = await userService.createUserWithWallet(ChainType.EVM, evmAddress);

      // 绑定 Solana
      const afterSolana = await userService.bindWalletToUser(
        user.id,
        ChainType.SOLANA,
        solanaAddress,
      );
      expect(afterSolana.wallets).toHaveLength(2);

      // 绑定 Tron
      const afterTron = await userService.bindWalletToUser(
        user.id,
        ChainType.TRON,
        tronAddress,
      );
      expect(afterTron.wallets).toHaveLength(3);

      // 核心验证：通过绑定的任何一个链的地址，都能定位到同一个主账号 userId！
      const userByEvm = await userService.findUserByWallet(ChainType.EVM, evmAddress);
      const userBySol = await userService.findUserByWallet(ChainType.SOLANA, solanaAddress);
      const userByTron = await userService.findUserByWallet(ChainType.TRON, tronAddress);

      expect(userByEvm?.id).toBe(user.id);
      expect(userBySol?.id).toBe(user.id);
      expect(userByTron?.id).toBe(user.id);
      expect(userByEvm?.id).toBe(userBySol?.id);
    });

    it('安全拦截：严禁绑定已经被其他用户绑定的钱包地址', async () => {
      const userA = await userService.createUserWithWallet(ChainType.EVM, evmAddress);
      const userB = await userService.createUserWithWallet(ChainType.SOLANA, solanaAddress);

      // User A 尝试绑定 User B 已经占用的 Solana 地址
      await expect(
        userService.bindWalletToUser(userA.id, ChainType.SOLANA, solanaAddress),
      ).rejects.toThrow('already bound to another master account');
    });

    it('安全拦截：不能重复绑定自己已有的钱包', async () => {
      const user = await userService.createUserWithWallet(ChainType.EVM, evmAddress);
      await expect(
        userService.bindWalletToUser(user.id, ChainType.EVM, evmAddress),
      ).rejects.toThrow('already bound to your account');
    });
  });

  describe('3. 钱包解绑 (Unbind)', () => {
    it('允许解绑已绑定的非主钱包', async () => {
      const user = await userService.createUserWithWallet(ChainType.EVM, evmAddress);
      await userService.bindWalletToUser(user.id, ChainType.SOLANA, solanaAddress);
      expect(user.wallets).toHaveLength(2);

      const updated = await userService.unbindWalletFromUser(
        user.id,
        ChainType.SOLANA,
        solanaAddress,
      );
      expect(updated.wallets).toHaveLength(1);

      // 解绑后不可再通过该 Solana 地址查到账号
      const found = await userService.findUserByWallet(ChainType.SOLANA, solanaAddress);
      expect(found).toBeNull();
    });

    it('安全拦截：严禁解绑主钱包或唯一仅存的钱包', async () => {
      const user = await userService.createUserWithWallet(ChainType.EVM, evmAddress);

      // 仅存一个钱包不可解绑
      await expect(
        userService.unbindWalletFromUser(user.id, ChainType.EVM, evmAddress),
      ).rejects.toThrow('Cannot unbind the only remaining wallet');

      // 即使绑定了多个，也不能解绑 isPrimary 钱包
      await userService.bindWalletToUser(user.id, ChainType.SOLANA, solanaAddress);
      await expect(
        userService.unbindWalletFromUser(user.id, ChainType.EVM, evmAddress),
      ).rejects.toThrow('Cannot unbind the primary wallet');
    });
  });
});
