import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoSweepCronService } from '../src/modules/transfer/auto-sweep-cron.service.js';
import { SweepService } from '../src/modules/transfer/sweep.service.js';
import { WalletSignerManager } from '../src/modules/wallet/wallet-signer.manager.js';
import { NetworkRegistryService } from '../src/modules/network/network-registry.service.js';
import { TransferService } from '../src/modules/transfer/transfer.service.js';

describe('AutoSweepCronService', () => {
  let service: AutoSweepCronService;
  let sweepServiceMock: Partial<SweepService>;
  let walletSignerManagerMock: Partial<WalletSignerManager>;
  let networkRegistryServiceMock: Partial<NetworkRegistryService>;
  let transferServiceMock: Partial<TransferService>;

  beforeEach(() => {
    sweepServiceMock = {
      sweepDepositFunds: vi.fn(),
      getSweepHistory: vi.fn().mockResolvedValue([]),
    };
    walletSignerManagerMock = {
      getRandomDepositWallet: vi.fn(),
      getRandomWithdrawWallet: vi.fn(),
    };
    networkRegistryServiceMock = {
      getAllNetworks: vi.fn().mockReturnValue([]),
    };
    transferServiceMock = {
      getBalance: vi.fn().mockResolvedValue('0.0'),
    };

    service = new AutoSweepCronService(
      sweepServiceMock as SweepService,
      walletSignerManagerMock as WalletSignerManager,
      networkRegistryServiceMock as NetworkRegistryService,
      transferServiceMock as TransferService,
    );
  });

  it('should initialize with default enabled state and 0.05 threshold', () => {
    const status = service.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.minThreshold).toBe('0.05');
    expect(status.totalSweptCount).toBe(0);
  });

  it('should toggle enabled state correctly', () => {
    let status = service.toggle(false);
    expect(status.enabled).toBe(false);

    status = service.toggle(true);
    expect(status.enabled).toBe(true);

    status = service.toggle();
    expect(status.enabled).toBe(false);
  });

  it('should set min threshold correctly', () => {
    const status = service.setMinThreshold('0.1');
    expect(status.minThreshold).toBe('0.1');
  });
});
