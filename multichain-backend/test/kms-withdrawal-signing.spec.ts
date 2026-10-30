import { describe, it, expect, beforeEach } from 'vitest';
import { WalletSignerManager } from '../src/modules/wallet/wallet-signer.manager.js';
import { LocalSignerProvider } from '../src/modules/wallet/providers/local-signer.provider.js';
import { RemoteKmsSignerProvider } from '../src/modules/wallet/providers/remote-kms-signer.provider.js';
import { EncryptedDbSignerProvider } from '../src/modules/wallet/providers/encrypted-db-signer.provider.js';
import { EncryptionServiceService } from '../src/modules/wallet/encryption-service.service.js';
import { ChainType } from '../src/common/enums/chain-type.enum.js';
import { WalletPurpose } from '../src/modules/wallet/interfaces/wallet-account.interface.js';
import { Transaction, SystemProgram, PublicKey } from '@solana/web3.js';

describe('三方加密加签服务与服务端提现出金智能路由集成测试 (KMS Withdrawal Signing Integration)', () => {
  let encryptionService: EncryptionServiceService;
  let localProvider: LocalSignerProvider;
  let remoteKmsProvider: RemoteKmsSignerProvider;
  let encryptedDbProvider: EncryptedDbSignerProvider;
  let walletSignerManager: WalletSignerManager;

  const testEvmWithdrawWallet = {
    id: 'test-vault-wallet-evm-01',
    chain: ChainType.EVM,
    address: '0x1111111111111111111111111111111111111111',
    providerType: 'LOCAL' as any,
    purpose: WalletPurpose.WITHDRAW,
  };

  const testSolanaWithdrawWallet = {
    id: 'test-vault-wallet-sol-01',
    chain: ChainType.SOLANA,
    address: 'solanaaddress111111111111111111111111111111',
    providerType: 'LOCAL' as any,
    purpose: WalletPurpose.WITHDRAW,
  };

  const testTronWithdrawWallet = {
    id: 'test-vault-wallet-tron-01',
    chain: ChainType.TRON,
    address: 't9yd14nj9j7xab4dbgeix9h8unkkhxuwwb',
    providerType: 'LOCAL' as any,
    purpose: WalletPurpose.WITHDRAW,
  };

  beforeEach(() => {
    encryptionService = new EncryptionServiceService();
    encryptionService.onModuleInit();

    localProvider = new LocalSignerProvider();
    remoteKmsProvider = new RemoteKmsSignerProvider(encryptionService, localProvider);
    encryptedDbProvider = new EncryptedDbSignerProvider();

    walletSignerManager = new WalletSignerManager(
      localProvider,
      remoteKmsProvider,
      encryptedDbProvider,
      encryptionService,
    );
  });

  it('1. EVM生态：当开启三方加密服务时，EVM提现签名强制路由至三方外部 KMS 服务 (Secp256k1)', async () => {
    await encryptionService.updateConfig({
      isActive: true,
      serviceUrl: 'https://kms.custody-vault.internal/api/v1',
      jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJrbXMtdGVzdCJ9.sig123',
    });

    const effectiveProvider = walletSignerManager.resolveEffectiveProvider(testEvmWithdrawWallet);
    expect(effectiveProvider.providerType).toBe('REMOTE_KMS');

    const signedRaw = await walletSignerManager.signEvmTransaction({
      wallet: testEvmWithdrawWallet,
      to: '0x9999999999999999999999999999999999999999',
      value: 1000000000000000000n,
      nonce: 0,
      gas: 21000n,
      chainId: 1,
    });

    expect(signedRaw).toBeDefined();
    expect(signedRaw.startsWith('0x')).toBe(true);
  });

  it('2. Solana生态：当开启三方加密服务时，Solana提现签名通过三方外部 KMS 完成 Ed25519 签名', async () => {
    await encryptionService.updateConfig({
      isActive: true,
      serviceUrl: 'https://kms.custody-vault.internal/api/v1',
      jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJrbXMtdGVzdCJ9.sig123',
    });

    const effectiveProvider = walletSignerManager.resolveEffectiveProvider(testSolanaWithdrawWallet);
    expect(effectiveProvider.providerType).toBe('REMOTE_KMS');

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey('11111111111111111111111111111111'),
        toPubkey: new PublicKey('11111111111111111111111111111111'),
        lamports: 1000,
      }),
    );
    tx.recentBlockhash = 'GfVtzZJ4k1nKjK8n3mQ9oR1x7sT5uV2w4yZ6aB8cDbEf';
    tx.feePayer = new PublicKey('11111111111111111111111111111111');

    const signedTx = await walletSignerManager.signSolanaTransaction({
      wallet: testSolanaWithdrawWallet,
      transaction: tx,
    });

    expect(signedTx).toBeDefined();
    expect(signedTx).toBeInstanceOf(Transaction);
  });

  it('3. TRON生态：当开启三方加密服务时，Tron提现签名通过三方外部 KMS 完成 ECDSA 签名', async () => {
    await encryptionService.updateConfig({
      isActive: true,
      serviceUrl: 'https://kms.custody-vault.internal/api/v1',
      jwtToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJrbXMtdGVzdCJ9.sig123',
    });

    const effectiveProvider = walletSignerManager.resolveEffectiveProvider(testTronWithdrawWallet);
    expect(effectiveProvider.providerType).toBe('REMOTE_KMS');

    const mockTronTx = {
      txID: 'tron_tx_999999',
      raw_data: { contract: [] },
      raw_data_hex: '0a020801',
    };

    const signedTx = await walletSignerManager.signTronTransaction({
      wallet: testTronWithdrawWallet,
      transaction: mockTronTx,
    });

    expect(signedTx).toBeDefined();
    expect(signedTx.signature).toBeDefined();
    expect(signedTx.signature.length).toBeGreaterThan(0);
  });

  it('4. 熔断风控：当三方加密服务关闭且设置严格熔断 (REJECT_ALL) 时，三大生态出金提现签名均被严格拦截', async () => {
    await encryptionService.updateConfig({
      isActive: false,
      fallbackStrategy: 'REJECT_ALL',
    });

    // EVM 熔断拦截
    expect(() => {
      walletSignerManager.resolveEffectiveProvider(testEvmWithdrawWallet);
    }).toThrow(/严格安全熔断策略/);

    // Solana 熔断拦截
    expect(() => {
      walletSignerManager.resolveEffectiveProvider(testSolanaWithdrawWallet);
    }).toThrow(/严格安全熔断策略/);

    // Tron 熔断拦截
    expect(() => {
      walletSignerManager.resolveEffectiveProvider(testTronWithdrawWallet);
    }).toThrow(/严格安全熔断策略/);
  });

  it('5. 容灾降级：当三方加密服务关闭但设置容灾降级 (LOCAL_BACKUP) 时，三大生态安全降级至本地签名通道', async () => {
    await encryptionService.updateConfig({
      isActive: false,
      fallbackStrategy: 'LOCAL_BACKUP',
    });

    expect(walletSignerManager.resolveEffectiveProvider(testEvmWithdrawWallet).providerType).toBe('LOCAL');
    expect(walletSignerManager.resolveEffectiveProvider(testSolanaWithdrawWallet).providerType).toBe('LOCAL');
    expect(walletSignerManager.resolveEffectiveProvider(testTronWithdrawWallet).providerType).toBe('LOCAL');
  });
});
