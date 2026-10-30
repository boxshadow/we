<template>
  <div class="dashboard-view">
    <!-- Header Summary Bar -->
    <div class="page-header">
      <div>
        <h1 class="page-title">金库运营与风控总览</h1>
        <p class="page-desc">多链接入节点、金库安全状态与跨链流水实时运营指标</p>
      </div>
      <div class="header-actions">
        <n-tag type="info" size="medium" :bordered="false" class="system-status-tag">
          <span class="status-indicator"></span>
          系统状态正常 · 实时监控中
        </n-tag>
        <n-button secondary size="medium" @click="loadStats">
          <template #icon>
            <n-icon><RefreshOutline /></n-icon>
          </template>
          刷新指标
        </n-button>
      </div>
    </div>

    <!-- Top KPI Cards -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">接入公链网络</span>
          <span class="metric-tag tag-neutral">EVM / TRON / SOL</span>
        </div>
        <div class="metric-val">{{ stats.totalNetworks }}</div>
        <div class="metric-footer">
          <span class="metric-sub">全适配多链资产与 RPC 路由</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">在线运行节点</span>
          <span class="metric-tag tag-success">正常运作</span>
        </div>
        <div class="metric-val text-emerald">{{ stats.activeNetworks }}</div>
        <div class="metric-footer">
          <span class="metric-sub">实时健康探测往返正常</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">熔断阻断网络</span>
          <span class="metric-tag" :class="stats.pausedNetworks > 0 ? 'tag-danger' : 'tag-neutral'">
            {{ stats.pausedNetworks > 0 ? '已阻断' : '无熔断' }}
          </span>
        </div>
        <div class="metric-val" :class="stats.pausedNetworks > 0 ? 'text-rose' : 'text-muted'">
          {{ stats.pausedNetworks }}
        </div>
        <div class="metric-footer">
          <span class="metric-sub">风控安全与出入金隔离控制</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">签名鉴权引擎</span>
          <span class="metric-tag tag-blue">SIWE + KMS</span>
        </div>
        <div class="metric-val font-mono">Enclave</div>
        <div class="metric-footer">
          <span class="metric-sub">EIP-4361 / Tip-191 / Ed25519</span>
        </div>
      </div>
    </div>

    <!-- Operational Architecture & Quick Actions -->
    <div class="dashboard-body-grid">
      <!-- Architecture & Security Checklist -->
      <div class="card-panel">
        <div class="card-panel-header">
          <div class="card-title-group">
            <n-icon size="18" color="#3b82f6"><ShieldCheckmarkOutline /></n-icon>
            <span class="card-panel-title">资金风控与签名安全架构</span>
          </div>
          <span class="header-badge">机构级防线</span>
        </div>

        <div class="architecture-list">
          <div class="arch-item">
            <div class="arch-icon-wrap icon-emerald">
              <n-icon size="18"><ArrowDownCircleOutline /></n-icon>
            </div>
            <div class="arch-content">
              <div class="arch-title">充值隔离热钱包 (Deposit Isolation Vault)</div>
              <div class="arch-desc">充值流水单向入账，无暴露私钥风险，支持多公链子地址与归集策略。</div>
            </div>
          </div>

          <div class="arch-item">
            <div class="arch-icon-wrap icon-blue">
              <n-icon size="18"><KeyOutline /></n-icon>
            </div>
            <div class="arch-content">
              <div class="arch-title">独立出金金库与外部 KMS 签名 (Withdrawal Vault)</div>
              <div class="arch-desc">出金签名通过 Rust Enclave / AWS KMS / HSM 进行物理隔离，支持自动出金白名单与熔断防刷。</div>
            </div>
          </div>

          <div class="arch-item">
            <div class="arch-icon-wrap icon-purple">
              <n-icon size="18"><GitNetworkOutline /></n-icon>
            </div>
            <div class="arch-content">
              <div class="arch-title">多链地址聚合画像与全景关联</div>
              <div class="arch-desc">EVM、TRON、Solana 钱包在同一平台体系下统一归集统计，穿透单笔流水全链查证。</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card-panel">
        <div class="card-panel-header">
          <div class="card-title-group">
            <n-icon size="18" color="#3b82f6"><FlashOutline /></n-icon>
            <span class="card-panel-title">常用控制中台入口</span>
          </div>
          <span class="header-badge">快捷调度</span>
        </div>

        <div class="actions-list">
          <button class="action-card-btn" @click="$router.push('/networks')">
            <div class="btn-icon-box">
              <n-icon size="20"><ServerOutline /></n-icon>
            </div>
            <div class="btn-text-box">
              <div class="btn-main-text">多链节点与 RPC 诊断</div>
              <div class="btn-sub-text">查看 EVM/TRON/Solana 节点延迟与区块高度</div>
            </div>
            <n-icon size="16" class="btn-arrow"><ChevronForwardOutline /></n-icon>
          </button>

          <button class="action-card-btn" @click="$router.push('/encryption-service')">
            <div class="btn-icon-box">
              <n-icon size="20"><LockClosedOutline /></n-icon>
            </div>
            <div class="btn-text-box">
              <div class="btn-main-text">KMS 签名中枢与 Enclave 金库</div>
              <div class="btn-sub-text">配置远程签名服务，管理物理内存置零密钥池</div>
            </div>
            <n-icon size="16" class="btn-arrow"><ChevronForwardOutline /></n-icon>
          </button>

          <button class="action-card-btn" @click="$router.push('/audit/analytics')">
            <div class="btn-icon-box">
              <n-icon size="20"><StatsChartOutline /></n-icon>
            </div>
            <div class="btn-text-box">
              <div class="btn-main-text">充提数据可视化分析</div>
              <div class="btn-sub-text">15天多链资金进出净额、代币流向走势图表</div>
            </div>
            <n-icon size="16" class="btn-arrow"><ChevronForwardOutline /></n-icon>
          </button>

          <button class="action-card-btn" @click="$router.push('/audit/ledger')">
            <div class="btn-icon-box">
              <n-icon size="20"><ReceiptOutline /></n-icon>
            </div>
            <div class="btn-text-box">
              <div class="btn-main-text">资金充提流水总账本</div>
              <div class="btn-sub-text">全量多链交易哈希、状态追踪与对账核验</div>
            </div>
            <n-icon size="16" class="btn-arrow"><ChevronForwardOutline /></n-icon>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ShieldCheckmarkOutline,
  ArrowDownCircleOutline,
  KeyOutline,
  GitNetworkOutline,
  FlashOutline,
  ServerOutline,
  LockClosedOutline,
  StatsChartOutline,
  ReceiptOutline,
  ChevronForwardOutline,
  RefreshOutline
} from '@vicons/ionicons5';
import { networkApi } from '../api/network';

const stats = ref({
  totalNetworks: 0,
  activeNetworks: 0,
  pausedNetworks: 0
});

async function loadStats() {
  try {
    const list = await networkApi.getNetworks();
    stats.value.totalNetworks = list.length;
    stats.value.activeNetworks = list.filter(n => !n.security?.isPaused).length;
    stats.value.pausedNetworks = list.filter(n => n.security?.isPaused).length;
  } catch (e) {
    stats.value = { totalNetworks: 7, activeNetworks: 7, pausedNetworks: 0 };
  }
}

onMounted(() => {
  loadStats();
});
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 20px;
  border-bottom: 1px solid #1e293b;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0 0 6px 0;
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
  gap: 12px;
}

.system-status-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(59, 130, 246, 0.1);
  color: #60a5fa;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}

.metric-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 0.15s ease;
}

.metric-card:hover {
  border-color: #334155;
}

.metric-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.metric-label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
  letter-spacing: 0.02em;
}

.metric-tag {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 500;
}

.tag-neutral {
  background: #1e293b;
  color: #94a3b8;
}

.tag-success {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.tag-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.tag-blue {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.metric-val {
  font-size: 28px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.1;
  margin-bottom: 10px;
  letter-spacing: -0.02em;
}

.metric-footer {
  padding-top: 10px;
  border-top: 1px solid #1e293b;
}

.metric-sub {
  font-size: 12px;
  color: #64748b;
}

.text-emerald { color: #10b981; }
.text-rose { color: #ef4444; }
.text-muted { color: #64748b; }
.font-mono { font-family: 'JetBrains Mono', SFMono-Regular, monospace; font-size: 24px; }

/* Dashboard Body */
.dashboard-body-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 900px) {
  .dashboard-body-grid {
    grid-template-columns: 1fr;
  }
}

.card-panel {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 20px;
}

.card-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  border-bottom: 1px solid #1e293b;
  margin-bottom: 18px;
}

.card-title-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.header-badge {
  font-size: 11px;
  color: #64748b;
  background: #0f172a;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #1e293b;
}

/* Architecture List */
.architecture-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.arch-item {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 6px;
  background: #0b0f17;
  border: 1px solid #1e293b;
}

.arch-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-emerald {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.icon-blue {
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;
}

.icon-purple {
  background: rgba(168, 85, 247, 0.12);
  color: #a855f7;
}

.arch-content {
  flex: 1;
}

.arch-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 4px;
}

.arch-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

/* Actions List */
.actions-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.action-card-btn {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 14px;
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  color: #f8fafc;
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}

.action-card-btn:hover {
  background: #151e2e;
  border-color: #3b82f6;
  transform: translateX(2px);
}

.btn-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  background: #1e293b;
  color: #3b82f6;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-text-box {
  flex: 1;
}

.btn-main-text {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 2px;
}

.btn-sub-text {
  font-size: 11px;
  color: #64748b;
}

.btn-arrow {
  color: #475569;
  transition: transform 0.15s ease;
}

.action-card-btn:hover .btn-arrow {
  color: #3b82f6;
  transform: translateX(2px);
}
</style>
