import { ChainType } from '../../../common/enums/chain-type.enum.js';

export type SignerProviderType = 'LOCAL' | 'ENCRYPTED_DB' | 'REMOTE_KMS' | 'MPC_CUSTODY';

/**
 * 钱包用途严格隔离枚举
 */
export enum WalletPurpose {
  DEPOSIT = 'DEPOSIT',           // 充值专属收款地址池（只收不发，严禁直接作为出金付款方）
  WITHDRAW = 'WITHDRAW',         // 出金专属付款热钱包（只出不进，严禁对外暴露给用户充值）
  TOKEN_DEPLOY = 'TOKEN_DEPLOY', // 发币专属部署钱包（拥有合约部署权/代币初始所有权/Mint权限，严禁与高频出入金混用）
}

export interface WalletAccount {
  id: string; // 唯一密钥标识，如 "kms-key-001" 或 "db-wallet-1"
  chain: ChainType;
  address: string; // 链上公开地址
  providerType: SignerProviderType; // 加签模式 (LOCAL / ENCRYPTED_DB / REMOTE_KMS)
  purpose: WalletPurpose; // 必须严格指定用途：DEPOSIT、WITHDRAW 或 TOKEN_DEPLOY
  metadata?: Record<string, any>; // 元数据 (如 KMS KeyArn, Vault Path, 资金阈值)
}
