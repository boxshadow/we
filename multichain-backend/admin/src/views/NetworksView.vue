<template>
  <div class="networks-view">
    <!-- Header Action Bar -->
    <div class="page-header">
      <div>
        <div class="title-row">
          <n-icon size="24" color="#3b82f6"><ServerOutline /></n-icon>
          <h1 class="page-title">多链网络与 RPC 节点监控中枢</h1>
        </div>
        <p class="page-desc">实时诊断各公链节点连通性与出块高度，支持单链紧急熔断阻断与动态免重启热插拔。</p>
      </div>
      <div class="header-actions">
        <n-button :loading="loading" secondary @click="fetchNetworks" class="btn-subtle">
          <template #icon>
            <n-icon><RefreshOutline /></n-icon>
          </template>
          刷新状态
        </n-button>
        <n-button type="primary" @click="showAddModal = true">
          <template #icon>
            <n-icon><AddOutline /></n-icon>
          </template>
          注册新公链
        </n-button>
      </div>
    </div>

    <!-- Network Cards Grid -->
    <div class="networks-grid">
      <div v-for="net in networks" :key="net.networkId" class="network-card">
        <div class="net-card-header">
          <div class="net-identity">
            <span class="family-badge" :class="net.family.toLowerCase()">{{ net.family }}</span>
            <span class="net-name">{{ net.name }}</span>
          </div>
          <span class="status-indicator-badge" :class="net.security.isPaused ? 'badge-paused' : 'badge-active'">
            <span class="status-dot" :class="net.security.isPaused ? 'dot-rose' : 'dot-emerald'"></span>
            {{ net.security.isPaused ? '已熔断阻断' : '正常运行' }}
          </span>
        </div>

        <div class="net-body">
          <div class="info-row">
            <span class="label">网络标识 (ID)</span>
            <span class="val font-mono">{{ net.networkId }}</span>
          </div>
          <div class="info-row">
            <span class="label">Chain ID</span>
            <span class="val font-mono">{{ net.chainId ?? 'N/A' }}</span>
          </div>
          <div class="info-row">
            <span class="label">原生代币</span>
            <span class="val font-mono">{{ net.nativeCurrency?.symbol }} ({{ net.nativeCurrency?.decimals }}位)</span>
          </div>
          <div class="info-row">
            <span class="label">Primary RPC</span>
            <span class="val font-mono truncate" :title="net.httpRpc?.primaryUrl">
              {{ net.httpRpc?.primaryUrl }}
            </span>
          </div>

          <!-- Diagnostics Result (live or placeholder) -->
          <div v-if="testResults[net.networkId]" class="diag-box" :class="{ ok: testResults[net.networkId].success }">
            <div class="diag-header">
              <span class="diag-title">节点诊断结果</span>
              <span class="latency" :class="getLatencyClass(testResults[net.networkId].latencyMs)">
                {{ testResults[net.networkId].latencyMs }}ms
              </span>
            </div>
            <div class="diag-content font-mono">
              <span v-if="testResults[net.networkId].success">
                最新出块高度: #{{ testResults[net.networkId].blockNumber }}
              </span>
              <span v-else class="text-error">
                {{ testResults[net.networkId].error || '节点连接超时' }}
              </span>
            </div>
          </div>
          <div v-else class="diag-box placeholder">
            <div class="diag-header">
              <span class="diag-title">节点诊断状态</span>
              <span class="latency text-muted">待探测</span>
            </div>
            <div class="diag-content text-muted">
              点击下方按钮探测 RPC 连通性与最新区块
            </div>
          </div>
        </div>

        <div class="net-card-footer">
          <n-button
            size="tiny"
            secondary
            :loading="testingNetId === net.networkId"
            @click="testRpc(net.networkId)"
          >
            <template #icon>
              <n-icon><PulseOutline /></n-icon>
            </template>
            诊断 RPC
          </n-button>
          
          <n-button
            size="tiny"
            :type="net.security.isPaused ? 'success' : 'warning'"
            secondary
            @click="togglePause(net)"
          >
            <template #icon>
              <n-icon><PlayCircleOutline v-if="net.security.isPaused" /><PauseCircleOutline v-else /></n-icon>
            </template>
            {{ net.security.isPaused ? '恢复通行' : '紧急熔断' }}
          </n-button>

          <n-button
            size="tiny"
            secondary
            @click="handleOpenEdit(net)"
          >
            <template #icon>
              <n-icon><CreateOutline /></n-icon>
            </template>
            编辑
          </n-button>

          <n-button
            size="tiny"
            type="error"
            secondary
            @click="handleDeleteNetwork(net)"
          >
            <template #icon>
              <n-icon><TrashOutline /></n-icon>
            </template>
            删除
          </n-button>
        </div>
      </div>
    </div>

    <!-- Modal: 添加新公链 -->
    <n-modal v-model:show="showAddModal" preset="card" title="注册新公链网络" style="max-width: 580px; background: #111827; border: 1px solid #1e293b;">
      <n-form :model="form" label-placement="top">
        <n-grid :x-gap="12" :cols="2">
          <n-form-item-gi label="网络标识符 (ID)">
            <n-input v-model:value="form.networkId" placeholder="如 arbitrum, base" />
          </n-form-item-gi>
          <n-form-item-gi label="网络名称">
            <n-input v-model:value="form.name" placeholder="如 Arbitrum One" />
          </n-form-item-gi>
        </n-grid>

        <n-grid :x-gap="12" :cols="2">
          <n-form-item-gi label="链生态类型 (Family)">
            <n-select
              v-model:value="form.family"
              :options="[
                { label: 'EVM 体系 (以太坊/L2)', value: 'EVM' },
                { label: 'TRON 体系 (波场)', value: 'TRON' },
                { label: 'SOLANA 体系', value: 'SOLANA' }
              ]"
            />
          </n-form-item-gi>
          <n-form-item-gi label="Chain ID (EVM 必填)">
            <n-input-number v-model:value="form.chainId" :show-button="false" placeholder="如 42161" />
          </n-form-item-gi>
        </n-grid>

        <n-grid :x-gap="12" :cols="3">
          <n-form-item-gi label="原生币符号">
            <n-input v-model:value="form.symbol" placeholder="ETH" />
          </n-form-item-gi>
          <n-form-item-gi label="币名称">
            <n-input v-model:value="form.currencyName" placeholder="Ether" />
          </n-form-item-gi>
          <n-form-item-gi label="精度 (Decimals)">
            <n-input-number v-model:value="form.decimals" :show-button="false" placeholder="18" />
          </n-form-item-gi>
        </n-grid>

        <n-form-item label="Primary HTTP RPC 节点">
          <n-input v-model:value="form.primaryRpc" placeholder="https://..." />
        </n-form-item>

        <n-form-item label="区块浏览器交易链接模板">
          <n-input v-model:value="form.txUrl" placeholder="https://arbiscan.io/tx/{txHash}" />
        </n-form-item>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px;">
          <n-button @click="showAddModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="handleSaveNetwork">确认注册并生效</n-button>
        </div>
      </n-form>
    </n-modal>

    <!-- Modal: 编辑公链配置 -->
    <n-modal v-model:show="showEditModal" preset="card" title="编辑公链配置与 RPC 节点" style="max-width: 580px; background: #111827; border: 1px solid #1e293b;">
      <n-form :model="editForm" label-placement="top">
        <n-grid :x-gap="12" :cols="2">
          <n-form-item-gi label="网络标识符 (只读)">
            <n-input :value="editForm.networkId" disabled />
          </n-form-item-gi>
          <n-form-item-gi label="公链展示名称">
            <n-input v-model:value="editForm.name" placeholder="如 Ethereum Mainnet" />
          </n-form-item-gi>
        </n-grid>

        <n-grid :x-gap="12" :cols="2">
          <n-form-item-gi label="链生态类型 (Family)">
            <n-tag size="medium" :type="editForm.family === 'EVM' ? 'info' : editForm.family === 'TRON' ? 'error' : 'success'">
              {{ editForm.family }}
            </n-tag>
          </n-form-item-gi>
          <n-form-item-gi label="Chain ID">
            <n-input-number v-model:value="editForm.chainId" :show-button="false" />
          </n-form-item-gi>
        </n-grid>

        <n-grid :x-gap="12" :cols="3">
          <n-form-item-gi label="原生币符号">
            <n-input v-model:value="editForm.symbol" />
          </n-form-item-gi>
          <n-form-item-gi label="币名称">
            <n-input v-model:value="editForm.currencyName" />
          </n-form-item-gi>
          <n-form-item-gi label="精度 (Decimals)">
            <n-input-number v-model:value="editForm.decimals" :show-button="false" />
          </n-form-item-gi>
        </n-grid>

        <n-form-item label="Primary HTTP RPC 节点">
          <n-input v-model:value="editForm.primaryRpc" placeholder="https://..." />
        </n-form-item>

        <n-form-item label="Secondary 备用 RPC 节点 (可选)">
          <n-input v-model:value="editForm.secondaryRpc" placeholder="https://..." />
        </n-form-item>

        <n-form-item label="区块浏览器交易链接模板">
          <n-input v-model:value="editForm.txUrl" placeholder="https://etherscan.io/tx/{txHash}" />
        </n-form-item>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 12px;">
          <n-button @click="showEditModal = false">取消</n-button>
          <n-button type="primary" :loading="savingEdit" @click="handleSaveEditNetwork">保存并更新配置</n-button>
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useMessage, useDialog } from 'naive-ui';
import {
  ServerOutline,
  RefreshOutline,
  AddOutline,
  PulseOutline,
  PauseCircleOutline,
  PlayCircleOutline,
  CreateOutline,
  TrashOutline,
} from '@vicons/ionicons5';
import { networkApi, type NetworkItem, type TestRpcResult } from '../api/network';

const message = useMessage();
const dialog = useDialog();

const loading = ref(false);
const networks = ref<NetworkItem[]>([]);
const testResults = ref<Record<string, TestRpcResult>>({});
const testingNetId = ref<string | null>(null);

const showAddModal = ref(false);
const saving = ref(false);
const form = ref({
  networkId: '',
  name: '',
  family: 'EVM' as 'EVM' | 'SOLANA' | 'TRON',
  chainId: 1 as number | null,
  symbol: 'ETH',
  currencyName: 'Ether',
  decimals: 18,
  primaryRpc: '',
  txUrl: ''
});

const showEditModal = ref(false);
const savingEdit = ref(false);
const editForm = ref({
  networkId: '',
  name: '',
  family: 'EVM' as 'EVM' | 'SOLANA' | 'TRON',
  chainId: 1 as number | null,
  symbol: 'ETH',
  currencyName: 'Ether',
  decimals: 18,
  primaryRpc: '',
  secondaryRpc: '',
  txUrl: ''
});

function handleOpenEdit(net: NetworkItem) {
  editForm.value = {
    networkId: net.networkId,
    name: net.name,
    family: net.family,
    chainId: net.chainId,
    symbol: net.nativeCurrency?.symbol || '',
    currencyName: net.nativeCurrency?.name || '',
    decimals: net.nativeCurrency?.decimals ?? 18,
    primaryRpc: net.httpRpc?.primaryUrl || '',
    secondaryRpc: net.httpRpc?.secondaryUrl || '',
    txUrl: net.blockExplorer?.txUrl || ''
  };
  showEditModal.value = true;
}

async function handleSaveEditNetwork() {
  if (!editForm.value.name || !editForm.value.primaryRpc) {
    message.error('请填写完整的网络名称与 RPC 地址');
    return;
  }
  savingEdit.value = true;
  try {
    await networkApi.updateNetwork(editForm.value.networkId, {
      name: editForm.value.name.trim(),
      chainId: editForm.value.chainId,
      nativeCurrency: {
        name: editForm.value.currencyName,
        symbol: editForm.value.symbol,
        decimals: editForm.value.decimals
      },
      httpRpc: {
        primaryUrl: editForm.value.primaryRpc.trim(),
        secondaryUrl: editForm.value.secondaryRpc?.trim() || undefined
      },
      blockExplorer: {
        name: 'Explorer',
        txUrl: editForm.value.txUrl.trim() || 'https://explorer.com/tx/{txHash}',
        addressUrl: 'https://explorer.com/address/{address}'
      }
    });
    message.success(`公链 [${editForm.value.name}] 配置更新成功`);
    showEditModal.value = false;
    await fetchNetworks();
  } catch (err: any) {
    message.error(err.message || '更新公链配置失败');
  } finally {
    savingEdit.value = false;
  }
}

function handleDeleteNetwork(net: NetworkItem) {
  dialog.error({
    title: `确认注销并删除公链 [${net.name}]？`,
    content: `删除后，系统将卸载该公链节点及通信路由 (${net.networkId})。如果该网络有正在处理中的充提订单，请谨慎操作！`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await networkApi.deleteNetwork(net.networkId);
        message.success(`公链 [${net.name}] 已成功从系统中卸载`);
        await fetchNetworks();
      } catch (err: any) {
        message.error(err.message || '删除公链失败');
      }
    }
  });
}

async function fetchNetworks() {
  loading.value = true;
  try {
    networks.value = await networkApi.getNetworks();
  } catch (e: any) {
    message.error('获取网络列表失败: ' + (e.message || '未知错误'));
  } finally {
    loading.value = false;
  }
}

async function testRpc(networkId: string) {
  testingNetId.value = networkId;
  try {
    const res = await networkApi.testRpc(networkId);
    testResults.value[networkId] = res;
    if (res.success) {
      message.success(`[${networkId}] 连通测试通过! 延迟: ${res.latencyMs}ms`);
    } else {
      message.error(`[${networkId}] 连通失败: ${res.error}`);
    }
  } catch (e: any) {
    message.error('测试请求异常');
  } finally {
    testingNetId.value = null;
  }
}

async function togglePause(net: NetworkItem) {
  const newPaused = !net.security.isPaused;
  const actionText = newPaused ? '熔断阻断' : '恢复流通';
  try {
    await networkApi.togglePause(net.networkId, newPaused);
    message.warning(`公链 [${net.name}] 已${actionText}`);
    await fetchNetworks();
  } catch (e: any) {
    message.error(`${actionText}操作失败: ` + e.message);
  }
}

async function handleSaveNetwork() {
  if (!form.value.networkId || !form.value.name || !form.value.primaryRpc) {
    message.error('请填写完整的基础信息');
    return;
  }
  saving.value = true;
  try {
    await networkApi.registerNetwork({
      networkId: form.value.networkId.trim().toLowerCase(),
      name: form.value.name.trim(),
      family: form.value.family,
      chainId: form.value.chainId,
      nativeCurrency: {
        name: form.value.currencyName,
        symbol: form.value.symbol,
        decimals: form.value.decimals
      },
      httpRpc: {
        primaryUrl: form.value.primaryRpc.trim()
      },
      blockExplorer: {
        name: 'Explorer',
        txUrl: form.value.txUrl.trim() || 'https://explorer.com/tx/{txHash}',
        addressUrl: 'https://explorer.com/address/{address}'
      }
    });
    message.success('新公链网络注册成功并已上线');
    showAddModal.value = false;
    form.value = {
      networkId: '',
      name: '',
      family: 'EVM',
      chainId: 1,
      symbol: 'ETH',
      currencyName: 'Ether',
      decimals: 18,
      primaryRpc: '',
      txUrl: ''
    };
    await fetchNetworks();
  } catch (e: any) {
    message.error('注册公链网络失败: ' + e.message);
  } finally {
    saving.value = false;
  }
}

function getLatencyClass(ms?: number) {
  if (!ms) return '';
  if (ms < 300) return 'fast';
  if (ms < 1000) return 'medium';
  return 'slow';
}

onMounted(() => {
  fetchNetworks();
});
</script>

<style scoped>
.networks-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 20px;
  border-bottom: 1px solid #1e293b;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.02em;
}

.page-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-subtle {
  background: #1e293b;
  border: 1px solid #334155;
  color: #f8fafc;
}

/* Networks Grid */
.networks-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 1200px) {
  .networks-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 720px) {
  .networks-grid {
    grid-template-columns: 1fr;
  }
}

.network-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 0.15s ease;
}

.network-card:hover {
  border-color: #334155;
}

.net-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid #1e293b;
  margin-bottom: 14px;
}

.net-identity {
  display: flex;
  align-items: center;
  gap: 8px;
}

.family-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.family-badge.evm {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.family-badge.tron {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.family-badge.solana {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.net-name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.status-indicator-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 500;
}

.badge-active {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.badge-paused {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
}

.status-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.dot-emerald {
  background: #10b981;
}

.dot-rose {
  background: #ef4444;
}

.net-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}

.info-row .label {
  color: #64748b;
}

.info-row .val {
  color: #cbd5e1;
}

.truncate {
  max-width: 170px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Diagnostics Box */
.diag-box {
  margin-top: 10px;
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px;
}

.diag-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.diag-title {
  font-size: 11px;
  color: #64748b;
}

.latency {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.latency.fast { color: #10b981; }
.latency.medium { color: #f59e0b; }
.latency.slow { color: #ef4444; }

.diag-content {
  font-size: 11px;
  color: #94a3b8;
}

.text-muted { color: #64748b; }
.text-error { color: #ef4444; }

/* Card Footer */
.net-card-footer {
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #1e293b;
}

.font-mono {
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
}
</style>
