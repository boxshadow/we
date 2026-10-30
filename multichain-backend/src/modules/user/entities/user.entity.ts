import { ChainType } from '../../../common/enums/chain-type.enum.js';

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  BANNED = 'BANNED',
}

export interface BoundWallet {
  chain: ChainType;
  address: string;
  boundAt: number;
  networkId?: string;
  isPrimary?: boolean;
}

export class UserEntity {
  id!: string; // Unique user ID (UUID)
  primaryWallet!: {
    chain: ChainType;
    address: string;
  };
  wallets!: BoundWallet[]; // Array of multi-chain wallets bound to this master account
  role!: UserRole;
  status!: UserStatus;
  nickname?: string;
  avatar?: string;
  createdAt!: number;
  updatedAt!: number;
  lastLoginAt!: number;
}
