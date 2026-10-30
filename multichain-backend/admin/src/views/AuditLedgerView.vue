<template>
  <div class="audit-ledger-view">
    <!-- 页面标题与操作 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">资金充提流水总账本 (Transaction Ledger & Audit)</h2>
        <div class="page-subtitle">
          全平台多链充值入账订单、热钱包提现放款流水、冷热金库归集统一对账与风控拦截审计
        </div>
      </div>
      <n-space align="center">
        <n-button type="primary" secondary @click="fetchData">
          刷新账本流水
        </n-button>
      </n-space>
    </div>

    <!-- 二级导航栏 -->
    <div class="audit-sub-nav">
      <router-link to="/audit/analytics" class="sub-nav-btn">
        <span class="sub-nav-text">运营可视化大屏</span>
        <span class="sub-nav-badge">15天走势 & 水位</span>
      </router-link>
      <router-link to="/audit/ledger" class="sub-nav-btn active">
        <span class="sub-nav-text">充提流水总账本</span>
        <span class="sub-nav-badge">流水 · 充值 · 提现</span>
      </router-link>
    </div>

    <!-- 多维度筛选栏 -->
    <div class="filter-toolbar">
      <div class="filter-group">
        <span class="filter-label">筛选条件:</span>
        <n-select
          v-model:value="filterChain"
          :options="chainFilterOptions"
          placeholder="公链生态"
          style="width: 140px;"
          @update:value="applyFilters"
        />
        <n-select
          v-model:value="filterToken"
          :options="tokenFilterOptions"
          placeholder="代币代码"
          style="width: 120px;"
          @update:value="applyFilters"
        />
        <n-select
          v-model:value="filterStatus"
          :options="statusFilterOptions"
          placeholder="订单状态"
          style="width: 130px;"
          @update:value="applyFilters"
        />
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索 TxHash / 钱包地址 / 用户主账号ID..."
          clearable
          style="width: 320px;"
          @update:value="applyFilters"
        />
        <n-button secondary @click="resetFilters">重置筛选</n-button>
      </div>
    </div>

    <!-- 三大核心账本标签页 -->
    <n-card hoverable style="background: #111827; border: 1px solid #1e293b;">
      <n-tabs v-model:value="activeLedgerTab" type="segment" animated>
        <!-- Tab 1: 全局资金流水总账本 -->
        <n-tab-pane name="transactions" :tab="`全局资金流水总账本 (${transactionsList.length})`">
          <div class="tab-header-row">
            <span class="tab-caption">汇集全平台多链充值入账、提现出款与冷热金库归集统一流水记录</span>
            <n-tag type="info" size="small" round>实时区块同步</n-tag>
          </div>

          <div v-if="transactionsList.length === 0" class="empty-holder">
            暂无匹配的资金流水记录
          </div>

          <table v-else class="custom-admin-table">
            <thead>
              <tr>
                <th>流水类型</th>
                <th>公链生态</th>
                <th>代币 / 金额</th>
                <th>出资原地址 (From)</th>
                <th>收款目标地址 (To)</th>
                <th>链上 TxHash</th>
                <th>确认状态</th>
                <th>产生时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in transactionsList" :key="item.id">
                <td>
                  <span
                    class="type-pill"
                    :class="{
                      deposit: item.type === 'DEPOSIT',
                      withdraw: item.type === 'WITHDRAWAL',
                      sweep: item.type === 'SWEEP',
                    }"
                  >
                    {{ item.type === 'DEPOSIT' ? '充值' : item.type === 'WITHDRAWAL' ? '提现' : '归集' }}
                  </span>
                </td>
                <td>
                  <span class="chain-badge" :class="item.chain.toLowerCase()">{{ item.chain }}</span>
                  <span class="net-text">({{ item.network }})</span>
                </td>
                <td>
                  <span class="amt-bold" :class="item.type === 'DEPOSIT' ? 'dep' : 'wth'">
                    {{ item.type === 'DEPOSIT' ? '+' : item.type === 'WITHDRAWAL' ? '-' : '' }}{{ item.amount }} {{ item.tokenSymbol }}
                  </span>
                </td>
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(item.fromAddress, '已复制出资原地址')">
                          {{ formatAddress(item.fromAddress) }}
                        </span>
                      </template>
                      {{ item.fromAddress || '未知地址' }} (点击复制)
                    </n-tooltip>
                    <button v-if="item.fromAddress" class="mini-icon-btn" title="复制完整地址" @click.stop="copyText(item.fromAddress, '已复制出资原地址')">复制</button>
                    <a v-if="item.fromAddress" :href="getExplorerAddressUrl(item.chain, item.fromAddress)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                </td>
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(item.toAddress, '已复制收款目标地址')">
                          {{ formatAddress(item.toAddress) }}
                        </span>
                      </template>
                      {{ item.toAddress || '未知地址' }} (点击复制)
                    </n-tooltip>
                    <button v-if="item.toAddress" class="mini-icon-btn" title="复制完整地址" @click.stop="copyText(item.toAddress, '已复制收款目标地址')">复制</button>
                    <a v-if="item.toAddress" :href="getExplorerAddressUrl(item.chain, item.toAddress)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                </td>
                <td class="mono-col">
                  <div v-if="item.txHash" class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="tx-link" @click="copyText(item.txHash, '已复制 TxHash')">
                          {{ item.txHash.slice(0, 8) }}...{{ item.txHash.slice(-6) }}
                        </span>
                      </template>
                      {{ item.txHash }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制 TxHash" @click.stop="copyText(item.txHash, '已复制 TxHash')">复制</button>
                    <a :href="getExplorerTxUrl(item.chain, item.txHash)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看交易">链上</a>
                  </div>
                  <span v-else style="color: #64748b;">-</span>
                </td>
                <td>
                  <span class="status-badge" :class="item.status.toLowerCase()">
                    {{ item.status }}
                  </span>
                </td>
                <td class="time-col">{{ new Date(item.timestamp).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </n-tab-pane>

        <!-- Tab 2: 充值入金订单记录 -->
        <n-tab-pane name="deposits" :tab="`充值入金订单记录 (${depositsList.length})`">
          <div class="tab-header-row">
            <span class="tab-caption">用户前端调起钱包加签或移动端扫码专属金库充值明细</span>
            <n-tag type="success" size="small" round>智能验签与对账入账已就绪</n-tag>
          </div>

          <div v-if="depositsList.length === 0" class="empty-holder">
            暂无匹配的充值订单记录
          </div>

          <table v-else class="custom-admin-table">
            <thead>
              <tr>
                <th>订单编号</th>
                <th>用户主账号 (点击直达画像)</th>
                <th>公链生态</th>
                <th>代币 / 金额</th>
                <th>专属收款地址 (Wallet A)</th>
                <th>用户打款来源</th>
                <th>TxHash</th>
                <th>区块确认</th>
                <th>入账状态</th>
                <th>创建/确认时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="d in depositsList" :key="d.id">
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <span>{{ d.id.slice(0, 8) }}...</span>
                    <button class="mini-icon-btn" title="复制订单号" @click="copyText(d.id, '已复制充值订单号')">复制</button>
                  </div>
                </td>
                <td class="user-col">
                  <n-tooltip v-if="d.userId" trigger="hover">
                    <template #trigger>
                      <span class="user-link-pill" @click="jumpToUserProfile(d.userId)">
                        {{ d.userId.slice(0, 8) }}...
                      </span>
                    </template>
                    {{ d.userId }} (点击前往查看该用户画像及所有资产)
                  </n-tooltip>
                  <span v-else style="color: #64748b;">匿名入账</span>
                </td>
                <td>
                  <span class="chain-badge" :class="d.chain.toLowerCase()">{{ d.chain }}</span>
                </td>
                <td>
                  <span class="amt-bold dep">+{{ d.actualAmount || d.amount }} {{ d.tokenSymbol }}</span>
                </td>
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(d.depositAddress, '已复制收款金库地址')">
                          {{ formatAddress(d.depositAddress) }}
                        </span>
                      </template>
                      {{ d.depositAddress }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制收款地址" @click="copyText(d.depositAddress, '已复制收款金库地址')">复制</button>
                    <a :href="getExplorerAddressUrl(d.chain, d.depositAddress)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                </td>
                <td class="mono-col">
                  <div v-if="d.fromAddress" class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(d.fromAddress, '已复制用户来源地址')">
                          {{ formatAddress(d.fromAddress) }}
                        </span>
                      </template>
                      {{ d.fromAddress }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制打款地址" @click="copyText(d.fromAddress, '已复制用户来源地址')">复制</button>
                    <a :href="getExplorerAddressUrl(d.chain, d.fromAddress)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                  <span v-else style="color: #64748b;">-</span>
                </td>
                <td class="mono-col">
                  <div v-if="d.txHash" class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="tx-link" @click="copyText(d.txHash, '已复制 TxHash')">
                          {{ d.txHash.slice(0, 8) }}...
                        </span>
                      </template>
                      {{ d.txHash }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制 TxHash" @click="copyText(d.txHash, '已复制 TxHash')">复制</button>
                    <a :href="getExplorerTxUrl(d.chain, d.txHash)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看交易">链上</a>
                  </div>
                  <span v-else style="color: #64748b;">待广播</span>
                </td>
                <td>
                  <span v-if="d.confirmations" style="color: #10b981; font-weight: 600;">{{ d.confirmations }} 确认</span>
                  <span v-else style="color: #64748b;">0/3</span>
                </td>
                <td>
                  <span class="status-badge" :class="d.status.toLowerCase()">{{ d.status }}</span>
                </td>
                <td class="time-col">{{ new Date(d.confirmedAt || d.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </n-tab-pane>

        <!-- Tab 3: 提现出金放款记录 -->
        <n-tab-pane name="withdrawals" :tab="`提现出金放款记录 (${withdrawalsList.length})`">
          <div class="tab-header-row">
            <span class="tab-caption">服务端使用专属提现热钱包向用户出资打款记录</span>
            <n-tag type="warning" size="small" round>单日出金限额风控拦截已启动</n-tag>
          </div>

          <div v-if="withdrawalsList.length === 0" class="empty-holder">
            暂无匹配的提现订单记录
          </div>

          <table v-else class="custom-admin-table">
            <thead>
              <tr>
                <th>提现订单号</th>
                <th>用户主账号 (点击直达画像)</th>
                <th>公链生态</th>
                <th>提现金额</th>
                <th>出款金库 (From Vault)</th>
                <th>用户接收地址 (To Address)</th>
                <th>TxHash</th>
                <th>放款状态</th>
                <th>异常原因</th>
                <th>申请/放款时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in withdrawalsList" :key="w.id">
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <span>{{ w.id.slice(0, 8) }}...</span>
                    <button class="mini-icon-btn" title="复制提现单号" @click="copyText(w.id, '已复制提现订单号')">复制</button>
                  </div>
                </td>
                <td class="user-col">
                  <n-tooltip v-if="w.userId" trigger="hover">
                    <template #trigger>
                      <span class="user-link-pill" @click="jumpToUserProfile(w.userId)">
                        {{ w.userId.slice(0, 8) }}...
                      </span>
                    </template>
                    {{ w.userId }} (点击前往查看该用户画像及所有资产)
                  </n-tooltip>
                  <span v-else style="color: #64748b;">系统出金</span>
                </td>
                <td>
                  <span class="chain-badge" :class="w.chain.toLowerCase()">{{ w.chain }}</span>
                </td>
                <td>
                  <span class="amt-bold wth">-{{ w.amount }} {{ w.tokenSymbol }}</span>
                </td>
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(w.fromVault, '已复制出金金库地址')">
                          {{ formatAddress(w.fromVault) }}
                        </span>
                      </template>
                      {{ w.fromVault }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制出金金库地址" @click="copyText(w.fromVault, '已复制出金金库地址')">复制</button>
                    <a :href="getExplorerAddressUrl(w.chain, w.fromVault)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                </td>
                <td class="mono-col">
                  <div class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="masked-addr-pill" @click="copyText(w.toAddress, '已复制用户接收地址')">
                          {{ formatAddress(w.toAddress) }}
                        </span>
                      </template>
                      {{ w.toAddress }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制接收地址" @click="copyText(w.toAddress, '已复制用户接收地址')">复制</button>
                    <a :href="getExplorerAddressUrl(w.chain, w.toAddress)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看">链上</a>
                  </div>
                </td>
                <td class="mono-col">
                  <div v-if="w.txHash" class="addr-action-wrap">
                    <n-tooltip trigger="hover">
                      <template #trigger>
                        <span class="tx-link" @click="copyText(w.txHash, '已复制 TxHash')">
                          {{ w.txHash.slice(0, 8) }}...
                        </span>
                      </template>
                      {{ w.txHash }} (点击复制)
                    </n-tooltip>
                    <button class="mini-icon-btn" title="复制 TxHash" @click="copyText(w.txHash, '已复制 TxHash')">复制</button>
                    <a :href="getExplorerTxUrl(w.chain, w.txHash)" target="_blank" class="mini-icon-btn explorer" title="在区块链浏览器中查看交易">链上</a>
                  </div>
                  <span v-else style="color: #64748b;">待放款</span>
                </td>
                <td>
                  <span class="status-badge" :class="w.status.toLowerCase()">{{ w.status }}</span>
                </td>
                <td>
                  <span v-if="w.errorMessage" class="error-text" :title="w.errorMessage">
                    {{ w.errorMessage.slice(0, 24) }}...
                  </span>
                  <span v-else style="color: #64748b;">-</span>
                </td>
                <td class="time-col">{{ new Date(w.confirmedAt || w.createdAt).toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </n-tab-pane>
      </n-tabs>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  adminClient,
  type TransactionItem,
} from '../api/adminClient';
import {
  maskAddress,
  copyText as copyToClipboard,
  getExplorerAddressUrl,
  getExplorerTxUrl,
} from '../utils/format';

const router = useRouter();
const route = useRoute();
const message = useMessage();

const activeLedgerTab = ref('transactions');
const filterChain = ref('ALL');
const filterToken = ref('ALL');
const filterStatus = ref('ALL');
const searchKeyword = ref('');

const chainFilterOptions = [
  { label: '全部生态', value: 'ALL' },
  { label: 'EVM 兼容链', value: 'EVM' },
  { label: '波场 TRON', value: 'TRON' },
  { label: 'Solana', value: 'SOLANA' },
];

const tokenFilterOptions = [
  { label: '全部代币', value: 'ALL' },
  { label: 'USDT', value: 'USDT' },
  { label: 'ETH', value: 'ETH' },
  { label: 'SOL', value: 'SOL' },
  { label: 'TRX', value: 'TRX' },
  { label: 'BNB', value: 'BNB' },
];

const statusFilterOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: 'CONFIRMED / 成功', value: 'CONFIRMED' },
  { label: 'PENDING / 待确认', value: 'PENDING' },
  { label: 'PROCESSING / 放款中', value: 'PROCESSING' },
  { label: 'FAILED / 异常失败', value: 'FAILED' },
];

const transactionsList = ref<TransactionItem[]>([]);
const depositsList = ref<any[]>([]);
const withdrawalsList = ref<any[]>([]);

function formatAddress(addr?: string) {
  return maskAddress(addr, 6, 4);
}

function copyText(txt?: string, tip = '已复制到剪贴板') {
  if (!txt) return;
  copyToClipboard(txt, () => {
    message.success(tip);
  });
}

function jumpToUserProfile(userId?: string) {
  if (!userId) return;
  router.push({ path: '/users', query: { search: userId, userId } });
}

async function fetchData() {
  await applyFilters();
}

async function applyFilters() {
  const queryParams: Record<string, string> = {};
  if (filterChain.value !== 'ALL') queryParams.chain = filterChain.value;
  if (filterToken.value !== 'ALL') queryParams.token = filterToken.value;
  if (filterStatus.value !== 'ALL') queryParams.status = filterStatus.value;
  if (searchKeyword.value.trim()) queryParams.search = searchKeyword.value.trim();

  try {
    const [txRes, depRes, wthRes] = await Promise.all([
      adminClient.getTransactions(queryParams),
      adminClient.getDeposits(queryParams),
      adminClient.getWithdrawals(queryParams),
    ]);

    transactionsList.value = txRes.list;
    depositsList.value = depRes.list;
    withdrawalsList.value = wthRes.list;
  } catch (err: any) {
    message.error('筛选查询流水失败: ' + err.message);
  }
}

function resetFilters() {
  filterChain.value = 'ALL';
  filterToken.value = 'ALL';
  filterStatus.value = 'ALL';
  searchKeyword.value = '';
  applyFilters();
}

onMounted(() => {
  if (route.query.search) {
    searchKeyword.value = String(route.query.search);
  }
  if (route.query.tab) {
    activeLedgerTab.value = String(route.query.tab);
  }
  if (route.query.chain) {
    filterChain.value = String(route.query.chain);
  }
  fetchData();
});
</script>

<style scoped>
.audit-ledger-view {
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

/* 二级导航栏 */
.audit-sub-nav {
  display: flex;
  gap: 12px;
  padding: 4px;
  background: #090e1a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  width: fit-content;
}

.sub-nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 8px;
  text-decoration: none;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.sub-nav-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.04);
}

.sub-nav-btn.active {
  background: #1e293b;
  color: #00e5ff;
  border: 1px solid rgba(0, 229, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 229, 255, 0.1);
}

.sub-nav-icon {
  font-size: 14px;
}

.sub-nav-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: #64748b;
  font-weight: 500;
}

.sub-nav-btn.active .sub-nav-badge {
  background: rgba(0, 229, 255, 0.15);
  color: #00e5ff;
}

/* 筛选工具栏 */
.filter-toolbar {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 10px 14px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 600;
}

/* 表格与 Tab */
.tab-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.tab-caption {
  font-size: 12px;
  color: #94a3b8;
}

.empty-holder {
  padding: 40px 0;
  text-align: center;
  color: #64748b;
  font-size: 13px;
}

.custom-admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
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
  padding: 10px 12px;
  border-bottom: 1px solid #1e293b;
  color: #cbd5e1;
}

.addr-action-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-icon-btn {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 3px;
  cursor: pointer;
  padding: 1px 5px;
  font-size: 11px;
  color: #94a3b8;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mini-icon-btn:hover {
  background: #334155;
  color: #f8fafc;
}
.mini-icon-btn.explorer {
  text-decoration: none;
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.3);
}
.mini-icon-btn.explorer:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #93c5fd;
  border-color: #3b82f6;
}

.type-pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}
.type-pill.deposit { background: rgba(16, 185, 129, 0.15); color: #34d399; }
.type-pill.withdraw { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
.type-pill.sweep { background: rgba(0, 229, 255, 0.15); color: #00e5ff; }

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

.net-text {
  font-size: 10px;
  color: #64748b;
  margin-left: 4px;
}

.amt-bold {
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}
.amt-bold.dep { color: #10b981; }
.amt-bold.wth { color: #f59e0b; }

.mono-col {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #94a3b8;
}

.tx-link {
  color: #38bdf8;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
}
.tx-link:hover {
  text-decoration: underline;
}

.user-col {
  font-size: 11px;
}

.user-link-pill {
  color: #38bdf8;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 2px 6px;
  background: rgba(56, 189, 248, 0.1);
  border-radius: 4px;
  transition: all 0.15s ease;
}
.user-link-pill:hover {
  background: rgba(56, 189, 248, 0.2);
  text-decoration: underline;
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
  font-family: monospace;
}
.status-badge.confirmed, .status-badge.success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}
.status-badge.pending, .status-badge.confirming, .status-badge.submitted {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}
.status-badge.failed, .status-badge.expired {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.error-text {
  color: #ef4444;
  font-size: 11px;
}

.time-col {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}

.masked-addr-pill {
  cursor: pointer;
  color: #cbd5e1;
  transition: color 0.15s;
  font-family: 'JetBrains Mono', monospace;
}
.masked-addr-pill:hover {
  text-decoration: underline;
  color: #38bdf8;
}
</style>
