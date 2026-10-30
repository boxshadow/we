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
  icon: string;
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
  isPrimary: boolean;
  boundAt: string;
}

export interface UserProfile {
  id: string;
  primaryWallet: {
    chain: ChainFamily;
    address: string;
  };
  role: string;
  wallets: UserWallet[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSession {
  tokens: AuthTokens | null;
  user: UserProfile | null;
}
