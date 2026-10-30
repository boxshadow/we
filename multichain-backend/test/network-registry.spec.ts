import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';
import { CreateNetworkDto } from '../src/modules/network/dto/network.dto.js';

describe('NetworkRegistryService - Dynamic Dual-Channel Chain Management', () => {
  let registry: NetworkRegistryService;

  beforeEach(() => {
    registry = new NetworkRegistryService();
  });

  describe('1. Default Built-in Networks & Dual-Channel RPCs', () => {
    it('应内置预设主要网络（Ethereum, BSC, Base, Arbitrum, Solana, Tron）', () => {
      const networks = registry.getAllNetworks();
      expect(networks.length).toBeGreaterThanOrEqual(6);

      const ids = networks.map((n) => n.networkId);
      expect(ids).toContain('ethereum');
      expect(ids).toContain('bsc');
      expect(ids).toContain('base');
      expect(ids).toContain('arbitrum');
      expect(ids).toContain('solana');
      expect(ids).toContain('tron');
    });

    it('每个网络应具备双通道配置（Channel 1: HTTP RPC, Channel 2: WS RPC）', () => {
      const eth = registry.getNetwork('ethereum');
      expect(eth.httpRpc.primaryUrl).toBeDefined();
      expect(eth.httpRpc.primaryUrl).toMatch(/^https?:\/\//);
      expect(eth.wsRpc.primaryUrl).toBeDefined();
      expect(eth.wsRpc.primaryUrl).toMatch(/^wss?:\/\//);
      expect(eth.contracts.dexRouterAddress).toBeDefined();
      expect(eth.contracts.tokenLockerAddress).toBeDefined();

      const bsc = registry.getNetwork('bsc');
      expect(bsc.chainId).toBe(56);
      expect(bsc.nativeCurrency.symbol).toBe('BNB');
      expect(bsc.httpRpc.primaryUrl).toBeDefined();
      expect(bsc.wsRpc.primaryUrl).toBeDefined();

      const sol = registry.getNetwork('solana');
      expect(sol.family).toBe(ChainType.SOLANA);
      expect(sol.nativeCurrency.decimals).toBe(9);
      expect(sol.wsRpc.primaryUrl).toBeDefined();

      const tron = registry.getNetwork('tron');
      expect(tron.family).toBe(ChainType.TRON);
      expect(tron.nativeCurrency.decimals).toBe(6);
      expect(tron.wsRpc.primaryUrl).toBeDefined();
    });

    it('支持按 networkId、chainId 或别名灵活查找', () => {
      expect(registry.getNetwork('ethereum').networkId).toBe('ethereum');
      expect(registry.getNetwork('EVM').networkId).toBe('ethereum');
      expect(registry.getNetwork('eth').networkId).toBe('ethereum');
      expect(registry.getNetwork(56).networkId).toBe('bsc');
      expect(registry.getNetwork(8453).networkId).toBe('base');
      expect(registry.getNetwork('solana').networkId).toBe('solana');
      expect(registry.getNetwork('tron').networkId).toBe('tron');
    });
  });

  describe('2. 动态扩展与注册新网络 (Dynamic Registration)', () => {
    it('允许后台管理员动态注册新的 EVM 链（如 Optimism、Polygon 或自定义私链）而无需重启修改代码', () => {
      const customNetwork: CreateNetworkDto = {
        networkId: 'optimism',
        name: 'Optimism Mainnet',
        family: ChainType.EVM,
        chainId: 10,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        httpRpc: {
          primaryUrl: 'https://mainnet.optimism.io',
          fallbackUrls: ['https://rpc.ankr.com/optimism'],
        },
        wsRpc: {
          primaryUrl: 'wss://mainnet.optimism.io/ws',
        },
        contracts: {
          dexRouterAddress: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
          tokenLockerAddress: '0xPinkLockOptimismAddress',
        },
        security: {
          minConfirmations: 3,
          minDeposit: '0.002',
          minWithdraw: '0.005',
          isPaused: false,
        },
      };

      const created = registry.registerNetwork(customNetwork);
      expect(created.networkId).toBe('optimism');
      expect(created.chainId).toBe(10);

      // 验证可以通过 networkId 或 chainId 获取
      const fetched = registry.getNetwork('optimism');
      expect(fetched.name).toBe('Optimism Mainnet');
      expect(registry.getNetwork(10).networkId).toBe('optimism');
    });

    it('注册重复 networkId 时应抛出异常', () => {
      expect(() => {
        registry.registerNetwork({
          networkId: 'ethereum',
          name: 'Ethereum Duplicate',
          family: ChainType.EVM,
          nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
          httpRpc: { primaryUrl: 'https://duplicate.rpc' },
        });
      }).toThrow('already exists');
    });
  });

  describe('3. 动态热更新与安全熔断 (Update & Pause)', () => {
    it('管理员可在运行时热更新 RPC 节点与合约地址', () => {
      const updated = registry.updateNetwork('bsc', {
        httpRpc: {
          primaryUrl: 'https://custom-premium-bsc-node.quicknode.pro',
        },
        wsRpc: {
          primaryUrl: 'wss://custom-premium-bsc-node.quicknode.pro/ws',
        },
      });

      expect(updated.httpRpc.primaryUrl).toBe(
        'https://custom-premium-bsc-node.quicknode.pro',
      );
      expect(updated.wsRpc.primaryUrl).toBe(
        'wss://custom-premium-bsc-node.quicknode.pro/ws',
      );
      expect(registry.getNetwork('bsc').httpRpc.primaryUrl).toBe(
        'https://custom-premium-bsc-node.quicknode.pro',
      );
    });

    it('支持紧急暂停 (Pause) 熔断链上业务', () => {
      const paused = registry.pauseNetwork('base', true);
      expect(paused.security.isPaused).toBe(true);

      const fetched = registry.getNetwork('base');
      expect(fetched.security.isPaused).toBe(true);

      // 解除暂停
      const unpaused = registry.pauseNetwork('base', false);
      expect(unpaused.security.isPaused).toBe(false);
    });

    it('安全防护：保护标准核心链不被误删，但允许删除自定义链', () => {
      expect(() => registry.deleteNetwork('ethereum')).toThrow(
        'Cannot delete canonical network',
      );
      expect(() => registry.deleteNetwork('solana')).toThrow(
        'Cannot delete canonical network',
      );

      // 添加临时网络并删除
      registry.registerNetwork({
        networkId: 'test-chain',
        name: 'Test Chain',
        family: ChainType.EVM,
        nativeCurrency: { name: 'TST', symbol: 'TST', decimals: 18 },
        httpRpc: { primaryUrl: 'https://test.rpc' },
      });

      expect(registry.hasNetwork('test-chain')).toBe(true);
      const deleted = registry.deleteNetwork('test-chain');
      expect(deleted).toBe(true);
      expect(registry.hasNetwork('test-chain')).toBe(false);
    });
  });
});
