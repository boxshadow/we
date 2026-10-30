import { authFetch } from './adminClient';

export interface NetworkItem {
  networkId: string;
  name: string;
  family: 'EVM' | 'SOLANA' | 'TRON';
  chainId: number | null;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  httpRpc: {
    primaryUrl: string;
    secondaryUrl?: string;
  };
  blockExplorer: {
    name: string;
    txUrl: string;
    addressUrl: string;
  };
  security: {
    isPaused: boolean;
  };
}

export interface TestRpcResult {
  networkId: string;
  success: boolean;
  blockNumber?: number | string;
  latencyMs?: number;
  testedRpc?: string;
  timestamp: string;
  error?: string;
}

const API_BASE = '/api';

export const networkApi = {
  // 获取公链列表 (包含状态与 RPC)
  async getNetworks(): Promise<NetworkItem[]> {
    const res = await authFetch(`${API_BASE}/networks`);
    if (!res.ok) throw new Error('获取网络列表失败');
    return res.json();
  },

  // 注册全新公链
  async registerNetwork(data: Partial<NetworkItem>): Promise<NetworkItem> {
    const res = await authFetch(`${API_BASE}/admin/networks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || '注册新公链失败');
    return result;
  },

  // 节点 RPC 连通性与延迟测试
  async testRpc(networkId: string): Promise<TestRpcResult> {
    const res = await authFetch(`${API_BASE}/admin/networks/${encodeURIComponent(networkId)}/test-rpc`, {
      method: 'POST'
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || '测试 RPC 节点失败');
    return result;
  },

  // 紧急熔断断路器切换 (Pause / Resume)
  async togglePause(networkId: string, paused: boolean): Promise<NetworkItem> {
    const res = await authFetch(`${API_BASE}/admin/networks/${encodeURIComponent(networkId)}/pause`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused })
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || '切换熔断状态失败');
    return result;
  },

  // 更新配置
  async updateNetwork(networkId: string, data: Partial<NetworkItem>): Promise<NetworkItem> {
    const res = await authFetch(`${API_BASE}/admin/networks/${encodeURIComponent(networkId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || '更新公链配置失败');
    return result;
  },

  // 删除公链配置
  async deleteNetwork(networkId: string): Promise<{ success: boolean; networkId: string }> {
    const res = await authFetch(`${API_BASE}/admin/networks/${encodeURIComponent(networkId)}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.message || '删除公链配置失败');
    return result;
  }
};
