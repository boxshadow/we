<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  NButton,
  NCard,
  NTag,
  NSpace,
  NGrid,
  NGi,
  NTooltip,
  NPopconfirm,
  NSpin,
  NEmpty,
  NModal,
  NSelect,
  NInput,
  NAlert,
  NQrCode,
  NProgress,
  NSteps,
  NStep,
  NTabs,
  NTabPane,
  NDivider,
  useMessage
} from 'naive-ui';
import {
  Wallet,
  ShieldCheck,
  Link2,
  Unlink,
  Copy,
  Check,
  Globe,
  Terminal,
  Trash2,
  ExternalLink,
  ChevronRight,
  Database,
  RefreshCw,
  UserCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Coins,
  Clock,
  CheckCircle2,
  Layers,
  ChevronDown,
  ChevronUp,
  Cpu,
  ArrowRight,
  ScanQrCode,
  ShieldAlert,
  AlertCircle
} from 'lucide-vue-next';
import { useWalletStore } from '../stores/wallet';
import { apiClient } from '../api/client';
import ConnectModal from '../components/ConnectModal.vue';
import type { UserProfile, ChainFamily } from '../types/wallet';

const walletStore = useWalletStore();
const message = useMessage();

const showConnectModal = ref(false);
const connectModalMode = ref<'login' | 'bind'>('login');
const copied = ref(false);

// 开发者底层画像与诊断抽屉折叠状态
const isDevPanelOpen = ref(false);

// 数据库持久化用户列表
const dbUsers = ref<UserProfile[]>([]);
const isDbLoading = ref(false);

// 用户独立多链代币资产体系 (Multi-Token Balances)
const userBalances = ref<any[]>([]);
const isBalancesLoading = ref(false);

// 充值入金流控 (Deposit Workflow)
const showDepositModal = ref(false);
const depositTab = ref<'wallet' | 'manual'>('wallet'); // 默认直接加签支付，备用手动转账
const depositNetwork = ref('ethereum');
const depositAmount = ref('10.0');
const selectedTokenSymbol = ref('USDT');
const supportedTokens = ref<any[]>([]);
const isCreatingDeposit = ref(false);
const isWalletSigning = ref(false);
const currentDepositOrder = ref<{
  orderId: string;
  network: string;
  tokenSymbol?: string;
  depositAddress: string;
  amount: string;
  expiresAt: number;
  rawTx?: any;
} | null>(null);

// 充值链上打包与确认进度 (Progress with Block Tracking)
const depositProgress = ref<{
  status: string;
  progress: number;
  currentConfirmations: number;
  requiredConfirmations: number;
  blockNumber?: number;
  currentBlock?: number;
  txHash?: string;
  credited?: boolean;
  amount?: string;
  tokenSymbol?: string;
} | null>(null);
let depositPollingTimer: any = null;

// 手动模式/双场景核验输入
const txHashInput = ref('');
const fromAddressInput = ref('');
const isConfirmingTx = ref(false);
const isScanningTx = ref(false);
const verificationResult = ref<any>(null);

// 提现出金流控 (Withdrawal Workflow via Server-Side On-Chain Transfer)
const showWithdrawModal = ref(false);
const withdrawNetwork = ref('ethereum');
const withdrawTokenSymbol = ref('USDT');
const withdrawAmount = ref('10.0');
const withdrawToAddress = ref('');
const isWithdrawing = ref(false);
const withdrawResult = ref<any>(null);
const withdrawError = ref<string | null>(null);
const userWithdrawals = ref<any[]>([]);

interface WithdrawStepItem {
  name: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  detail?: string;
}

const defaultWithdrawSteps: WithdrawStepItem[] = [
  { name: '1. 参数与地址校验', status: 'PENDING', detail: '等待提交' },
  { name: '2. 余额核验与资产锁定', status: 'PENDING', detail: '核对账本可用余额' },
  { name: '3. 智能匹配出资热钱包', status: 'PENDING', detail: '挑选公链提现节点' },
  { name: '4. 安全 Enclave 物理加签', status: 'PENDING', detail: 'KMS 硬件隔离签名' },
  { name: '5. 公链节点广播入块', status: 'PENDING', detail: '提交 rawTx 至 RPC' },
  { name: '6. 区块打包确认与到账', status: 'PENDING', detail: '等待出块与最终确认' },
];
const withdrawStepsDisplay = ref<WithdrawStepItem[]>([...defaultWithdrawSteps]);

// 下拉选项适配
const networkOptions = computed(() => {
  return walletStore.supportedNetworks.map((net) => ({
    label: `${net.name} (${net.family})`,
    value: net.networkId,
  }));
});

const tokenOptions = computed(() => {
  if (supportedTokens.value.length === 0) {
    return [
      { label: 'USDT (默认稳定币)', value: 'USDT' },
      { label: '原生代币', value: 'NATIVE' },
    ];
  }
  return supportedTokens.value.map((t) => ({
    label: `${t.symbol} - ${t.name}${t.isNative ? ' (原生)' : ''}`,
    value: t.symbol,
  }));
});

// 计算当前提现币种的可用余额
const currentTokenAvailableBalance = computed(() => {
  const target = userBalances.value.find(
    (b) =>
      b.networkId?.toLowerCase() === withdrawNetwork.value.toLowerCase() &&
      b.tokenSymbol?.toUpperCase() === withdrawTokenSymbol.value.toUpperCase()
  );
  return target?.balance || '0.0';
});

async function loadSupportedTokens(netId: string) {
  try {
    const list = await apiClient.getSupportedTokens(netId);
    supportedTokens.value = list;
    if (list.length > 0 && !list.find((t) => t.symbol === selectedTokenSymbol.value)) {
      selectedTokenSymbol.value = list[0].symbol;
      withdrawTokenSymbol.value = list[0].symbol;
    }
  } catch {
    supportedTokens.value = [];
  }
}

async function onNetworkChanged(netId: string) {
  depositNetwork.value = netId;
  withdrawNetwork.value = netId;
  await loadSupportedTokens(netId);
  await handleCreateDeposit();
}

async function loadUserBalances() {
  if (!walletStore.user?.id) return;
  isBalancesLoading.value = true;
  try {
    userBalances.value = await apiClient.getUserBalances(walletStore.user.id);
  } catch (err: any) {
    console.warn('拉取用户资产矩阵失败:', err);
  } finally {
    isBalancesLoading.value = false;
  }
}

async function loadUserWithdrawals() {
  if (!walletStore.user?.id) return;
  try {
    userWithdrawals.value = await apiClient.getUserWithdrawals(walletStore.user.id);
  } catch (err: any) {
    console.warn('拉取用户提现流水失败:', err);
  }
}

function openDepositModal() {
  if (!walletStore.accessToken || !walletStore.user) {
    message.warning('请先连接钱包完成身份鉴权');
    openLoginModal();
    return;
  }
  showDepositModal.value = true;
  handleCreateDeposit();
}

function quickDeposit(networkId: string, symbol: string) {
  depositNetwork.value = networkId;
  selectedTokenSymbol.value = symbol;
  showDepositModal.value = true;
  handleCreateDeposit();
}

function openWithdrawModal(netId?: string, symbol?: string) {
  if (!walletStore.accessToken || !walletStore.user) {
    message.warning('请先连接钱包完成身份鉴权');
    openLoginModal();
    return;
  }
  if (netId) withdrawNetwork.value = netId;
  if (symbol) withdrawTokenSymbol.value = symbol;
  withdrawToAddress.value = walletStore.connectedAddress || '';
  withdrawResult.value = null;
  withdrawError.value = null;
  withdrawStepsDisplay.value = defaultWithdrawSteps.map(s => ({ ...s }));
  showWithdrawModal.value = true;
  loadUserWithdrawals();
}

function setMaxWithdrawAmount() {
  withdrawAmount.value = currentTokenAvailableBalance.value;
}

function fillCurrentAddress() {
  if (walletStore.connectedAddress) {
    withdrawToAddress.value = walletStore.connectedAddress;
    message.info('已填入当前连接的钱包地址');
  }
}

async function handleCreateDeposit() {
  if (!walletStore.user?.id) return;
  isCreatingDeposit.value = true;
  try {
    const res = await apiClient.createDepositIntent({
      network: depositNetwork.value,
      amount: depositAmount.value || '10.0',
      tokenSymbol: selectedTokenSymbol.value,
      userId: walletStore.user.id,
    });
    currentDepositOrder.value = res;
  } catch (err: any) {
    console.warn('创建充值订单意图失败:', err);
  } finally {
    isCreatingDeposit.value = false;
  }
}

/**
 * 核心流程：服务端给出交易数据，前端直接拉起当前钱包进行加签支付并跟踪区块确认
 */
async function handleWalletSignDeposit() {
  if (!walletStore.accessToken || !walletStore.user) {
    message.warning('请先连接钱包以完成 Web3 身份鉴权');
    openLoginModal();
    return;
  }

  isWalletSigning.value = true;
  depositProgress.value = {
    status: 'SIGNING',
    progress: 15,
    currentConfirmations: 0,
    requiredConfirmations: 3,
  };

  try {
    const orderRes = await apiClient.createDepositIntent({
      network: depositNetwork.value,
      amount: depositAmount.value || '10.0',
      tokenSymbol: selectedTokenSymbol.value,
      userId: walletStore.user?.id,
    });
    currentDepositOrder.value = orderRes;

    const rawTx = orderRes.rawTx;
    if (!rawTx) {
      throw new Error('服务端未返回有效的加签交易数据 (rawTx)');
    }

    const targetNet = walletStore.supportedNetworks.find((n) => n.networkId === depositNetwork.value);
    const targetFamily: ChainFamily = (targetNet?.family as ChainFamily) || 'EVM';
    const reqConf = targetFamily === 'SOLANA' ? 1 : targetFamily === 'TRON' ? 2 : 3;
    const provider = walletStore.getActiveProvider(targetFamily);

    if (!provider) {
      throw new Error(`未检测到支持 [${targetFamily}] 的钱包插件，请确认已解锁 TokenPocket / MetaMask 等 Web3 钱包`);
    }

    message.loading('已唤起钱包，请在弹出窗口中确认加签支付...', { duration: 3000 });

    let txHash = '';

    if (targetFamily === 'EVM') {
      if (rawTx.chainIdHex && provider.request) {
        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: rawTx.chainIdHex }],
          });
        } catch {
          // 忽略用户未预配链的警告
        }
      }

      const params: any = {
        from: walletStore.connectedAddress,
        to: rawTx.to,
        value: rawTx.value || '0x0',
        data: rawTx.data || '0x',
      };

      txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [params],
      });
    } else if (targetFamily === 'TRON') {
      if (provider.trx && provider.trx.sendTransaction) {
        if (rawTx.method === 'native') {
          const tx = await provider.trx.sendTransaction(rawTx.to, Number(rawTx.value));
          txHash = tx.txid || tx.transaction?.txID || tx;
        } else {
          const contract = await provider.contract().at(rawTx.to);
          txHash = await contract.transfer(rawTx.depositAddress, rawTx.contractParams?.rawAmount).send();
        }
      } else {
        throw new Error('TRON 钱包插件未就绪');
      }
    } else {
      throw new Error('Solana 链上请使用备用 Tab 复制收款地址进行转账');
    }

    if (!txHash) {
      throw new Error('钱包加签已取消或未生成有效 txHash');
    }

    message.success(`钱包加签成功，已广播链上！交易 Hash: ${formatAddr(txHash)}`);
    txHashInput.value = txHash;

    depositProgress.value = {
      status: 'CONFIRMING',
      progress: 35,
      currentConfirmations: 1,
      requiredConfirmations: reqConf,
      txHash,
      amount: orderRes.amount,
      tokenSymbol: orderRes.tokenSymbol,
    };

    apiClient.confirmDeposit({ orderId: orderRes.orderId, txHash }).catch(() => {});

    if (depositPollingTimer) clearInterval(depositPollingTimer);
    depositPollingTimer = setInterval(async () => {
      try {
        const prog = await apiClient.getDepositProgress(orderRes.orderId);
        if (prog) {
          depositProgress.value = prog;
          if (prog.status === 'CONFIRMED' || prog.progress >= 100) {
            clearInterval(depositPollingTimer);
            depositPollingTimer = null;
            message.success(`区块确认完毕，充值成功到账: ${prog.amount || orderRes.amount} ${prog.tokenSymbol || selectedTokenSymbol.value}`);
            await loadUserBalances();
            await loadDbUsers();
          }
        }
      } catch (e) {
        console.warn('轮询充值进度异常:', e);
      }
    }, 2000);

  } catch (err: any) {
    depositProgress.value = null;
    message.error(err.message || '加签支付失败，用户已取消或网络超时');
  } finally {
    isWalletSigning.value = false;
  }
}

async function handleConfirmWithTxHash() {
  if (!currentDepositOrder.value?.orderId) {
    message.warning('请先生成有效的充值订单');
    return;
  }
  if (!txHashInput.value.trim()) {
    message.warning('请输入链上交易 Hash (txHash)');
    return;
  }
  isConfirmingTx.value = true;
  try {
    const res = await apiClient.confirmDeposit({
      orderId: currentDepositOrder.value.orderId,
      txHash: txHashInput.value.trim(),
    });
    verificationResult.value = res;
    depositProgress.value = {
      status: 'CONFIRMED',
      progress: 100,
      currentConfirmations: 3,
      requiredConfirmations: 3,
      txHash: res.txHash,
      amount: res.amount,
      tokenSymbol: res.tokenSymbol,
    };
    message.success('链上对账核验成功！充值金额已累加至账户余额');
    loadUserBalances();
    loadDbUsers();
  } catch (err: any) {
    message.error(err.message || '核验确认失败');
  } finally {
    isConfirmingTx.value = false;
  }
}

async function handleScanMatchWithoutTxHash() {
  if (!currentDepositOrder.value?.orderId) {
    message.warning('请先生成充值订单');
    return;
  }
  isScanningTx.value = true;
  try {
    const res = await apiClient.scanMatchDeposit({
      orderId: currentDepositOrder.value.orderId,
      fromAddress: fromAddressInput.value.trim() || undefined,
    });
    verificationResult.value = res;
    depositProgress.value = {
      status: 'CONFIRMED',
      progress: 100,
      currentConfirmations: 3,
      requiredConfirmations: 3,
      txHash: res.txHash,
      amount: res.amount,
      tokenSymbol: res.tokenSymbol,
    };
    message.success('智能对账匹配成功！已入账');
    loadUserBalances();
    loadDbUsers();
  } catch (err: any) {
    message.error(err.message || '未扫描到匹配交易，请稍后再试');
  } finally {
    isScanningTx.value = false;
  }
}

async function handleExecuteWithdraw() {
  if (!walletStore.user?.id) {
    message.warning('请先连接钱包');
    return;
  }
  if (!withdrawAmount.value || parseFloat(withdrawAmount.value) <= 0) {
    message.warning('请输入有效的提现金额');
    return;
  }
  if (!withdrawToAddress.value || withdrawToAddress.value.trim().length < 10) {
    message.warning('请输入有效的提现接收公钥地址');
    return;
  }

  isWithdrawing.value = true;
  withdrawResult.value = null;
  withdrawError.value = null;

  // 初始化步骤指示器
  withdrawStepsDisplay.value = [
    { name: '1. 参数与地址校验', status: 'PROCESSING', detail: `校验公链 ${withdrawNetwork.value} 与目标地址...` },
    { name: '2. 余额核验与资产锁定', status: 'PENDING', detail: '核对账本可用余额' },
    { name: '3. 智能匹配出资热钱包', status: 'PENDING', detail: '挑选公链提现节点' },
    { name: '4. 安全 Enclave 物理加签', status: 'PENDING', detail: 'KMS 硬件隔离签名' },
    { name: '5. 公链节点广播入块', status: 'PENDING', detail: '提交 rawTx 至 RPC' },
    { name: '6. 区块打包确认与到账', status: 'PENDING', detail: '等待出块与最终确认' },
  ];

  try {
    withdrawStepsDisplay.value[0] = {
      name: '1. 参数与地址校验',
      status: 'SUCCESS',
      detail: `目标地址格式合法: ${formatAddr(withdrawToAddress.value.trim())}`,
    };
    withdrawStepsDisplay.value[1] = {
      name: '2. 余额核验与资产锁定',
      status: 'PROCESSING',
      detail: `正在原子冻结扣减 ${withdrawAmount.value} ${withdrawTokenSymbol.value}...`,
    };

    const res = await apiClient.withdraw({
      userId: walletStore.user.id,
      network: withdrawNetwork.value,
      tokenSymbol: withdrawTokenSymbol.value,
      amount: withdrawAmount.value,
      toAddress: withdrawToAddress.value.trim(),
    });

    if (res.pipelineSteps && Array.isArray(res.pipelineSteps)) {
      withdrawStepsDisplay.value = res.pipelineSteps.map((s: any) => ({
        name: `${s.step}. ${s.name}`,
        status: s.status,
        detail: s.detail,
      }));
    } else {
      withdrawStepsDisplay.value = [
        { name: '1. 参数与地址校验', status: 'SUCCESS', detail: '公链与地址校验通过' },
        { name: '2. 余额核验与资产锁定', status: 'SUCCESS', detail: `已扣减 ${withdrawAmount.value} ${withdrawTokenSymbol.value}` },
        { name: '3. 智能匹配出资热钱包', status: 'SUCCESS', detail: `出资节点: ${formatAddr(res.fromVault || 'HotVault')}` },
        { name: '4. 安全 Enclave 物理加签', status: 'SUCCESS', detail: 'KMS/原生 Enclave 签名完成' },
        { name: '5. 公链节点广播入块', status: 'SUCCESS', detail: `TxHash: ${formatAddr(res.txHash)}` },
        { name: '6. 区块打包确认与到账', status: 'SUCCESS', detail: '链上确认放款完成' },
      ];
    }

    withdrawResult.value = res;
    message.success(`提现放款成功！已广播链上 Hash: ${formatAddr(res.txHash)}`);
    await loadUserBalances();
    await loadUserWithdrawals();
  } catch (err: any) {
    withdrawError.value = err.message || '提现发起失败，请检查余额或网络状态';
    if (withdrawStepsDisplay.value[1].status === 'PROCESSING') {
      withdrawStepsDisplay.value[1] = {
        name: '2. 余额核验与资产锁定',
        status: 'FAILED',
        detail: err.message,
      };
    } else {
      withdrawStepsDisplay.value[3] = {
        name: '4. 安全加签与广播',
        status: 'FAILED',
        detail: err.message,
      };
    }
    message.error(err.message || '提现发起失败');
  } finally {
    isWithdrawing.value = false;
  }
}

const getExplorerTxUrl = (network: string, txHash?: string) => {
  if (!txHash) return '#';
  const net = (network || '').toUpperCase();
  if (net.includes('TRON')) return `https://nile.tronscan.org/#/transaction/${txHash}`;
  if (net.includes('SOLANA')) return `https://solscan.io/tx/${txHash}?cluster=devnet`;
  return `https://sepolia.etherscan.io/tx/${txHash}`;
};

async function loadDbUsers() {
  isDbLoading.value = true;
  try {
    dbUsers.value = await apiClient.getAllUsers();
  } catch (err: any) {
    console.warn('拉取数据库用户失败:', err);
  } finally {
    isDbLoading.value = false;
  }
}

watch(
  () => walletStore.user,
  (newUser) => {
    if (newUser) {
      loadUserBalances();
      loadUserWithdrawals();
    } else {
      userBalances.value = [];
      userWithdrawals.value = [];
    }
  },
  { immediate: true }
);

onMounted(() => {
  loadDbUsers();
  loadSupportedTokens(depositNetwork.value);
});

function openLoginModal() {
  connectModalMode.value = 'login';
  showConnectModal.value = true;
}

function openBindModal() {
  connectModalMode.value = 'bind';
  showConnectModal.value = true;
}

async function handleUnbind(chain: ChainFamily, address: string) {
  try {
    message.loading(`正在解绑 [${chain}] 地址...`, { duration: 2500 });
    await walletStore.unbindWallet(chain, address);
    message.success(`成功解绑 [${chain}] ${formatAddr(address)}`);
    loadDbUsers();
    loadUserBalances();
  } catch (err: any) {
    message.error(err.message || '解绑失败');
  }
}

function copyAddress(addr: string) {
  navigator.clipboard.writeText(addr);
  copied.value = true;
  message.success('地址已复制到剪贴板');
  setTimeout(() => { copied.value = false; }, 2000);
}

function handleDisconnect() {
  walletStore.disconnect();
  message.info('已断开当前钱包连接');
  loadDbUsers();
}

const formatAddr = (addr?: string) => {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};
</script>

<template>
  <div class="clean-dapp-container">
    <!-- 1. 未连接状态：清爽、克制、聚焦价值的 Hero 欢迎看板 -->
    <section v-if="!walletStore.user" class="welcome-card">
      <div class="welcome-main">
        <h1 class="welcome-title">多链 Web3 资产与统一身份网关</h1>
        <p class="welcome-desc">
          基于密码学挑战签名与多链账户聚合协议。一次连接，无缝打通 EVM、TRON 与 Solana 全生态公链地址；支持前端直接拉起钱包加签支付、实时区块确认追踪，以及服务端热钱包隔离出金。
        </p>

        <div class="welcome-actions">
          <NButton
            type="primary"
            size="large"
            class="clean-action-btn"
            @click="openLoginModal"
          >
            <template #icon><Wallet :size="16" /></template>
            连接钱包 (Connect Wallet)
          </NButton>
        </div>

        <div class="supported-wallets-bar">
          <span class="bar-label">原生支持钱包：</span>
          <div class="wallet-pills">
            <span class="wallet-pill">TokenPocket</span>
            <span class="wallet-pill">MetaMask</span>
            <span class="wallet-pill">OKX Wallet</span>
            <span class="wallet-pill">Phantom</span>
            <span class="wallet-pill">TronLink</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 2. 已连接状态：现代化个人资产中枢 (Portfolio Dashboard) -->
    <section v-else class="portfolio-dashboard">
      <!-- 顶部主账号全局身份卡片 -->
      <div class="master-account-card">
        <div class="account-left">
          <div class="account-badge-row">
            <span class="role-badge">统一主账号 (Master ID)</span>
            <span class="chain-count-badge">{{ walletStore.user.wallets?.length || 1 }} 条链已互通</span>
          </div>
          <div class="account-id-row">
            <span class="user-id-text mono-text">{{ walletStore.user.id }}</span>
            <button class="icon-copy-btn" @click="copyAddress(walletStore.user.id)" title="复制账号 ID">
              <Copy :size="13" />
            </button>
          </div>
          <div class="primary-wallet-hint">
            首发主钱包: <span class="mono-text">[{{ walletStore.user.primaryWallet.chain }}] {{ formatAddr(walletStore.user.primaryWallet.address) }}</span>
          </div>
        </div>

        <div class="account-right">
          <NSpace :size="10">
            <NButton type="primary" size="medium" @click="openDepositModal">
              <template #icon><ArrowDownLeft :size="15" /></template>
              充值入金
            </NButton>
            <NButton secondary type="info" size="medium" @click="openWithdrawModal()">
              <template #icon><ArrowUpRight :size="15" /></template>
              申请提现
            </NButton>
            <NButton secondary size="medium" @click="openBindModal">
              <template #icon><Link2 :size="15" /></template>
              绑定新链
            </NButton>
            <NButton quaternary size="medium" type="error" @click="handleDisconnect">
              断开
            </NButton>
          </NSpace>
        </div>
      </div>

      <!-- 独立资产明细看板 -->
      <div class="section-container">
        <div class="section-title-bar">
          <div class="title-left">
            <h2 class="clean-section-title">我的多链代币资产 (My Balances)</h2>
            <span class="title-sub">各链独立记账，支持秒级加签充值与实时出金</span>
          </div>
          <NButton size="small" secondary :loading="isBalancesLoading" @click="loadUserBalances">
            <template #icon><RefreshCw :size="13" /></template>
            刷新资产
          </NButton>
        </div>

        <div v-if="userBalances.length === 0" class="empty-state-card">
          <p class="empty-text">当前暂无代币资产余额。点击上方【充值入金】通过钱包直接加签支付即可快速充值到账。</p>
          <NButton type="primary" size="small" secondary @click="openDepositModal">
            立即充值
          </NButton>
        </div>

        <div v-else class="balances-grid">
          <div
            v-for="b in userBalances"
            :key="b.id || (b.networkId + b.tokenSymbol)"
            class="balance-clean-card"
          >
            <div class="b-card-top">
              <span class="chain-tag" :class="b.networkId?.toLowerCase()">{{ b.networkId }}</span>
              <span class="token-tag">{{ b.tokenSymbol }}</span>
            </div>
            <div class="b-card-middle">
              <span class="b-amount mono-text">{{ b.balance }}</span>
              <span class="b-symbol">{{ b.tokenSymbol }}</span>
            </div>
            <div class="b-card-bottom">
              <span class="b-contract mono-text" :title="b.tokenAddress">
                {{ b.tokenAddress ? formatAddr(b.tokenAddress) : '原生公链币' }}
              </span>
              <div class="b-actions">
                <button class="b-btn-deposit" @click="quickDeposit(b.networkId, b.tokenSymbol)">
                  充值
                </button>
                <button class="b-btn-withdraw" @click="openWithdrawModal(b.networkId, b.tokenSymbol)">
                  提现
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已绑定跨链地址矩阵 -->
      <div class="section-container">
        <div class="section-title-bar">
          <div class="title-left">
            <h2 class="clean-section-title">已绑定多链地址矩阵 (Linked Wallets)</h2>
            <span class="title-sub">任意已绑定钱包均可反向免密登录同一主账号</span>
          </div>
          <NButton size="small" secondary type="primary" @click="openBindModal">
            <template #icon><Link2 :size="13" /></template>
            添加新链绑定
          </NButton>
        </div>

        <div class="wallets-table-card">
          <div
            v-for="w in walletStore.user.wallets"
            :key="w.chain + w.address"
            class="wallet-row"
          >
            <div class="w-row-left">
              <span class="chain-tag" :class="w.chain.toLowerCase()">{{ w.chain }}</span>
              <span class="w-address mono-text">{{ w.address }}</span>
              <NTag v-if="w.isPrimary" size="tiny" type="primary" round>初始主钱包</NTag>
              <NTag v-else size="tiny" type="default" round>跨链绑定</NTag>
            </div>

            <div class="w-row-right">
              <span class="w-date">{{ new Date(w.boundAt).toLocaleDateString() }}</span>
              <button class="icon-action-btn" @click="copyAddress(w.address)" title="复制地址">
                <Copy :size="13" />
              </button>
              <NPopconfirm
                v-if="!w.isPrimary"
                @positive-click="handleUnbind(w.chain, w.address)"
                positive-text="确认解绑"
                negative-text="取消"
              >
                <template #trigger>
                  <button class="icon-action-btn text-danger" title="解绑该地址">
                    <Unlink :size="13" />
                  </button>
                </template>
                确认从当前主账号中解除绑定 [{{ w.chain }}] 该公链地址吗？
              </NPopconfirm>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. 支持网络概览 (简洁条目网格) -->
    <section class="section-container">
      <div class="section-title-bar">
        <div class="title-left">
          <h2 class="clean-section-title">支持公链矩阵 (Supported Networks)</h2>
          <span class="title-sub">双通道 RPC 节点全时健康诊断与熔断监控</span>
        </div>
        <span class="counter-text">共 {{ walletStore.supportedNetworks.length }} 条网络</span>
      </div>

      <div class="networks-grid">
        <div
          v-for="net in walletStore.supportedNetworks"
          :key="net.networkId"
          class="network-clean-item"
        >
          <div class="net-left">
            <span class="net-dot" :class="{ 'is-paused': net.isPaused }"></span>
            <div>
              <div class="net-name">{{ net.name }}</div>
              <div class="net-meta">{{ net.family }} · ID: {{ net.chainId || '-' }}</div>
            </div>
          </div>
          <div class="net-right">
            <span class="net-symbol mono-text">{{ net.symbol }}</span>
            <NTag v-if="net.isPaused" size="tiny" type="warning" round>维护中</NTag>
            <NTag v-else size="tiny" type="success" round>就绪</NTag>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. 底部可折叠：开发者对账画像与实时链路终端 (Dev Telemetry) -->
    <section class="dev-drawer-container">
      <div class="dev-drawer-header" @click="isDevPanelOpen = !isDevPanelOpen">
        <div class="dev-header-left">
          <Cpu :size="16" class="dev-icon" />
          <span class="dev-title">开发者与底层链路诊断工具 (Developer Inspector & Telemetry)</span>
          <span class="dev-badge">持久化文件: data/users.json</span>
        </div>
        <div class="dev-header-right">
          <span class="dev-toggle-text">{{ isDevPanelOpen ? '收起面板' : '展开调试面板' }}</span>
          <ChevronUp v-if="isDevPanelOpen" :size="16" />
          <ChevronDown v-else :size="16" />
        </div>
      </div>

      <div v-if="isDevPanelOpen" class="dev-drawer-content">
        <!-- 数据库主账号画像 -->
        <div class="dev-card">
          <div class="dev-card-header">
            <span class="dev-card-title">主账号数据库持久化快照 (data/users.json - 共 {{ dbUsers.length }} 个档案)</span>
            <NButton size="tiny" secondary @click="loadDbUsers" :loading="isDbLoading">
              <template #icon><RefreshCw :size="11" /></template>
              刷新数据
            </NButton>
          </div>
          <div class="dev-users-list">
            <div
              v-for="u in dbUsers"
              :key="u.id"
              class="dev-user-row"
              :class="{ 'is-active-session': walletStore.user?.id === u.id }"
            >
              <div class="dev-u-top">
                <span class="mono-text font-bold" style="color: #3b82f6;">{{ u.id }}</span>
                <NTag v-if="walletStore.user?.id === u.id" size="tiny" type="success" round>当前登录</NTag>
              </div>
              <div class="dev-u-wallets">
                <span
                  v-for="bw in u.wallets"
                  :key="bw.chain + bw.address"
                  class="dev-wallet-pill"
                >
                  <span class="chain-tag" :class="bw.chain.toLowerCase()">{{ bw.chain }}</span>
                  <span class="mono-text" style="font-size: 11px;">{{ formatAddr(bw.address) }}</span>
                  <span v-if="bw.isPrimary" style="color: #3b82f6; font-size: 10px;">(主)</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 实时交互日志控制台 -->
        <div class="dev-card">
          <div class="dev-card-header">
            <span class="dev-card-title">Web3 身份验签与 RPC 诊断流水 (Live Telemetry)</span>
            <button class="clear-btn" @click="walletStore.logs = []">
              <Trash2 :size="12" />
              清空
            </button>
          </div>
          <div class="terminal-view">
            <div v-if="walletStore.logs.length === 0" class="term-empty-text">
              暂无日志事件。点击上方【连接钱包】即可触发链路探测、挑战 Nonce 获取及 EIP-4361 签名验签。
            </div>
            <div
              v-for="(log, idx) in walletStore.logs"
              :key="idx"
              class="terminal-row"
              :class="log.type"
            >
              <span class="term-time">{{ log.time }}</span>
              <span class="term-tag">[{{ log.type.toUpperCase() }}]</span>
              <span class="term-msg">{{ log.message }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 连接与选链弹窗 -->
    <ConnectModal
      v-model:show="showConnectModal"
      :mode="connectModalMode"
      @connected="(addr) => { message.success(`连接完成: ${formatAddr(addr)}`); loadDbUsers(); }"
      @bound="() => { message.success('跨链绑定成功！已收录至主账号'); loadDbUsers(); }"
    />

    <!-- 多链充值入金模态窗 (Deposit Modal) -->
    <NModal
      v-model:show="showDepositModal"
      preset="card"
      title="多链代币充值入金"
      style="max-width: 580px; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;"
      :bordered="false"
    >
      <div class="clean-modal-content">
        <!-- 链与代币选择 -->
        <div class="form-grid">
          <div class="form-item">
            <label class="form-label">目标公链</label>
            <NSelect
              v-model:value="depositNetwork"
              :options="networkOptions"
              placeholder="选择公链"
              @update:value="onNetworkChanged"
            />
          </div>
          <div class="form-item">
            <label class="form-label">充值代币 (Token)</label>
            <NSelect
              v-model:value="selectedTokenSymbol"
              :options="tokenOptions"
              placeholder="选择代币"
              @update:value="handleCreateDeposit"
            />
          </div>
        </div>

        <div class="form-item" style="margin-top: 14px;">
          <label class="form-label">充值金额</label>
          <NInput
            v-model:value="depositAmount"
            placeholder="请输入充值数量 (例如: 10.0)"
            @blur="handleCreateDeposit"
          />
        </div>

        <div style="margin-top: 20px;">
          <NTabs v-model:value="depositTab" type="segment" animated>
            <!-- 方案 1: 直接调起钱包加签支付 -->
            <NTabPane name="wallet" tab="一键加签支付 (浏览器插件)">
              <div class="clean-tab-content">
                <div class="pay-method-intro">
                  <span class="pay-intro-title">即时加签支付</span>
                  <p class="pay-intro-desc">
                    系统已自动组装链上交易数据 (rawTx)。点击下方按钮即可唤起当前连接的钱包直接签名转账，无需手动复制收款地址。
                  </p>
                </div>

                <NButton
                  type="primary"
                  block
                  size="large"
                  :loading="isWalletSigning"
                  @click="handleWalletSignDeposit"
                  style="margin-top: 14px; font-weight: 600;"
                >
                  <template #icon><ArrowDownLeft :size="16" /></template>
                  唤起钱包支付 {{ depositAmount }} {{ selectedTokenSymbol }}
                </NButton>

                <!-- 切换至扫码提示 -->
                <div class="switch-method-bar">
                  <span class="switch-hint">没有安装浏览器钱包插件？</span>
                  <button class="switch-link-btn" @click="depositTab = 'manual'">
                    <ScanQrCode :size="13" />
                    <span>切换至手机 App 扫码支付</span>
                  </button>
                </div>

                <!-- 实时区块确认与核验进度卡片 -->
                <div v-if="depositProgress" class="progress-box">
                  <div class="progress-box-top">
                    <span class="progress-box-title">链上区块确认与入账进度</span>
                    <NTag
                      :type="depositProgress.status === 'CONFIRMED' ? 'success' : 'info'"
                      size="small"
                      round
                    >
                      {{ depositProgress.status === 'CONFIRMED' ? '已到账' : '区块打包中' }}
                    </NTag>
                  </div>

                  <div style="margin-bottom: 16px;">
                    <NProgress
                      type="line"
                      :percentage="depositProgress.progress"
                      :status="depositProgress.status === 'CONFIRMED' ? 'success' : 'info'"
                      :processing="depositProgress.status !== 'CONFIRMED'"
                    />
                  </div>

                  <NSteps
                    size="small"
                    :current="depositProgress.status === 'CONFIRMED' ? 4 : (depositProgress.currentConfirmations > 0 ? 3 : (depositProgress.txHash ? 2 : 1))"
                    :status="depositProgress.status === 'CONFIRMED' ? 'finish' : 'process'"
                  >
                    <NStep title="生成交易" description="收款池匹配" />
                    <NStep title="钱包签名" :description="depositProgress.txHash ? '已广播' : '加签中'" />
                    <NStep
                      title="区块打包"
                      :description="`${depositProgress.currentConfirmations || 0}/${depositProgress.requiredConfirmations || 3} 块确认`"
                    />
                    <NStep title="入账完成" description="余额已累加" />
                  </NSteps>

                  <div v-if="depositProgress.txHash" class="tx-hash-row">
                    <span>交易 Hash: <span class="mono-text" style="color: #94a3b8;">{{ formatAddr(depositProgress.txHash) }}</span></span>
                    <a
                      :href="getExplorerTxUrl(depositNetwork, depositProgress.txHash)"
                      target="_blank"
                      class="clean-link"
                    >
                      <span>区块浏览器</span>
                      <ExternalLink :size="12" />
                    </a>
                  </div>
                </div>
              </div>
            </NTabPane>

            <!-- 方案 2: 手机 App 扫码或专属地址转账 -->
            <NTabPane name="manual" tab="手机扫码与专属地址">
              <div v-if="isCreatingDeposit" class="d-loading-wrapper">
                <NSpin size="medium" />
                <span class="d-loading-text">正在从专属收款池匹配地址并构建数据...</span>
              </div>

              <div v-else-if="currentDepositOrder" class="manual-deposit-box">
                <!-- 核心精致二维码呈现面板 -->
                <div class="qr-showcase-panel">
                  <!-- 顶部信息栏 -->
                  <div class="qr-panel-top">
                    <div class="qr-net-tag-group">
                      <span class="chain-tag" :class="depositNetwork.toLowerCase()">{{ depositNetwork.toUpperCase() }}</span>
                      <span class="qr-token-name">{{ currentDepositOrder.tokenSymbol || selectedTokenSymbol }}</span>
                    </div>
                    <div class="qr-timer-pill">
                      <Clock :size="12" />
                      <span>30 分钟有效</span>
                    </div>
                  </div>

                  <!-- 二维码主体区域：带精密四角刻线、平滑微圆角、中心 Token 徽章 -->
                  <div class="qr-display-stage">
                    <div class="qr-frame-box">
                      <!-- 4 个精密对齐刻线 -->
                      <span class="frame-corner corner-tl"></span>
                      <span class="frame-corner corner-tr"></span>
                      <span class="frame-corner corner-bl"></span>
                      <span class="frame-corner corner-br"></span>

                      <div class="qr-canvas-holder">
                        <NQrCode
                          :value="currentDepositOrder.depositAddress"
                          :size="156"
                          :padding="0"
                          error-correction-level="H"
                          color="#090d16"
                          background-color="#ffffff"
                        />
                        <!-- 中心 Token 徽标，高反差微阴影 -->
                        <div class="qr-center-pill">
                          <span class="qr-center-text">{{ (currentDepositOrder.tokenSymbol || selectedTokenSymbol).slice(0, 4) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- 扫码引导提示 -->
                  <div class="qr-scan-guide">
                    <ScanQrCode :size="14" class="guide-icon" />
                    <span>使用 <strong>TokenPocket / MetaMask / OKX</strong> 移动端 App 扫码转账</span>
                  </div>

                  <!-- 专属收款地址复制行 -->
                  <div class="qr-address-card">
                    <div class="qr-addr-header">
                      <span class="qr-addr-title">充值专属收款地址 (只收不发 · 独立金库)</span>
                      <a
                        :href="getExplorerTxUrl(depositNetwork, currentDepositOrder.depositAddress)"
                        target="_blank"
                        class="explorer-addr-link"
                      >
                        <span>浏览器查验</span>
                        <ExternalLink :size="11" />
                      </a>
                    </div>
                    <div class="qr-addr-body">
                      <span class="mono-text qr-full-address">{{ currentDepositOrder.depositAddress }}</span>
                      <NButton size="small" type="primary" secondary @click="copyAddress(currentDepositOrder.depositAddress)">
                        <template #icon><Copy :size="12" /></template>
                        {{ copied ? '已复制' : '复制' }}
                      </NButton>
                    </div>
                  </div>

                  <!-- 充值防跨错网络安全预警 -->
                  <div class="qr-security-warning">
                    <ShieldAlert :size="14" class="warning-icon" />
                    <span class="warning-text">
                      请务必确认充值转账网络为 <strong>{{ depositNetwork.toUpperCase() }}</strong>，且仅支持充值 <strong>{{ currentDepositOrder.tokenSymbol || selectedTokenSymbol }}</strong>。请勿充入其他币种或错误网络。
                    </span>
                  </div>
                </div>

                <!-- 手动核验提交区 -->
                <div class="verify-section-box" style="margin-top: 14px;">
                  <!-- 场景 A: 提交 TxHash -->
                  <div class="verify-scenario-item">
                    <span class="scenario-label">场景 A：转账后已获得交易 Hash (txHash)</span>
                    <div style="display: flex; gap: 8px; margin-top: 6px;">
                      <NInput
                        v-model:value="txHashInput"
                        placeholder="输入链上交易 Hash (0x...)"
                        size="small"
                      />
                      <NButton
                        type="primary"
                        size="small"
                        :loading="isConfirmingTx"
                        @click="handleConfirmWithTxHash"
                      >
                        核验入账
                      </NButton>
                    </div>
                  </div>

                  <!-- 场景 B: 交易所提现无 TxHash 智能对账 -->
                  <div class="verify-scenario-item" style="margin-top: 8px;">
                    <span class="scenario-label">场景 B：外部交易所提现无 txHash？</span>
                    <div style="display: flex; gap: 8px; margin-top: 6px;">
                      <NInput
                        v-model:value="fromAddressInput"
                        placeholder="付款方来源公钥地址 (选填)"
                        size="small"
                      />
                      <NButton
                        type="default"
                        size="small"
                        :loading="isScanningTx"
                        @click="handleScanMatchWithoutTxHash"
                      >
                        智能探测入账
                      </NButton>
                    </div>
                  </div>

                  <div v-if="verificationResult" style="margin-top: 12px;">
                    <div class="withdraw-success-card">
                      <div class="res-top">
                        <span class="res-title">
                          <CheckCircle2 :size="15" class="text-success" />
                          链上核验与入账完成
                        </span>
                        <NTag type="success" size="tiny" round>CONFIRMED</NTag>
                      </div>
                      <p class="res-desc">
                        实际到账 <strong>{{ verificationResult.amount || verificationResult.actualAmount }} {{ verificationResult.tokenSymbol }}</strong> 已成功增加至您的账户余额。
                      </p>
                      <div v-if="verificationResult.txHash" class="res-hash-row">
                        <span>交易凭证: <span class="mono-text">{{ formatAddr(verificationResult.txHash) }}</span></span>
                        <a
                          :href="getExplorerTxUrl(depositNetwork, verificationResult.txHash)"
                          target="_blank"
                          class="clean-link"
                        >
                          <span>区块浏览器</span>
                          <ExternalLink :size="12" />
                        </a>
                      </div>
                      <div v-if="verificationResult.newBalance" class="res-vault-row">
                        <span>最新可用资产: </span>
                        <span class="res-balance-text">{{ verificationResult.newBalance }} {{ verificationResult.tokenSymbol }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 底部快捷切回插件支付 -->
                <div class="switch-method-bar">
                  <span class="switch-hint">已安装桌面端浏览器插件？</span>
                  <button class="switch-link-btn" @click="depositTab = 'wallet'">
                    <ArrowDownLeft :size="13" />
                    <span>切换至一键加签支付</span>
                  </button>
                </div>
              </div>
            </NTabPane>
          </NTabs>
        </div>
      </div>
    </NModal>

    <!-- 多链资产提现出金模态窗 (Withdraw Modal) -->
    <NModal
      v-model:show="showWithdrawModal"
      preset="card"
      title="多链代币提现出金"
      style="max-width: 580px; background: #0f172a; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 14px;"
      :bordered="false"
    >
      <div class="clean-modal-content">
        <div class="form-grid">
          <div class="form-item">
            <label class="form-label">提现公链</label>
            <NSelect
              v-model:value="withdrawNetwork"
              :options="networkOptions"
              placeholder="选择公链"
            />
          </div>
          <div class="form-item">
            <label class="form-label">提现代币 (Token)</label>
            <NSelect
              v-model:value="withdrawTokenSymbol"
              :options="tokenOptions"
              placeholder="选择代币"
            />
          </div>
        </div>

        <div class="form-item" style="margin-top: 14px;">
          <div class="label-with-hint">
            <label class="form-label">提现金额</label>
            <span class="hint-balance">
              当前可用资产: <strong class="text-white">{{ currentTokenAvailableBalance }}</strong> {{ withdrawTokenSymbol }}
            </span>
          </div>
          <div style="display: flex; gap: 8px;">
            <NInput
              v-model:value="withdrawAmount"
              placeholder="输入提取数量"
            />
            <NButton secondary @click="setMaxWithdrawAmount">
              全部提取
            </NButton>
          </div>
        </div>

        <div class="form-item" style="margin-top: 14px;">
          <div class="label-with-hint">
            <label class="form-label">接收钱包公钥地址</label>
            <button class="link-btn" @click="fillCurrentAddress">
              填入当前连接钱包
            </button>
          </div>
          <NInput
            v-model:value="withdrawToAddress"
            placeholder="输入目标链公钥地址 (0x... / T... / Solana)"
          />
        </div>

        <div class="withdraw-submit-box" style="margin-top: 20px;">
          <NButton
            type="primary"
            block
            size="large"
            :loading="isWithdrawing"
            @click="handleExecuteWithdraw"
            style="font-weight: 600;"
          >
            <template #icon><ArrowUpRight :size="16" /></template>
            确认发起提现 (由服务端出资金库转账)
          </NButton>
        </div>

        <!-- 提现全盘链路实时进度面板 -->
        <div v-if="isWithdrawing || withdrawResult || withdrawError" class="pipeline-progress-container">
          <div class="pipeline-header">
            <span class="pipeline-title">提现全盘链路状态追踪 (Withdrawal Pipeline)</span>
            <NTag :type="withdrawError ? 'error' : (withdrawResult ? 'success' : 'info')" size="tiny" round>
              {{ withdrawError ? '出金受阻·资金已回滚' : (withdrawResult ? '全链路出资达成' : '多阶段执行中') }}
            </NTag>
          </div>

          <!-- 6-Stage Progress Steps -->
          <div class="pipeline-steps-list">
            <div
              v-for="(st, idx) in withdrawStepsDisplay"
              :key="idx"
              class="pipeline-step-item"
              :class="{
                'is-done': st.status === 'SUCCESS',
                'is-active': st.status === 'PROCESSING',
                'is-failed': st.status === 'FAILED',
                'is-pending': st.status === 'PENDING'
              }"
            >
              <div class="step-icon-badge">
                <Check v-if="st.status === 'SUCCESS'" :size="12" />
                <span v-else-if="st.status === 'FAILED'" class="failed-x">✕</span>
                <NSpin v-else-if="st.status === 'PROCESSING'" :size="10" />
                <span v-else class="pending-num">{{ idx + 1 }}</span>
              </div>
              <div class="step-info">
                <div class="step-line-title">
                  <span class="step-name">{{ st.name }}</span>
                  <span class="step-status-tag" :class="st.status.toLowerCase()">
                    {{ st.status === 'SUCCESS' ? '已达成' : st.status === 'PROCESSING' ? '处理中' : st.status === 'FAILED' ? '异常阻断' : '等待' }}
                  </span>
                </div>
                <div v-if="st.detail" class="step-detail mono-text">
                  {{ st.detail }}
                </div>
              </div>
            </div>
          </div>

          <!-- 提现成功结果卡片 -->
          <div v-if="withdrawResult" class="withdraw-success-card">
            <div class="res-top">
              <span class="res-title">
                <CheckCircle2 :size="15" class="text-success" />
                链上转账出款已广播成功
              </span>
              <NTag type="success" size="tiny" round>CONFIRMED</NTag>
            </div>
            <p class="res-desc">
              系统已从出资金库向您的接收地址划转 <strong>{{ withdrawResult.amount }} {{ withdrawResult.tokenSymbol }}</strong>。
            </p>
            <div class="res-hash-row">
              <span>交易 Hash: <span class="mono-text">{{ formatAddr(withdrawResult.txHash) }}</span></span>
              <a
                :href="getExplorerTxUrl(withdrawNetwork, withdrawResult.txHash)"
                target="_blank"
                class="clean-link"
              >
                <span>查看区块浏览器</span>
                <ExternalLink :size="12" />
              </a>
            </div>
            <div v-if="withdrawResult.fromVault" class="res-vault-row">
              <span>出资热金库: <span class="mono-text">{{ formatAddr(withdrawResult.fromVault) }}</span></span>
              <span v-if="withdrawResult.remainingBalance" class="res-balance-text">
                剩余可用: {{ withdrawResult.remainingBalance }} {{ withdrawResult.tokenSymbol }}
              </span>
            </div>
          </div>

          <!-- 提现失败卡片 (包含原路全额退款补偿证明) -->
          <div v-if="withdrawError" class="withdraw-failed-card">
            <div class="res-top">
              <span class="res-title text-error">
                <AlertCircle :size="15" />
                提现流程阻断
              </span>
              <NTag type="error" size="tiny" round>FAILED & REFUNDED</NTag>
            </div>
            <p class="res-desc text-error">
              {{ withdrawError }}
            </p>
            <div class="rollback-note">
              资金安全保障：系统已自动触发原子补偿机制，扣减资金已全额原路退还至您的账户。
            </div>
          </div>
        </div>

        <!-- 历史提现记录 -->
        <div v-if="userWithdrawals.length > 0" class="history-list-box">
          <span class="history-title">最近提现记录</span>
          <div class="history-items">
            <div
              v-for="w in userWithdrawals.slice(0, 5)"
              :key="w.id"
              class="history-row"
            >
              <div class="h-left">
                <span class="chain-tag" :class="w.network.toLowerCase()">{{ w.network }}</span>
                <span class="h-amount mono-text">-{{ w.amount }} {{ w.tokenSymbol }}</span>
              </div>
              <span class="h-addr mono-text">{{ formatAddr(w.txHash || w.toAddress) }}</span>
              <NTag size="tiny" :type="w.status === 'CONFIRMED' ? 'success' : 'info'" round>
                {{ w.status }}
              </NTag>
            </div>
          </div>
        </div>
      </div>
    </NModal>
  </div>
</template>

<style scoped>
.clean-dapp-container {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

/* 1. 欢迎看板 (未连接) */
.welcome-card {
  padding: 48px 40px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}

.welcome-main {
  max-width: 680px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.welcome-title {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #f8fafc;
  margin: 0;
  line-height: 1.25;
}

.welcome-desc {
  font-size: 14px;
  line-height: 1.65;
  color: #94a3b8;
  margin: 0;
}

.welcome-actions {
  margin-top: 8px;
}

.clean-action-btn {
  font-weight: 600;
  padding: 0 24px;
}

.supported-wallets-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: wrap;
}

.bar-label {
  font-size: 12px;
  color: #64748b;
}

.wallet-pills {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.wallet-pill {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  color: #cbd5e1;
}

/* 2. 个人中枢看板 */
.portfolio-dashboard {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.master-account-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  flex-wrap: wrap;
  gap: 20px;
}

.account-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.account-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.role-badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #3b82f6;
}

.chain-count-badge {
  font-size: 11px;
  color: #64748b;
  padding: 1px 8px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 4px;
}

.account-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-id-text {
  font-size: 18px;
  font-weight: 600;
  color: #f8fafc;
}

.icon-copy-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-copy-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
}

.primary-wallet-hint {
  font-size: 12px;
  color: #64748b;
}

/* 板块通用布局 */
.section-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.clean-section-title {
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.2px;
}

.title-sub {
  font-size: 12px;
  color: #64748b;
}

.counter-text {
  font-size: 12px;
  color: #64748b;
}

/* 资产网格 */
.balances-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.balance-clean-card {
  padding: 16px 18px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: border-color 0.15s;
}

.balance-clean-card:hover {
  border-color: rgba(255, 255, 255, 0.16);
}

.b-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chain-tag {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}

.chain-tag.ethereum, .chain-tag.evm {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
}

.chain-tag.tron {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}

.chain-tag.solana {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.1);
}

.chain-tag.bsc {
  color: #fbbf24;
  background: rgba(245, 158, 11, 0.1);
}

.token-tag {
  font-size: 11px;
  font-weight: 600;
  color: #f8fafc;
}

.b-card-middle {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.b-amount {
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
}

.b-symbol {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.b-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.b-contract {
  font-size: 11px;
  color: #64748b;
}

.b-actions {
  display: flex;
  gap: 6px;
}

.b-btn-deposit, .b-btn-withdraw {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: #cbd5e1;
  cursor: pointer;
  transition: all 0.15s;
}

.b-btn-deposit:hover {
  background: #3b82f6;
  border-color: #3b82f6;
  color: #fff;
}

.b-btn-withdraw:hover {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.empty-state-card {
  padding: 32px 24px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-text {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

/* 绑定地址表格卡片 */
.wallets-table-card {
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.wallet-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 13px;
}

.wallet-row:last-child {
  border-bottom: none;
}

.w-row-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.w-address {
  font-size: 13px;
  color: #e2e8f0;
}

.w-row-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.w-date {
  font-size: 11px;
  color: #64748b;
}

.icon-action-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 4px;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-action-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.08);
}

.icon-action-btn.text-danger:hover {
  color: #ef4444;
}

/* 网络矩阵 */
.networks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.network-clean-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.net-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.net-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.net-dot.is-paused {
  background: #f59e0b;
}

.net-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.net-meta {
  font-size: 11px;
  color: #64748b;
}

.net-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.net-symbol {
  font-size: 11px;
  color: #94a3b8;
}

/* 4. 开发者诊断抽屉 */
.dev-drawer-container {
  margin-top: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: #0b1120;
  overflow: hidden;
}

.dev-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.02);
  user-select: none;
  transition: background 0.15s;
}

.dev-drawer-header:hover {
  background: rgba(255, 255, 255, 0.04);
}

.dev-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dev-icon {
  color: #64748b;
}

.dev-title {
  font-size: 13px;
  font-weight: 600;
  color: #cbd5e1;
}

.dev-badge {
  font-size: 11px;
  color: #64748b;
  font-family: 'JetBrains Mono', monospace;
}

.dev-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #64748b;
}

.dev-drawer-content {
  padding: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dev-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dev-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dev-card-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
}

.dev-users-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.dev-user-row {
  padding: 10px 14px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dev-user-row.is-active-session {
  border-color: rgba(59, 130, 246, 0.4);
}

.dev-u-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.dev-u-wallets {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.dev-wallet-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 4px;
}

.terminal-view {
  background: #070a12;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px;
  max-height: 200px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.term-empty-text {
  color: #64748b;
  padding: 8px 0;
}

.terminal-row {
  display: flex;
  gap: 8px;
  line-height: 1.6;
}

.term-time {
  color: #64748b;
}

.term-tag {
  color: #3b82f6;
  font-weight: 600;
}

.term-msg {
  color: #cbd5e1;
}

.terminal-row.error .term-tag {
  color: #ef4444;
}

.terminal-row.success .term-tag {
  color: #10b981;
}

.clear-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.clear-btn:hover {
  color: #f8fafc;
}

/* 模态框通用 */
.clean-modal-content {
  display: flex;
  flex-direction: column;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.label-with-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.hint-balance {
  font-size: 11px;
  color: #64748b;
}

.text-white {
  color: #f8fafc;
}

.text-success {
  color: #10b981;
}

.link-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}

.link-btn:hover {
  text-decoration: underline;
}

.clean-tab-content {
  padding-top: 12px;
}

.pay-method-intro {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px 14px;
}

.pay-intro-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  display: block;
  margin-bottom: 4px;
}

.pay-intro-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0;
}

.progress-box {
  margin-top: 16px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 16px;
}

.progress-box-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.progress-box-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.tx-hash-row {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
}

.clean-link {
  color: #3b82f6;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  text-decoration: none;
}

.clean-link:hover {
  text-decoration: underline;
}

/* 手动与扫码充值展示 */
.manual-deposit-box {
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.qr-showcase-panel {
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qr-panel-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qr-net-tag-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qr-token-name {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.qr-timer-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 8px;
  border-radius: 4px;
}

.qr-display-stage {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 6px 0;
}

.qr-frame-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  line-height: 0;
}

/* 四角高精对齐刻度 */
.frame-corner {
  position: absolute;
  width: 12px;
  height: 12px;
  border-color: rgba(59, 130, 246, 0.7);
  pointer-events: none;
}

.corner-tl {
  top: 0;
  left: 0;
  border-top: 2px solid;
  border-left: 2px solid;
  border-top-left-radius: 5px;
}

.corner-tr {
  top: 0;
  right: 0;
  border-top: 2px solid;
  border-right: 2px solid;
  border-top-right-radius: 5px;
}

.corner-bl {
  bottom: 0;
  left: 0;
  border-bottom: 2px solid;
  border-left: 2px solid;
  border-bottom-left-radius: 5px;
}

.corner-br {
  bottom: 0;
  right: 0;
  border-bottom: 2px solid;
  border-right: 2px solid;
  border-bottom-right-radius: 5px;
}

.qr-canvas-holder {
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  line-height: 0;
}

/* 消除 Naive UI 二维码在全局 box-sizing 下的偏移 */
:deep(.n-qr-code) {
  box-sizing: content-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 0 !important;
}

:deep(.n-qr-code canvas) {
  display: block !important;
}

.qr-center-pill {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #ffffff;
  border: 2px solid #090d16;
  border-radius: 6px;
  padding: 3px 7px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  line-height: 1;
}

.qr-center-text {
  font-size: 10px;
  font-weight: 800;
  color: #090d16;
  font-family: 'JetBrains Mono', monospace;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.qr-scan-guide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
}

.guide-icon {
  color: #3b82f6;
  flex-shrink: 0;
}

.qr-address-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
}

.qr-addr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qr-addr-title {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.explorer-addr-link {
  font-size: 11px;
  color: #3b82f6;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.explorer-addr-link:hover {
  text-decoration: underline;
}

.qr-addr-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.qr-full-address {
  font-size: 12px;
  color: #f1f5f9;
  word-break: break-all;
}

.qr-security-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(245, 158, 11, 0.06);
  border: 1px solid rgba(245, 158, 11, 0.16);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 11px;
  line-height: 1.5;
  color: #f59e0b;
}

.warning-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

.warning-text {
  flex: 1;
}

.verify-section-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.verify-scenario-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 10px 12px;
}

.scenario-label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.switch-method-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-top: 10px;
  font-size: 12px;
}

.switch-hint {
  color: #64748b;
}

.switch-link-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 0;
}

.switch-link-btn:hover {
  text-decoration: underline;
}

.d-loading-wrapper {
  padding: 40px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.d-loading-text {
  font-size: 12px;
  color: #94a3b8;
}

/* 提现结果 */
.withdraw-success-card {
  margin-top: 16px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 10px;
  padding: 14px;
}

.res-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.res-title {
  font-size: 13px;
  font-weight: 600;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 6px;
}

.res-desc {
  font-size: 12px;
  color: #cbd5e1;
  margin: 0;
  line-height: 1.5;
}

.res-hash-row {
  margin-top: 8px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
}

.res-vault-row {
  margin-top: 6px;
  font-size: 11px;
  color: #94a3b8;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.res-balance-text {
  color: #38bdf8;
  font-weight: 500;
}

/* 提现全盘链路进度监控 */
.pipeline-progress-container {
  margin-top: 18px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
}

.pipeline-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.pipeline-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
}

.pipeline-steps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pipeline-step-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  transition: all 0.2s ease;
}

.pipeline-step-item.is-done {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.04);
}

.pipeline-step-item.is-active {
  border-color: rgba(59, 130, 246, 0.4);
  background: rgba(59, 130, 246, 0.06);
}

.pipeline-step-item.is-failed {
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.06);
}

.step-icon-badge {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  margin-top: 2px;
}

.is-done .step-icon-badge {
  background: #10b981;
  color: #fff;
}

.is-active .step-icon-badge {
  background: #3b82f6;
  color: #fff;
}

.is-failed .step-icon-badge {
  background: #ef4444;
  color: #fff;
}

.is-pending .step-icon-badge {
  background: #1e293b;
  color: #64748b;
}

.step-info {
  flex: 1;
  min-width: 0;
}

.step-line-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.step-name {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.is-pending .step-name {
  color: #64748b;
}

.step-status-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.step-status-tag.success {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.step-status-tag.processing {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.1);
}

.step-status-tag.failed {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.step-status-tag.pending {
  color: #64748b;
  background: rgba(255, 255, 255, 0.04);
}

.step-detail {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 3px;
  word-break: break-all;
  line-height: 1.4;
}

.withdraw-failed-card {
  margin-top: 12px;
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: 10px;
  padding: 14px;
}

.rollback-note {
  margin-top: 8px;
  padding: 8px 10px;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 6px;
  font-size: 11px;
  color: #93c5fd;
  line-height: 1.4;
}

.history-list-box {
  margin-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 14px;
}

.history-title {
  font-size: 12px;
  font-weight: 600;
  color: #94a3b8;
  display: block;
  margin-bottom: 8px;
}

.history-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 140px;
  overflow-y: auto;
}

.history-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #090d16;
  border-radius: 6px;
  font-size: 11px;
}

.h-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.h-amount {
  font-weight: 600;
  color: #f8fafc;
}

.h-addr {
  color: #64748b;
}

@media (max-width: 640px) {
  .welcome-card {
    padding: 24px 20px;
  }
  .welcome-title {
    font-size: 22px;
  }
  .master-account-card {
    padding: 16px;
  }
  .account-id-row {
    flex-wrap: wrap;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .wallet-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}
</style>
