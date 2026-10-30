import { ChainType } from '../../../common/enums/chain-type.enum.js';
import { UserEntity, UserRole } from '../../user/entities/user.entity.js';

export interface NonceChallenge {
  nonce: string;
  message: string;
  chain: ChainType;
  address: string;
  domain: string;
  uri: string;
  issuedAt: number;
  expiresAt: number;
}

export interface JwtPayload {
  sub: string; // userId
  address: string; // the wallet address used for this session
  chain: ChainType;
  role: UserRole;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LoginResponse {
  user: UserEntity;
  tokens: AuthTokens;
}
