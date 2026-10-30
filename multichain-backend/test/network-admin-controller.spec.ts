import { describe, it, expect, beforeEach } from 'vitest';
import { NetworkAdminController } from '../src/modules/network/network-admin.controller.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';

describe('NetworkAdminController - Admin Dashboard Endpoints', () => {
  let controller: NetworkAdminController;
  let registry: NetworkRegistryService;

  beforeEach(() => {
    registry = new NetworkRegistryService();
    controller = new NetworkAdminController(registry);
  });

  it('GET /admin/networks 应返回所有网络列表及双通道节点信息', () => {
    const list = controller.getAllNetworks();
    expect(list.length).toBeGreaterThanOrEqual(6);
    for (const net of list) {
      expect(net.httpRpc).toBeDefined();
      expect(net.wsRpc).toBeDefined();
      expect(net.contracts).toBeDefined();
    }
  });

  it('GET /admin/networks/:id 应返回特定网络详情', () => {
    const eth = controller.getNetwork('ethereum');
    expect(eth.networkId).toBe('ethereum');
    expect(eth.chainId).toBe(1);
    expect(eth.nativeCurrency.symbol).toBe('ETH');
  });

  it('POST /admin/networks 应能成功注册新 EVM 网络', () => {
    const created = controller.registerNetwork({
      networkId: 'polygon',
      name: 'Polygon PoS Mainnet',
      family: ChainType.EVM,
      chainId: 137,
      nativeCurrency: { name: 'Polygon Ecosystem Token', symbol: 'POL', decimals: 18 },
      httpRpc: {
        primaryUrl: 'https://polygon-rpc.com',
      },
      wsRpc: {
        primaryUrl: 'wss://polygon-bor-rpc.publicnode.com',
      },
      contracts: {
        dexRouterAddress: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      },
    });

    expect(created.networkId).toBe('polygon');
    expect(created.chainId).toBe(137);
    expect(controller.getNetwork('polygon').name).toBe('Polygon PoS Mainnet');
  });

  it('PUT /admin/networks/:id 应能热更新节点与配置', () => {
    const updated = controller.updateNetwork('bsc', {
      name: 'BNB Smart Chain (Updated)',
      httpRpc: {
        primaryUrl: 'https://bsc-dataseed1.defibit.io',
      },
    });

    expect(updated.name).toBe('BNB Smart Chain (Updated)');
    expect(updated.httpRpc.primaryUrl).toBe('https://bsc-dataseed1.defibit.io');
  });

  it('PATCH /admin/networks/:id/pause 应能切换熔断暂停状态', () => {
    const paused = controller.pauseNetwork('ethereum', true);
    expect(paused.security.isPaused).toBe(true);

    const resumed = controller.pauseNetwork('ethereum', false);
    expect(resumed.security.isPaused).toBe(false);
  });

  it('DELETE /admin/networks/:id 允许删除自定义网络', () => {
    controller.registerNetwork({
      networkId: 'custom-devnet',
      name: 'Devnet',
      family: ChainType.EVM,
      nativeCurrency: { name: 'DEV', symbol: 'DEV', decimals: 18 },
      httpRpc: { primaryUrl: 'http://localhost:8545' },
    });

    const res = controller.deleteNetwork('custom-devnet');
    expect(res.success).toBe(true);
    expect(() => controller.getNetwork('custom-devnet')).toThrow();
  });
});
