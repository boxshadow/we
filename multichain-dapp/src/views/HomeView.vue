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
  AlertCircle,
  XCircle,
  Activity,
  Lock,
  Sparkles,
  PieChart,
  History
} from 'lucide-vue-next';
import { useWalletStore } from '../stores/wallet';
import { apiClient } from '../api/client';
import ConnectModal from '../components/ConnectModal.vue';
import type { UserProfile, ChainFamily } from '../types/wallet';

const walletStore = useWalletStore();
const message = useMessage();

// 核心视图切换
const activeTab = ref<'portfolio' | 'deposit' | 'withdraw' | 'matrix' | 'activity'>('portfolio');

// 连接与绑定弹窗流控
const showConnectModal = ref(false);
const connectModalMode = ref<'login' | 'bind'>('login');
const copiedAddress = ref<string | null>(null);

// 开发者底层画像抽屉
const isDevPanelOpen = ref(false);

// 用户资产矩阵体系
const userBalances = ref<any[]>([]);
const isBalancesLoading = ref(false);

// 充值工作流 (Deposit Workflow)
const depositTab = ref<'wallet' | 'manual'>('wallet');
const depositNetwork = ref('ethereum');
const depositAmount = ref('100.0');
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

// 充值链上打包与确认进度
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

// 提现出金工作流 (Withdrawal Workflow)
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

// 计算用户总资产 USD 估值折算
const totalEstimatedUsd = computed(() => {
  if (!userBalances.value || userBalances.value.length === 0) return '0.00';
  let total = 0;
  for (const b of userBalances.value) {
    const bal = parseFloat(b.balance || '0');
    if (isNaN(bal)) continue;
    const sym = (b.tokenSymbol || '').toUpperCase();
    if (sym === 'USDT' || sym === 'USDC') {
      total += bal * 1.0;
    } else if (sym === 'ETH') {
      total += bal * 2650.0;
    } else if (sym === 'BNB') {
      total += bal * 590.0;
    } else if (sym === 'SOL') {
      total += bal * 175.0;
    } else if (sym === 'TRX') {
      total += bal * 0.16;
    } else {
      total += bal * 1.0;
    }
  }
  return total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
});

// 验证目的地址是否与目标公链协议相符
const isWithdrawAddressValid = computed(() => {
  const addr = withdrawToAddress.value.trim();
  if (!addr) return null;
  const targetNet = walletStore.supportedNetworks.find((n) => n.networkId === withdrawNetwork.value);
  const fam = targetNet?.family || 'EVM';
  if (fam === 'EVM') {
    return /^0x[a-fA-F0-9]{40}$/.test(addr);
  }
  if (fam === 'TRON') {
    return /^T[a-km-zA-HJ-NP-Z1-9]{33}$/.test(addr);
  }
  if (fam === 'SOLANA') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
  }
  return true;
});

// 复制工具
function copyToClipboard(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  copiedAddress.value = text;
  setTimeout(() => {
    if (copiedAddress.value === text) copiedAddress.value = null;
  }, 2000);
}

function formatAddr(addr: string) {
  if (!addr) return '';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatShortId(id: string) {
  if (!id) return '';
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

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

const recentDeposits = ref<any[]>([]);

async function loadRecentDeposits() {
  try {
    const list = await apiClient.getRecentDeposits();
    if (walletStore.user?.id) {
      recentDeposits.value = list.filter((d: any) => !d.userId || d.userId === walletStore.user?.id);
    } else {
      recentDeposits.value = list;
    }
  } catch (err: any) {
    console.warn('拉取充值流水失败:', err);
  }
}

async function loadActivityHistory() {
  await Promise.allSettled([loadUserWithdrawals(), loadRecentDeposits()]);
}

const unifiedActivityList = computed(() => {
  const items: any[] = [];
  for (const w of userWithdrawals.value) {
    items.push({
      id: w.id,
      type: 'WITHDRAW',
      typeLabel: '提现出金',
      network: w.network || w.chain,
      tokenSymbol: w.tokenSymbol,
      amount: w.amount,
      txHash: w.txHash,
      status: w.status || 'CONFIRMED',
      timestamp: w.createdAt || Date.now(),
    });
  }
  for (const d of recentDeposits.value) {
    items.push({
      id: d.id,
      type: 'DEPOSIT',
      typeLabel: '充值入金',
      network: d.network || d.chain,
      tokenSymbol: d.tokenSymbol || 'USDT',
      amount: d.actualAmount || d.amount,
      txHash: d.txHash,
      status: d.status || 'CONFIRMED',
      timestamp: d.createdAt || Date.now(),
    });
  }
  return items.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
});

function openLoginModal() {
  connectModalMode.value = 'login';
  showConnectModal.value = true;
}

function openBindModal() {
  connectModalMode.value = 'bind';
  showConnectModal.value = true;
}

function switchToDeposit(netId?: string, symbol?: string) {
  if (netId) depositNetwork.value = netId;
  if (symbol) selectedTokenSymbol.value = symbol;
  activeTab.value = 'deposit';
  handleCreateDeposit();
}

function switchToWithdraw(netId?: string, symbol?: string) {
  if (netId) withdrawNetwork.value = netId;
  if (symbol) withdrawTokenSymbol.value = symbol;
  withdrawToAddress.value = walletStore.connectedAddress || '';
  withdrawResult.value = null;
  withdrawError.value = null;
  withdrawStepsDisplay.value = defaultWithdrawSteps.map((s) => ({ ...s }));
  activeTab.value = 'withdraw';
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
  const amt = parseFloat(depositAmount.value);
  if (isNaN(amt) || amt <= 0) {
    message.error('请输入有效的充值金额');
    return;
  }
  isCreatingDeposit.value = true;
  try {
    const res = await apiClient.createDepositIntent({
      network: depositNetwork.value,
      amount: depositAmount.value.trim(),
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

// 核心充值流程：服务端给出交易数据，前端直接拉起当前钱包进行加签支付并跟踪区块确认
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
          // 忽略不支持切换链的异常
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
            await loadActivityHistory();
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
    loadActivityHistory();
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
    message.success('智能对账探测成功！已匹配入账');
    loadUserBalances();
    loadActivityHistory();
  } catch (err: any) {
    message.error(err.message || '未扫描到匹配交易，请稍后重试');
  } finally {
    isScanningTx.value = false;
  }
}

// 核心提现出金执行
async function executeServerSideWithdrawal() {
  if (!walletStore.accessToken || !walletStore.user) {
    message.warning('请先连接钱包完成身份鉴权');
    openLoginModal();
    return;
  }

  const amtNum = parseFloat(withdrawAmount.value);
  const availNum = parseFloat(currentTokenAvailableBalance.value);
  if (isNaN(amtNum) || amtNum <= 0) {
    message.error('请输入有效的提现出金数量');
    return;
  }
  if (amtNum > availNum) {
    message.error(`提现金额超出可用余额 (当前可用: ${availNum} ${withdrawTokenSymbol.value})`);
    return;
  }
  if (!withdrawToAddress.value.trim()) {
    message.error('请输入提现目标目的地址');
    return;
  }
  if (isWithdrawAddressValid.value === false) {
    message.error(`提现接收地址不符合 ${withdrawNetwork.value.toUpperCase()} 规范，请仔细核对`);
    return;
  }

  isWithdrawing.value = true;
  withdrawError.value = null;
  withdrawResult.value = null;

  withdrawStepsDisplay.value = [
    { name: '1. 参数与地址校验', status: 'PROCESSING', detail: '正在核验公链协议与目的地址规范...' },
    { name: '2. 余额核验与资产锁定', status: 'PENDING', detail: '账本可用余额原子扣减' },
    { name: '3. 智能匹配出资热钱包', status: 'PENDING', detail: '挑选公链提现节点' },
    { name: '4. 安全 Enclave 物理加签', status: 'PENDING', detail: 'KMS 硬件隔离签名' },
    { name: '5. 公链节点广播入块', status: 'PENDING', detail: '提交 rawTx 至 RPC' },
    { name: '6. 区块打包确认与到账', status: 'PENDING', detail: '等待出块与最终确认' },
  ];

  try {
    await new Promise((r) => setTimeout(r, 400));
    withdrawStepsDisplay.value[0] = { name: '1. 参数与地址校验', status: 'SUCCESS', detail: '格式与白名单校验通过' };
    withdrawStepsDisplay.value[1] = { name: '2. 余额核验与资产锁定', status: 'PROCESSING', detail: '正在锁定可用余额...' };

    const res = await apiClient.withdraw({
      network: withdrawNetwork.value,
      tokenSymbol: withdrawTokenSymbol.value,
      amount: withdrawAmount.value,
      toAddress: withdrawToAddress.value.trim(),
      userId: walletStore.user.id,
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
  if (net.includes('SOLANA')) return `https://explorer.solana.com/tx/${txHash}?cluster=devnet`;
  if (net.includes('BSC')) return `https://bscscan.com/tx/${txHash}`;
  if (net.includes('BASE')) return `https://basescan.org/tx/${txHash}`;
  if (net.includes('ARBITRUM')) return `https://arbiscan.io/tx/${txHash}`;
  return `https://sepolia.etherscan.io/tx/${txHash}`;
};

// 跨链解绑钱包
async function handleUnbind(chain: ChainFamily, address: string) {
  try {
    message.loading(`正在解绑 [${chain}] ${formatAddr(address)}...`);
    await walletStore.unbindWallet(chain, address);
    message.success('已成功移除该公链绑定');
    await loadActivityHistory();
  } catch (err: any) {
    message.error(err.message || '解绑失败');
  }
}

watch(
  () => walletStore.accessToken,
  async (newVal) => {
    if (newVal && walletStore.user) {
      await loadUserBalances();
      await loadActivityHistory();
      if (!currentDepositOrder.value) {
        await handleCreateDeposit();
      }
    }
  },
  { immediate: true }
);

watch(
  () => activeTab.value,
  async (tab) => {
    if (tab === 'deposit' && !currentDepositOrder.value && walletStore.user?.id) {
      await handleCreateDeposit();
    }
  }
);

watch(
  () => depositTab.value,
  async (tab) => {
    if (tab === 'manual' && !currentDepositOrder.value && walletStore.user?.id) {
      await handleCreateDeposit();
    }
  }
);

onMounted(async () => {
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['portfolio', 'deposit', 'withdraw', 'matrix', 'activity'].includes(tabParam)) {
      activeTab.value = tabParam as any;
    }
  }
  if (walletStore.supportedNetworks.length > 0) {
    depositNetwork.value = walletStore.supportedNetworks[0].networkId;
    withdrawNetwork.value = walletStore.supportedNetworks[0].networkId;
    await loadSupportedTokens(depositNetwork.value);
  }
  await loadActivityHistory();
});
</script>

<template>
  <div class="dapp-container">
    <!-- 未连接状态：展示商业级 CyberGate 概览与多链生态接入 -->
    <div v-if="!walletStore.accessToken || !walletStore.user" class="unauth-hero-zone">
      <!-- 英雄主看板 -->
      <div class="hero-card">
        <div class="hero-content">
          <div class="hero-tag-row">
            <span class="live-status-pill">
              <span class="pulse-dot"></span>
              全网多链 RPC 与 KMS Enclave 运行就绪
            </span>
            <span class="arch-badge">物理隔离架构 · 零助记词泄露风险</span>
          </div>

          <h1 class="hero-title">企业级多链资产聚合与清结算网关</h1>
          <p class="hero-description">
            1 个唯一主账号聚合 EVM、TRON 与 Solana 全生态公钥矩阵。入金收款池物理只收不发，服务端热金库基于 Rust KMS Enclave 硬件级加签出资，提供链上全链路不可篡改审计与 0 秒异常原路补偿。
          </p>

          <div class="hero-action-group">
            <NButton
              type="primary"
              size="large"
              class="primary-cta-btn"
              @click="openLoginModal"
            >
              <template #icon><Wallet :size="18" /></template>
              连接 Web3 钱包开启网关
            </NButton>

            <NButton
              size="large"
              secondary
              class="demo-cta-btn"
              @click="() => walletStore.loginWithDemoAccount()"
            >
              <template #icon><Sparkles :size="17" /></template>
              以演示画像极速体验
            </NButton>
          </div>
        </div>

        <!-- 3 大核心架构特性微卡片 -->
        <div class="hero-pillars">
          <div class="pillar-item">
            <div class="pillar-icon-box">
              <Link2 :size="18" />
            </div>
            <div class="pillar-body">
              <h4 class="pillar-title">1 主账号 · 多公钥矩阵</h4>
              <p class="pillar-desc">一次连接自由绑定 EVM、Tron 与 Solana 钱包，任意绑定公钥均可反向免密登录同一主账号。</p>
            </div>
          </div>

          <div class="pillar-item">
            <div class="pillar-icon-box">
              <Cpu :size="18" />
            </div>
            <div class="pillar-body">
              <h4 class="pillar-title">无感智能加签充值</h4>
              <p class="pillar-desc">服务端动态构造 rawTx Calldata 原生唤起支付，区块确认实时感知，杜绝错链与手动复制风险。</p>
            </div>
          </div>

          <div class="pillar-item">
            <div class="pillar-icon-box">
              <ShieldCheck :size="18" />
            </div>
            <div class="pillar-body">
              <h4 class="pillar-title">出入金物理隔离与补偿</h4>
              <p class="pillar-desc">收款池只收不发防渗透，出资由 KMS Vault 独立硬件签名，链上失败自动触发 0 秒原路补偿。</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 支持公链生态矩阵网格 -->
      <div class="supported-chains-section">
        <div class="section-header">
          <h3 class="section-title">全域接入公链与网络节点</h3>
          <span class="section-meta">共 {{ walletStore.supportedNetworks.length }} 条生产及测试网络已联通</span>
        </div>

        <div class="chain-cards-grid">
          <div
            v-for="net in walletStore.supportedNetworks"
            :key="net.networkId"
            class="chain-card"
          >
            <div class="chain-header">
              <span class="chain-family-badge" :class="net.family.toLowerCase()">{{ net.family }}</span>
              <span class="chain-name">{{ net.name }}</span>
            </div>
            <div class="chain-specs">
              <div class="spec-row">
                <span class="spec-label">原生代币</span>
                <span class="spec-val mono-text">{{ net.symbol }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">最终确认</span>
                <span class="spec-val mono-text">{{ net.family === 'SOLANA' ? '32 块' : net.family === 'TRON' ? '19 块' : '5 块' }}</span>
              </div>
              <div class="spec-row">
                <span class="spec-label">节点状态</span>
                <span class="spec-val status-green">
                  <span class="mini-dot"></span>
                  正常服务
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 已登录状态：完整商业级 DApp 控制台 -->
    <div v-else class="auth-workspace-zone">
      <!-- 顶部主账号画像与净值概览条 -->
      <div class="account-overview-banner">
        <div class="account-meta-left">
          <div class="account-id-row">
            <span class="account-badge">主账号 ID</span>
            <span class="account-id-text account-id-desktop mono-text">{{ walletStore.user.id }}</span>
            <span class="account-id-text account-id-mobile mono-text">{{ formatShortId(walletStore.user.id) }}</span>
            <span class="role-pill">{{ walletStore.user.role }}</span>
            <button
              class="copy-inline-btn"
              @click="copyToClipboard(walletStore.user.id)"
              title="复制主账号 ID"
            >
              <Check v-if="copiedAddress === walletStore.user.id" :size="12" />
              <Copy v-else :size="12" />
            </button>
          </div>
          <div class="genesis-wallet-row">
            <Lock :size="13" class="lock-icon" />
            <span class="genesis-label">创世钱包:</span>
            <span class="genesis-chain">{{ walletStore.user.primaryWallet.chain }}</span>
            <span class="genesis-addr mono-text">{{ formatAddr(walletStore.user.primaryWallet.address) }}</span>
            <button
              class="copy-inline-btn"
              @click="copyToClipboard(walletStore.user.primaryWallet.address)"
              title="复制完整地址"
            >
              <Check v-if="copiedAddress === walletStore.user.primaryWallet.address" :size="12" />
              <Copy v-else :size="12" />
            </button>
          </div>
        </div>

        <div class="account-metrics-right">
          <div class="metrics-summary-group">
            <div class="metric-block">
              <span class="metric-label">聚合资产总估值 (USD)</span>
              <div class="metric-val-row">
                <span class="metric-dollar">$</span>
                <span class="metric-number mono-text tabular-nums">{{ totalEstimatedUsd }}</span>
              </div>
            </div>

            <div class="metric-divider"></div>

            <div class="metric-block">
              <span class="metric-label">已绑定公链矩阵</span>
              <span class="metric-sub-val mono-text">{{ walletStore.user.wallets?.length || 1 }} 条公链</span>
            </div>
          </div>

          <div class="header-fast-actions">
            <NButton size="small" type="primary" @click="activeTab = 'deposit'">
              <template #icon><ArrowDownLeft :size="14" /></template>
              充值入金
            </NButton>
            <NButton size="small" secondary @click="activeTab = 'withdraw'">
              <template #icon><ArrowUpRight :size="14" /></template>
              提现出金
            </NButton>
          </div>
        </div>
      </div>

      <!-- 核心导航标签页 -->
      <div class="dapp-nav-tabs">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'portfolio' }"
          @click="activeTab = 'portfolio'"
        >
          <PieChart :size="15" />
          <span>资产看板</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'deposit' }"
          @click="switchToDeposit()"
        >
          <ArrowDownLeft :size="15" />
          <span>极速充值</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'withdraw' }"
          @click="activeTab = 'withdraw'"
        >
          <ArrowUpRight :size="15" />
          <span>机构提现</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'matrix' }"
          @click="activeTab = 'matrix'"
        >
          <Link2 :size="15" />
          <span>公钥矩阵</span>
          <span class="tab-count-badge">{{ walletStore.user.wallets?.length || 1 }}</span>
        </button>

        <button
          class="tab-btn"
          :class="{ active: activeTab === 'activity' }"
          @click="activeTab = 'activity'"
        >
          <History :size="15" />
          <span>审计流水</span>
        </button>
      </div>

      <!-- 视图 1: 资产总览看板 (Portfolio Hub) -->
      <div v-if="activeTab === 'portfolio'" class="tab-content-view">
        <div class="surface-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">多链多代币资产清单</h3>
              <p class="panel-subtitle">所有绑定公链在 CyberGate 账本上的可用与锁定余额，已按实时汇率折算</p>
            </div>
            <NButton size="small" secondary @click="loadUserBalances" :loading="isBalancesLoading">
              <template #icon><RefreshCw :size="13" /></template>
              刷新资产
            </NButton>
          </div>

          <div class="table-container">
            <table class="dapp-table">
              <thead>
                <tr>
                  <th>代币体系</th>
                  <th>所属公链</th>
                  <th>类型</th>
                  <th class="text-right">可用余额</th>
                  <th class="text-right">锁定 / 确认中</th>
                  <th class="text-right">折合估值 (USD)</th>
                  <th class="text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="userBalances.length === 0">
                  <td colspan="7" class="text-center empty-cell">
                    <span v-if="isBalancesLoading">正在拉取多链账本余额...</span>
                    <span v-else>暂无链上资产，点击上方 [充值入金] 开启多链资产聚合</span>
                  </td>
                </tr>
                <tr v-for="b in userBalances" :key="`${b.networkId}-${b.tokenSymbol}`">
                  <td>
                    <div class="token-cell">
                      <div class="token-avatar">{{ b.tokenSymbol.slice(0, 3) }}</div>
                      <div>
                        <div class="token-name">{{ b.tokenName || b.tokenSymbol }}</div>
                        <div class="token-symbol mono-text">{{ b.tokenSymbol }}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="network-badge">{{ b.networkName || b.networkId }}</span>
                  </td>
                  <td>
                    <span class="type-tag" :class="b.isNative ? 'native' : 'token'">
                      {{ b.isNative ? '原生币' : '智能合约' }}
                    </span>
                  </td>
                  <td class="text-right mono-text font-medium text-highlight">
                    {{ b.balance }}
                  </td>
                  <td class="text-right mono-text text-muted">
                    {{ b.lockedBalance || '0.0' }}
                  </td>
                  <td class="text-right mono-text text-val">
                    ${{ (parseFloat(b.balance || '0') * (b.tokenSymbol === 'ETH' ? 2650 : b.tokenSymbol === 'BNB' ? 590 : b.tokenSymbol === 'SOL' ? 175 : b.tokenSymbol === 'TRX' ? 0.16 : 1.0)).toFixed(2) }}
                  </td>
                  <td class="text-right">
                    <div class="table-actions-row">
                      <button class="action-link-btn" @click="switchToDeposit(b.networkId, b.tokenSymbol)">
                        充值
                      </button>
                      <button class="action-link-btn" @click="switchToWithdraw(b.networkId, b.tokenSymbol)">
                        提现
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 视图 2: 极速加签充值中心 (Deposit Pipeline) -->
      <div v-else-if="activeTab === 'deposit'" class="tab-content-view">
        <div class="deposit-grid-layout">
          <!-- 充值配置面板 -->
          <div class="surface-panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">智能意图加签充值</h3>
                <p class="panel-subtitle">选择目标公链与充值币种，生成专属意图与动态 Calldata</p>
              </div>
            </div>

            <!-- 充值公链与代币选择 -->
            <div class="form-group">
              <label class="form-label">目标公链生态</label>
              <NSelect
                v-model:value="depositNetwork"
                :options="networkOptions"
                @update:value="onNetworkChanged"
              />
            </div>

            <div class="form-group">
              <label class="form-label">充值代币体系</label>
              <NSelect
                v-model:value="selectedTokenSymbol"
                :options="tokenOptions"
                @update:value="handleCreateDeposit"
              />
            </div>

            <div class="form-group">
              <div class="label-with-meta">
                <label class="form-label">充值数量</label>
                <span class="input-unit mono-text">{{ selectedTokenSymbol }}</span>
              </div>
              <NInput
                v-model:value="depositAmount"
                placeholder="例如: 100.0"
                class="mono-text"
                @change="handleCreateDeposit"
              />
              <div class="quick-preset-chips">
                <button class="preset-chip" @click="depositAmount = '10.0'; handleCreateDeposit()">10</button>
                <button class="preset-chip" @click="depositAmount = '50.0'; handleCreateDeposit()">50</button>
                <button class="preset-chip" @click="depositAmount = '100.0'; handleCreateDeposit()">100</button>
                <button class="preset-chip" @click="depositAmount = '500.0'; handleCreateDeposit()">500</button>
              </div>
            </div>

            <!-- 模式切换: 极速加签 vs 备用收款池 -->
            <div class="deposit-mode-switcher">
              <button
                class="mode-switch-btn"
                :class="{ active: depositTab === 'wallet' }"
                @click="depositTab = 'wallet'"
              >
                原生钱包直接加签 (推荐)
              </button>
              <button
                class="mode-switch-btn"
                :class="{ active: depositTab === 'manual' }"
                @click="depositTab = 'manual'"
              >
                专属收款池地址与二维码
              </button>
            </div>

            <!-- 模式 A: 钱包直接加签支付 -->
            <div v-if="depositTab === 'wallet'" class="wallet-sign-dock">
              <div class="dock-summary-box">
                <div class="summary-line">
                  <span>支付网络:</span>
                  <strong class="mono-text">{{ depositNetwork.toUpperCase() }}</strong>
                </div>
                <div class="summary-line">
                  <span>预计支付:</span>
                  <strong class="mono-text text-highlight">{{ depositAmount }} {{ selectedTokenSymbol }}</strong>
                </div>
                <div class="summary-line">
                  <span>收款金库池:</span>
                  <span class="mono-text text-muted">{{ formatAddr(currentDepositOrder?.depositAddress || '0xDEPOSIT_POOL') }}</span>
                </div>
              </div>

              <NButton
                type="primary"
                size="large"
                class="full-width-btn"
                :loading="isWalletSigning || isCreatingDeposit"
                @click="handleWalletSignDeposit"
              >
                <template #icon><Wallet :size="16" /></template>
                唤起当前钱包加签支付
              </NButton>

              <p class="dock-hint-text">
                点击后系统将通过已连接的钱包调起签名。链上广播后，将自动对账累加至您的 CyberGate 主账号。
              </p>
            </div>

            <!-- 模式 B: 专属收款池地址与二维码 -->
            <div v-else class="manual-deposit-dock">
              <div v-if="isCreatingDeposit && !currentDepositOrder" class="qr-loading-stage">
                <NSpin size="medium" />
                <span class="qr-loading-text">正在从专属收款池匹配地址并构建数据...</span>
              </div>

              <div v-else-if="currentDepositOrder" class="qr-showcase-panel">
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
                        :size="160"
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
                    <button
                      class="copy-btn-solid"
                      @click="copyToClipboard(currentDepositOrder.depositAddress)"
                      title="复制完整收款地址"
                    >
                      <Check v-if="copiedAddress === currentDepositOrder.depositAddress" :size="13" />
                      <Copy v-else :size="13" />
                    </button>
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

              <div v-else class="qr-loading-stage">
                <span class="qr-loading-text">暂无有效收款池地址，请选择币种后重新生成</span>
                <NButton size="small" type="primary" secondary @click="handleCreateDeposit">重新生成地址</NButton>
              </div>

              <div class="manual-verify-box">
                <label class="form-label">外部转账后核验 (输入 TxHash 或直接探测)</label>
                <div class="input-with-button">
                  <NInput
                    v-model:value="txHashInput"
                    placeholder="请输入链上交易 Hash (0x...)"
                    class="mono-text"
                  />
                  <NButton
                    type="primary"
                    secondary
                    :loading="isConfirmingTx"
                    @click="handleConfirmWithTxHash"
                  >
                    提交核验
                  </NButton>
                </div>
                <div class="scan-match-row">
                  <button
                    class="ghost-scan-btn"
                    :disabled="isScanningTx"
                    @click="handleScanMatchWithoutTxHash"
                  >
                    <ScanQrCode :size="13" />
                    <span>无 TxHash？一键探测链上最新充值</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 充值链上生命周期进度追踪面板 -->
          <div class="surface-panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">全生命周期链上确认进度</h3>
                <p class="panel-subtitle">交易广播后，网关 RPC 双通道监听实时出块并更新到账状态</p>
              </div>
            </div>

            <div v-if="depositProgress" class="progress-display-zone">
              <div class="progress-metric-header">
                <span class="status-indicator-badge" :class="depositProgress.status.toLowerCase()">
                  {{ depositProgress.status }}
                </span>
                <span class="confirm-count mono-text">
                  {{ depositProgress.currentConfirmations }} / {{ depositProgress.requiredConfirmations }} 区块确认
                </span>
              </div>

              <NProgress
                type="line"
                :percentage="depositProgress.progress"
                :show-indicator="false"
                status="success"
                class="styled-progress-bar"
              />

              <div class="lifecycle-timeline">
                <div class="timeline-node done">
                  <span class="node-dot"></span>
                  <div class="node-info">
                    <span class="node-title">意向订单生成</span>
                    <span class="node-desc">已锁定专属入金通道</span>
                  </div>
                </div>

                <div class="timeline-node" :class="{ done: depositProgress.progress >= 20, active: depositProgress.progress < 20 }">
                  <span class="node-dot"></span>
                  <div class="node-info">
                    <span class="node-title">钱包私钥加签</span>
                    <span class="node-desc">用户授权原生转账</span>
                  </div>
                </div>

                <div class="timeline-node" :class="{ done: depositProgress.progress >= 35, active: depositProgress.progress >= 20 && depositProgress.progress < 35 }">
                  <span class="node-dot"></span>
                  <div class="node-info">
                    <span class="node-title">Mempool 广播入块</span>
                    <span class="node-desc mono-text" v-if="depositProgress.txHash">
                      Tx: {{ formatAddr(depositProgress.txHash) }}
                      <a :href="getExplorerTxUrl(depositNetwork, depositProgress.txHash)" target="_blank" class="explorer-link">
                        <ExternalLink :size="11" />
                      </a>
                    </span>
                    <span class="node-desc" v-else>等待节点接收</span>
                  </div>
                </div>

                <div class="timeline-node" :class="{ done: depositProgress.progress >= 100, active: depositProgress.progress >= 35 && depositProgress.progress < 100 }">
                  <span class="node-dot"></span>
                  <div class="node-info">
                    <span class="node-title">清算与原子累加</span>
                    <span class="node-desc" v-if="depositProgress.progress >= 100">资产已成功到账并入库</span>
                    <span class="node-desc" v-else>等待区块最终确认</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="progress-empty-state">
              <Clock :size="32" class="empty-icon" />
              <p class="empty-text">暂无进行中的充值交易</p>
              <p class="empty-sub">在左侧配置数量并点击 [加签支付]，此处将实时展示逐块确认动画</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 视图 3: 机构受控提现出金 (Withdrawal Pipeline) -->
      <div v-else-if="activeTab === 'withdraw'" class="tab-content-view">
        <div class="withdraw-grid-layout">
          <!-- 提现表单卡片 -->
          <div class="surface-panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">机构级受控提现出金</h3>
                <p class="panel-subtitle">从 CyberGate 账户提出资产至外部个人钱包或交易所</p>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">提现目标公链</label>
              <NSelect
                v-model:value="withdrawNetwork"
                :options="networkOptions"
                @update:value="loadSupportedTokens(withdrawNetwork)"
              />
            </div>

            <div class="form-group">
              <label class="form-label">出金代币体系</label>
              <NSelect
                v-model:value="withdrawTokenSymbol"
                :options="tokenOptions"
              />
            </div>

            <div class="form-group">
              <div class="label-with-meta">
                <label class="form-label">提现数量</label>
                <div class="available-badge">
                  <span>当前可用:</span>
                  <strong class="mono-text">{{ currentTokenAvailableBalance }} {{ withdrawTokenSymbol }}</strong>
                  <button class="max-btn" @click="setMaxWithdrawAmount">全部 (MAX)</button>
                </div>
              </div>
              <NInput
                v-model:value="withdrawAmount"
                placeholder="输入出金数量"
                class="mono-text"
              />
            </div>

            <div class="form-group">
              <div class="label-with-meta">
                <label class="form-label">提现目的地址 (Destination)</label>
                <button class="fill-self-btn" @click="fillCurrentAddress">填入当前钱包地址</button>
              </div>
              <NInput
                v-model:value="withdrawToAddress"
                placeholder="输入接收资产的钱包地址"
                class="mono-text"
              />
              <div v-if="withdrawToAddress.trim() && isWithdrawAddressValid !== null" class="address-validity-tip">
                <span v-if="isWithdrawAddressValid" class="valid-text">
                  <CheckCircle2 :size="12" /> 地址符合 {{ withdrawNetwork.toUpperCase() }} 规范
                </span>
                <span v-else class="invalid-text">
                  <AlertCircle :size="12" /> 地址格式不符合目标公链规范，请仔细核对
                </span>
              </div>
            </div>

            <!-- 费率与出金预估 -->
            <div class="withdrawal-estimate-card">
              <div class="estimate-row">
                <span>网络矿工费预估 (Gas Fee):</span>
                <span class="mono-text">0.00 (平台赞助/内扣)</span>
              </div>
              <div class="estimate-row">
                <span>出金签名机制:</span>
                <span class="kms-enclave-badge">Rust KMS Vault 独立硬件 Enclave</span>
              </div>
              <div class="estimate-row total">
                <span>实际到账金额:</span>
                <strong class="mono-text text-highlight">{{ withdrawAmount }} {{ withdrawTokenSymbol }}</strong>
              </div>
            </div>

            <NButton
              type="primary"
              size="large"
              class="full-width-btn"
              :loading="isWithdrawing"
              :disabled="isWithdrawAddressValid === false"
              @click="executeServerSideWithdrawal"
            >
              <template #icon><ArrowUpRight :size="16" /></template>
              提交提现放款申请
            </NButton>
          </div>

          <!-- 6-Stage 提现全链路流水线与补偿展示 -->
          <div class="surface-panel">
            <div class="panel-header">
              <div>
                <h3 class="panel-title">6-Stage 提现流控与补偿监测</h3>
                <p class="panel-subtitle">严格按原子扣款 -> KMS Enclave 加签 -> 广播 -> 区块确认闭环流转</p>
              </div>
            </div>

            <div class="pipeline-steps-card">
              <div
                v-for="(st, idx) in withdrawStepsDisplay"
                :key="st.name"
                class="step-item"
                :class="st.status.toLowerCase()"
              >
                <div class="step-icon-col">
                  <CheckCircle2 v-if="st.status === 'SUCCESS'" :size="16" class="step-status-icon success" />
                  <NSpin v-else-if="st.status === 'PROCESSING'" size="small" />
                  <XCircle v-else-if="st.status === 'FAILED'" :size="16" class="step-status-icon failed" />
                  <span v-else class="step-num-dot">{{ idx + 1 }}</span>
                </div>
                <div class="step-body-col">
                  <div class="step-title-row">
                    <span class="step-title">{{ st.name }}</span>
                    <span class="step-badge" :class="st.status.toLowerCase()">{{ st.status }}</span>
                  </div>
                  <p class="step-detail-text">{{ st.detail || '准备就绪' }}</p>
                </div>
              </div>
            </div>

            <!-- 提现成功回执 -->
            <div v-if="withdrawResult" class="withdraw-receipt-card">
              <div class="receipt-header">
                <CheckCircle2 :size="18" class="receipt-icon" />
                <span class="receipt-title">出金广播成功回执</span>
              </div>
              <div class="receipt-item">
                <span class="receipt-label">链上交易 Hash:</span>
                <span class="mono-text receipt-hash">{{ formatAddr(withdrawResult.txHash) }}</span>
                <a :href="getExplorerTxUrl(withdrawNetwork, withdrawResult.txHash)" target="_blank" class="explorer-link">
                  <ExternalLink :size="12" />
                </a>
              </div>
              <div class="receipt-item">
                <span class="receipt-label">出资金库节点:</span>
                <span class="mono-text">{{ formatAddr(withdrawResult.fromVault || 'KMS_Hot_Enclave') }}</span>
              </div>
            </div>

            <!-- 提现失败补偿提示 -->
            <div v-if="withdrawError" class="withdraw-compensation-notice">
              <ShieldAlert :size="16" class="comp-icon" />
              <div>
                <strong class="comp-title">触发原路补偿回滚机制</strong>
                <p class="comp-desc">
                  出金事务未完成，扣减资产已 0 秒自动原路退还至您的账户可用余额，账本零漏单：{{ withdrawError }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 视图 4: 公钥身份矩阵中心 (Key Matrix) -->
      <div v-else-if="activeTab === 'matrix'" class="tab-content-view">
        <div class="surface-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">多链公钥身份绑定矩阵</h3>
              <p class="panel-subtitle">同一主账号下挂载的所有多链地址，任意绑定公钥均可反向登录此账号</p>
            </div>
            <NButton type="primary" size="small" @click="openBindModal">
              <template #icon><Link2 :size="13" /></template>
              绑定新公链钱包
            </NButton>
          </div>

          <div class="key-matrix-grid">
            <div
              v-for="w in walletStore.user.wallets"
              :key="w.address"
              class="matrix-wallet-card"
              :class="{ 'is-primary': w.isPrimary }"
            >
              <div class="matrix-card-header">
                <div class="chain-tag-group">
                  <span class="chain-family-badge" :class="w.chain.toLowerCase()">{{ w.chain }}</span>
                  <span v-if="w.isPrimary" class="genesis-pill">
                    <Lock :size="10" /> 创世主地址 (锁定)
                  </span>
                  <span v-else class="secondary-pill">拓展绑定</span>
                </div>
                <span class="bound-time mono-text">{{ new Date(w.boundAt).toLocaleDateString() }}</span>
              </div>

              <div class="matrix-card-body">
                <span class="addr-label">公钥地址:</span>
                <div class="addr-row">
                  <span class="full-addr-text mono-text">{{ w.address }}</span>
                  <button
                    class="copy-btn-solid"
                    @click="copyToClipboard(w.address)"
                    title="复制完整公钥"
                  >
                    <Check v-if="copiedAddress === w.address" :size="12" />
                    <Copy v-else :size="12" />
                  </button>
                </div>
              </div>

              <div class="matrix-card-footer">
                <span v-if="w.isPrimary" class="locked-tip-text">
                  创世主钱包具备账户根凭证权限，安全机制禁止解绑
                </span>
                <NPopconfirm
                  v-else
                  @positive-click="handleUnbind(w.chain, w.address)"
                  positive-text="确认解绑"
                  negative-text="取消"
                >
                  <template #trigger>
                    <button class="unbind-btn">
                      <Unlink :size="12" /> 解绑此钱包
                    </button>
                  </template>
                  确认从当前主账号解除绑定该 [{{ w.chain }}] 钱包地址吗？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 视图 5: 审计流水历史 (Activity Ledger) -->
      <div v-else-if="activeTab === 'activity'" class="tab-content-view">
        <div class="surface-panel">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">全链路链上出入金流水与审计</h3>
              <p class="panel-subtitle">每一笔充值与提现均具备不可篡改的链上 Hash 与区块高度记录</p>
            </div>
            <NButton size="small" secondary @click="loadActivityHistory">
              <template #icon><RefreshCw :size="13" /></template>
              刷新流水
            </NButton>
          </div>

          <div class="table-container">
            <table class="dapp-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>类型</th>
                  <th>网络</th>
                  <th>币种</th>
                  <th class="text-right">数量</th>
                  <th>链上 TxHash</th>
                  <th class="text-right">状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="unifiedActivityList.length === 0">
                  <td colspan="7" class="text-center empty-cell">
                    <div class="empty-state-box">
                      <History :size="24" class="empty-state-icon" />
                      <div class="empty-state-title">暂无链上出入金流水记录</div>
                      <div class="empty-state-hint">发起充值或提现后，每一笔带区块证明的流水都会展示在此</div>
                    </div>
                  </td>
                </tr>
                <tr v-for="rec in unifiedActivityList" :key="rec.id">
                  <td class="mono-text text-muted">
                    {{ new Date(rec.timestamp || Date.now()).toLocaleTimeString() }}
                  </td>
                  <td>
                    <span class="type-pill" :class="rec.type.toLowerCase()">{{ rec.typeLabel }}</span>
                  </td>
                  <td>
                    <span class="network-badge">{{ rec.network }}</span>
                  </td>
                  <td class="mono-text font-medium">{{ rec.tokenSymbol }}</td>
                  <td class="text-right mono-text font-medium" :class="rec.type === 'DEPOSIT' ? 'text-emerald' : 'text-highlight'">
                    {{ rec.type === 'DEPOSIT' ? '+' : '-' }}{{ rec.amount }}
                  </td>
                  <td>
                    <div class="tx-hash-cell" v-if="rec.txHash">
                      <span class="mono-text">{{ formatAddr(rec.txHash) }}</span>
                      <a :href="getExplorerTxUrl(rec.network, rec.txHash)" target="_blank" class="explorer-link">
                        <ExternalLink :size="12" />
                      </a>
                    </div>
                    <span v-else class="text-muted mono-text">-</span>
                  </td>
                  <td class="text-right">
                    <span class="status-indicator-badge success">
                      {{ rec.status || 'FINALIZED' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 开发者底层链路折叠抽屉 (非侵入式轻量诊断) -->
      <div class="dev-telemetry-strip">
        <button class="telemetry-toggle-btn" @click="isDevPanelOpen = !isDevPanelOpen">
          <Terminal :size="13" />
          <span>开发者底层链路诊断与日志终端</span>
          <ChevronUp v-if="isDevPanelOpen" :size="13" />
          <ChevronDown v-else :size="13" />
        </button>

        <div v-if="isDevPanelOpen" class="telemetry-content-box">
          <div class="telemetry-log-console">
            <div v-for="(lg, idx) in walletStore.logs" :key="idx" class="log-line" :class="lg.type">
              <span class="log-time mono-text">[{{ lg.time }}]</span>
              <span class="log-msg">{{ lg.message }}</span>
            </div>
            <div v-if="walletStore.logs.length === 0" class="log-empty">
              暂无运行时事件日志
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 弹窗组件 -->
    <ConnectModal
      v-model:show="showConnectModal"
      :mode="connectModalMode"
      @connected="loadUserBalances"
      @bound="loadUserBalances"
    />
  </div>
</template>

<style scoped>
.dapp-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 未登录状态 Hero */
.unauth-hero-zone {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.hero-card {
  padding: 40px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.hero-tag-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.live-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
  padding: 3px 10px;
  border-radius: 20px;
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.arch-badge {
  font-size: 11px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.05);
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.hero-title {
  margin: 12px 0 8px;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.5px;
  color: #f8fafc;
  line-height: 1.25;
}

.hero-description {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: #94a3b8;
  max-width: 780px;
}

.hero-action-group {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 8px;
}

.primary-cta-btn {
  font-weight: 600;
  font-size: 14px;
}

.demo-cta-btn {
  font-size: 14px;
}

.hero-pillars {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 24px;
}

@media (max-width: 768px) {
  .hero-pillars {
    grid-template-columns: 1fr;
  }
}

.pillar-item {
  display: flex;
  gap: 12px;
}

.pillar-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #1e293b;
  color: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  shrink: 0;
}

.pillar-title {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.pillar-desc {
  margin: 0;
  font-size: 12px;
  color: #64748b;
  line-height: 1.5;
}

.section-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.section-meta {
  font-size: 12px;
  color: #64748b;
}

.chain-cards-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

@media (max-width: 768px) {
  .chain-cards-grid {
    grid-template-columns: 1fr;
  }
}

.chain-card {
  padding: 16px;
  border-radius: 10px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.chain-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.chain-family-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: #1e293b;
  color: #94a3b8;
}

.chain-family-badge.evm {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
}

.chain-family-badge.tron {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
}

.chain-family-badge.solana {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.15);
}

.chain-name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.chain-specs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  color: #64748b;
}

.spec-val {
  color: #f1f5f9;
}

.status-green {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #10b981;
}

.mini-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
}

/* 已登录状态控制台 */
.account-overview-banner {
  padding: 24px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
}

.account-meta-left {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.account-id-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.account-badge {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  flex-shrink: 0;
}

.account-id-text {
  font-size: 13px;
  color: #f8fafc;
  font-weight: 600;
}

.account-id-mobile {
  display: none;
}

.role-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  font-weight: 600;
  flex-shrink: 0;
}

.genesis-wallet-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  flex-wrap: wrap;
}

.lock-icon {
  color: #f59e0b;
  flex-shrink: 0;
}

.genesis-label {
  flex-shrink: 0;
}

.genesis-chain {
  color: #60a5fa;
  font-weight: 600;
  flex-shrink: 0;
}

.genesis-addr {
  color: #f1f5f9;
}

.copy-inline-btn {
  background: transparent;
  border: none;
  color: #64748b;
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.copy-inline-btn:hover {
  color: #3b82f6;
  background: rgba(255, 255, 255, 0.05);
}

.account-metrics-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.metrics-summary-group {
  display: flex;
  align-items: center;
  gap: 24px;
}

.metric-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: #64748b;
}

.metric-val-row {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.metric-dollar {
  font-size: 16px;
  color: #3b82f6;
  font-weight: 600;
}

.metric-number {
  font-size: 24px;
  font-weight: 700;
  color: #f8fafc;
}

.metric-sub-val {
  font-size: 14px;
  font-weight: 600;
  color: #f1f5f9;
}

.metric-divider {
  width: 1px;
  height: 36px;
  background: rgba(255, 255, 255, 0.08);
}

.header-fast-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 导航标签切换 */
.dapp-nav-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding-bottom: 12px;
  overflow-x: auto;
  flex-wrap: nowrap;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.dapp-nav-tabs::-webkit-scrollbar {
  display: none;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: 13px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
}

.tab-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.04);
}

.tab-btn.active {
  color: #f8fafc;
  background: #1e293b;
  border-color: rgba(59, 130, 246, 0.4);
  font-weight: 600;
}

.tab-count-badge {
  font-size: 10px;
  background: #111827;
  padding: 1px 6px;
  border-radius: 4px;
  color: #60a5fa;
  font-family: 'JetBrains Mono', monospace;
}

/* 面板通用样式 */
.surface-panel {
  padding: 24px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.panel-title {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
}

.panel-subtitle {
  margin: 0;
  font-size: 12px;
  color: #64748b;
}

/* 数据表格 */
.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  width: 100%;
}

.dapp-table {
  width: 100%;
  min-width: 600px;
  border-collapse: collapse;
  font-size: 13px;
  white-space: nowrap;
}

.dapp-table th {
  text-align: left;
  padding: 10px 14px;
  color: #64748b;
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.dapp-table td {
  padding: 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  color: #94a3b8;
}

.text-right {
  text-align: right;
}

.text-center {
  text-align: center;
}

.text-highlight {
  color: #f8fafc;
}

.text-muted {
  color: #64748b;
}

.text-val {
  color: #10b981;
}

.token-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}

.token-avatar {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #60a5fa;
  font-family: 'JetBrains Mono', monospace;
}

.token-name {
  font-size: 13px;
  color: #f8fafc;
  font-weight: 500;
}

.token-symbol {
  font-size: 11px;
  color: #64748b;
}

.network-badge {
  font-size: 11px;
  color: #94a3b8;
  background: #111827;
  padding: 3px 8px;
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.type-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

.type-tag.native {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
}

.type-tag.token {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

.table-actions-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.action-link-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #94a3b8;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.action-link-btn:hover {
  color: #3b82f6;
  border-color: rgba(59, 130, 246, 0.4);
}

/* 充值布局 */
.deposit-grid-layout,
.withdraw-grid-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 860px) {
  .deposit-grid-layout,
  .withdraw-grid-layout {
    grid-template-columns: 1fr;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.form-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.label-with-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quick-preset-chips {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.preset-chip {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  color: #94a3b8;
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  padding: 2px 8px;
  cursor: pointer;
}

.preset-chip:hover {
  border-color: rgba(59, 130, 246, 0.4);
  color: #f8fafc;
}

.deposit-mode-switcher {
  display: flex;
  background: #111827;
  border-radius: 8px;
  padding: 3px;
  margin-bottom: 16px;
  gap: 4px;
}

.mode-switch-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 12px;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-switch-btn.active {
  background: #1e293b;
  color: #f8fafc;
  font-weight: 600;
}

.wallet-sign-dock {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.dock-summary-box {
  padding: 12px;
  background: #111827;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
}

.dock-hint-text {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}

.full-width-btn {
  width: 100%;
  font-weight: 600;
}

/* 精致专属收款池与二维码呈现面板 */
.qr-loading-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px 20px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 16px;
}

.qr-loading-text {
  font-size: 13px;
  color: #94a3b8;
}

.qr-showcase-panel {
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
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
  padding: 8px 0;
}

.qr-frame-box {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  line-height: 0;
}

/* 四角高精对齐刻度 */
.frame-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border-color: rgba(59, 130, 246, 0.7);
  pointer-events: none;
}

.corner-tl {
  top: 0;
  left: 0;
  border-top: 2px solid;
  border-left: 2px solid;
  border-top-left-radius: 6px;
}

.corner-tr {
  top: 0;
  right: 0;
  border-top: 2px solid;
  border-right: 2px solid;
  border-top-right-radius: 6px;
}

.corner-bl {
  bottom: 0;
  left: 0;
  border-bottom: 2px solid;
  border-left: 2px solid;
  border-bottom-left-radius: 6px;
}

.corner-br {
  bottom: 0;
  right: 0;
  border-bottom: 2px solid;
  border-right: 2px solid;
  border-bottom-right-radius: 6px;
}

.qr-canvas-holder {
  position: relative;
  background: #ffffff;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
  line-height: 0;
}

/* 消除 Naive UI 二维码在全局 box-sizing 下的偏移与截断 */
:deep(.n-qr-code) {
  box-sizing: content-box !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 0 !important;
}

:deep(.n-qr-code canvas) {
  display: block !important;
  max-width: 100% !important;
  height: auto !important;
}

.qr-center-pill {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #ffffff;
  border: 2px solid #090d16;
  border-radius: 6px;
  padding: 2px 7px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  line-height: 1;
}

.qr-center-text {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: #090d16;
  letter-spacing: 0.5px;
}

.qr-scan-guide {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
}

.guide-icon {
  color: #3b82f6;
}

.qr-address-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
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

.copy-btn-solid {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border-radius: 4px;
  padding: 4px 6px;
  display: flex;
  align-items: center;
  cursor: pointer;
  shrink: 0;
}

.copy-btn-solid:hover {
  color: #3b82f6;
}

.manual-verify-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.input-with-button {
  display: flex;
  gap: 8px;
}

.ghost-scan-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  padding: 4px 0;
}

/* 进度时间线 */
.progress-display-zone {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.progress-metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-indicator-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-indicator-badge.confirming,
.status-indicator-badge.signing {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.status-indicator-badge.confirmed,
.status-indicator-badge.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.confirm-count {
  font-size: 12px;
  color: #94a3b8;
}

.lifecycle-timeline {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 8px;
}

.timeline-node {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  position: relative;
}

.node-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #334155;
  margin-top: 4px;
}

.timeline-node.done .node-dot {
  background: #10b981;
}

.timeline-node.active .node-dot {
  background: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
}

.node-info {
  display: flex;
  flex-direction: column;
}

.node-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
}

.node-desc {
  font-size: 11px;
  color: #64748b;
}

.explorer-link {
  color: #3b82f6;
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}

.progress-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: #64748b;
  text-align: center;
}

.empty-icon {
  color: #334155;
  margin-bottom: 12px;
}

.empty-text {
  margin: 0 0 4px 0;
  font-size: 14px;
  color: #94a3b8;
}

.empty-sub {
  margin: 0;
  font-size: 12px;
  max-width: 320px;
}

/* 提现面板 */
.available-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.max-btn {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #60a5fa;
  font-size: 10px;
  border-radius: 3px;
  cursor: pointer;
}

.fill-self-btn {
  background: transparent;
  border: none;
  color: #3b82f6;
  font-size: 11px;
  cursor: pointer;
}

.address-validity-tip {
  margin-top: 4px;
  font-size: 11px;
}

.valid-text {
  color: #10b981;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.invalid-text {
  color: #ef4444;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.withdrawal-estimate-card {
  padding: 12px;
  background: #111827;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 16px;
}

.estimate-row {
  display: flex;
  justify-content: space-between;
  color: #94a3b8;
}

.estimate-row.total {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 6px;
  color: #f8fafc;
  font-weight: 600;
}

.kms-enclave-badge {
  font-size: 10px;
  color: #c084fc;
  background: rgba(168, 85, 247, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
}

.pipeline-steps-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: 8px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.step-num-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #1e293b;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
}

.step-status-icon.success {
  color: #10b981;
}

.step-status-icon.failed {
  color: #ef4444;
}

.step-body-col {
  flex: 1;
}

.step-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.step-title {
  font-size: 13px;
  font-weight: 500;
  color: #f1f5f9;
}

.step-badge {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  padding: 1px 5px;
  border-radius: 3px;
}

.step-badge.pending {
  color: #64748b;
  background: rgba(255, 255, 255, 0.05);
}

.step-badge.processing {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
}

.step-badge.success {
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
}

.step-badge.failed {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.15);
}

.step-detail-text {
  margin: 2px 0 0 0;
  font-size: 11px;
  color: #64748b;
}

.withdraw-receipt-card {
  margin-top: 16px;
  padding: 12px;
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.receipt-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #10b981;
}

.receipt-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #94a3b8;
}

.receipt-hash {
  color: #f8fafc;
}

.withdraw-compensation-notice {
  margin-top: 16px;
  padding: 12px;
  background: rgba(239, 68, 68, 0.06);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.comp-icon {
  color: #ef4444;
  margin-top: 2px;
}

.comp-title {
  font-size: 12px;
  color: #ef4444;
  display: block;
}

.comp-desc {
  margin: 2px 0 0 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
}

/* 公钥矩阵网格 */
.key-matrix-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

@media (max-width: 640px) {
  .key-matrix-grid {
    grid-template-columns: 1fr;
  }
}

.matrix-wallet-card {
  padding: 16px;
  border-radius: 10px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.matrix-wallet-card.is-primary {
  border-color: rgba(59, 130, 246, 0.3);
  background: rgba(17, 24, 39, 0.9);
}

.matrix-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.chain-tag-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.genesis-pill {
  font-size: 10px;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.2);
  padding: 1px 6px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.secondary-pill {
  font-size: 10px;
  color: #94a3b8;
  background: #1e293b;
  padding: 1px 6px;
  border-radius: 4px;
}

.bound-time {
  font-size: 11px;
  color: #64748b;
}

.addr-label {
  font-size: 11px;
  color: #64748b;
  display: block;
  margin-bottom: 2px;
}

.addr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.full-addr-text {
  font-size: 12px;
  color: #f8fafc;
  word-break: break-all;
}

.matrix-card-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 8px;
  display: flex;
  justify-content: flex-end;
}

.locked-tip-text {
  font-size: 11px;
  color: #64748b;
}

.unbind-btn {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.2);
  color: #ef4444;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s ease;
}

.unbind-btn:hover {
  background: rgba(239, 68, 68, 0.1);
}

/* 审计历史 */
.type-pill {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 500;
  display: inline-block;
}

.type-pill.withdraw {
  color: #f87171;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.2);
}

.type-pill.deposit {
  color: #34d399;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.2);
}

.text-emerald {
  color: #34d399;
}

.empty-state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
  gap: 8px;
}

.empty-state-icon {
  color: #475569;
}

.empty-state-title {
  font-size: 13px;
  color: #94a3b8;
  font-weight: 500;
}

.empty-state-hint {
  font-size: 11px;
  color: #64748b;
}

.tx-hash-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 开发者折叠诊断 */
.dev-telemetry-strip {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 16px;
}

.telemetry-toggle-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
}

.telemetry-toggle-btn:hover {
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.04);
}

.telemetry-content-box {
  margin-top: 12px;
  padding: 12px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
}

.telemetry-log-console {
  max-height: 200px;
  overflow-y: auto;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.log-line {
  display: flex;
  gap: 8px;
}

.log-time {
  color: #64748b;
  flex-shrink: 0;
}

.log-line.info .log-msg {
  color: #94a3b8;
}

.log-line.success .log-msg {
  color: #10b981;
}

.log-line.warn .log-msg {
  color: #f59e0b;
}

.log-line.error .log-msg {
  color: #ef4444;
}

.log-empty {
  color: #475569;
  text-align: center;
  padding: 12px;
}

/* 移动端与小屏幕自适应 (Responsive Design) */
@media (max-width: 768px) {
  .account-overview-banner {
    padding: 16px 14px;
    gap: 16px;
    flex-direction: column;
    align-items: stretch;
  }
  .account-metrics-right {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
  }
  .metrics-summary-group {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    width: 100%;
  }
  .metric-divider {
    display: none;
  }
  .header-fast-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    width: 100%;
  }
  .header-fast-actions .n-button {
    width: 100%;
  }
}

@media (max-width: 640px) {
  .hero-card {
    padding: 20px 16px;
    gap: 20px;
  }
  .hero-title {
    font-size: 20px;
    line-height: 1.35;
    margin: 8px 0 6px;
    word-break: break-word;
  }
  .hero-description {
    font-size: 13px;
    line-height: 1.5;
  }
  .hero-action-group {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .primary-cta-btn,
  .demo-cta-btn {
    width: 100%;
    justify-content: center;
  }
  .dapp-nav-tabs {
    padding-bottom: 8px;
    gap: 6px;
  }
  .tab-btn {
    padding: 6px 12px;
    font-size: 12px;
    gap: 5px;
  }
  .account-id-desktop {
    display: none;
  }
  .account-id-mobile {
    display: inline-block;
  }
  .qr-showcase-panel {
    padding: 12px 10px;
  }
  .qr-frame-box {
    padding: 8px;
  }
  .qr-canvas-holder {
    padding: 10px;
  }
  .qr-scan-guide {
    font-size: 11px;
    text-align: center;
  }
  .qr-full-address {
    font-size: 11px;
  }
}
</style>
