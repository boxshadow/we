import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ChainType } from '../../common/enums/chain-type.enum.js';
import {
  NetworkConfigEntity,
  RpcHealthTestResult,
} from './interfaces/network-config.interface.js';
import { CreateNetworkDto, UpdateNetworkDto } from './dto/network.dto.js';

@Injectable()
export class NetworkRegistryService {
  private readonly logger = new Logger(NetworkRegistryService.name);
  private readonly networks = new Map<string, NetworkConfigEntity>();

  constructor() {
    this.initializeDefaultNetworks();
  }

  private initializeDefaultNetworks(): void {
    const defaultEvmHttp =
      process.env.EVM_RPC_URL || 'https://ethereum-rpc.publicnode.com';
    const defaultEvmWs =
      process.env.EVM_WS_URL || 'wss://ethereum-rpc.publicnode.com';

    const defaultSolanaHttp =
      process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const defaultSolanaWs =
      process.env.SOLANA_WS_URL || 'wss://api.mainnet-beta.solana.com';

    const defaultTronHttp =
      process.env.TRON_FULL_HOST || 'https://api.trongrid.io';
    const defaultTronWs =
      process.env.TRON_WS_URL || 'wss://api.trongrid.io/event';

    const defaults: NetworkConfigEntity[] = [
      {
        networkId: 'ethereum',
        name: 'Ethereum Mainnet',
        family: ChainType.EVM,
        chainId: 1,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        httpRpc: {
          primaryUrl: defaultEvmHttp,
          fallbackUrls: [
            'https://rpc.ankr.com/eth',
            'https://cloudflare-eth.com',
          ],
        },
        wsRpc: {
          primaryUrl: defaultEvmWs,
          fallbackUrls: ['wss://rpc.ankr.com/eth/ws'],
        },
        contracts: {
          dexRouterAddress:
            process.env.EVM_ROUTER_ADDRESS ||
            '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // Uniswap V2
          dexFactoryAddress: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
          wrappedNativeAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
          tokenLockerAddress:
            process.env.EVM_LOCKER_ADDRESS ||
            '0x663A06EAA220037371509176378c8a14b5ff5A1b', // UniCrypt / Locker
        },
        security: {
          minConfirmations: 2,
          minDeposit: '0.001',
          minWithdraw: '0.005',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        networkId: 'bsc',
        name: 'BNB Smart Chain',
        family: ChainType.EVM,
        chainId: 56,
        nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
        httpRpc: {
          primaryUrl:
            process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
          fallbackUrls: [
            'https://rpc.ankr.com/bsc',
            'https://bsc-rpc.publicnode.com',
          ],
        },
        wsRpc: {
          primaryUrl:
            process.env.BSC_WS_URL || 'wss://bsc-rpc.publicnode.com',
          fallbackUrls: ['wss://rpc.ankr.com/bsc/ws'],
        },
        contracts: {
          dexRouterAddress: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap V2
          dexFactoryAddress: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
          wrappedNativeAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
          tokenLockerAddress: '0x7ee058420e5937496F5a2096f04cAA7721cF70cc', // PinkLock
        },
        security: {
          minConfirmations: 5,
          minDeposit: '0.01',
          minWithdraw: '0.02',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        networkId: 'base',
        name: 'Base Mainnet',
        family: ChainType.EVM,
        chainId: 8453,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        httpRpc: {
          primaryUrl:
            process.env.BASE_RPC_URL || 'https://mainnet.base.org',
          fallbackUrls: ['https://base-rpc.publicnode.com'],
        },
        wsRpc: {
          primaryUrl:
            process.env.BASE_WS_URL || 'wss://base-rpc.publicnode.com',
        },
        contracts: {
          dexRouterAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24', // Uniswap V2 on Base
          dexFactoryAddress: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
          wrappedNativeAddress: '0x4200000000000000000000000000000000000006',
          tokenLockerAddress: '0xd81A4a9e53A1c618F2a51A07bF85a153D0A3528A',
        },
        security: {
          minConfirmations: 5,
          minDeposit: '0.001',
          minWithdraw: '0.005',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        networkId: 'arbitrum',
        name: 'Arbitrum One',
        family: ChainType.EVM,
        chainId: 42161,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        httpRpc: {
          primaryUrl:
            process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
          fallbackUrls: ['https://arbitrum-one-rpc.publicnode.com'],
        },
        wsRpc: {
          primaryUrl:
            process.env.ARBITRUM_WS_URL ||
            'wss://arbitrum-one-rpc.publicnode.com',
        },
        contracts: {
          dexRouterAddress: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', // SushiSwap on Arb
          dexFactoryAddress: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
          wrappedNativeAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
          tokenLockerAddress: '0x663A06EAA220037371509176378c8a14b5ff5A1b',
        },
        security: {
          minConfirmations: 5,
          minDeposit: '0.001',
          minWithdraw: '0.005',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        networkId: 'solana',
        name: 'Solana Mainnet',
        family: ChainType.SOLANA,
        nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
        httpRpc: {
          primaryUrl: defaultSolanaHttp,
          fallbackUrls: ['https://rpc.ankr.com/solana'],
        },
        wsRpc: {
          primaryUrl: defaultSolanaWs,
        },
        contracts: {
          dexRouterAddress:
            process.env.SOLANA_RAYDIUM_PROGRAM_ID ||
            '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM V4
          tokenLockerAddress: 'LockrWmn6K5twhz3y9w1Pdc1C4eP1Zf78jB3D1K6Y92',
        },
        security: {
          minConfirmations: 32, // Finalized commitments
          minDeposit: '0.05',
          minWithdraw: '0.1',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        networkId: 'tron',
        name: 'Tron Mainnet',
        family: ChainType.TRON,
        nativeCurrency: { name: 'Tronix', symbol: 'TRX', decimals: 6 },
        httpRpc: {
          primaryUrl: defaultTronHttp,
          fallbackUrls: ['https://api.tronstack.io'],
        },
        wsRpc: {
          primaryUrl: defaultTronWs,
        },
        contracts: {
          dexRouterAddress:
            process.env.TRON_SUNSWAP_ROUTER ||
            'TKzxdSv2xMmAQzfTtQBp5UBmBjZZMmsssC', // SunSwap V2
          tokenLockerAddress: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb', // Tron Timelock / Locker
        },
        security: {
          minConfirmations: 19, // Tron confirmation threshold
          minDeposit: '10',
          minWithdraw: '20',
          isPaused: false,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    for (const net of defaults) {
      this.networks.set(net.networkId.toLowerCase(), net);
    }

    this.logger.log(
      `NetworkRegistry initialized with ${this.networks.size} networks: ${Array.from(
        this.networks.keys(),
      ).join(', ')}`,
    );
  }

  /**
   * Register a new network dynamically from Admin Panel
   */
  registerNetwork(dto: CreateNetworkDto): NetworkConfigEntity {
    const id = dto.networkId.trim().toLowerCase();
    if (this.networks.has(id)) {
      throw new BadRequestException(
        `Network with ID "${dto.networkId}" already exists.`,
      );
    }

    const network: NetworkConfigEntity = {
      networkId: id,
      name: dto.name,
      family: dto.family,
      chainId: dto.chainId,
      nativeCurrency: dto.nativeCurrency,
      httpRpc: {
        primaryUrl: dto.httpRpc.primaryUrl,
        fallbackUrls: dto.httpRpc.fallbackUrls || [],
        headers: dto.httpRpc.headers,
      },
      wsRpc: {
        primaryUrl: dto.wsRpc?.primaryUrl,
        fallbackUrls: dto.wsRpc?.fallbackUrls || [],
      },
      contracts: {
        dexRouterAddress: dto.contracts?.dexRouterAddress,
        dexFactoryAddress: dto.contracts?.dexFactoryAddress,
        tokenLockerAddress: dto.contracts?.tokenLockerAddress,
        wrappedNativeAddress: dto.contracts?.wrappedNativeAddress,
        customContracts: dto.contracts?.customContracts || {},
      },
      security: {
        minConfirmations: dto.security?.minConfirmations ?? 1,
        minDeposit: dto.security?.minDeposit ?? '0',
        minWithdraw: dto.security?.minWithdraw ?? '0',
        isPaused: dto.security?.isPaused ?? false,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.networks.set(id, network);
    this.logger.log(`Registered new network: ${id} (${network.name}) [Family: ${network.family}]`);
    return network;
  }

  /**
   * Update network configuration (e.g. switch RPC, add WS, update contracts)
   */
  updateNetwork(networkId: string, dto: UpdateNetworkDto): NetworkConfigEntity {
    const existing = this.getNetwork(networkId);
    const id = existing.networkId;

    const updated: NetworkConfigEntity = {
      ...existing,
      name: dto.name ?? existing.name,
      chainId: dto.chainId ?? existing.chainId,
      nativeCurrency: dto.nativeCurrency ?? existing.nativeCurrency,
      httpRpc: {
        ...existing.httpRpc,
        ...dto.httpRpc,
      },
      wsRpc: {
        ...existing.wsRpc,
        ...dto.wsRpc,
      },
      contracts: {
        ...existing.contracts,
        ...dto.contracts,
      },
      security: {
        ...existing.security,
        ...dto.security,
      },
      updatedAt: Date.now(),
    };

    this.networks.set(id, updated);
    this.logger.log(`Updated network config: ${id}`);
    return updated;
  }

  /**
   * Flexible network resolution:
   * Supports networkId ('bsc', 'ethereum'), chainId ('56', 56), or family aliases ('EVM', 'SOLANA', 'TRON')
   */
  getNetwork(networkIdOrAlias: string | number): NetworkConfigEntity {
    const query = String(networkIdOrAlias).trim().toLowerCase();

    // 1. Direct match by networkId
    if (this.networks.has(query)) {
      return this.networks.get(query)!;
    }

    // 2. Numeric chainId match
    const asNum = Number(query);
    if (!isNaN(asNum) && asNum > 0) {
      for (const net of this.networks.values()) {
        if (net.chainId === asNum) {
          return net;
        }
      }
    }

    // 3. ChainType alias match
    if (query === 'evm' || query === 'eth') {
      return this.networks.get('ethereum')!;
    }
    if (query === 'sol' || query === 'solana') {
      return this.networks.get('solana')!;
    }
    if (query === 'trx' || query === 'tron') {
      return this.networks.get('tron')!;
    }

    throw new NotFoundException(
      `Network "${networkIdOrAlias}" not found in registry. Configured networks: ${Array.from(
        this.networks.keys(),
      ).join(', ')}`,
    );
  }

  /**
   * Check if network exists
   */
  hasNetwork(networkIdOrAlias: string | number): boolean {
    try {
      this.getNetwork(networkIdOrAlias);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all registered networks
   */
  getAllNetworks(): NetworkConfigEntity[] {
    return Array.from(this.networks.values());
  }

  /**
   * Delete custom network
   */
  deleteNetwork(networkId: string): boolean {
    const net = this.getNetwork(networkId);
    // Protect standard base networks from accidental removal
    if (['ethereum', 'solana', 'tron'].includes(net.networkId)) {
      throw new BadRequestException(
        `Cannot delete canonical network ${net.networkId}`,
      );
    }
    const result = this.networks.delete(net.networkId);
    this.logger.log(`Deleted network: ${net.networkId}`);
    return result;
  }

  /**
   * Freeze/Pause a network
   */
  pauseNetwork(networkId: string, paused: boolean): NetworkConfigEntity {
    const net = this.getNetwork(networkId);
    net.security.isPaused = paused;
    net.updatedAt = Date.now();
    this.logger.warn(`Network ${net.networkId} paused status set to: ${paused}`);
    return net;
  }

  /**
   * Test dual-channel RPC endpoints (HTTP ping + WS handshake)
   */
  async testNetworkRpc(networkIdOrAlias: string): Promise<RpcHealthTestResult> {
    const net = this.getNetwork(networkIdOrAlias);
    const result: RpcHealthTestResult = {
      networkId: net.networkId,
      family: net.family,
      testedAt: Date.now(),
      http: {
        status: 'UNREACHABLE',
        url: net.httpRpc.primaryUrl,
        latencyMs: -1,
      },
      ws: {
        status: net.wsRpc.primaryUrl ? 'UNREACHABLE' : 'NOT_CONFIGURED',
        url: net.wsRpc.primaryUrl,
        latencyMs: -1,
      },
    };

    // 1. Test HTTP Channel
    const httpStart = Date.now();
    try {
      const response = await fetch(net.httpRpc.primaryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(net.httpRpc.headers || {}),
        },
        body: JSON.stringify(
          net.family === ChainType.EVM
            ? { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }
            : net.family === ChainType.SOLANA
              ? { jsonrpc: '2.0', id: 1, method: 'getBlockHeight', params: [] }
              : { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }, // fallback/Tron full node ping
        ),
        signal: AbortSignal.timeout(3000), // 3s timeout
      });

      const httpLatency = Date.now() - httpStart;
      result.http.latencyMs = httpLatency;

      if (response.ok) {
        const json: any = await response.json();
        result.http.status = httpLatency > 1500 ? 'DEGRADED' : 'HEALTHY';
        if (json.result) {
          result.http.latestBlock =
            typeof json.result === 'string' && json.result.startsWith('0x')
              ? parseInt(json.result, 16)
              : json.result;
        }
      } else {
        result.http.status = 'DEGRADED';
        result.http.error = `HTTP status ${response.status}: ${response.statusText}`;
      }
    } catch (err: any) {
      result.http.status = 'UNREACHABLE';
      result.http.latencyMs = Date.now() - httpStart;
      result.http.error = err.message || 'Connection failed';
    }

    // 2. Test WS Channel
    if (net.wsRpc.primaryUrl) {
      const wsStart = Date.now();
      try {
        const wsTested = await this.testWebSocketHandshake(
          net.wsRpc.primaryUrl,
          2500,
        );
        result.ws.latencyMs = Date.now() - wsStart;
        result.ws.status = wsTested ? 'HEALTHY' : 'UNREACHABLE';
      } catch (err: any) {
        result.ws.status = 'UNREACHABLE';
        result.ws.latencyMs = Date.now() - wsStart;
        result.ws.error = err.message || 'WebSocket handshake failed';
      }
    }

    return result;
  }

  private testWebSocketHandshake(url: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let isResolved = false;
      const timer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          try {
            ws.close();
          } catch {}
          resolve(false);
        }
      }, timeoutMs);

      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        clearTimeout(timer);
        return resolve(false);
      }

      ws.onopen = () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          ws.close();
          resolve(true);
        }
      };

      ws.onerror = () => {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          resolve(false);
        }
      };
    });
  }
}
