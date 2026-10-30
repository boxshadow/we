import type { SupportedNetwork, UserProfile, AuthTokens, ChainFamily } from '../types/wallet';

const API_BASE = '/api';

export const apiClient = {
  // 获取公链配置列表
  async getNetworks(): Promise<SupportedNetwork[]> {
    const res = await fetch(`${API_BASE}/networks`);
    if (!res.ok) throw new Error('拉取支持网络失败');
    const data = await res.json();
    return data.map((d: any) => ({
      networkId: d.networkId,
      name: d.name,
      family: d.family,
      chainId: d.chainId,
      chainIdHex: d.chainId ? '0x' + d.chainId.toString(16) : null,
      symbol: d.nativeCurrency?.symbol || 'ETH',
      icon: d.family === 'EVM' ? '🔷' : d.family === 'SOLANA' ? '🟣' : '🔴',
      rpc: d.httpRpc?.primaryUrl || '',
      isPaused: d.security?.isPaused || false
    }));
  },

  // 获取签名 Nonce 与 EIP-4361 挑战文本
  async getNonce(chain: ChainFamily, address: string, networkId?: string): Promise<{ nonce: string; message: string }> {
    let url = `${API_BASE}/auth/nonce?chain=${encodeURIComponent(chain)}&address=${encodeURIComponent(address)}`;
    if (networkId) url += `&networkId=${encodeURIComponent(networkId)}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '获取 Nonce 失败');
    return data;
  },

  // 提交验签登录
  async login(payload: { chain: ChainFamily; address: string; signature: string; message: string; networkId?: string }): Promise<{ tokens: AuthTokens; user: UserProfile }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '验签登录失败');
    return data;
  },

  // 拉取当前主账号画像
  async getProfile(accessToken: string): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Token 已过期');
    return data;
  },

  // 跨链绑定新钱包
  async bindWallet(accessToken: string, payload: { chain: ChainFamily; address: string; signature: string; message: string }): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/auth/bind-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '绑定钱包失败');
    return data;
  },

  // 解绑钱包
  async unbindWallet(accessToken: string, payload: { chain: ChainFamily; address: string }): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/auth/unbind-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '解绑失败');
    return data;
  },

  // 刷新访问令牌
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '刷新 Token 失败');
    return data;
  },

  // 获取数据库中所有主账号画像及跨链绑定列表
  async getAllUsers(): Promise<UserProfile[]> {
    const res = await fetch(`${API_BASE}/users/all`);
    if (!res.ok) throw new Error('拉取数据库用户档案失败');
    return res.json();
  },

  // 获取多链支持代币字典 (公开)
  async getSupportedTokens(networkId?: string): Promise<any[]> {
    const url = networkId ? `${API_BASE}/tokens/supported?networkId=${encodeURIComponent(networkId)}` : `${API_BASE}/tokens/supported`;
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  },

  // 获取用户多链代币独立资产余额
  async getUserBalances(userId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/balances/user/${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return res.json();
  },

  // 创建充值订单意图 (生成专属充值收款地址)
  async createDepositIntent(payload: { network: string; amount: string; tokenSymbol?: string; tokenAddress?: string; userId?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '创建充值订单失败');
    return data;
  },

  // 场景 A: 提交 TxHash 确认到账并增加资产余额
  async confirmDeposit(payload: { orderId: string; txHash: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/deposit/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '核验充值订单失败');
    return data;
  },

  // 场景 B: 交易所提现/扫码未拿到 TxHash，智能链上对账探测入账
  async scanMatchDeposit(payload: { orderId: string; fromAddress?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/deposit/scan-matching`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '智能对账核验失败');
    return data;
  },

  // 轮询查询充值订单区块链确认进度 (Block Confirmations)
  async getDepositProgress(orderId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/deposit/${encodeURIComponent(orderId)}/progress`);
    if (!res.ok) return null;
    return res.json();
  },

  // 发起提现出金 (服务端执行线上转账出资)
  async withdraw(payload: { network: string; tokenSymbol: string; amount: string; toAddress: string; userId?: string; tokenAddress?: string }): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '提现申请失败');
    return data;
  },

  // 轮询查询提现订单区块链确认进度
  async getWithdrawalProgress(orderId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/transfer/workflow/withdraw/${encodeURIComponent(orderId)}/progress`);
    if (!res.ok) return null;
    return res.json();
  },

  // 获取用户提现历史记录
  async getUserWithdrawals(userId: string): Promise<any[]> {
    const res = await fetch(`${API_BASE}/transfer/workflow/withdrawals/user/${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    return res.json();
  },

  // 获取最近充值订单流水
  async getRecentDeposits(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/transfer/workflow/deposits`);
    if (!res.ok) return [];
    return res.json();
  }
};
