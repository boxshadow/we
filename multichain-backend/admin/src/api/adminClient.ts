const API_BASE = '/api';

export const ADMIN_TOKEN_KEY = 'admin_access_token';
export const ADMIN_PROFILE_KEY = 'admin_profile';

/**
 * 封装自动附加 Admin Bearer Token 的 Fetch 客户端
 * 当捕获 401 Unauthorized 时，自动清除本地会话并跳转至登录页
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/admin-dist/login';
    }
  }

  return res;
}

export interface DepositWalletItem {
  id: string;
  networkId?: string | null;
  chain: string; // EVM, SOLANA, TRON
  address: string;
  label?: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WithdrawWalletItem {
  id: string;
  chain: string; // EVM, SOLANA, TRON
  address: string;
  label?: string | null;
  balance: string;
  dailyLimit: string;
  spentToday: string;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionItem {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'SWEEP';
  network: string;
  chain: string;
  tokenSymbol: string;
  amount: string;
  fromAddress: string;
  toAddress: string;
  txHash?: string;
  status: string;
  timestamp: number;
  userId?: string;
  blockNumber?: number;
  confirmations?: number;
}

export interface OperationsAnalytics {
  summary: {
    totalDepositAmount: string;
    todayDepositAmount: string;
    totalDepositCount: number;
    totalWithdrawalAmount: string;
    todayWithdrawalAmount: string;
    totalWithdrawalCount: number;
    netFlow24h: string;
    pendingDepositsCount: number;
    pendingWithdrawalsCount: number;
  };
  chainVolumeShare: {
    EVM: number;
    TRON: number;
    SOLANA: number;
  };
  vaultReserves?: any[];
  recentTrend?: any[];
  trend15Days?: any[];
  summary15Days?: any;
  tokenVolumeShare?: Record<string, number>;
  [key: string]: any;
}

export interface UserSummaryItem {
  id: string;
  role: string;
  status: string;
  nickname?: string;
  primaryWallet?: {
    chain: string;
    address: string;
  };
  primaryChain?: string;
  primaryAddress?: string;
  walletsCount: number;
  totalWallets?: number;
  totalBalanceUsdt: string;
  totalEstimatedUsd?: string;
  createdAt: number;
  lastLoginAt?: number;
  wallets: Array<{
    chain: string;
    address: string;
    isPrimary?: boolean;
    networkId?: string;
    boundAt: number;
  }>;
  [key: string]: any;
}

export interface UserDetailData {
  user: UserSummaryItem;
  balances: any[];
  deposits: any[];
  withdrawals: any[];
  wallets: any[];
  statistics: any;
  stats?: any;
  [key: string]: any;
}

export interface EnclaveKeyItem {
  keyId: string;
  address: string;
  chain: string;
  algorithm: string;
  createdAt: number;
}

export interface JwtTokenDetails {
  algorithm: string;
  issuer: string;
  audience: string[];
  expiresAt: number;
  issuedAt: number;
  roles: string[];
  isExpired: boolean;
}

export interface EncryptionServiceConfig {
  serviceUrl: string;
  jwtToken: string;
  maskedJwtToken?: string;
  providerType: 'CUSTOM_KMS' | 'FIREBLOCKS_MPC' | 'HASHICORP_VAULT' | 'AWS_KMS';
  isActive: boolean;
  timeoutMs: number;
  retryCount: number;
  supportedAlgorithms: string[];
  fallbackStrategy: 'REJECT_ALL' | 'LOCAL_BACKUP';
  enforceHttps: boolean;
  updatedAt: number;
  updatedBy: string;
  lastTestedAt?: number;
  lastStatus?: 'ONLINE' | 'OFFLINE' | 'AUTH_FAILED';
  lastLatencyMs?: number;
  serverVersion?: string;
  tokenDetails?: JwtTokenDetails;
}

export interface ConnectionTestResult {
  success: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'AUTH_FAILED';
  latencyMs: number;
  statusCode: number;
  serverVersion: string;
  enclaveId?: string;
  message: string;
  testedAt: number;
  supportedAlgorithms: string[];
}

export interface TestSignResult {
  success: boolean;
  chain: string;
  signature: string;
  keyId: string;
  latencyMs: number;
  algorithm: string;
  timestamp: number;
}

export interface AdminLoginDto {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface AdminLoginSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  admin: {
    id: string;
    username: string;
    role: string;
    isTwoFactorEnabled: boolean;
    lastLoginAt?: number;
  };
}

export interface TwoFactorSetupRequiredResponse {
  requireTwoFactorSetup: true;
  setupToken: string;
  username: string;
  secret: string;
  otpAuthUri: string;
  qrCodeDataUrl: string;
  message: string;
}

export interface TwoFactorCodeRequiredResponse {
  requireTwoFactorCode: true;
  username: string;
  message: string;
}

export type AdminLoginResult =
  | AdminLoginSuccessResponse
  | TwoFactorSetupRequiredResponse
  | TwoFactorCodeRequiredResponse;

export interface AdminProfile {
  id: string;
  username: string;
  role: string;
  isTwoFactorEnabled: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export interface TwoFactorSetupData {
  secret: string;
  otpAuthUri: string;
  qrCodeDataUrl: string;
  currentCode: string;
}

export const adminAuthClient = {
  async login(dto: AdminLoginDto): Promise<AdminLoginResult> {
    const res = await fetch(`${API_BASE}/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '管理员登录失败，请检查账号、密码或二次验证码');
    }
    const data: AdminLoginResult = await res.json();
    if ('accessToken' in data) {
      localStorage.setItem(ADMIN_TOKEN_KEY, data.accessToken);
      localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(data.admin));
    }
    return data;
  },

  async confirm2faSetup(setupToken: string, twoFactorCode: string): Promise<AdminLoginSuccessResponse> {
    const res = await fetch(`${API_BASE}/admin/auth/2fa/confirm-setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setupToken, twoFactorCode }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '绑定激活失败，请检查动态验证码');
    }
    const data: AdminLoginSuccessResponse = await res.json();
    localStorage.setItem(ADMIN_TOKEN_KEY, data.accessToken);
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(data.admin));
    return data;
  },

  async resetDemo(username: string = 'admin'): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${API_BASE}/admin/auth/2fa/reset-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '重置失败');
    }
    return res.json();
  },

  async getLiveCode(secret?: string): Promise<string> {
    const url = secret
      ? `${API_BASE}/admin/auth/2fa/live-code?secret=${encodeURIComponent(secret)}`
      : `${API_BASE}/admin/auth/2fa/live-code`;
    const res = await fetch(url);
    if (!res.ok) return '';
    const data = await res.json();
    return data.code || '';
  },

  async getMe(): Promise<AdminProfile> {
    const res = await authFetch(`${API_BASE}/admin/auth/me`);
    if (!res.ok) throw new Error('获取管理员档案失败');
    return res.json();
  },

  async get2faSetup(): Promise<TwoFactorSetupData> {
    const res = await authFetch(`${API_BASE}/admin/auth/2fa/setup`);
    if (!res.ok) throw new Error('获取 2FA 绑定信息失败');
    return res.json();
  },

  async logout(): Promise<void> {
    try {
      await authFetch(`${API_BASE}/admin/auth/logout`, { method: 'POST' });
    } catch {
      // ignore
    } finally {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      localStorage.removeItem(ADMIN_PROFILE_KEY);
    }
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  getStoredAdmin(): AdminProfile | null {
    try {
      const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
};

export const adminClient = {
  // ================= 充值钱包配置 =================
  async getDepositWallets(chain?: string, networkId?: string): Promise<DepositWalletItem[]> {
    const params = new URLSearchParams();
    if (chain && chain !== 'ALL') params.append('chain', chain);
    if (networkId && networkId !== 'ALL') params.append('networkId', networkId);
    const res = await authFetch(`${API_BASE}/admin/deposit-wallets?${params.toString()}`);
    if (!res.ok) throw new Error('获取充值收款钱包失败');
    return res.json();
  },

  async addDepositWallet(dto: { chain: string; address: string; label?: string; networkId?: string }): Promise<DepositWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/deposit-wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '添加充值收款钱包失败');
    }
    return res.json();
  },

  async updateDepositWallet(id: string, dto: { label?: string; isActive?: boolean }): Promise<DepositWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/deposit-wallets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error('更新充值收款钱包失败');
    return res.json();
  },

  async toggleDepositWallet(id: string, isActive: boolean): Promise<DepositWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/deposit-wallets/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) throw new Error('切换充值钱包状态失败');
    return res.json();
  },

  async deleteDepositWallet(id: string): Promise<boolean> {
    const res = await authFetch(`${API_BASE}/admin/deposit-wallets/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('删除充值收款钱包失败');
    const data = await res.json();
    return data.success;
  },

  // ================= 提现钱包配置 =================
  async getWithdrawWallets(chain?: string): Promise<WithdrawWalletItem[]> {
    const params = new URLSearchParams();
    if (chain && chain !== 'ALL') params.append('chain', chain);
    const res = await authFetch(`${API_BASE}/admin/withdraw-wallets?${params.toString()}`);
    if (!res.ok) throw new Error('获取提现出金热钱包失败');
    return res.json();
  },

  async addWithdrawWallet(dto: { chain: string; address: string; label?: string; balance?: string; dailyLimit?: string }): Promise<WithdrawWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/withdraw-wallets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '添加提现出款钱包失败');
    }
    return res.json();
  },

  async updateWithdrawWallet(
    id: string,
    dto: { label?: string; balance?: string; dailyLimit?: string; isActive?: boolean }
  ): Promise<WithdrawWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/withdraw-wallets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error('更新提现热钱包失败');
    return res.json();
  },

  async toggleWithdrawWallet(id: string, isActive: boolean): Promise<WithdrawWalletItem> {
    const res = await authFetch(`${API_BASE}/admin/withdraw-wallets/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive }),
    });
    if (!res.ok) throw new Error('切换出款热钱包状态失败');
    return res.json();
  },

  async deleteWithdrawWallet(id: string): Promise<boolean> {
    const res = await authFetch(`${API_BASE}/admin/withdraw-wallets/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('删除提现出款钱包失败');
    const data = await res.json();
    return data.success;
  },

  // ================= 账本流水、充值、提现与运营看板 =================
  async getTransactions(params: Record<string, string>): Promise<{ total: number; list: TransactionItem[] }> {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_BASE}/admin/ledger/transactions?${qs}`);
    if (!res.ok) throw new Error('获取账本流水失败');
    return res.json();
  },

  async getDeposits(params: Record<string, string>): Promise<{ total: number; list: any[] }> {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_BASE}/admin/ledger/deposits?${qs}`);
    if (!res.ok) throw new Error('获取充值记录失败');
    return res.json();
  },

  async getWithdrawals(params: Record<string, string>): Promise<{ total: number; list: any[] }> {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_BASE}/admin/ledger/withdrawals?${qs}`);
    if (!res.ok) throw new Error('获取提现记录失败');
    return res.json();
  },

  async getOperationsAnalytics(): Promise<OperationsAnalytics> {
    const res = await authFetch(`${API_BASE}/admin/ledger/analytics`);
    if (!res.ok) throw new Error('获取运营可视化看板失败');
    return res.json();
  },

  // ================= 用户列表与全维画像 =================
  async getUsers(params: Record<string, string>): Promise<{ total: number; list: UserSummaryItem[] }> {
    const qs = new URLSearchParams(params).toString();
    const res = await authFetch(`${API_BASE}/admin/users?${qs}`);
    if (!res.ok) throw new Error('获取用户列表失败');
    return res.json();
  },

  async getUserDetail(userId: string): Promise<UserDetailData> {
    const res = await authFetch(`${API_BASE}/admin/users/${userId}/detail`);
    if (!res.ok) throw new Error(`获取用户详情失败: ${userId}`);
    return res.json();
  },

  // ================= 三方加密与外部签名服务 (KMS / MPC Custody) =================
  async getEncryptionConfig(): Promise<EncryptionServiceConfig> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service`);
    if (!res.ok) throw new Error('获取三方加密服务配置失败');
    return res.json();
  },

  async updateEncryptionConfig(dto: Partial<EncryptionServiceConfig>): Promise<EncryptionServiceConfig> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) throw new Error('更新三方加密服务配置失败');
    return res.json();
  },

  async testEncryptionConnection(dto?: { serviceUrl?: string; jwtToken?: string; timeoutMs?: number }): Promise<ConnectionTestResult> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto || {}),
    });
    const result = await res.json();
    return result;
  },

  async testEncryptionSign(dto: { chain: string; payload?: string }): Promise<TestSignResult> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service/sign-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    const result = await res.json();
    return result;
  },

  async getEnclaveKeys(): Promise<{ success: boolean; total: number; keys: EnclaveKeyItem[] }> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service/keys`);
    if (!res.ok) throw new Error('获取 Enclave 托管密钥列表失败');
    return res.json();
  },

  async importEnclaveKey(dto: { chain: string; privateKey: string; keyId?: string }): Promise<any> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service/keys/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '导入私钥至 Enclave 失败');
    }
    return res.json();
  },

  async deleteEnclaveKey(keyId: string): Promise<any> {
    const res = await authFetch(`${API_BASE}/admin/encryption-service/keys/${encodeURIComponent(keyId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || '销毁 Enclave 密钥失败');
    }
    return res.json();
  },
};
