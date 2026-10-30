export type KmsProviderType = 'CUSTOM_KMS' | 'FIREBLOCKS_MPC' | 'HASHICORP_VAULT' | 'AWS_KMS';

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
  providerType: KmsProviderType;
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

export interface UpdateEncryptionServiceDto {
  serviceUrl?: string;
  jwtToken?: string;
  providerType?: KmsProviderType;
  isActive?: boolean;
  timeoutMs?: number;
  retryCount?: number;
  supportedAlgorithms?: string[];
  fallbackStrategy?: 'REJECT_ALL' | 'LOCAL_BACKUP';
  enforceHttps?: boolean;
}

export interface TestConnectionDto {
  serviceUrl?: string;
  jwtToken?: string;
  timeoutMs?: number;
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

export interface TestSignDto {
  chain: 'EVM' | 'SOLANA' | 'TRON';
  payload?: string;
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
