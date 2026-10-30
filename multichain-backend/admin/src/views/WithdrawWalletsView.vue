<template>
  <div class="withdraw-wallets-view">
    <div class="page-header">
      <div>
        <h2 class="page-title">多链提现出金热钱包配置 (Withdrawal Hot Vaults)</h2>
        <div class="page-subtitle">
          配置平台服务端用于向用户执行链上自动打款放款的出资金库。分为 <strong>EVM (各链通用放款池)</strong>、<strong>SOLANA</strong>、<strong>TRON</strong> 三大出金通道。
        </div>
      </div>
      <n-space align="center">
        <n-button type="primary" secondary @click="showAddModal = true">
          添加提现出金钱包
        </n-button>
        <n-button secondary @click="fetchWallets">
          刷新热钱包池
        </n-button>
      </n-space>
    </div>

    <!-- 顶部出金储备指标看板 -->
    <div class="stat-cards-grid">
      <div class="stat-card">
        <div class="stat-label">EVM 出资金库储备 (USDT)</div>
        <div class="stat-value text-blue">{{ evmTotalBalance }}</div>
        <div class="stat-sub">共 {{ evmWallets.length }} 个在线放款节点</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">TRON (TRC20) 储备水位</div>
        <div class="stat-value text-rose">{{ tronTotalBalance }}</div>
        <div class="stat-sub">共 {{ tronWallets.length }} 个在线放款节点</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SOLANA 储备水位</div>
        <div class="stat-value text-teal">{{ solanaTotalBalance }}</div>
        <div class="stat-sub">共 {{ solanaWallets.length }} 个在线放款节点</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日已出金总额</div>
        <div class="stat-value text-amber">{{ totalSpentToday }}</div>
        <div class="stat-sub">受单日动态限额保护</div>
      </div>
    </div>

    <!-- 三大生态分类卡片 -->
    <n-card hoverable style="background: #111827; border: 1px solid #1e293b;">
      <n-tabs v-model:value="activeTab" type="segment" animated>
        <!-- EVM 生态 -->
        <n-tab-pane name="EVM" tab="EVM 出资组 (Ethereum · BSC · Polygon 通用)">
          <div class="tab-intro-banner">
            <span class="intro-tag evm">EVM 出金池</span>
            <span class="intro-desc">
              用户在任意 EVM 链发起提现时，系统由具备有效签名凭证的 EVM 出资金库发起链上原子交易，直接完成向用户收款公钥打款。
            </span>
          </div>
          <withdraw-table :list="evmWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- TRON 生态 -->
        <n-tab-pane name="TRON" tab="TRON 出资组 (波场 TRC20 快速出金池)">
          <div class="tab-intro-banner">
            <span class="intro-tag tron">TRON 出金池</span>
            <span class="intro-desc">
              向用户 TRON 地址 (T 开头) 出资 TRC20-USDT 或 TRX 原生币，内置充足能量与带宽保障秒级广播。
            </span>
          </div>
          <withdraw-table :list="tronWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- SOLANA 生态 -->
        <n-tab-pane name="SOLANA" tab="SOLANA 出资组 (SPL 代币高速放款池)">
          <div class="tab-intro-banner">
            <span class="intro-tag solana">SOLANA 出金池</span>
            <span class="intro-desc">
              面向 Solana 钱包用户执行 SPL Token 转账出资，支持极低 Gas 成本与 400ms 高速出块确认。
            </span>
          </div>
          <withdraw-table :list="solanaWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- 全部清单 -->
        <n-tab-pane name="ALL" tab="全量提现热钱包矩阵">
          <withdraw-table :list="wallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- 添加提现钱包弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      title="添加多链提现出金热钱包"
      style="max-width: 520px; background: #111827; border: 1px solid #1e293b;"
    >
      <n-form :model="addForm" label-placement="top">
        <n-form-item label="所属公链生态类别 (3大组)" required>
          <n-select
            v-model:value="addForm.chain"
            :options="chainOptions"
            placeholder="请选择生态类别"
          />
        </n-form-item>

        <n-form-item label="热钱包备注标签" required>
          <n-input
            v-model:value="addForm.label"
            placeholder="如: EVM02, TRON02, SOL02"
          />
        </n-form-item>

        <n-form-item label="出款热钱包公钥地址" required>
          <n-input
            v-model:value="addForm.address"
            placeholder="EVM: 0x... / TRON: T... / SOL: Base58"
          />
        </n-form-item>

        <n-grid :x-gap="12" cols="2">
          <n-grid-item>
            <n-form-item label="初始预存/估算余额 (Token)">
              <n-input v-model:value="addForm.balance" placeholder="如: 100000" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="单日出金安全限额 (Token)">
              <n-input v-model:value="addForm.dailyLimit" placeholder="如: 50000" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddModal = false">取消</n-button>
          <n-button type="primary" :loading="isSubmitting" @click="handleAddSubmit">
            立即录入出金金库
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑提现热钱包弹窗 -->
    <n-modal
      v-model:show="showEditModal"
      preset="card"
      title="编辑多链提现出金热钱包"
      style="max-width: 520px; background: #111827; border: 1px solid #1e293b;"
    >
      <n-form :model="editForm" label-placement="top">
        <n-form-item label="所属公链生态">
          <n-tag :type="editForm.chain === 'EVM' ? 'info' : editForm.chain === 'TRON' ? 'error' : 'success'">
            {{ editForm.chain }}
          </n-tag>
        </n-form-item>

        <n-form-item label="出金公钥地址 (只读)">
          <n-input :value="editForm.address" disabled />
        </n-form-item>

        <n-form-item label="热钱包备注标签" required>
          <n-input v-model:value="editForm.label" placeholder="如: EVM01, TRON01" />
        </n-form-item>

        <n-grid :x-gap="12" cols="2">
          <n-grid-item>
            <n-form-item label="储备可用余额 (Token)">
              <n-input v-model:value="editForm.balance" placeholder="250000.00" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="单日出金安全限额 (Token)">
              <n-input v-model:value="editForm.dailyLimit" placeholder="100000.00" />
            </n-form-item>
          </n-grid-item>
        </n-grid>

        <n-form-item label="放款通道状态">
          <n-switch v-model:value="editForm.isActive" />
          <span style="margin-left: 8px; color: #94a3b8; font-size: 12px;">
            {{ editForm.isActive ? '自动放款中：系统可调用该节点出金' : '已暂停出款：暂不调用该节点' }}
          </span>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" :loading="isSavingEdit" @click="handleEditSubmit">
            保存金库配置
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, defineComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage } from 'naive-ui';
import { adminClient, type WithdrawWalletItem } from '../api/adminClient';
import { maskAddress, copyText } from '../utils/format';

const router = useRouter();
const message = useMessage();
const wallets = ref<WithdrawWalletItem[]>([]);
const activeTab = ref('EVM');
const showAddModal = ref(false);
const isSubmitting = ref(false);

const showEditModal = ref(false);
const isSavingEdit = ref(false);
const editForm = ref({
  id: '',
  chain: 'EVM',
  address: '',
  label: '',
  balance: '250000',
  dailyLimit: '100000',
  isActive: true,
});

function handleOpenEdit(w: WithdrawWalletItem) {
  editForm.value = {
    id: w.id,
    chain: w.chain,
    address: w.address,
    label: w.label || '',
    balance: w.balance,
    dailyLimit: w.dailyLimit,
    isActive: w.isActive,
  };
  showEditModal.value = true;
}

async function handleEditSubmit() {
  if (!editForm.value.label.trim()) {
    message.warning('请填写热钱包备注标签');
    return;
  }
  isSavingEdit.value = true;
  try {
    await adminClient.updateWithdrawWallet(editForm.value.id, {
      label: editForm.value.label.trim(),
      balance: editForm.value.balance,
      dailyLimit: editForm.value.dailyLimit,
      isActive: editForm.value.isActive,
    });
    message.success('提现热钱包配置已更新');
    showEditModal.value = false;
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '更新失败');
  } finally {
    isSavingEdit.value = false;
  }
}

const addForm = ref({
  chain: 'EVM',
  label: '',
  address: '',
  balance: '100000',
  dailyLimit: '100000',
});

const chainOptions = [
  { label: 'EVM 出资组 (Ethereum / BSC / Polygon 通用)', value: 'EVM' },
  { label: 'TRON 出资组 (波场 TRC20 独立池)', value: 'TRON' },
  { label: 'SOLANA 出资组 (Solana SPL 独立池)', value: 'SOLANA' },
];

const evmWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'EVM'));
const tronWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'TRON'));
const solanaWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'SOLANA'));

const evmTotalBalance = computed(() => {
  const sum = evmWallets.value.reduce((acc, w) => acc + (parseFloat(w.balance) || 0), 0);
  return sum.toLocaleString();
});

const tronTotalBalance = computed(() => {
  const sum = tronWallets.value.reduce((acc, w) => acc + (parseFloat(w.balance) || 0), 0);
  return sum.toLocaleString();
});

const solanaTotalBalance = computed(() => {
  const sum = solanaWallets.value.reduce((acc, w) => acc + (parseFloat(w.balance) || 0), 0);
  return sum.toLocaleString();
});

const totalSpentToday = computed(() => {
  const sum = wallets.value.reduce((acc, w) => acc + (parseFloat(w.spentToday) || 0), 0);
  return sum.toLocaleString();
});

async function fetchWallets() {
  try {
    wallets.value = await adminClient.getWithdrawWallets();
  } catch (err: any) {
    message.error(err.message || '获取提现热钱包列表失败');
  }
}

async function handleToggle(id: string, nextStatus: boolean) {
  try {
    await adminClient.toggleWithdrawWallet(id, nextStatus);
    message.success(nextStatus ? '已开启该热钱包放款权限' : '已暂停该热钱包放款');
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '切换状态失败');
  }
}

async function handleDelete(id: string) {
  try {
    await adminClient.deleteWithdrawWallet(id);
    message.success('已删除提现热钱包配置');
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '删除失败');
  }
}

async function handleAddSubmit() {
  if (!addForm.value.address.trim()) {
    message.warning('请填写出款热钱包地址');
    return;
  }
  isSubmitting.value = true;
  try {
    await adminClient.addWithdrawWallet({
      chain: addForm.value.chain,
      address: addForm.value.address.trim(),
      label: addForm.value.label.trim() || undefined,
      balance: addForm.value.balance || '100000',
      dailyLimit: addForm.value.dailyLimit || '100000',
    });
    message.success('提现出金热钱包配置成功');
    showAddModal.value = false;
    addForm.value = { chain: 'EVM', label: '', address: '', balance: '100000', dailyLimit: '100000' };
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '录入提现钱包失败');
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  fetchWallets();
});

// 子组件：表格呈现
const WithdrawTable = defineComponent({
  props: {
    list: {
      type: Array as () => WithdrawWalletItem[],
      required: true,
    },
  },
  emits: ['toggle', 'delete', 'edit'],
  setup(props, { emit }) {
    return () => {
      if (props.list.length === 0) {
        return h('div', { style: 'padding: 40px 0; text-align: center; color: #64748b;' }, '该生态组暂无配置提现热钱包');
      }

      return h('table', { class: 'custom-admin-table' }, [
        h('thead', [
          h('tr', [
            h('th', '生态组'),
            h('th', '热钱包标签'),
            h('th', '出金公钥地址 (From Vault)'),
            h('th', '估算储备余额'),
            h('th', '单日限额 / 今日已出'),
            h('th', '放款通道状态'),
            h('th', '操作'),
          ]),
        ]),
        h('tbody', props.list.map((item) => {
          return h('tr', { key: item.id }, [
            h('td', [
              h('span', { class: `chain-badge ${item.chain.toLowerCase()}` }, item.chain),
            ]),
            h('td', { style: 'font-weight: 600; color: #f1f5f9;' }, item.label || '未命名热钱包'),
            h('td', [
              h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
                h('span', {
                  style: 'font-family: monospace; font-size: 13px; color: #38bdf8; font-weight: 500; cursor: pointer;',
                  title: `点击复制完整地址: ${item.address}`,
                  onClick: () => copyText(item.address, () => message.success('已复制完整出金公钥')),
                }, maskAddress(item.address, 6, 4)),
                h('button', {
                  class: 'btn-copy-tiny',
                  title: '复制完整公钥',
                  onClick: () => copyText(item.address, () => message.success('已复制完整出金公钥')),
                }, '复制'),
              ]),
            ]),
            h('td', { style: 'font-family: monospace; font-weight: 600; color: #10b981;' }, `${item.balance} Token`),
            h('td', [
              h('div', { style: 'font-size: 12px; color: #cbd5e1;' }, `限额: ${item.dailyLimit}`),
              h('div', { style: 'font-size: 11px; color: #64748b;' }, `今日已放: ${item.spentToday}`),
            ]),
            h('td', [
              h('button', {
                class: `status-toggle-btn ${item.isActive ? 'active' : 'inactive'}`,
                onClick: () => emit('toggle', item.id, !item.isActive),
              }, item.isActive ? '自动放款中' : '已暂停出款'),
            ]),
            h('td', [
              h('div', { style: 'display: flex; gap: 6px;' }, [
                h('button', {
                  class: 'btn-ledger-tiny',
                  title: '前往流水账本查看此出金热钱包的所有放款流水',
                  onClick: () => router.push({ path: '/audit/ledger', query: { search: item.address, tab: 'withdrawals' } }),
                }, '查出金'),
                h('button', {
                  class: 'btn-edit-tiny',
                  onClick: () => emit('edit', item),
                }, '编辑'),
                h('button', {
                  class: 'btn-delete-tiny',
                  onClick: () => {
                    if (confirm('确认删除此提现出款钱包吗？')) {
                      emit('delete', item.id);
                    }
                  },
                }, '删除'),
              ]),
            ]),
          ]);
        })),
      ]);
    };
  },
});
</script>

<style scoped>
.withdraw-wallets-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: #f8fafc;
}

.page-subtitle {
  color: #64748b;
  font-size: 13px;
  margin-top: 4px;
}

.stat-cards-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
}

@media (max-width: 1024px) {
  .stat-cards-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .stat-cards-grid {
    grid-template-columns: 1fr;
  }
}

.stat-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 16px 18px;
}

.stat-label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin: 6px 0;
}

.text-blue { color: #60a5fa; }
.text-rose { color: #f87171; }
.text-teal { color: #2dd4bf; }
.text-amber { color: #fbbf24; }

.stat-sub {
  font-size: 11px;
  color: #64748b;
}

.tab-intro-banner {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.intro-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}

.intro-tag.evm { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.intro-tag.tron { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.intro-tag.solana { background: rgba(20, 184, 166, 0.2); color: #2dd4bf; }

.intro-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.chain-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
.chain-badge.evm { background: #1e3a8a; color: #93c5fd; }
.chain-badge.tron { background: #7f1d1d; color: #fca5a5; }
.chain-badge.solana { background: #134e4a; color: #99f6e4; }

.custom-admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.custom-admin-table th {
  text-align: left;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  color: #94a3b8;
  font-weight: 600;
  border-bottom: 1px solid #1e293b;
}

.custom-admin-table td {
  padding: 12px;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}

.status-toggle-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.status-toggle-btn.active {
  color: #10b981;
  border-color: rgba(16, 185, 129, 0.3);
  background: rgba(16, 185, 129, 0.1);
}
.status-toggle-btn.inactive {
  color: #94a3b8;
  border-color: rgba(148, 163, 184, 0.3);
  background: rgba(148, 163, 184, 0.05);
}

.btn-ledger-tiny {
  background: transparent;
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #34d399;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.btn-ledger-tiny:hover {
  background: rgba(16, 185, 129, 0.15);
}

.btn-edit-tiny {
  background: transparent;
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.btn-edit-tiny:hover {
  background: rgba(56, 189, 248, 0.15);
}

.btn-copy-tiny {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  font-size: 11px;
  opacity: 0.6;
  transition: opacity 0.2s;
}
.btn-copy-tiny:hover {
  opacity: 1;
}

.btn-delete-tiny {
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #ef4444;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
}
.btn-delete-tiny:hover {
  background: rgba(239, 68, 68, 0.15);
}
</style>
