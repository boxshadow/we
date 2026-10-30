export type ChainFamily = 'EVM' | 'SOLANA' | 'TRON';

export interface SupportedNetwork {
  networkId: string;
  name: string;
  family: ChainFamily;
  chainId: number | null;
  chainIdHex?: string | null;
  symbol: string;
  icon?: string;
  rpc: string;
  isPaused: boolean;
}

export interface WalletConfig {
  id: string;
  name: string;
  sub: string;
  families: ChainFamily[];
  icon?: string;
  svgIcon?: string;
  iconImg?: string;
  rdns?: string;
  downloadUrl?: string;
  detect?: () => boolean;
  getProvider?: (family?: ChainFamily) => any;
}

export interface UserWallet {
  chain: ChainFamily;
  address: string;
  networkId?: string;
  isPrimary: boolean;
  boundAt: number | string;
}

export interface UserProfile {
  id: string;
  nickname?: string;
  role: string;
  status?: string;
  primaryWallet: {
    chain: ChainFamily;
    address: string;
  };
  wallets: UserWallet[];
  createdAt?: number;
  updatedAt?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  tokens: AuthTokens | null;
  user: UserProfile | null;
}

export interface TokenBalance {
  networkId: string;
  networkName?: string;
  family: ChainFamily;
  tokenSymbol: string;
  tokenName: string;
  balance: string;
  lockedBalance?: string;
  usdPrice?: number;
  usdValue?: string;
  isNative: boolean;
}

export interface DepositOrder {
  orderId: string;
  network: string;
  tokenSymbol?: string;
  depositAddress: string;
  amount: string;
  expiresAt: number;
  rawTx?: any;
}

export interface DepositProgress {
  status: 'PENDING' | 'DETECTED' | 'CONFIRMING' | 'CREDITED' | 'EXPIRED' | 'FAILED';
  progress: number;
  currentConfirmations: number;
  requiredConfirmations: number;
  blockNumber?: number;
  currentBlock?: number;
  txHash?: string;
  credited?: boolean;
  amount?: string;
  tokenSymbol?: string;
}

export interface WithdrawalStepItem {
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  detail?: string;
}

export interface WithdrawalRecord {
  id: string;
  network: string;
  tokenSymbol: string;
  amount: string;
  toAddress: string;
  fromVault?: string;
  status: 'PROCESSING' | 'CONFIRMING' | 'SUCCESS' | 'COMPENSATED_FAILED' | 'FAILED';
  txHash?: string;
  createdAt: number;
  errorMessage?: string;
}
