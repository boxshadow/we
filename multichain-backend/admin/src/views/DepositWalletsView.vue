<template>
  <div class="deposit-wallets-view">
    <div class="page-header">
      <div>
        <h2 class="page-title">充值收款专属钱包配置 (Deposit Wallets)</h2>
        <div class="page-subtitle">
          配置平台各公链的只收不发收款钱包池。分为 <strong>EVM (全兼容链通用)</strong>、<strong>SOLANA</strong>、<strong>TRON</strong> 三大独立生态组。
        </div>
      </div>
      <n-space align="center">
        <n-button type="primary" secondary @click="showAddModal = true">
          添加充值收款钱包
        </n-button>
        <n-button secondary @click="fetchWallets">
          刷新列表
        </n-button>
      </n-space>
    </div>

    <!-- 顶部核心指示牌 -->
    <div class="stat-cards-grid">
      <div class="stat-card">
        <div class="stat-label">EVM 通用充值钱包</div>
        <div class="stat-value text-blue">{{ evmWallets.length }}</div>
        <div class="stat-sub">ETH / BSC / Polygon 共享</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">TRON 充值收款钱包</div>
        <div class="stat-value text-rose">{{ tronWallets.length }}</div>
        <div class="stat-sub">TRC20 USDT 专属金库</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">SOLANA 充值收款钱包</div>
        <div class="stat-value text-teal">{{ solanaWallets.length }}</div>
        <div class="stat-sub">SPL Token 独立地址池</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">在线激活通道</div>
        <div class="stat-value text-emerald">{{ activeCount }} / {{ wallets.length }}</div>
        <div class="stat-sub">动态调度与随机负载</div>
      </div>
    </div>

    <!-- 三大生态分类展示卡片 -->
    <n-card hoverable style="background: #111827; border: 1px solid #1e293b;">
      <n-tabs v-model:value="activeTab" type="segment" animated>
        <!-- EVM 生态 -->
        <n-tab-pane name="EVM" tab="EVM 生态组 (Ethereum · BSC · Polygon 通用)">
          <div class="tab-intro-banner">
            <span class="intro-tag evm">EVM 通用池</span>
            <span class="intro-desc">
              EVM 私钥公钥体系完全兼容。此处配置的地址池自动面向以太坊主网、币安智能链 BSC、Polygon、Arbitrum 等所有 EVM 兼容公链通用调度。
            </span>
          </div>
          <wallet-table :list="evmWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- TRON 生态 -->
        <n-tab-pane name="TRON" tab="TRON 生态组 (波场 TRC20 独立池)">
          <div class="tab-intro-banner">
            <span class="intro-tag tron">TRON 独立池</span>
            <span class="intro-desc">
              波场 TRON 采用 Base58Check 格式 (T 开头)，支持 TRC20-USDT 与 TRX 原生币充值收款独立金库通道。
            </span>
          </div>
          <wallet-table :list="tronWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- SOLANA 生态 -->
        <n-tab-pane name="SOLANA" tab="SOLANA 生态组 (SPL Token 独立池)">
          <div class="tab-intro-banner">
            <span class="intro-tag solana">SOLANA 独立池</span>
            <span class="intro-desc">
              Solana 采用 Ed25519 曲线与 Base58 格式，专属支持 SOL 与 SPL-USDT 资产的高速入金归集。
            </span>
          </div>
          <wallet-table :list="solanaWallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>

        <!-- 全部清单 -->
        <n-tab-pane name="ALL" tab="全量充值钱包矩阵">
          <wallet-table :list="wallets" @toggle="handleToggle" @delete="handleDelete" @edit="handleOpenEdit" />
        </n-tab-pane>
      </n-tabs>
    </n-card>

    <!-- 添加充值收款钱包弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      title="添加多链充值收款专属钱包"
      style="max-width: 520px; background: #111827; border: 1px solid #1e293b;"
    >
      <n-form :model="addForm" label-placement="top">
        <n-form-item label="所属公链生态类别 (3大类)" required>
          <n-select
            v-model:value="addForm.chain"
            :options="chainOptions"
            placeholder="请选择生态类别"
          />
        </n-form-item>

        <n-form-item label="钱包备注标签" required>
          <n-input
            v-model:value="addForm.label"
            placeholder="如: EVM04, TRON02, SOL02"
          />
        </n-form-item>

        <n-form-item label="收款钱包公钥地址 (只收不发)" required>
          <n-input
            v-model:value="addForm.address"
            placeholder="EVM: 0x... / TRON: T... / SOL: Base58"
          />
          <template #feedback>
            <span v-if="addForm.chain === 'EVM'" style="font-size: 11px; color: #64748b;">
              EVM 地址格式必须为 0x 开头的 42 位十六进制公钥，对 ETH / BSC 等全 EVM 链通用生效。
            </span>
            <span v-else-if="addForm.chain === 'TRON'" style="font-size: 11px; color: #64748b;">
              TRON 地址格式必须为 T 开头的 34 位 Base58Check 字符串。
            </span>
            <span v-else-if="addForm.chain === 'SOLANA'" style="font-size: 11px; color: #64748b;">
              Solana 地址格式必须为 32-44 位 Base58 公钥字符串。
            </span>
          </template>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showAddModal = false">取消</n-button>
          <n-button type="primary" :loading="isSubmitting" @click="handleAddSubmit">
            立即录入钱包
          </n-button>
        </n-space>
      </template>
    </n-modal>

    <!-- 编辑充值收款钱包弹窗 -->
    <n-modal
      v-model:show="showEditModal"
      preset="card"
      title="编辑充值收款专属钱包"
      style="max-width: 520px; background: #111827; border: 1px solid #1e293b;"
    >
      <n-form :model="editForm" label-placement="top">
        <n-form-item label="所属生态">
          <n-tag :type="editForm.chain === 'EVM' ? 'info' : editForm.chain === 'TRON' ? 'error' : 'success'">
            {{ editForm.chain }}
          </n-tag>
        </n-form-item>

        <n-form-item label="收款公钥地址 (只读)">
          <n-input :value="editForm.address" disabled />
        </n-form-item>

        <n-form-item label="钱包备注标签" required>
          <n-input v-model:value="editForm.label" placeholder="如: EVM01, TRON01" />
        </n-form-item>

        <n-form-item label="通道启用状态">
          <n-switch v-model:value="editForm.isActive" />
          <span style="margin-left: 8px; color: #94a3b8; font-size: 12px;">
            {{ editForm.isActive ? '当前激活：用户充值时可被调度' : '当前停用：暂不参与充值分配' }}
          </span>
        </n-form-item>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" :loading="isSavingEdit" @click="handleEditSubmit">
            保存修改
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
import { adminClient, type DepositWalletItem } from '../api/adminClient';
import { maskAddress, copyText } from '../utils/format';

const router = useRouter();
const message = useMessage();
const wallets = ref<DepositWalletItem[]>([]);
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
  isActive: true,
});

function handleOpenEdit(w: DepositWalletItem) {
  editForm.value = {
    id: w.id,
    chain: w.chain,
    address: w.address,
    label: w.label || '',
    isActive: w.isActive,
  };
  showEditModal.value = true;
}

async function handleEditSubmit() {
  if (!editForm.value.label.trim()) {
    message.warning('请填写备注标签');
    return;
  }
  isSavingEdit.value = true;
  try {
    await adminClient.updateDepositWallet(editForm.value.id, {
      label: editForm.value.label.trim(),
      isActive: editForm.value.isActive,
    });
    message.success('收款钱包配置已更新');
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
});

const chainOptions = [
  { label: 'EVM 生态组 (Ethereum / BSC / Polygon 共享)', value: 'EVM' },
  { label: 'TRON 生态组 (波场 TRC20 独立池)', value: 'TRON' },
  { label: 'SOLANA 生态组 (Solana SPL 独立池)', value: 'SOLANA' },
];

const evmWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'EVM'));
const tronWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'TRON'));
const solanaWallets = computed(() => wallets.value.filter((w) => w.chain.toUpperCase() === 'SOLANA'));
const activeCount = computed(() => wallets.value.filter((w) => w.isActive).length);

async function fetchWallets() {
  try {
    wallets.value = await adminClient.getDepositWallets();
  } catch (err: any) {
    message.error(err.message || '获取充值钱包列表失败');
  }
}

async function handleToggle(id: string, nextStatus: boolean) {
  try {
    await adminClient.toggleDepositWallet(id, nextStatus);
    message.success(nextStatus ? '已启用该充值收款通道' : '已暂停该充值收款通道');
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '切换状态失败');
  }
}

async function handleDelete(id: string) {
  try {
    await adminClient.deleteDepositWallet(id);
    message.success('已删除充值收款钱包配置');
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '删除失败');
  }
}

async function handleAddSubmit() {
  if (!addForm.value.address.trim()) {
    message.warning('请填写钱包公钥地址');
    return;
  }
  isSubmitting.value = true;
  try {
    await adminClient.addDepositWallet({
      chain: addForm.value.chain,
      address: addForm.value.address.trim(),
      label: addForm.value.label.trim() || undefined,
    });
    message.success('充值专属收款钱包配置成功');
    showAddModal.value = false;
    addForm.value = { chain: 'EVM', label: '', address: '' };
    await fetchWallets();
  } catch (err: any) {
    message.error(err.message || '录入充值钱包失败');
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  fetchWallets();
});

// 子组件：表格呈现
const WalletTable = defineComponent({
  props: {
    list: {
      type: Array as () => DepositWalletItem[],
      required: true,
    },
  },
  emits: ['toggle', 'delete', 'edit'],
  setup(props, { emit }) {
    return () => {
      if (props.list.length === 0) {
        return h('div', { style: 'padding: 40px 0; text-align: center; color: #64748b;' }, '该生态组暂无配置充值钱包');
      }

      return h('table', { class: 'custom-admin-table' }, [
        h('thead', [
          h('tr', [
            h('th', '生态大类'),
            h('th', '钱包备注标签'),
            h('th', '收款公钥地址 (Deposit Wallet)'),
            h('th', '通道状态'),
            h('th', '录入时间'),
            h('th', '操作'),
          ]),
        ]),
        h('tbody', props.list.map((item) => {
          return h('tr', { key: item.id }, [
            h('td', [
              h('span', { class: `chain-badge ${item.chain.toLowerCase()}` }, item.chain),
            ]),
            h('td', { style: 'font-weight: 600; color: #f1f5f9;' }, item.label || '未命名钱包'),
            h('td', [
              h('div', { style: 'display: flex; align-items: center; gap: 6px;' }, [
                h('span', {
                  style: 'font-family: monospace; font-size: 13px; color: #38bdf8; font-weight: 500; cursor: pointer;',
                  title: `点击复制完整地址: ${item.address}`,
                  onClick: () => copyText(item.address, () => message.success('已复制完整收款公钥')),
                }, maskAddress(item.address, 6, 4)),
                h('button', {
                  class: 'btn-copy-tiny',
                  title: '复制完整地址',
                  onClick: () => copyText(item.address, () => message.success('已复制完整收款公钥')),
                }, '复制'),
              ]),
            ]),
            h('td', [
              h('button', {
                class: `status-toggle-btn ${item.isActive ? 'active' : 'inactive'}`,
                onClick: () => emit('toggle', item.id, !item.isActive),
              }, item.isActive ? '启用中' : '已停用'),
            ]),
            h('td', { style: 'color: #64748b; font-size: 11px;' }, new Date(item.createdAt).toLocaleString()),
            h('td', [
              h('div', { style: 'display: flex; gap: 6px;' }, [
                h('button', {
                  class: 'btn-ledger-tiny',
                  title: '前往流水账本查看此收款钱包的所有充值流水',
                  onClick: () => router.push({ path: '/audit/ledger', query: { search: item.address, tab: 'deposits' } }),
                }, '查流水'),
                h('button', {
                  class: 'btn-edit-tiny',
                  onClick: () => emit('edit', item),
                }, '编辑'),
                h('button', {
                  class: 'btn-delete-tiny',
                  onClick: () => {
                    if (confirm('确认删除此充值收款钱包吗？')) {
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
.deposit-wallets-view {
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
.text-emerald { color: #34d399; }

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
