export enum AdminRole {
  FOUNDER = 'FOUNDER',
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  AUDITOR = 'AUDITOR',
}

export interface AdminUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  twoFactorSecret: string;
  isTwoFactorEnabled: boolean;
  tempTwoFactorSecret?: string;
  role: AdminRole;
  status: 'ACTIVE' | 'DISABLED';
  createdAt: number;
  updatedAt: number;
  lastLoginAt?: number;
  lastLoginIp?: string;
}

export interface AdminLoginDto {
  username: string;
  password: string;
  twoFactorCode?: string;
}

export interface ConfirmTwoFactorSetupDto {
  setupToken: string;
  twoFactorCode: string;
}

export interface AdminLoginSuccessResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  admin: {
    id: string;
    username: string;
    role: AdminRole;
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

export type AdminLoginResponse =
  | AdminLoginSuccessResponse
  | TwoFactorSetupRequiredResponse
  | TwoFactorCodeRequiredResponse;

export interface AdminProfile {
  id: string;
  username: string;
  role: AdminRole;
  isTwoFactorEnabled: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export interface AdminJwtPayload {
  sub: string;
  username: string;
  role: AdminRole;
  type: 'ADMIN' | 'ADMIN_SETUP_2FA';
  tempSecret?: string;
  iat?: number;
  exp?: number;
}

export interface TwoFactorSetupResponse {
  secret: string;
  otpAuthUri: string;
  qrCodeDataUrl: string;
  currentCode: string;
}
