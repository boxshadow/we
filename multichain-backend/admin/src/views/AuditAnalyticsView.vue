<template>
  <div class="audit-analytics-view">
    <!-- 页面标题与操作 -->
    <div class="page-header">
      <div>
        <h2 class="page-title">资金运营可视化大屏 (Operations Analytics)</h2>
        <div class="page-subtitle">
          全平台多链充提资金池 24h 实时流动、公链生态分布占比、出金储备水位与 15 天充提动向分析
        </div>
      </div>
      <n-space align="center">
        <n-button type="primary" secondary @click="fetchData">
          刷新运营数据
        </n-button>
      </n-space>
    </div>

    <!-- 二级导航栏 -->
    <div class="audit-sub-nav">
      <router-link to="/audit/analytics" class="sub-nav-btn active">
        <span class="sub-nav-text">运营可视化大屏</span>
        <span class="sub-nav-badge">15天走势 & 水位</span>
      </router-link>
      <router-link to="/audit/ledger" class="sub-nav-btn">
        <span class="sub-nav-text">充提流水总账本</span>
        <span class="sub-nav-badge">流水 · 充值 · 提现</span>
      </router-link>
    </div>

    <!-- 1. 核心指标看板 (6大指标) -->
    <div class="analytics-dashboard-panel">
      <div class="kpi-grid">
        <div class="kpi-card" style="border-top: 3px solid #10b981;">
          <div class="kpi-title">今日充值入金</div>
          <div class="kpi-val" style="color: #34d399;">
            ${{ analytics.summary.todayDepositAmount }}
          </div>
          <div class="kpi-meta">累计 ${{ analytics.summary.totalDepositAmount }} ({{ analytics.summary.totalDepositCount }} 笔)</div>
        </div>

        <div class="kpi-card" style="border-top: 3px solid #f59e0b;">
          <div class="kpi-title">今日提现出金</div>
          <div class="kpi-val" style="color: #fbbf24;">
            ${{ analytics.summary.todayWithdrawalAmount }}
          </div>
          <div class="kpi-meta">累计 ${{ analytics.summary.totalWithdrawalAmount }} ({{ analytics.summary.totalWithdrawalCount }} 笔)</div>
        </div>

        <div class="kpi-card" style="border-top: 3px solid #3b82f6;">
          <div class="kpi-title">24h 净资金流动</div>
          <div class="kpi-val" :style="{ color: parseFloat(analytics.summary.netFlow24h) >= 0 ? '#60a5fa' : '#f87171' }">
            {{ parseFloat(analytics.summary.netFlow24h) >= 0 ? '+' : '' }}${{ analytics.summary.netFlow24h }}
          </div>
          <div class="kpi-meta">{{ parseFloat(analytics.summary.netFlow24h) >= 0 ? '净资金正流入' : '净资金流出' }}</div>
        </div>

        <div class="kpi-card" style="border-top: 3px solid #8b5cf6;">
          <div class="kpi-title">待确认充值</div>
          <div class="kpi-val" style="color: #a78bfa;">
            {{ analytics.summary.pendingDepositsCount }} 笔
          </div>
          <div class="kpi-meta">链上区块确认中</div>
        </div>

        <div class="kpi-card" style="border-top: 3px solid #ec4899;">
          <div class="kpi-title">待处理提现</div>
          <div class="kpi-val" style="color: #f472b6;">
            {{ analytics.summary.pendingWithdrawalsCount }} 笔
          </div>
          <div class="kpi-meta">热钱包放款队列</div>
        </div>

        <div class="kpi-card" style="border-top: 3px solid #06b6d4;">
          <div class="kpi-title">出金金库健康度</div>
          <div class="kpi-val" style="color: #22d3ee;">
            99.8%
          </div>
          <div class="kpi-meta">EVM / TRON / SOL 正常</div>
        </div>
      </div>

      <!-- 生态分布与储备指示 -->
      <div class="sub-dashboard-grid">
        <!-- 公链交易量生态分布 -->
        <div class="sub-dashboard-box">
          <div class="box-head">
            <span class="box-title">多链公链充提资金生态分布</span>
            <span class="box-sub">EVM 共享池 vs TRON vs SOLANA</span>
          </div>
          <div class="chain-share-bar">
            <div
              class="share-segment evm"
              :style="{ width: `${analytics.chainVolumeShare.EVM}%` }"
              :title="`EVM: ${analytics.chainVolumeShare.EVM}%`"
            >
              EVM {{ analytics.chainVolumeShare.EVM }}%
            </div>
            <div
              class="share-segment tron"
              :style="{ width: `${analytics.chainVolumeShare.TRON}%` }"
              :title="`TRON: ${analytics.chainVolumeShare.TRON}%`"
            >
              TRON {{ analytics.chainVolumeShare.TRON }}%
            </div>
            <div
              class="share-segment solana"
              :style="{ width: `${analytics.chainVolumeShare.SOLANA}%` }"
              :title="`SOLANA: ${analytics.chainVolumeShare.SOLANA}%`"
            >
              SOL {{ analytics.chainVolumeShare.SOLANA }}%
            </div>
          </div>
          <div class="legend-row">
            <span class="legend-item"><i class="dot evm"></i> EVM 兼容公链 (ETH, BSC, Polygon)</span>
            <span class="legend-item"><i class="dot tron"></i> 波场 TRON (TRC20)</span>
            <span class="legend-item"><i class="dot solana"></i> Solana (SPL Token)</span>
          </div>
        </div>

        <!-- 出资金库热钱包储备水位 -->
        <div class="sub-dashboard-box">
          <div class="box-head">
            <span class="box-title">出金热钱包储备水位动态监控</span>
            <span class="box-sub">自动出款备用金</span>
          </div>
          <div class="vault-reserves-grid">
            <div v-for="v in analytics.vaultReserves" :key="v.address" class="vault-pill-item">
              <div class="v-pill-left">
                <span class="chain-badge" :class="v.chain.toLowerCase()">{{ v.chain }}</span>
                <span class="v-label">{{ v.label }}</span>
              </div>
              <div class="v-pill-right">
                <span class="v-balance">{{ v.balance }} Token</span>
                <span class="status-tag normal">● 充足</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. 过去 15 天充值与提现运营走势大屏 (15-Day Cashflow Dynamics) -->
    <div class="trend15-panel">
      <div class="trend15-header">
        <div class="trend15-title-wrap">
          <span class="trend15-title">过去 15 天充值与提现运营走势 (15-Day Cashflow Dynamics)</span>
          <span class="trend15-subtitle">每日充值入金与提现放款动态对比、逐日净头寸流向与业务笔数统计</span>
        </div>
        <div class="trend15-controls">
          <n-radio-group v-model:value="trendViewMode" size="small">
            <n-radio-button value="chart">走势柱状图</n-radio-button>
            <n-radio-button value="table">逐日明细表</n-radio-button>
          </n-radio-group>
        </div>
      </div>

      <!-- 15天核心摘要 KPI -->
      <div class="trend15-kpi-bar" v-if="analytics.summary15Days">
        <div class="kpi-mini-item">
          <span class="kpi-mini-label">15天累计充值入金</span>
          <span class="kpi-mini-val text-deposit">${{ analytics.summary15Days.totalDepositAmount }}</span>
          <span class="kpi-mini-count">共 {{ analytics.summary15Days.totalDepositCount }} 笔入账</span>
        </div>
        <div class="kpi-mini-sep"></div>
        <div class="kpi-mini-item">
          <span class="kpi-mini-label">15天累计提现放款</span>
          <span class="kpi-mini-val text-withdraw">${{ analytics.summary15Days.totalWithdrawAmount }}</span>
          <span class="kpi-mini-count">共 {{ analytics.summary15Days.totalWithdrawCount }} 笔放款</span>
        </div>
        <div class="kpi-mini-sep"></div>
        <div class="kpi-mini-item">
          <span class="kpi-mini-label">15天资金净流动 (净头寸)</span>
          <span class="kpi-mini-val" :class="parseFloat(analytics.summary15Days.totalNetInflow) >= 0 ? 'text-inflow' : 'text-outflow'">
            {{ parseFloat(analytics.summary15Days.totalNetInflow) >= 0 ? '+' : '' }}${{ analytics.summary15Days.totalNetInflow }}
          </span>
          <span class="kpi-mini-count">{{ parseFloat(analytics.summary15Days.totalNetInflow) >= 0 ? '平台资金净沉淀' : '净流出' }}</span>
        </div>
        <div class="kpi-mini-sep"></div>
        <div class="kpi-mini-item">
          <span class="kpi-mini-label">15天充提总订单笔数</span>
          <span class="kpi-mini-val text-cyan">{{ analytics.summary15Days.totalCount }} 笔</span>
          <span class="kpi-mini-count">全生态流水笔数</span>
        </div>
      </div>

      <!-- 视图 1: 15天走势图 -->
      <div v-if="trendViewMode === 'chart'" class="trend-chart-container">
        <div class="trend-bars-wrapper">
          <div
            v-for="(day, idx) in trendDataList"
            :key="idx"
            class="trend-day-col"
          >
            <!-- 悬停卡片 / 气泡 -->
            <div class="day-tooltip">
              <div class="tt-date">{{ day.fullDate || day.date }}</div>
              <div class="tt-row text-deposit">充值: ${{ day.depositAmount }} ({{ day.depositCount || 0 }}笔)</div>
              <div class="tt-row text-withdraw">提现: ${{ day.withdrawAmount }} ({{ day.withdrawCount || 0 }}笔)</div>
              <div class="tt-row text-inflow">净流: {{ day.netInflow >= 0 ? '+' : '' }}${{ day.netInflow }}</div>
            </div>

            <!-- 柱体展示区 -->
            <div class="bars-pair">
              <div
                class="bar dep-bar"
                :style="{ height: `${calcBarHeight(day.depositAmount)}%` }"
                :title="`充值: $${day.depositAmount}`"
              >
                <span v-if="day.depositAmount > 0" class="bar-tag">${{ day.depositAmount }}</span>
              </div>
              <div
                class="bar wd-bar"
                :style="{ height: `${calcBarHeight(day.withdrawAmount)}%` }"
                :title="`提现: $${day.withdrawAmount}`"
              >
                <span v-if="day.withdrawAmount > 0" class="bar-tag">${{ day.withdrawAmount }}</span>
              </div>
            </div>

            <!-- 日期标签 -->
            <div class="day-label" :class="{ today: idx === trendDataList.length - 1 }">
              {{ day.date }}
            </div>
          </div>
        </div>

        <div class="chart-legend-row">
          <span class="legend-badge dep-legend">● 充值入金 (Deposit)</span>
          <span class="legend-badge wd-legend">● 提现出款 (Withdrawal)</span>
          <span class="legend-note">* 悬停上方各日期柱体可查看当日完整笔数与净流动明细</span>
        </div>
      </div>

      <!-- 视图 2: 15天明细表 -->
      <div v-else class="trend-table-container">
        <table class="custom-admin-table">
          <thead>
            <tr>
              <th>统计日期</th>
              <th>充值入金总额 ($)</th>
              <th>充值订单数</th>
              <th>提现放款总额 ($)</th>
              <th>提现订单数</th>
              <th>当日净资金头寸 ($)</th>
              <th>流动状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(day, idx) in trendDataList" :key="idx">
              <td class="font-mono">
                <span style="font-weight: 600; color: #f1f5f9;">{{ day.fullDate || day.date }}</span>
                <span v-if="idx === trendDataList.length - 1" class="today-badge">今日</span>
              </td>
              <td class="font-mono" style="color: #34d399; font-weight: 600;">+${{ day.depositAmount.toFixed(2) }}</td>
              <td>{{ day.depositCount || 0 }} 笔</td>
              <td class="font-mono" style="color: #fbbf24; font-weight: 600;">-${{ day.withdrawAmount.toFixed(2) }}</td>
              <td>{{ day.withdrawCount || 0 }} 笔</td>
              <td class="font-mono" :style="{ color: day.netInflow >= 0 ? '#60a5fa' : '#f87171', fontWeight: '700' }">
                {{ day.netInflow >= 0 ? '+' : '' }}${{ (day.netInflow || 0).toFixed(2) }}
              </td>
              <td>
                <span class="trend-status-pill" :class="day.netInflow >= 0 ? 'pos' : 'neg'">
                  {{ day.netInflow > 0 ? '净沉淀' : day.netInflow < 0 ? '净流出' : '平衡' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useMessage } from 'naive-ui';
import { adminClient, type OperationsAnalytics } from '../api/adminClient';

const message = useMessage();
const trendViewMode = ref<'chart' | 'table'>('chart');

const analytics = ref<OperationsAnalytics>({
  summary: {
    totalDepositAmount: '0.00',
    todayDepositAmount: '0.00',
    totalDepositCount: 0,
    totalWithdrawalAmount: '0.00',
    todayWithdrawalAmount: '0.00',
    totalWithdrawalCount: 0,
    netFlow24h: '0.00',
    pendingDepositsCount: 0,
    pendingWithdrawalsCount: 0,
  },
  chainVolumeShare: { EVM: 70, TRON: 20, SOLANA: 10 },
  vaultReserves: [],
  recentTrend: [],
  trend15Days: [],
});

const trendDataList = computed(() => {
  return analytics.value.trend15Days || [];
});

function calcBarHeight(amt: number) {
  const list = analytics.value.trend15Days || analytics.value.recentTrend || [];
  const max = Math.max(
    ...list.flatMap((d) => [d.depositAmount, d.withdrawAmount]),
    50
  );
  if (!amt || amt <= 0) return 4;
  return Math.min(100, Math.max(8, Math.round((amt / max) * 95)));
}

async function fetchData() {
  try {
    analytics.value = await adminClient.getOperationsAnalytics();
  } catch (err: any) {
    message.error(err.message || '获取运营大屏数据失败');
  }
}

onMounted(() => {
  fetchData();
});
</script>

<style scoped>
.audit-analytics-view {
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
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.4);
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
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

/* 运营分析看板面板 */
.analytics-dashboard-panel {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 16px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 14px;
  margin-bottom: 16px;
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 768px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.sub-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

@media (max-width: 900px) {
  .sub-dashboard-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 12px 14px;
}

.kpi-title {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.kpi-val {
  font-size: 20px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  margin: 4px 0;
}

.kpi-meta {
  font-size: 11px;
  color: #64748b;
}

.sub-dashboard-box {
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.box-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.box-title {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
}

.box-sub {
  font-size: 11px;
  color: #64748b;
}

/* 生态比例条 */
.chain-share-bar {
  display: flex;
  height: 24px;
  border-radius: 6px;
  overflow: hidden;
  font-size: 11px;
  font-weight: 700;
  line-height: 24px;
  text-align: center;
  color: #fff;
}

.share-segment.evm { background: #2563eb; }
.share-segment.tron { background: #dc2626; }
.share-segment.solana { background: #0d9488; }

.legend-row {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: #94a3b8;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.dot.evm { background: #3b82f6; }
.dot.tron { background: #ef4444; }
.dot.solana { background: #14b8a6; }

.vault-reserves-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vault-pill-item {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.v-pill-left {
  display: flex;
  align-items: center;
  gap: 8px;
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

.v-label {
  font-size: 11px;
  color: #cbd5e1;
}

.v-pill-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.v-balance {
  font-size: 12px;
  font-weight: 700;
  font-family: monospace;
  color: #10b981;
}

.status-tag.normal {
  font-size: 10px;
  color: #10b981;
}

/* 15 天充值与提现运营大屏 */
.trend15-panel {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.trend15-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 14px;
}

.trend15-title-wrap {
  display: flex;
  flex-direction: column;
}

.trend15-title {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.trend15-subtitle {
  font-size: 12px;
  color: #64748b;
  margin-top: 3px;
}

.trend15-kpi-bar {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px 18px;
  margin-bottom: 16px;
  gap: 20px;
  flex-wrap: wrap;
}

.kpi-mini-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kpi-mini-label {
  font-size: 11px;
  color: #94a3b8;
}

.kpi-mini-val {
  font-size: 16px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}

.kpi-mini-count {
  font-size: 10px;
  color: #64748b;
}

.kpi-mini-sep {
  width: 1px;
  height: 28px;
  background: #1e293b;
}

.text-deposit { color: #34d399; }
.text-withdraw { color: #fbbf24; }
.text-inflow { color: #60a5fa; }
.text-outflow { color: #f87171; }
.text-cyan { color: #22d3ee; }

.trend-chart-container {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 24px 16px 12px 16px;
}

.trend-bars-wrapper {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  height: 180px;
  gap: 6px;
  padding-bottom: 8px;
  border-bottom: 1px dashed #334155;
}

.trend-day-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  justify-content: flex-end;
  position: relative;
}

.trend-day-col:hover .day-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(-8px);
}

.day-tooltip {
  position: absolute;
  bottom: 100%;
  background: #1e293b;
  border: 1px solid #38bdf8;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 30;
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  pointer-events: none;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
}

.tt-date {
  font-weight: 700;
  color: #f1f5f9;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 3px;
  margin-bottom: 4px;
}

.tt-row {
  margin: 2px 0;
}

.bars-pair {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  width: 100%;
  justify-content: center;
  height: 100%;
}

.bar {
  width: 10px;
  border-radius: 3px 3px 0 0;
  transition: height 0.3s ease;
  min-height: 4px;
}

.bar.dep-bar {
  background: linear-gradient(180deg, #34d399 0%, #059669 100%);
}

.bar.wd-bar {
  background: linear-gradient(180deg, #fbbf24 0%, #d97706 100%);
}

.day-label {
  font-size: 10px;
  font-family: monospace;
  color: #64748b;
  margin-top: 6px;
}

.day-label.today {
  color: #38bdf8;
  font-weight: 700;
}

.chart-legend-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
  font-size: 11px;
}

.legend-badge.dep-legend { color: #34d399; font-weight: 600; }
.legend-badge.wd-legend { color: #fbbf24; font-weight: 600; }
.legend-note { color: #64748b; margin-left: auto; font-size: 11px; }

.trend-table-container {
  margin-top: 10px;
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

.today-badge {
  background: #0284c7;
  color: #fff;
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 6px;
}

.trend-status-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}
.trend-status-pill.pos {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.trend-status-pill.neg {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.font-mono {
  font-family: 'JetBrains Mono', monospace;
}
</style>
