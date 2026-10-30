export interface EvmConfig {
  rpcUrl: string;
  privateKey: string;
  routerAddress?: string; // Uniswap V2 Router address
  lockerAddress?: string; // Token Locker contract address
  chainId?: number;
}

export interface SolanaConfig {
  rpcUrl: string;
  privateKey: string; // Base58 encoded secret key or comma-separated bytes
  raydiumProgramId?: string;
}

export interface TronConfig {
  fullHost: string; // TronGrid or private full node
  privateKey: string;
  apiKey?: string; // TronGrid API Key
  sunswapRouterAddress?: string;
}

export interface AppChainConfig {
  evm: EvmConfig;
  solana: SolanaConfig;
  tron: TronConfig;
}

export const defaultChainConfig = (): AppChainConfig => ({
  evm: {
    rpcUrl: process.env.EVM_RPC_URL || 'https://ethereum-rpc.publicnode.com',
    privateKey: process.env.EVM_PRIVATE_KEY || '',
    routerAddress: process.env.EVM_ROUTER_ADDRESS || '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2 Mainnet
    lockerAddress: process.env.EVM_LOCKER_ADDRESS || '',
    chainId: Number(process.env.EVM_CHAIN_ID || 1),
  },
  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    privateKey: process.env.SOLANA_PRIVATE_KEY || '',
    raydiumProgramId: process.env.SOLANA_RAYDIUM_PROGRAM_ID || '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  },
  tron: {
    fullHost: process.env.TRON_FULL_HOST || 'https://api.trongrid.io',
    privateKey: process.env.TRON_PRIVATE_KEY || '',
    apiKey: process.env.TRON_API_KEY || '',
    sunswapRouterAddress: process.env.TRON_SUNSWAP_ROUTER || 'TKzxdSv2xMmAQzfTtQBp5UBmBjZZMmsssC',
  },
});
