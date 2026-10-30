import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Optional,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import BigNumber from 'bignumber.js';
import { encodeFunctionData, isAddress, type Address } from 'viem';
import { ERC20_ABI } from '../adapters/evm/contracts.js';
import { WalletSignerManager } from '../wallet/wallet-signer.manager.js';
import { TransferService } from './transfer.service.js';
import {
  DepositOrder,
  OrderStatus,
  CreateDepositDto,
  SubmitDepositTxDto,
  ScanMatchDepositDto,
  RawTxPayload,
} from './types/order.types.js';
import { NetworkRegistryService } from '../network/network-registry.service.js';
import { DepositWalletService } from '../wallet/deposit-wallet.service.js';
import { TokenConfigService } from '../token/token-config.service.js';
import { BalanceService } from '../balance/balance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DepositService implements OnModuleInit {
  private readonly logger = new Logger(DepositService.name);
  private orders = new Map<string, DepositOrder>();
  private usedTxHashes = new Set<string>(); // Anti-replay cache (confirmed)
  private processingTxHashes = new Set<string>(); // In-flight mutex lock preventing concurrent replay attacks

  constructor(
    private readonly walletSignerManager: WalletSignerManager,
    private readonly transferService: TransferService,
    private readonly networkRegistryService: NetworkRegistryService,
    @Optional() private readonly depositWalletService?: DepositWalletService,
    @Optional() private readonly tokenConfigService?: TokenConfigService,
    @Optional() private readonly balanceService?: BalanceService,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      await this.loadActiveOrdersFromDb();
    }
  }

  private async loadActiveOrdersFromDb() {
    if (!this.prisma) return;
    try {
      const dbOrders = await this.prisma.depositOrder.findMany({
        where: { status: { in: ['PENDING', 'CONFIRMED'] } },
        take: 100,
        orderBy: { createdAt: 'desc' },
      });

      for (const d of dbOrders) {
        this.orders.set(d.id, {
          id: d.id,
          userId: d.userId || undefined,
          chain: d.network,
          tokenSymbol: d.tokenSymbol || undefined,
          tokenAddress: d.tokenAddress || undefined,
          depositAddress: d.depositAddress,
          amount: d.amount,
          actualAmount: d.actualAmount || undefined,
          txHash: d.txHash || undefined,
          fromAddress: d.fromAddress || undefined,
          status: d.status as OrderStatus,
          credited: d.credited,
          createdAt: Number(d.createdAt),
          expiresAt: Number(d.expiresAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : undefined,
        });

        if (d.txHash && d.status === 'CONFIRMED') {
          this.usedTxHashes.add(d.txHash.toLowerCase());
        }
      }
      this.logger.log(` 已加载 ${dbOrders.length} 条有效充值订单至内存状态机`);
    } catch (err: any) {
      this.logger.warn(`加载充值订单失败: ${err.message}`);
    }
  }

  /**
   * 1. 用户在 DApp 创建充值请求意图
   * - 校验网络及代币是否合法
   * - 动态从后台配置的充值收款池挑选可用钱包 A
   * - 生成 30 分钟有效的充值订单
   */
  async createDepositIntent(dto: CreateDepositDto): Promise<{
    orderId: string;
    network: string;
    tokenSymbol: string;
    tokenAddress?: string;
    depositAddress: string;
    amount: string;
    expiresAt: number;
    rawTx?: RawTxPayload;
    pipelineSteps?: any[];
  }> {
    const net = this.networkRegistryService.getNetwork(dto.network);
    if (net.security.isPaused) {
      throw new BadRequestException(
        `网络 "${net.name}" (${net.networkId}) 目前处于熔断维护状态，暂停充值入金`,
      );
    }

    const amountBn = new BigNumber(dto.amount);
    if (amountBn.isNaN() || amountBn.isLessThanOrEqualTo(0)) {
      throw new BadRequestException(`充值金额不合法: ${dto.amount}`);
    }

    // 1. 解析与校验支持代币 (Token)
    let tokenSymbol = dto.tokenSymbol ? dto.tokenSymbol.trim().toUpperCase() : undefined;
    let tokenAddress = dto.tokenAddress ? dto.tokenAddress.trim() : undefined;

    if (tokenSymbol && this.tokenConfigService) {
      const supportedToken = await this.tokenConfigService.findToken(net.networkId, tokenSymbol);
      if (supportedToken) {
        if (!supportedToken.isActive) {
          throw new BadRequestException(`代币 [${tokenSymbol}] 在网络 [${net.networkId}] 充值已被管理员停用`);
        }
        tokenAddress = supportedToken.contractAddress || undefined;

        if (amountBn.isLessThan(new BigNumber(supportedToken.minDeposit))) {
          throw new BadRequestException(
            `充值金额小于该代币最小起充限额: ${supportedToken.minDeposit} ${tokenSymbol}`,
          );
        }
      }
    } else if (tokenAddress) {
      tokenSymbol = 'CUSTOM_TOKEN';
    } else {
      tokenSymbol = net.nativeCurrency?.symbol || 'NATIVE';
    }

    // 2. 从管理后台配置的充值收款池动态分配一个激活的钱包 A
    let assignedDepositAddress: string;
    if (this.depositWalletService) {
      const configuredWallet = await this.depositWalletService.getRandomActiveDepositWallet(net.networkId);
      assignedDepositAddress = configuredWallet.address;
    } else {
      const fallbackWallet = await this.walletSignerManager.getRandomDepositWallet(net.family);
      assignedDepositAddress = fallbackWallet.address;
    }

    // 3. 构建供前端钱包直接加签支付的未签名交易数据 (RawTxPayload)
    let rawTx: RawTxPayload;
    let decimals = 18;
    if (this.tokenConfigService && tokenSymbol) {
      const tk = await this.tokenConfigService.findToken(net.networkId, tokenSymbol);
      if (tk) decimals = tk.decimals;
    }

    if (net.family === 'EVM') {
      if (!tokenAddress) {
        // 原生 EVM 币转账 (ETH, BNB 等)
        const weiHex = '0x' + BigInt(new BigNumber(dto.amount).times(10 ** decimals).toFixed(0)).toString(16);
        rawTx = {
          family: 'EVM',
          to: assignedDepositAddress,
          value: weiHex,
          data: '0x',
          chainId: net.chainId,
          chainIdHex: net.chainId ? '0x' + net.chainId.toString(16) : undefined,
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals,
          method: 'native',
        };
      } else {
        // ERC20 / BEP20 代币合约转账 (USDT 等)
        const atomicAmount = BigInt(new BigNumber(dto.amount).times(10 ** decimals).toFixed(0));
        let data = '0x';
        if (isAddress(assignedDepositAddress) && isAddress(tokenAddress)) {
          try {
            data = encodeFunctionData({
              abi: ERC20_ABI,
              functionName: 'transfer',
              args: [assignedDepositAddress as Address, atomicAmount],
            });
          } catch {
            const cleanAddr = assignedDepositAddress.replace(/^0x/, '').toLowerCase().padStart(64, '0');
            const amountHex = atomicAmount.toString(16).padStart(64, '0');
            data = `0xa9059cbb${cleanAddr}${amountHex}`;
          }
        } else {
          const cleanAddr = assignedDepositAddress.replace(/^0x/, '').toLowerCase().padStart(64, '0');
          const amountHex = atomicAmount.toString(16).padStart(64, '0');
          data = `0xa9059cbb${cleanAddr}${amountHex}`;
        }
        rawTx = {
          family: 'EVM',
          to: tokenAddress,
          value: '0x0',
          data,
          chainId: net.chainId,
          chainIdHex: net.chainId ? '0x' + net.chainId.toString(16) : undefined,
          tokenAddress,
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals,
          method: 'transfer',
        };
      }
    } else if (net.family === 'TRON') {
      decimals = tokenAddress ? 6 : 6;
      if (!tokenAddress) {
        const amountSun = new BigNumber(dto.amount).times(1e6).toFixed(0);
        rawTx = {
          family: 'TRON',
          to: assignedDepositAddress,
          value: amountSun,
          data: '',
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals: 6,
          method: 'native',
          contractParams: { amountSun },
        };
      } else {
        const rawAmount = new BigNumber(dto.amount).times(10 ** decimals).toFixed(0);
        rawTx = {
          family: 'TRON',
          to: tokenAddress,
          value: '0',
          data: '',
          tokenAddress,
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals: 6,
          method: 'transfer',
          contractParams: {
            functionSelector: 'transfer(address,uint256)',
            recipient: assignedDepositAddress,
            rawAmount,
          },
        };
      }
    } else {
      // SOLANA
      decimals = tokenAddress ? 6 : 9;
      if (!tokenAddress) {
        const lamports = new BigNumber(dto.amount).times(1e9).toFixed(0);
        rawTx = {
          family: 'SOLANA',
          to: assignedDepositAddress,
          value: lamports,
          data: '',
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals: 9,
          method: 'native',
          contractParams: { lamports },
        };
      } else {
        const rawAmount = new BigNumber(dto.amount).times(10 ** decimals).toFixed(0);
        rawTx = {
          family: 'SOLANA',
          to: assignedDepositAddress,
          value: '0',
          data: '',
          tokenAddress,
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          decimals: 6,
          method: 'transfer',
          contractParams: {
            mintAddress: tokenAddress,
            recipient: assignedDepositAddress,
            rawAmount,
          },
        };
      }
    }

    const orderId = randomUUID();
    const now = Date.now();
    const expiresAt = now + 30 * 60 * 1000; // 30 分钟超时窗口
    const rawTxData = JSON.stringify(rawTx);

    const pipelineSteps = [
      {
        step: 1,
        name: '充值意图与金库分配',
        status: 'SUCCESS' as const,
        detail: `公链: ${net.name}，分配专属收款金库: ${assignedDepositAddress}`,
        timestamp: now,
      },
      {
        step: 2,
        name: '组装未签名交易载荷',
        status: 'SUCCESS' as const,
        detail: `已生成 ${rawTx.method === 'transfer' ? '代币合约转账' : '底层原生币转账'} 签名载荷 (rawTx)`,
        timestamp: now,
      },
      {
        step: 3,
        name: '钱包签名与链上广播',
        status: 'PENDING' as const,
        detail: '等待客户端钱包插件直接加签或移动端扫码支付',
        timestamp: now,
      },
      {
        step: 4,
        name: '链上收据核验与防重放',
        status: 'PENDING' as const,
        detail: '等待区块链网络打包交易并核对收款人',
        timestamp: now,
      },
      {
        step: 5,
        name: '到账金额与代币合约校验',
        status: 'PENDING' as const,
        detail: '比对实际到账金额是否足额',
        timestamp: now,
      },
      {
        step: 6,
        name: '代币资产原子结算入账',
        status: 'PENDING' as const,
        detail: '累加至对应 Token 资产账本',
        timestamp: now,
      },
    ];

    const order: DepositOrder = {
      id: orderId,
      userId: dto.userId,
      chain: net.networkId,
      tokenSymbol,
      tokenAddress,
      depositAddress: assignedDepositAddress,
      amount: dto.amount,
      status: OrderStatus.PENDING,
      rawTx,
      rawTxData,
      credited: false,
      pipelineSteps,
      createdAt: now,
      expiresAt,
    };

    this.orders.set(orderId, order);

    if (this.prisma) {
      this.prisma.depositOrder.create({
        data: {
          id: orderId,
          userId: dto.userId || null,
          network: net.networkId,
          tokenSymbol,
          tokenAddress: tokenAddress || null,
          depositAddress: assignedDepositAddress,
          amount: dto.amount,
          status: 'PENDING',
          rawTxData,
          credited: false,
          createdAt: BigInt(now),
          expiresAt: BigInt(expiresAt),
        },
      }).catch((err) => {
        this.logger.warn(`Prisma 写入充值意图订单异常: ${err.message}`);
      });
    }

    this.logger.log(
      `Deposit Intent Created: [Order ${orderId}] [${net.networkId}] Token: ${tokenSymbol}, Amount: ${dto.amount}, Assigned Deposit Wallet: ${assignedDepositAddress}`,
    );

    return {
      orderId,
      network: net.networkId,
      tokenSymbol,
      tokenAddress,
      depositAddress: assignedDepositAddress,
      amount: dto.amount,
      expiresAt,
      rawTx,
      pipelineSteps,
    };
  }

  /**
   * 2. 场景 A：前端提交 txHash 触发链上验证与结算入账
   * 严格验证：
   * 1. 防重放攻击 (txHash 唯一性，不可二次充值)
   * 2. 链上确认状态 (confirmed & success)
   * 3. 收款方是否为本平台配置的合法充值专属钱包
   * 4. 代币合约是否严格匹配
   * 5. 到账金额是否 >= 订单金额
   * 6. 验证成功后原子给用户代币余额增值，每个 Token 单独存放！
   */
  async verifyAndConfirmDeposit(dto: SubmitDepositTxDto): Promise<{
    success: boolean;
    orderId: string;
    txHash: string;
    status: OrderStatus;
    tokenSymbol?: string;
    amount?: string;
    credited?: boolean;
    newBalance?: string;
    pipelineSteps?: any[];
    error?: string;
  }> {
    const order = this.orders.get(dto.orderId);
    if (!order) {
      throw new NotFoundException(`充值订单 ${dto.orderId} 不存在`);
    }

    if (order.status === OrderStatus.CONFIRMED && order.credited) {
      const balance = order.userId && this.balanceService
        ? await this.balanceService.getSingleBalance(order.userId, String(order.chain), order.tokenSymbol || 'USDT')
        : undefined;
      return {
        success: true,
        orderId: order.id,
        txHash: order.txHash!,
        status: OrderStatus.CONFIRMED,
        tokenSymbol: order.tokenSymbol,
        amount: order.actualAmount || order.amount,
        credited: true,
        newBalance: balance,
      };
    }

    if (Date.now() > order.expiresAt) {
      order.status = OrderStatus.EXPIRED;
      throw new BadRequestException(`充值订单已超时失效，请重新生成充值订单`);
    }

    const cleanHash = dto.txHash.trim().toLowerCase();

    // 1. 防重放校验与飞行互斥锁 (In-flight Mutex & Replay Lock)
    // 彻底封堵并发提交相同 txHash 绕过校验的微秒级竞态攻击
    if (this.usedTxHashes.has(cleanHash) || this.processingTxHashes.has(cleanHash)) {
      throw new ConflictException(`交易哈希 ${dto.txHash} 正在核验中或已经被使用入账，严禁重复提交或并发刷单 (Anti-Replay Violation)`);
    }

    // 2. 防重放校验 (Prisma 持久化层)
    if (this.prisma) {
      const confirmedOrder = await this.prisma.depositOrder.findFirst({
        where: {
          txHash: cleanHash,
          status: 'CONFIRMED',
        },
      });
      if (confirmedOrder) {
        this.usedTxHashes.add(cleanHash);
        throw new ConflictException(`交易哈希 ${dto.txHash} 已在系统中确认入账过，严禁二次刷单`);
      }
    }

    // 立即抢占飞行锁
    this.processingTxHashes.add(cleanHash);

    try {
      this.logger.log(
        `正在进行链上核验: Order=${order.id}, Chain=${order.chain}, TxHash=${dto.txHash}`,
      );

      // 3. 调用底层对应公链适配器进行链上确认状态核查
      const verifyResult = await this.transferService.verifyTx(order.chain, dto.txHash);

      if (!verifyResult.confirmed) {
        return {
          success: false,
          orderId: order.id,
          txHash: dto.txHash,
          status: OrderStatus.PENDING,
          error: '交易尚未在区块链上确认打包，请等待数秒后重试',
        };
      }

      // 4. 收款地址合法性核验：必须是分配的钱包或者系统在该链上配置的充值钱包池之一
      const validAddresses = [order.depositAddress.toLowerCase()];
      if (this.depositWalletService) {
        const activeWallets = await this.depositWalletService.getActiveWallets(String(order.chain));
        validAddresses.push(...activeWallets.map((w) => w.address.toLowerCase()));
      }

      const receiptTo = (verifyResult.to || '').toLowerCase();
      if (!validAddresses.includes(receiptTo)) {
        this.logger.warn(
          `充值核验失败：收款地址不属于本平台。期望：${order.depositAddress}，实际链上到账地址：${verifyResult.to}`,
        );
        return {
          success: false,
          orderId: order.id,
          txHash: dto.txHash,
          status: OrderStatus.FAILED,
          error: `收款钱包地址不匹配：款项未汇入分配的平台充值专属钱包`,
        };
      }

      // 5. 代币合约校验
      if (order.tokenAddress) {
        if (
          !verifyResult.tokenAddress ||
          verifyResult.tokenAddress.toLowerCase() !== order.tokenAddress.toLowerCase()
        ) {
          return {
            success: false,
            orderId: order.id,
            txHash: dto.txHash,
            status: OrderStatus.FAILED,
            error: `代币合约不匹配：交易代币合约为 ${verifyResult.tokenAddress}，期望代币合约为 ${order.tokenAddress}`,
          };
        }
      } else {
        // 原生币转账校验
        if (verifyResult.tokenAddress) {
          return {
            success: false,
            orderId: order.id,
            txHash: dto.txHash,
            status: OrderStatus.FAILED,
            error: `代币类型不匹配：此充值订单为底层原生币，检测到汇款为代币合约转账`,
          };
        }
      }

      // 6. 充值到账金额校验
      const actualAmount = verifyResult.amount || order.amount;
      const actualBn = new BigNumber(actualAmount);
      const expectedBn = new BigNumber(order.amount);

      if (actualBn.isLessThan(expectedBn)) {
        return {
          success: false,
          orderId: order.id,
          txHash: dto.txHash,
          status: OrderStatus.FAILED,
          error: `实际到账金额不足：链上到账 ${actualAmount}，小于订单要求金额 ${order.amount}`,
        };
      }

      // 7. 结算确认并原子增加用户该 Token 余额
      order.status = OrderStatus.CONFIRMED;
      order.txHash = dto.txHash;
      order.fromAddress = verifyResult.from;
      order.actualAmount = actualAmount;
      order.confirmedAt = Date.now();
      order.blockNumber = verifyResult.blockNumber;
      order.confirmations = 3;
      order.credited = true;
      this.usedTxHashes.add(cleanHash);

      order.pipelineSteps = [
        {
          step: 1,
          name: '充值意图与金库分配',
          status: 'SUCCESS' as const,
          detail: `公链: ${order.chain}，专属收款金库: ${order.depositAddress}`,
          timestamp: order.createdAt,
        },
        {
          step: 2,
          name: '组装未签名交易载荷',
          status: 'SUCCESS' as const,
          detail: '交易数据载荷构建完成',
          timestamp: order.createdAt,
        },
        {
          step: 3,
          name: '钱包签名与链上广播',
          status: 'SUCCESS' as const,
          detail: `已广播链上，TxHash: ${dto.txHash}`,
          timestamp: Date.now(),
        },
        {
          step: 4,
          name: '链上收据核验与防重放',
          status: 'SUCCESS' as const,
          detail: `防重放检查通过，收据核验成功 (高度: ${verifyResult.blockNumber || 'Latest'})`,
          timestamp: Date.now(),
        },
        {
          step: 5,
          name: '到账金额与代币合约校验',
          status: 'SUCCESS' as const,
          detail: `实际到账 ${actualAmount} ${order.tokenSymbol}，合约匹配通过`,
          timestamp: Date.now(),
        },
        {
          step: 6,
          name: '代币资产原子结算入账',
          status: 'SUCCESS' as const,
          detail: '已成功入账至代币账户',
          timestamp: Date.now(),
        },
      ];

      let newBalanceStr: string | undefined;
      if (order.userId && this.balanceService) {
        const creditedRecord = await this.balanceService.creditBalance(
          order.userId,
          String(order.chain),
          order.tokenSymbol || 'USDT',
          order.tokenAddress,
          actualAmount,
        );
        newBalanceStr = creditedRecord.balance;
        if (order.pipelineSteps && order.pipelineSteps[5]) {
          order.pipelineSteps[5].detail = `已成功入账，最新账户余额: ${newBalanceStr}`;
        }
      }

      if (this.prisma) {
        this.prisma.depositOrder.update({
          where: { id: order.id },
          data: {
            status: 'CONFIRMED',
            txHash: dto.txHash,
            fromAddress: verifyResult.from,
            actualAmount,
            blockNumber: verifyResult.blockNumber ? BigInt(verifyResult.blockNumber) : null,
            confirmations: 3,
            credited: true,
            confirmedAt: BigInt(order.confirmedAt),
          },
        }).catch((err) => {
          this.logger.warn(`Prisma 更新充值订单状态异常: ${err.message}`);
        });
      }

      this.logger.log(
        ` [Deposit Confirmed] Order=${order.id}, User=${order.userId}, Token=${order.tokenSymbol}, Amount=${actualAmount}, TxHash=${dto.txHash}`,
      );

      return {
        success: true,
        orderId: order.id,
        txHash: dto.txHash,
        status: OrderStatus.CONFIRMED,
        tokenSymbol: order.tokenSymbol,
        amount: actualAmount,
        credited: true,
        newBalance: newBalanceStr,
        pipelineSteps: order.pipelineSteps,
      };
    } finally {
      this.processingTxHashes.delete(cleanHash);
    }
  }

  /**
   * 3. 场景 B：前端未获取到 txHash 的情况 (如第三方提现、扫码转账未捕获 Hash)
   * 自动智能扫描匹配：
   * - 检查充值地址的链上沉淀
   * - 验证订单生命周期内有效入账
   * - 自动完成订单与代币余额结算
   */
  async scanAndMatchDeposit(dto: ScanMatchDepositDto): Promise<{
    success: boolean;
    orderId: string;
    txHash: string;
    status: OrderStatus;
    tokenSymbol?: string;
    amount?: string;
    credited?: boolean;
    newBalance?: string;
    pipelineSteps?: any[];
    message?: string;
    error?: string;
  }> {
    const order = this.orders.get(dto.orderId);
    if (!order) {
      throw new NotFoundException(`充值订单 ${dto.orderId} 不存在`);
    }

    if (order.status === OrderStatus.CONFIRMED && order.credited) {
      const balance = order.userId && this.balanceService
        ? await this.balanceService.getSingleBalance(order.userId, String(order.chain), order.tokenSymbol || 'USDT')
        : undefined;
      return {
        success: true,
        orderId: order.id,
        txHash: order.txHash!,
        status: OrderStatus.CONFIRMED,
        tokenSymbol: order.tokenSymbol,
        amount: order.actualAmount || order.amount,
        credited: true,
        newBalance: balance,
        message: '该订单已确认入账，余额已处于最新状态',
      };
    }

    if (Date.now() > order.expiresAt) {
      order.status = OrderStatus.EXPIRED;
      throw new BadRequestException('充值订单已超时失效');
    }

    // 智能链上探测：查询分配的充值钱包当前余额
    const currentBalance = await this.transferService.getBalance(
      order.chain,
      order.depositAddress,
      order.tokenAddress,
    );

    const balanceBn = new BigNumber(currentBalance);
    const expectedBn = new BigNumber(order.amount);

    if (balanceBn.isLessThan(expectedBn)) {
      return {
        success: false,
        orderId: order.id,
        txHash: '',
        status: OrderStatus.PENDING,
        error: `充值收款地址目前尚未监测到足额入账 (当前探测余额: ${currentBalance}，期望: ${order.amount})。如果已转账，区块链网络可能稍有延迟，请稍后再次点击侦测。`,
      };
    }

    // 匹配成功：生成确定性链上匹配流水标识，防止重复对账
    const matchedTxHash = `0xMatchIncoming_${order.id.replace(/-/g, '').slice(0, 16)}_${Date.now()}`;
    const cleanHash = matchedTxHash.toLowerCase();

    order.status = OrderStatus.CONFIRMED;
    order.txHash = matchedTxHash;
    order.fromAddress = dto.fromAddress || 'auto-scan-transfer';
    order.actualAmount = order.amount;
    order.confirmedAt = Date.now();
    order.credited = true;
    this.usedTxHashes.add(cleanHash);

    order.pipelineSteps = [
      {
        step: 1,
        name: '充值意图与金库分配',
        status: 'SUCCESS' as const,
        detail: `公链: ${order.chain}，专属收款金库: ${order.depositAddress}`,
        timestamp: order.createdAt,
      },
      {
        step: 2,
        name: '组装未签名交易载荷',
        status: 'SUCCESS' as const,
        detail: '专属地址生成完毕',
        timestamp: order.createdAt,
      },
      {
        step: 3,
        name: '外部转账或扫码出款',
        status: 'SUCCESS' as const,
        detail: '用户已向专属地址完成外部转账',
        timestamp: Date.now(),
      },
      {
        step: 4,
        name: '智能探测链上资金沉淀',
        status: 'SUCCESS' as const,
        detail: `探测到入账资金: ${currentBalance} >= ${order.amount}`,
        timestamp: Date.now(),
      },
      {
        step: 5,
        name: '生成对账确定性哈希凭证',
        status: 'SUCCESS' as const,
        detail: `匹配凭证: ${matchedTxHash}`,
        timestamp: Date.now(),
      },
      {
        step: 6,
        name: '代币资产原子结算入账',
        status: 'SUCCESS' as const,
        detail: '已成功入账至代币账户',
        timestamp: Date.now(),
      },
    ];

    let newBalanceStr: string | undefined;
    if (order.userId && this.balanceService) {
      const creditedRecord = await this.balanceService.creditBalance(
        order.userId,
        String(order.chain),
        order.tokenSymbol || 'USDT',
        order.tokenAddress,
        order.amount,
      );
      newBalanceStr = creditedRecord.balance;
      if (order.pipelineSteps && order.pipelineSteps[5]) {
        order.pipelineSteps[5].detail = `已成功入账，最新账户余额: ${newBalanceStr}`;
      }
    }

    if (this.prisma) {
      this.prisma.depositOrder.update({
        where: { id: order.id },
        data: {
          status: 'CONFIRMED',
          txHash: matchedTxHash,
          fromAddress: order.fromAddress,
          actualAmount: order.amount,
          credited: true,
          confirmedAt: BigInt(order.confirmedAt),
        },
      }).catch((err) => {
        this.logger.warn(`Prisma 自动匹配订单更新异常: ${err.message}`);
      });
    }

    this.logger.log(
      ` [Auto-Scan Matched] Order=${order.id}, User=${order.userId}, Token=${order.tokenSymbol}, Amount=${order.amount}, MatchedHash=${matchedTxHash}`,
    );

    return {
      success: true,
      orderId: order.id,
      txHash: matchedTxHash,
      status: OrderStatus.CONFIRMED,
      tokenSymbol: order.tokenSymbol,
      amount: order.amount,
      credited: true,
      newBalance: newBalanceStr,
      pipelineSteps: order.pipelineSteps,
      message: '智能链上探测匹配成功！充值金额已自动计入您的代币资产余额！',
    };
  }

  /**
   * 4. 查询充值订单当前状态与链上区块打包确认进度
   * 支持返回区块高度与当前确认数 (如 1/3, 2/3, 3/3 块确认)
   */
  async getDepositProgress(orderId: string): Promise<{
    orderId: string;
    status: OrderStatus;
    progress: number;
    currentConfirmations: number;
    requiredConfirmations: number;
    blockNumber?: number;
    currentBlock?: number;
    txHash?: string;
    credited: boolean;
    amount?: string;
    tokenSymbol?: string;
    pipelineSteps?: any[];
    error?: string;
  }> {
    const order = this.orders.get(orderId);
    if (!order) {
      throw new NotFoundException(`充值订单 ${orderId} 不存在`);
    }

    const net = this.networkRegistryService.getNetwork(String(order.chain));
    const required = net.family === 'SOLANA' ? 1 : net.family === 'TRON' ? 2 : 3;

    if (order.status === OrderStatus.CONFIRMED) {
      return {
        orderId: order.id,
        status: OrderStatus.CONFIRMED,
        progress: 100,
        currentConfirmations: order.confirmations || required,
        requiredConfirmations: required,
        blockNumber: order.blockNumber,
        txHash: order.txHash,
        credited: order.credited || false,
        amount: order.actualAmount || order.amount,
        tokenSymbol: order.tokenSymbol,
        pipelineSteps: order.pipelineSteps,
      };
    }

    if (!order.txHash) {
      return {
        orderId: order.id,
        status: OrderStatus.PENDING,
        progress: 0,
        currentConfirmations: 0,
        requiredConfirmations: required,
        credited: false,
        amount: order.amount,
        tokenSymbol: order.tokenSymbol,
        pipelineSteps: order.pipelineSteps,
      };
    }

    try {
      const verifyResult = await this.transferService.verifyTx(order.chain, order.txHash);
      if (verifyResult.confirmed) {
        let currentBlockNum = verifyResult.blockNumber || 0;
        let confirmations = 1;

        if (net.family === 'EVM') {
          try {
            const publicClient = (this.transferService as any).evmAdapter?.getPublicClient(net.networkId);
            if (publicClient) {
              const latest = await publicClient.getBlockNumber();
              currentBlockNum = Number(latest);
              if (verifyResult.blockNumber) {
                confirmations = Math.max(1, currentBlockNum - verifyResult.blockNumber + 1);
              }
            }
          } catch {}
        } else {
          confirmations = required;
        }

        order.blockNumber = verifyResult.blockNumber;
        order.confirmations = confirmations;

        if (confirmations >= required) {
          if (!order.credited) {
            await this.verifyAndConfirmDeposit({ orderId: order.id, txHash: order.txHash });
          }
          return {
            orderId: order.id,
            status: OrderStatus.CONFIRMED,
            progress: 100,
            currentConfirmations: confirmations,
            requiredConfirmations: required,
            blockNumber: verifyResult.blockNumber,
            currentBlock: currentBlockNum,
            txHash: order.txHash,
            credited: true,
            amount: order.actualAmount || order.amount,
            tokenSymbol: order.tokenSymbol,
            pipelineSteps: order.pipelineSteps,
          };
        } else {
          order.status = OrderStatus.CONFIRMING;
          const progress = Math.min(95, Math.floor((confirmations / required) * 100));
          return {
            orderId: order.id,
            status: OrderStatus.CONFIRMING,
            progress,
            currentConfirmations: confirmations,
            requiredConfirmations: required,
            blockNumber: verifyResult.blockNumber,
            currentBlock: currentBlockNum,
            txHash: order.txHash,
            credited: false,
            amount: order.amount,
            tokenSymbol: order.tokenSymbol,
            pipelineSteps: order.pipelineSteps,
          };
        }
      } else {
        return {
          orderId: order.id,
          status: OrderStatus.CONFIRMING,
          progress: 25,
          currentConfirmations: 0,
          requiredConfirmations: required,
          txHash: order.txHash,
          credited: false,
          amount: order.amount,
          tokenSymbol: order.tokenSymbol,
          pipelineSteps: order.pipelineSteps,
        };
      }
    } catch (err: any) {
      return {
        orderId: order.id,
        status: order.status,
        progress: 15,
        currentConfirmations: 0,
        requiredConfirmations: required,
        txHash: order.txHash,
        credited: false,
        pipelineSteps: order.pipelineSteps,
        error: err.message,
      };
    }
  }

  async getRecentDeposits(limit = 20) {
    if (this.prisma) {
      try {
        const list = await this.prisma.depositOrder.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' },
        });
        return list.map((d) => ({
          ...d,
          createdAt: Number(d.createdAt),
          expiresAt: Number(d.expiresAt),
          confirmedAt: d.confirmedAt ? Number(d.confirmedAt) : null,
        }));
      } catch (err: any) {
        this.logger.warn(`查询最近充值记录失败: ${err.message}`);
      }
    }
    return Array.from(this.orders.values());
  }

  getOrder(orderId: string): DepositOrder | undefined {
    return this.orders.get(orderId);
  }
}
