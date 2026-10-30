<template>
  <div class="tokens-balances-view">
    <n-tabs type="segment" animated>
      <!-- Tab 1: 多链支持代币配置 -->
      <n-tab-pane name="tokens" tab="多链支持代币配置 (Supported Tokens)">
        <n-card hoverable style="margin-top: 16px; background: #111827; border: 1px solid #1e293b;">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 16px; font-weight: 700;">公链支持代币与合约配置字典</span>
                <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">
                  配置用户在各个公链上允许充值的代币（如 USDT, USDC, ETH 等）。录入合约地址与精度方便链上验签，每个 Token 资产单独存放。
                </p>
              </div>
              <n-space>
                <n-button type="primary" secondary @click="showAddTokenModal = true">
                  添加支持代币
                </n-button>
                <n-button secondary @click="fetchTokens">
                  刷新
                </n-button>
              </n-space>
            </div>
          </template>

          <n-empty v-if="tokens.length === 0" description="暂无代币配置" style="margin: 40px 0;" />

          <n-table v-else striped size="small">
            <thead>
              <tr>
                <th>网络</th>
                <th>代币符号</th>
                <th>代币全称</th>
                <th>合约地址 (Contract)</th>
                <th>精度 (Decimals)</th>
                <th>最小起充</th>
                <th>充值状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tk in tokens" :key="tk.id">
                <td>
                  <n-tag size="small" type="info" round>{{ tk.networkId }}</n-tag>
                </td>
                <td style="font-weight: 700; color: #38bdf8;">
                  {{ tk.symbol }}
                </td>
                <td style="color: #f1f5f9;">
                  {{ tk.name }}
                </td>
                <td style="font-family: monospace; font-size: 11px;">
                  <span v-if="tk.contractAddress" style="color: #a78bfa;">{{ tk.contractAddress }}</span>
                  <n-tag v-else size="tiny" type="default" round>底层原生代币</n-tag>
                </td>
                <td>{{ tk.decimals }}</td>
                <td>{{ tk.minDeposit }}</td>
                <td>
                  <n-switch
                    :value="tk.isActive"
                    @update:value="(val: boolean) => handleToggleToken(tk.id, val)"
                  >
                    <template #checked>已启用</template>
                    <template #unchecked>已暂停</template>
                  </n-switch>
                </td>
                <td>
                  <n-popconfirm
                    @positive-click="handleDeleteToken(tk.id)"
                    positive-text="确认删除"
                    negative-text="取消"
                  >
                    <template #trigger>
                      <n-button size="tiny" tertiary type="error">删除</n-button>
                    </template>
                    确认删除此代币支持配置吗？
                  </n-popconfirm>
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-card>
      </n-tab-pane>

      <!-- Tab 2: 用户多链代币资产总览 -->
      <n-tab-pane name="balances" tab="用户多链代币资产总览 (User Balances)">
        <n-card hoverable style="margin-top: 16px; background: #111827; border: 1px solid #1e293b;">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 16px; font-weight: 700;">用户各链独立 Token 余额账本</span>
                <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">
                  每个用户在各链上、各个 Token 的余额均以高精度 BigNumber 字符串独立存储，充值验证通过后自动结算入账。
                </p>
              </div>
              <n-button secondary @click="fetchBalances">
                刷新资产
              </n-button>
            </div>
          </template>

          <n-empty v-if="balances.length === 0" description="暂无用户充值资产记录" style="margin: 40px 0;" />

          <n-table v-else striped size="small">
            <thead>
              <tr>
                <th>用户主账号 ID (UUID)</th>
                <th>公链网络</th>
                <th>代币符号 (Token)</th>
                <th>合约地址</th>
                <th>账户余额 (Balance)</th>
                <th>最近变更时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="b in balances" :key="b.id">
                <td style="font-family: monospace; font-size: 12px; color: #94a3b8;">
                  {{ b.userId }}
                </td>
                <td>
                  <n-tag size="small" type="success" round>{{ b.networkId }}</n-tag>
                </td>
                <td style="font-weight: 700; color: #60a5fa;">
                  {{ b.tokenSymbol }}
                </td>
                <td style="font-family: monospace; font-size: 11px; color: #64748b;">
                  {{ b.tokenAddress || '原生币 (Native)' }}
                </td>
                <td style="font-family: monospace; font-size: 14px; font-weight: 800; color: #10b981;">
                  {{ b.balance }}
                </td>
                <td style="font-size: 11px; color: #64748b;">
                  {{ new Date(b.updatedAt).toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-card>
      </n-tab-pane>

      <!-- Tab 3: 充值订单与链上对账记录 -->
      <n-tab-pane name="deposits" tab="充值订单与链上核验流水 (Deposit Orders)">
        <n-card hoverable style="margin-top: 16px; background: #111827; border: 1px solid #1e293b;">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 16px; font-weight: 700;">充值意图与链上对账流水账本</span>
                <p style="color: #64748b; font-size: 12px; margin: 4px 0 0 0;">
                  展示全平台充值订单、分配的收款钱包池地址、提交的 TxHash 或智能对账状态。
                </p>
              </div>
              <n-button secondary @click="fetchDeposits">
                刷新流水
              </n-button>
            </div>
          </template>

          <n-empty v-if="deposits.length === 0" description="暂无充值订单记录" style="margin: 40px 0;" />

          <n-table v-else striped size="small">
            <thead>
              <tr>
                <th>订单号 (Order ID)</th>
                <th>公链网络</th>
                <th>代币</th>
                <th>分配收款地址 (Wallet A)</th>
                <th>预期充值</th>
                <th>实际到账</th>
                <th>交易 TxHash</th>
                <th>状态</th>
                <th>创建时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in deposits" :key="d.id">
                <td style="font-family: monospace; font-size: 11px; color: #94a3b8;">
                  {{ d.id.slice(0, 8) }}...
                </td>
                <td>
                  <n-tag size="small" type="info" round>{{ d.network }}</n-tag>
                </td>
                <td style="font-weight: 700; color: #38bdf8;">
                  {{ d.tokenSymbol || 'NATIVE' }}
                </td>
                <td style="font-family: monospace; font-size: 11px; color: #a78bfa;">
                  {{ d.depositAddress }}
                </td>
                <td>{{ d.amount }}</td>
                <td style="color: #10b981; font-weight: 700;">
                  {{ d.actualAmount || d.amount }}
                </td>
                <td style="font-family: monospace; font-size: 11px; color: #f59e0b;">
                  {{ d.txHash ? d.txHash.slice(0, 16) + '...' : '等待提交/扫描' }}
                </td>
                <td>
                  <n-tag
                    size="small"
                    :type="d.status === 'CONFIRMED' ? 'success' : d.status === 'PENDING' ? 'warning' : 'error'"
                    round
                  >
                    {{ d.status }}
                  </n-tag>
                </td>
                <td style="font-size: 11px; color: #64748b;">
                  {{ new Date(d.createdAt).toLocaleString() }}
                </td>
              </tr>
            </tbody>
          </n-table>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <!-- 添加代币配置弹窗 -->
    <n-modal
      v-model:show="showAddTokenModal"
      preset="card"
      title="添加公链支持代币配置"
      style="max-width: 500px; background: #111827; border: 1px solid #1e293b;"
    >
      <n-form :model="addTokenForm" label-placement="top">
        <n-form-item label="所属公链网络">
          <n-select
            v-model:value="addTokenForm.networkId"
            :options="networkFormOptions"
            placeholder="请选择目标公链"
          />
        </n-form-item>
        <n-form-item label="代币符号 (Symbol)">
          <n-input
            v-model:value="addTokenForm.symbol"
            placeholder="如: USDT, USDC, DAI"
          />
        </n-form-item>
        <n-form-item label="代币全称 (Name)">
          <n-input
            v-model:value="addTokenForm.name"
            placeholder="如: Tether USD"
          />
        </n-form-item>
        <n-form-item label="合约地址 (Contract Address，原生币请留空)">
          <n-input
            v-model:value="addTokenForm.contractAddress"
            placeholder="如: 0xdAC17F958D2ee523a2206206994597C13D831ec7 (留空代表原生币)"
          />
        </n-form-item>
        <n-form-item label="代币精度 (Decimals)">
          <n-input-number
            v-model:value="addTokenForm.decimals"
            :min="0"
            :max="36"
            style="width: 100%;"
          />
        </n-form-item>
        <n-form-item label="最小起充金额 (Min Deposit)">
          <n-input
            v-model:value="addTokenForm.minDeposit"
            placeholder="如: 1.0"
          />
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddTokenModal = false">取消</n-button>
          <n-button type="primary" :loading="isAddingToken" @click="handleAddToken">
            确认保存
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMessage, NInputNumber } from 'naive-ui';

interface SupportedToken {
  id: string;
  networkId: string;
  symbol: string;
  name: string;
  contractAddress: string | null;
  decimals: number;
  minDeposit: string;
  isActive: boolean;
}

interface UserBalance {
  id: string;
  userId: string;
  networkId: string;
  tokenSymbol: string;
  tokenAddress: string | null;
  balance: string;
  updatedAt: number;
}

interface DepositOrderRecord {
  id: string;
  network: string;
  tokenSymbol?: string;
  depositAddress: string;
  amount: string;
  actualAmount?: string;
  txHash?: string;
  status: string;
  createdAt: number;
}

const message = useMessage();
const tokens = ref<SupportedToken[]>([]);
const balances = ref<UserBalance[]>([]);
const deposits = ref<DepositOrderRecord[]>([]);

const showAddTokenModal = ref(false);
const isAddingToken = ref(false);

const addTokenForm = ref({
  networkId: 'ethereum',
  symbol: '',
  name: '',
  contractAddress: '',
  decimals: 18,
  minDeposit: '1.0',
});

const networkFormOptions = [
  { label: 'Ethereum (EVM)', value: 'ethereum' },
  { label: 'BSC (EVM)', value: 'bsc' },
  { label: 'TRON (TRC20)', value: 'tron' },
  { label: 'Solana (SPL)', value: 'solana' },
  { label: 'Arbitrum (EVM)', value: 'arbitrum' },
  { label: 'Base (EVM)', value: 'base' },
];

const fetchTokens = async () => {
  try {
    const res = await fetch('/api/admin/tokens');
    if (res.ok) tokens.value = await res.json();
  } catch {}
};

const fetchBalances = async () => {
  try {
    const res = await fetch('/api/balances/admin/all');
    if (res.ok) balances.value = await res.json();
  } catch {}
};

const fetchDeposits = async () => {
  try {
    const res = await fetch('/api/transfer/workflow/deposits?limit=50');
    if (res.ok) deposits.value = await res.json();
  } catch {}
};

const handleToggleToken = async (id: string, nextStatus: boolean) => {
  try {
    const res = await fetch(`/api/admin/tokens/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: nextStatus }),
    });
    if (res.ok) {
      message.success(`代币状态已更新为: ${nextStatus ? '启用' : '禁用'}`);
      await fetchTokens();
    }
  } catch {
    message.error('切换状态失败');
  }
};

const handleDeleteToken = async (id: string) => {
  try {
    const res = await fetch(`/api/admin/tokens/${id}`, { method: 'DELETE' });
    if (res.ok) {
      message.success('已删除代币配置');
      await fetchTokens();
    }
  } catch {
    message.error('删除失败');
  }
};

const handleAddToken = async () => {
  if (!addTokenForm.value.symbol.trim() || !addTokenForm.value.name.trim()) {
    message.warning('请填写代币符号和全称');
    return;
  }
  isAddingToken.value = true;
  try {
    const res = await fetch('/api/admin/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        networkId: addTokenForm.value.networkId,
        symbol: addTokenForm.value.symbol,
        name: addTokenForm.value.name,
        contractAddress: addTokenForm.value.contractAddress.trim() || null,
        decimals: addTokenForm.value.decimals,
        minDeposit: addTokenForm.value.minDeposit,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || '添加失败');

    message.success('已成功配置支持新的代币');
    showAddTokenModal.value = false;
    addTokenForm.value.symbol = '';
    addTokenForm.value.name = '';
    addTokenForm.value.contractAddress = '';
    await fetchTokens();
  } catch (err: any) {
    message.error(err.message || '添加失败');
  } finally {
    isAddingToken.value = false;
  }
};

onMounted(() => {
  fetchTokens();
  fetchBalances();
  fetchDeposits();
});
</script>

<style scoped>
</style>
