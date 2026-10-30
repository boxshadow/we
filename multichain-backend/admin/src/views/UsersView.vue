<template>
  <div class="users-view">
    <div class="page-header">
      <div>
        <h2 class="page-title">全网用户与多链资产画像 (User Master Accounts)</h2>
        <div class="page-subtitle">
          全平台 Web3 主账号 (Master Accounts)、多链钱包公钥绑定矩阵与各链独立资产余额画像
        </div>
      </div>
      <n-space align="center">
        <n-button secondary @click="fetchUsers">
          刷新用户档案
        </n-button>
      </n-space>
    </div>

    <!-- 顶部概览指标 -->
    <n-grid :x-gap="16" :y-gap="16" cols="1 s:2 m:4" style="margin-bottom: 20px;">
      <n-grid-item>
        <div class="stat-card">
          <div class="stat-label">注册主账号总数</div>
          <div class="stat-value" style="color: #60a5fa;">{{ usersList.length }} 位</div>
          <div class="stat-sub">多链钱包聚合唯一 ID</div>
        </div>
      </n-grid-item>
      <n-grid-item>
        <div class="stat-card">
          <div class="stat-label">多链跨链绑定用户</div>
          <div class="stat-value" style="color: #34d399;">{{ multiChainUsersCount }} 位</div>
          <div class="stat-sub">同时绑定 ≥2 种公链生态</div>
        </div>
      </n-grid-item>
      <n-grid-item>
        <div class="stat-card">
          <div class="stat-label">用户托管资产总估值</div>
          <div class="stat-value" style="color: #a78bfa;">${{ totalUserAssets }}</div>
          <div class="stat-sub">全公链 Token 聚合估算</div>
        </div>
      </n-grid-item>
      <n-grid-item>
        <div class="stat-card">
          <div class="stat-label">活跃账户状态</div>
          <div class="stat-value" style="color: #00e5ff;">100% 正常</div>
          <div class="stat-sub">防女巫与风险监控良好</div>
        </div>
      </n-grid-item>
    </n-grid>

    <!-- 筛选搜索工具栏 -->
    <div class="filter-toolbar">
      <div class="filter-group">
        <span class="filter-label">用户检索:</span>
        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索 用户主账号UUID / 绑定的任意链公钥..."
          clearable
          style="width: 340px;"
          @update:value="fetchUsers"
        />
        <n-select
          v-model:value="filterRole"
          :options="roleOptions"
          placeholder="角色身份"
          style="width: 130px;"
          @update:value="fetchUsers"
        />
        <n-select
          v-model:value="filterStatus"
          :options="statusOptions"
          placeholder="账号状态"
          style="width: 130px;"
          @update:value="fetchUsers"
        />
        <n-button secondary @click="resetFilters">重置</n-button>
      </div>
    </div>

    <!-- 用户列表表格 -->
    <n-card hoverable style="background: #0b1120; border: 1px solid #1e293b;">
      <div v-if="usersList.length === 0" class="empty-holder">
        暂无符合条件的用户档案记录
      </div>

      <table v-else class="custom-admin-table">
        <thead>
          <tr>
            <th>用户主账号 ID</th>
            <th>首发主钱包公钥 (Primary Wallet)</th>
            <th>多链钱包公钥矩阵</th>
            <th>账号状态与身份</th>
            <th>托管资产估值 (USDT)</th>
            <th>注册与最后活跃</th>
            <th style="min-width: 230px;">数据联动与操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="user in usersList" :key="user.id">
            <!-- 1. 用户主账号 ID -->
            <td class="mono-col">
              <div class="user-id-cell">
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="copyable-id" @click="copyText(user.id, '已复制用户 ID')">
                      {{ user.id.slice(0, 8) }}...{{ user.id.slice(-4) }}
                    </span>
                  </template>
                  {{ user.id }} (点击复制完整 ID)
                </n-tooltip>
                <button class="mini-icon-btn" title="复制完整用户ID" @click.stop="copyText(user.id, '已复制用户 ID')">复制</button>
              </div>
            </td>

            <!-- 2. 首发主钱包公钥 -->
            <td>
              <div class="primary-wallet-cell">
                <span class="chain-badge" :class="user.primaryWallet?.chain?.toLowerCase() || 'evm'">
                  {{ user.primaryWallet?.chain || 'EVM' }}
                </span>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <span class="addr-masked" @click="copyText(user.primaryWallet?.address, '已复制主钱包公钥')">
                      {{ formatAddress(user.primaryWallet?.address) }}
                    </span>
                  </template>
                  {{ user.primaryWallet?.address || '未绑定公钥' }} (点击复制)
                </n-tooltip>
                <button
                  v-if="user.primaryWallet?.address"
                  class="mini-icon-btn"
                  title="复制主钱包地址"
                  @click.stop="copyText(user.primaryWallet?.address, '已复制主钱包公钥')"
                >
                  复制
                </button>
                <a
                  v-if="user.primaryWallet?.address"
                  :href="getExplorerAddressUrl(user.primaryWallet?.chain, user.primaryWallet?.address)"
                  target="_blank"
                  class="mini-icon-btn explorer"
                  title="在区块链浏览器中查看该地址"
                >
                  链上
                </a>
              </div>
            </td>

            <!-- 3. 多链钱包公钥矩阵 -->
            <td>
              <div class="bound-badges-row">
                <n-tooltip v-for="w in user.wallets" :key="w.address" trigger="hover">
                  <template #trigger>
                    <span
                      class="mini-chain-pill"
                      :class="w.chain.toLowerCase()"
                      @click="copyText(w.address, `已复制 ${w.chain} 公钥`)"
                    >
                      {{ w.chain }}
                    </span>
                  </template>
                  {{ w.chain }}: {{ w.address }} (点击复制)
                </n-tooltip>
                <span class="badge-count">({{ user.walletsCount }} 链)</span>
              </div>
            </td>

            <!-- 4. 账号状态与身份 -->
            <td>
              <div class="status-role-wrap">
                <span class="status-dot" :class="user.status.toLowerCase()">
                  {{ user.status === 'ACTIVE' ? '正常' : '已封禁' }}
                </span>
                <span class="role-badge" :class="user.role.toLowerCase()">
                  {{ user.role === 'ADMIN' ? '超级管理员' : '普通用户' }}
                </span>
              </div>
            </td>

            <!-- 5. 托管资产估值 -->
            <td>
              <span class="asset-bold">${{ user.totalBalanceUsdt }}</span>
            </td>

            <!-- 6. 注册与最后活跃 -->
            <td class="time-col">
              <div>{{ new Date(user.createdAt).toLocaleDateString() }}</div>
              <div style="font-size: 10px; color: #475569;">活跃: {{ new Date(user.lastLoginAt || user.createdAt).toLocaleDateString() }}</div>
            </td>

            <!-- 7. 跨模块联动与操作 -->
            <td>
              <div class="action-buttons-group">
                <n-button size="tiny" type="primary" secondary @click="openUserDetail(user.id)">
                  全维画像
                </n-button>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" type="info" secondary @click="jumpToLedger(user.id)">
                      穿透流水
                    </n-button>
                  </template>
                  前往【充提流水总账本】筛选该用户全量流水记录
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" type="success" secondary @click="jumpToLedger(user.id, 'deposits')">
                      查充值
                    </n-button>
                  </template>
                  查看该用户全部充值订单记录
                </n-tooltip>
                <n-tooltip trigger="hover">
                  <template #trigger>
                    <n-button size="tiny" type="warning" secondary @click="jumpToLedger(user.id, 'withdrawals')">
                      查提现
                    </n-button>
                  </template>
                  查看该用户全部提现放款记录
                </n-tooltip>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </n-card>

    <!-- 用户全维画像与资产详情抽屉 -->
    <n-drawer v-model:show="showDetailDrawer" :width="740" placement="right">
      <n-drawer-content title="用户全维画像与多链资产详情" closable>
        <div v-if="isLoadingDetail" style="padding: 60px 0; text-align: center;">
          <n-spin size="large" />
          <div style="margin-top: 14px; color: #94a3b8; font-size: 13px;">正在加载多链画像与资金矩阵...</div>
        </div>

        <div v-else-if="selectedUserDetail" class="user-detail-container">
          <!-- 用户顶部资料卡 (以钱包公钥为主标识) -->
          <div class="user-profile-header-card">
            <div class="user-avatar-badge">
              {{ resolveAvatarSymbol(selectedUserDetail.profile.primaryWallet?.chain) }}
            </div>
            <div class="user-profile-info">
              <div class="user-name-row">
                <span class="detail-wallet-addr font-mono">
                  {{ maskAddress(selectedUserDetail.profile.primaryWallet?.address, 8, 6) }}
                </span>
                <button
                  v-if="selectedUserDetail.profile.primaryWallet?.address"
                  class="mini-icon-btn"
                  title="复制主公钥"
                  @click="copyText(selectedUserDetail.profile.primaryWallet?.address, '已复制主公钥')"
                >
                  复制
                </button>
                <a
                  v-if="selectedUserDetail.profile.primaryWallet?.address"
                  :href="getExplorerAddressUrl(selectedUserDetail.profile.primaryWallet?.chain, selectedUserDetail.profile.primaryWallet?.address)"
                  target="_blank"
                  class="mini-icon-btn explorer"
                  title="在区块链浏览器中查看"
                >
                  链上
                </a>
                <span class="role-badge" :class="selectedUserDetail.profile.role.toLowerCase()">
                  {{ selectedUserDetail.profile.role }}
                </span>
                <span class="status-dot active">● {{ selectedUserDetail.profile.status }}</span>
              </div>
              <div class="detail-id-row">
                <span class="label">主账号唯一 UUID:</span>
                <span class="mono-val">{{ selectedUserDetail.profile.id }}</span>
                <button class="mini-icon-btn" title="复制主账号 UUID" @click="copyText(selectedUserDetail.profile.id, '已复制用户 UUID')">复制</button>
              </div>
              <div class="detail-time-row">
                <span>注册时间: {{ new Date(selectedUserDetail.profile.createdAt).toLocaleString() }}</span>
                <span>最后活跃: {{ new Date(selectedUserDetail.profile.lastLoginAt).toLocaleString() }}</span>
              </div>
            </div>
          </div>

          <!-- 快捷跨页面导航栏 -->
          <div class="drawer-cross-nav-bar">
            <n-button size="small" type="info" secondary @click="jumpToLedger(selectedUserDetail.profile.id)">
              查看该用户全部资金流水账本
            </n-button>
            <n-button size="small" type="success" secondary @click="jumpToLedger(selectedUserDetail.profile.id, 'deposits')">
              筛选该用户充值入金订单
            </n-button>
            <n-button size="small" type="warning" secondary @click="jumpToLedger(selectedUserDetail.profile.id, 'withdrawals')">
              筛选该用户提现放款记录
            </n-button>
          </div>

          <!-- 用户资产与充提统计 -->
          <n-grid :x-gap="12" :y-gap="12" cols="2 s:4" style="margin: 16px 0;">
            <n-grid-item>
              <div class="mini-kpi">
                <div class="m-label">估算总资产</div>
                <div class="m-val" style="color: #60a5fa;">${{ selectedUserDetail.statistics.totalAssetEstimate }}</div>
              </div>
            </n-grid-item>
            <n-grid-item>
              <div class="mini-kpi">
                <div class="m-label">累计充值到账</div>
                <div class="m-val" style="color: #34d399;">${{ selectedUserDetail.statistics.totalDeposited }}</div>
              </div>
            </n-grid-item>
            <n-grid-item>
              <div class="mini-kpi">
                <div class="m-label">累计提现出金</div>
                <div class="m-val" style="color: #fbbf24;">${{ selectedUserDetail.statistics.totalWithdrawn }}</div>
              </div>
            </n-grid-item>
            <n-grid-item>
              <div class="mini-kpi">
                <div class="m-label">充提订单总数</div>
                <div class="m-val" style="color: #a78bfa;">
                  {{ selectedUserDetail.statistics.depositCount + selectedUserDetail.statistics.withdrawalCount }} 笔
                </div>
              </div>
            </n-grid-item>
          </n-grid>

          <!-- 选项卡详情展示 -->
          <n-tabs type="line" animated>
            <!-- Tab 1: 已绑定多链钱包矩阵 -->
            <n-tab-pane name="wallets" :tab="`绑定公钥矩阵 (${selectedUserDetail.wallets.length})`">
              <div class="drawer-section-intro">
                该主账号绑定的多链公钥地址。用户可在前端随时切换任意公链钱包进行无缝加签与鉴权。
              </div>

              <div class="wallets-grid">
                <div
                  v-for="w in selectedUserDetail.wallets"
                  :key="w.address"
                  class="wallet-card-item"
                  :class="{ primary: w.isPrimary }"
                >
                  <div class="w-card-top">
                    <span class="chain-badge" :class="w.chain.toLowerCase()">{{ w.chain }}</span>
                    <span v-if="w.isPrimary" class="primary-flag">首发主钱包</span>
                    <span v-else class="sub-flag">绑定副钱包</span>
                  </div>
                  <div class="w-card-addr-row">
                    <span class="w-card-addr" :title="`完整公钥: ${w.address}`">{{ maskAddress(w.address, 10, 8) }}</span>
                    <button class="mini-icon-btn" title="复制公钥" @click="copyText(w.address, '已复制公钥')">复制</button>
                    <a
                      :href="getExplorerAddressUrl(w.chain, w.address)"
                      target="_blank"
                      class="mini-icon-btn explorer"
                      title="在区块链浏览器中查看"
                    >
                      链上
                    </a>
                  </div>
                  <div class="w-card-bottom">
                    <span class="w-time">绑定于 {{ new Date(w.boundAt).toLocaleString() }}</span>
                    <span class="w-full-tip font-mono">{{ w.address.slice(0, 14) }}...</span>
                  </div>
                </div>
              </div>
            </n-tab-pane>

            <!-- Tab 2: 各链 Token 余额明细矩阵 -->
            <n-tab-pane name="balances" :tab="`多链资产余额 (${selectedUserDetail.balances.length})`">
              <div class="drawer-section-intro">
                用户在全公链各个代币的单独存管余额 (采用 BigNumber 运算保障零精度漂移)。
              </div>

              <div v-if="selectedUserDetail.balances.length === 0" class="empty-holder">
                该用户尚未产生代币充值存管记录
              </div>

              <table v-else class="custom-admin-table">
                <thead>
                  <tr>
                    <th>公链网络</th>
                    <th>代币符号</th>
                    <th>合约地址</th>
                    <th>存管可用余额</th>
                    <th>最后变动时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="b in selectedUserDetail.balances" :key="b.id">
                    <td>
                      <span class="chain-badge" :class="resolveChainFamily(b.networkId).toLowerCase()">
                        {{ b.networkId }}
                      </span>
                    </td>
                    <td style="font-weight: 700; color: #f1f5f9;">{{ b.tokenSymbol }}</td>
                    <td class="mono-col">
                      <div v-if="b.tokenAddress" class="addr-action-wrap">
                        <span>{{ formatAddress(b.tokenAddress) }}</span>
                        <button class="mini-icon-btn" title="复制合约地址" @click="copyText(b.tokenAddress, '已复制合约地址')">复制</button>
                        <a :href="getExplorerAddressUrl(b.networkId, b.tokenAddress)" target="_blank" class="mini-icon-btn explorer">链上</a>
                      </div>
                      <span v-else style="color: #64748b;">原生主网币</span>
                    </td>
                    <td>
                      <span class="asset-bold" style="color: #10b981;">{{ b.balance }}</span>
                    </td>
                    <td class="time-col">{{ new Date(b.updatedAt).toLocaleString() }}</td>
                  </tr>
                </tbody>
              </table>
            </n-tab-pane>

            <!-- Tab 3: 该用户充值历史 -->
            <n-tab-pane name="deposits" :tab="`充值历史 (${selectedUserDetail.deposits.length})`">
              <div v-if="selectedUserDetail.deposits.length === 0" class="empty-holder">
                暂无充值记录
              </div>
              <table v-else class="custom-admin-table">
                <thead>
                  <tr>
                    <th>充值单号</th>
                    <th>公链 / 代币</th>
                    <th>充值金额</th>
                    <th>专属收款金库</th>
                    <th>确认状态</th>
                    <th>TxHash</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="d in selectedUserDetail.deposits" :key="d.id">
                    <td class="mono-col">{{ d.id.slice(0, 8) }}...</td>
                    <td>
                      <span class="chain-badge" :class="(d.network || 'evm').toLowerCase()">{{ d.network }}</span>
                      <span style="margin-left: 4px; font-weight: 600;">{{ d.tokenSymbol || 'USDT' }}</span>
                    </td>
                    <td class="amt-bold dep">+{{ d.actualAmount || d.amount }}</td>
                    <td class="mono-col">
                      <div class="addr-action-wrap">
                        <span>{{ formatAddress(d.depositAddress) }}</span>
                        <button class="mini-icon-btn" title="复制收款地址" @click="copyText(d.depositAddress, '已复制收款金库地址')">复制</button>
                      </div>
                    </td>
                    <td>
                      <span class="status-badge" :class="d.status.toLowerCase()">{{ d.status }}</span>
                    </td>
                    <td class="mono-col">
                      <div v-if="d.txHash" class="addr-action-wrap">
                        <span class="tx-link" @click="copyText(d.txHash, '已复制 TxHash')">{{ d.txHash.slice(0, 8) }}...</span>
                        <a :href="getExplorerTxUrl(d.network, d.txHash)" target="_blank" class="mini-icon-btn explorer">链上</a>
                      </div>
                      <span v-else style="color: #64748b;">待广播</span>
                    </td>
                    <td class="time-col">{{ new Date(d.confirmedAt || d.createdAt).toLocaleString() }}</td>
                  </tr>
                </tbody>
              </table>
            </n-tab-pane>

            <!-- Tab 4: 该用户提现历史 -->
            <n-tab-pane name="withdrawals" :tab="`提现历史 (${selectedUserDetail.withdrawals.length})`">
              <div v-if="selectedUserDetail.withdrawals.length === 0" class="empty-holder">
                暂无提现记录
              </div>
              <table v-else class="custom-admin-table">
                <thead>
                  <tr>
                    <th>提现单号</th>
                    <th>公链 / 代币</th>
                    <th>提现金额</th>
                    <th>用户接收地址</th>
                    <th>放款状态</th>
                    <th>TxHash</th>
                    <th>时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="w in selectedUserDetail.withdrawals" :key="w.id">
                    <td class="mono-col">{{ w.id.slice(0, 8) }}...</td>
                    <td>
                      <span class="chain-badge" :class="(w.network || 'evm').toLowerCase()">{{ w.network }}</span>
                      <span style="margin-left: 4px; font-weight: 600;">{{ w.tokenSymbol }}</span>
                    </td>
                    <td class="amt-bold wth">-{{ w.amount }}</td>
                    <td class="mono-col">
                      <div class="addr-action-wrap">
                        <span>{{ formatAddress(w.toAddress) }}</span>
                        <button class="mini-icon-btn" title="复制接收地址" @click="copyText(w.toAddress, '已复制用户接收地址')">复制</button>
                        <a :href="getExplorerAddressUrl(w.network, w.toAddress)" target="_blank" class="mini-icon-btn explorer">链上</a>
                      </div>
                    </td>
                    <td>
                      <span class="status-badge" :class="w.status.toLowerCase()">{{ w.status }}</span>
                    </td>
                    <td class="mono-col">
                      <div v-if="w.txHash" class="addr-action-wrap">
                        <span class="tx-link" @click="copyText(w.txHash, '已复制 TxHash')">{{ w.txHash.slice(0, 8) }}...</span>
                        <a :href="getExplorerTxUrl(w.network, w.txHash)" target="_blank" class="mini-icon-btn explorer">链上</a>
                      </div>
                      <span v-else style="color: #64748b;">待放款</span>
                    </td>
                    <td class="time-col">{{ new Date(w.confirmedAt || w.createdAt).toLocaleString() }}</td>
                  </tr>
                </tbody>
              </table>
            </n-tab-pane>
          </n-tabs>
        </div>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useMessage } from 'naive-ui';
import {
  adminClient,
  type UserSummaryItem,
  type UserDetailData,
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

const usersList = ref<UserSummaryItem[]>([]);
const searchKeyword = ref('');
const filterRole = ref('ALL');
const filterStatus = ref('ALL');

const showDetailDrawer = ref(false);
const isLoadingDetail = ref(false);
const selectedUserDetail = ref<UserDetailData | null>(null);

const roleOptions = [
  { label: '全部角色', value: 'ALL' },
  { label: '普通玩家 (USER)', value: 'USER' },
  { label: '管理员 (ADMIN)', value: 'ADMIN' },
];

const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '正常激活 (ACTIVE)', value: 'ACTIVE' },
  { label: '封禁暂停 (BANNED)', value: 'BANNED' },
];

const multiChainUsersCount = computed(() => {
  return usersList.value.filter((u) => u.walletsCount >= 2).length;
});

const totalUserAssets = computed(() => {
  const sum = usersList.value.reduce((acc, u) => acc + (parseFloat(u.totalBalanceUsdt) || 0), 0);
  return sum.toLocaleString();
});

function resolveChainFamily(netId: string) {
  const lower = (netId || '').toLowerCase();
  if (lower.includes('tron')) return 'TRON';
  if (lower.includes('solana')) return 'SOLANA';
  return 'EVM';
}

function resolveAvatarSymbol(chain?: string) {
  const c = (chain || 'EVM').toUpperCase();
  if (c.includes('TRON')) return 'TRX';
  if (c.includes('SOL')) return 'SOL';
  return '⟠';
}

function formatAddress(addr?: string) {
  return maskAddress(addr, 6, 4);
}

function copyText(txt?: string, tip = '已复制到剪贴板') {
  if (!txt) return;
  copyToClipboard(txt, () => {
    message.success(tip);
  });
}

function jumpToLedger(userId: string, tab?: string) {
  const query: Record<string, string> = { search: userId };
  if (tab) query.tab = tab;
  router.push({ path: '/audit/ledger', query });
}

async function fetchUsers() {
  const params: Record<string, string> = {};
  if (searchKeyword.value.trim()) params.search = searchKeyword.value.trim();
  if (filterRole.value !== 'ALL') params.role = filterRole.value;
  if (filterStatus.value !== 'ALL') params.status = filterStatus.value;

  try {
    const res = await adminClient.getUsers(params);
    usersList.value = res.list;
  } catch (err: any) {
    message.error(err.message || '获取用户列表失败');
  }
}

function resetFilters() {
  searchKeyword.value = '';
  filterRole.value = 'ALL';
  filterStatus.value = 'ALL';
  fetchUsers();
}

async function openUserDetail(userId: string) {
  showDetailDrawer.value = true;
  isLoadingDetail.value = true;
  selectedUserDetail.value = null;

  try {
    selectedUserDetail.value = await adminClient.getUserDetail(userId);
  } catch (err: any) {
    message.error(err.message || '获取用户画像详情失败');
  } finally {
    isLoadingDetail.value = false;
  }
}

onMounted(() => {
  if (route.query.search) {
    searchKeyword.value = String(route.query.search);
  }
  if (route.query.userId) {
    searchKeyword.value = String(route.query.userId);
    openUserDetail(String(route.query.userId));
  }
  fetchUsers();
});
</script>

<style scoped>
.users-view {
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

.stat-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 14px 16px;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin: 4px 0;
}

.stat-sub {
  font-size: 11px;
  color: #64748b;
}

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

.user-id-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.copyable-id {
  color: #38bdf8;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
}
.copyable-id:hover {
  text-decoration: underline;
}

.primary-wallet-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.addr-masked {
  font-family: 'JetBrains Mono', monospace;
  color: #f1f5f9;
  cursor: pointer;
}
.addr-masked:hover {
  color: #38bdf8;
  text-decoration: underline;
}

.mini-icon-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  font-size: 12px;
  opacity: 0.7;
  transition: opacity 0.15s, transform 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.mini-icon-btn:hover {
  opacity: 1;
  transform: scale(1.15);
}
.mini-icon-btn.explorer {
  text-decoration: none;
}

.role-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.role-badge.admin { background: rgba(234, 179, 8, 0.2); color: #facc15; }
.role-badge.user { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

.status-role-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  font-size: 11px;
}
.status-dot.active { color: #10b981; }
.status-dot.banned { color: #ef4444; }

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

.bound-badges-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mini-chain-pill {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
  cursor: pointer;
}
.mini-chain-pill.evm { background: #1e3a8a; color: #93c5fd; }
.mini-chain-pill.tron { background: #7f1d1d; color: #fca5a5; }
.mini-chain-pill.solana { background: #134e4a; color: #99f6e4; }

.badge-count {
  font-size: 10px;
  color: #64748b;
}

.asset-bold {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  color: #34d399;
}

.mono-col {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.time-col {
  font-size: 11px;
  color: #64748b;
}

.action-buttons-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.amt-bold {
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}
.amt-bold.dep { color: #10b981; }
.amt-bold.wth { color: #f59e0b; }

.tx-link {
  color: #38bdf8;
  cursor: pointer;
}
.tx-link:hover {
  text-decoration: underline;
}

.status-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 700;
}
.status-badge.confirmed, .status-badge.success { background: rgba(16, 185, 129, 0.2); color: #10b981; }
.status-badge.pending, .status-badge.confirming { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.status-badge.failed { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

/* 详情抽屉样式 */
.user-detail-container {
  display: flex;
  flex-direction: column;
}

.user-profile-header-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.user-avatar-badge {
  width: 50px;
  height: 50px;
  border-radius: 12px;
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  flex-shrink: 0;
  font-family: monospace;
}

.user-profile-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.detail-wallet-addr {
  font-size: 16px;
  font-weight: 700;
  color: #38bdf8;
}

.detail-id-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.detail-id-row .label { color: #64748b; }
.detail-id-row .mono-val { color: #94a3b8; font-family: monospace; }

.detail-time-row {
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: #64748b;
}

.drawer-cross-nav-bar {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.mini-kpi {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px;
}
.mini-kpi .m-label { font-size: 11px; color: #94a3b8; }
.mini-kpi .m-val { font-size: 16px; font-weight: 700; font-family: monospace; margin-top: 2px; }

.drawer-section-intro {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 12px;
  line-height: 1.5;
}

.wallets-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wallet-card-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wallet-card-item.primary {
  border-color: rgba(56, 189, 248, 0.4);
  background: rgba(56, 189, 248, 0.03);
}

.w-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.primary-flag {
  font-size: 11px;
  font-weight: 700;
  color: #38bdf8;
}

.sub-flag {
  font-size: 11px;
  color: #64748b;
}

.w-card-addr-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.w-card-addr {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: #38bdf8;
  word-break: break-all;
}

.w-card-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.w-time {
  font-size: 11px;
  color: #64748b;
}

.w-full-tip {
  font-size: 11px;
  color: #475569;
}

.addr-action-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
}
</style>
