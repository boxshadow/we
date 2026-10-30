import { describe, it, expect } from 'vitest';
import { SignatureVerifierService } from '../src/modules/auth/signature-verifier.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';

describe('SignatureVerifierService - Tron Verification', () => {
  it('should verify real TronLink signature using SignatureVerifierService', async () => {
    const mockEvmAdapter = {} as any;
    const service = new SignatureVerifierService(mockEvmAdapter);

    const address = 'TRXbmxAHAxHTcasDXvyF1fKvP1wxgCLSRH';
    const signature = '0x01237df664ea903ccea16a774690a8c42ca2df961f408033d2c2b53c7a344f5548147ee375784840a450b514081db62a8ffbb2f7d5e39d6f6107868b61ae7ab91c';
    const message = `localhost wants you to sign in with your TRON account:
TRXbmxAHAxHTcasDXvyF1fKvP1wxgCLSRH

Sign in with your Web3 wallet to authenticate.

URI: http://localhost:3000
Version: 1
Chain: TRON
Nonce: d790429e1a71798162e19c71d248e2ec
Issued At: 2026-10-07T15:37:21.845Z
Expiration Time: 2026-10-07T15:42:21.845Z`;

    const isValid = await service.verifySignature(ChainType.TRON, address, message, signature);
    expect(isValid).toBe(true);
  });
});
