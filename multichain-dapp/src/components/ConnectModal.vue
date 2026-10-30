<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  NModal,
  NButton,
  NTag,
  NSpin,
  useMessage,
  NAlert
} from 'naive-ui';
import {
  ChevronLeft,
  CheckCircle2,
  ExternalLink,
  AlertTriangle,
  Wallet as WalletIcon,
  Globe2,
  ShieldCheck,
  Sparkles,
  ArrowRight
} from 'lucide-vue-next';
import { useWalletStore } from '../stores/wallet';
import type { WalletConfig, SupportedNetwork } from '../types/wallet';

const props = withDefaults(defineProps<{
  show: boolean;
  mode?: 'login' | 'bind';
}>(), {
  mode: 'login'
});

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'connected', address: string): void;
  (e: 'bound', profile: any): void;
}>();

const walletStore = useWalletStore();
const message = useMessage();

// 步骤控制: 1 = 选择钱包, 2 = 选择网络
const currentStep = ref<1 | 2>(1);
const chosenWallet = ref<WalletConfig | null>(null);
const signingChainId = ref<string | null>(null);
const isDemoLoggingIn = ref(false);

// 监听弹窗打开，重置步骤
watch(() => props.show, (newVal) => {
  if (newVal) {
    currentStep.value = 1;
    chosenWallet.value = null;
    signingChainId.value = null;
  }
});

// 计算当前选择钱包与平台支持网络的交集
const compatibleNetworks = computed(() => {
  if (!chosenWallet.value) return [];
  return walletStore.supportedNetworks.filter(net => 
    chosenWallet.value!.families.includes(net.family)
  );
});

// 选择钱包
function selectWallet(walletItem: { wallet: WalletConfig; detected: boolean }) {
  chosenWallet.value = walletItem.wallet;
  currentStep.value = 2;
}

// 返回钱包列表
function backToWallets() {
  currentStep.value = 1;
  signingChainId.value = null;
}

// 唤起原生授权与验签（区分登录模式与跨链绑定模式）
async function handleConnectChain(network: SupportedNetwork) {
  if (!chosenWallet.value) return;
  if (network.isPaused) {
    message.warning(`公链 [${network.name}] 当前处于平台熔断保护状态，暂停接入`);
    return;
  }

  signingChainId.value = network.networkId;
  try {
    if (props.mode === 'bind') {
      message.loading(`正在唤起 ${chosenWallet.value.name} 发起 ${network.name} 跨链所有权验证签名...`, { duration: 3000 });
      const updated = await walletStore.bindWalletWithChain(chosenWallet.value, network);
      message.success(`跨链绑定成功！已将 [${network.family}] 钱包添加至主账号名下`);
      emit('update:show', false);
      emit('bound', updated);
    } else {
      message.loading(`正在唤起 ${chosenWallet.value.name} 发起 ${network.name} 身份挑战签名...`, { duration: 3000 });
      await walletStore.connectWalletWithChain(chosenWallet.value, network);
      message.success(`连接成功！欢迎 ${walletStore.connectedAddress.slice(0, 6)}...${walletStore.connectedAddress.slice(-4)}`);
      emit('update:show', false);
      emit('connected', walletStore.connectedAddress);
    }
  } catch (err: any) {
    message.error(err.message || '签名授权失败或已被取消');
  } finally {
    signingChainId.value = null;
  }
}

// 演示账号极速体验
async function handleDemoLogin() {
  isDemoLoggingIn.value = true;
  try {
    const res = await walletStore.loginWithDemoAccount();
    message.success(`演示画像载入成功！欢迎用户 ${res.user.primaryWallet.address.slice(0, 6)}...${res.user.primaryWallet.address.slice(-4)}`);
    emit('update:show', false);
    emit('connected', res.user.primaryWallet.address);
  } catch (err: any) {
    message.error(err.message || '演示登录失败');
  } finally {
    isDemoLoggingIn.value = false;
  }
}
</script>

<template>
  <NModal
    :show="props.show"
    @update:show="(val) => emit('update:show', val)"
    preset="card"
    class="clean-connect-modal"
    :animated="false"
    :style="{ backgroundColor: '#0f172a', width: '600px' }"
    :mask-closable="!walletStore.isConnecting"
    :closable="!walletStore.isConnecting"
  >
    <template #header>
      <div class="modal-header">
        <button
          v-if="currentStep === 2"
          class="back-btn"
          @click="backToWallets"
          :disabled="walletStore.isConnecting"
        >
          <ChevronLeft :size="16" />
          <span>返回</span>
        </button>
        <div class="header-titles">
          <span class="step-badge">
            {{ props.mode === 'bind' ? '跨链绑定' : '身份连接' }} · 步骤 {{ currentStep }} / 2
          </span>
          <h3 class="modal-title">
            {{
              props.mode === 'bind'
                ? (currentStep === 1 ? '选择待绑定的钱包' : `选择 [${chosenWallet?.name}] 对应公链`)
                : (currentStep === 1 ? '选择 Web3 钱包' : `选择 [${chosenWallet?.name}] 对应公链`)
            }}
          </h3>
        </div>
      </div>
    </template>

    <div class="modal-body-container">
      <!-- 步骤 1: 钱包列表展示 (TokenPocket 优先置顶) -->
      <div v-if="currentStep === 1" class="step-view">
        <div class="step-guide">
          <WalletIcon :size="15" class="guide-icon" />
          <span>
            {{ props.mode === 'bind' ? '请选择您要绑定至当前主账号的钱包扩展或 App 环境' : '系统已通过 EIP-6963 自动感知当前浏览器安装的钱包扩展' }}
          </span>
        </div>

        <div class="wallet-grid">
          <div
            v-for="item in walletStore.walletList"
            :key="item.wallet.id"
            class="wallet-card"
            :class="{ 'is-detected': item.detected }"
            @click="selectWallet(item)"
          >
            <!-- 钱包图标 -->
            <div class="wallet-icon-wrapper">
              <span v-if="item.wallet.iconImg" class="wallet-custom-img">
                <img :src="item.wallet.iconImg" alt="" />
              </span>
              <span v-else-if="item.wallet.svgIcon" v-html="item.wallet.svgIcon" class="wallet-svg-box"></span>
              <span v-else class="wallet-fallback-box">
                <WalletIcon :size="20" />
              </span>
            </div>

            <!-- 钱包信息 -->
            <div class="wallet-info">
              <div class="wallet-title-row">
                <span class="wallet-name">{{ item.wallet.name }}</span>
                <span v-if="item.detected" class="detected-badge">
                  <span class="detected-dot"></span>
                  已就绪
                </span>
                <a
                  v-else-if="item.wallet.downloadUrl"
                  :href="item.wallet.downloadUrl"
                  target="_blank"
                  class="download-link"
                  @click.stop
                >
                  官网获取 <ExternalLink :size="10" />
                </a>
              </div>
              <p class="wallet-desc">{{ item.wallet.sub }}</p>
              
              <!-- 跨链家族标签 -->
              <div class="family-tags">
                <span
                  v-for="fam in item.wallet.families"
                  :key="fam"
                  class="chain-fam-pill"
                  :class="fam.toLowerCase()"
                >
                  {{ fam }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 演示画像快速体验通道 (在无插件环境提供一键演练) -->
        <div v-if="props.mode !== 'bind'" class="demo-experience-dock">
          <div class="demo-dock-info">
            <div class="demo-dock-title">
              <Sparkles :size="14" class="sparkle-icon" />
              <span>无钱包扩展？体验演示画像</span>
            </div>
            <p class="demo-dock-desc">
              一键接入预置多链测试画像 (EVM / TRON / Solana)，直接探索资产聚合看板与全生命周期充提流控。
            </p>
          </div>
          <NButton
            size="small"
            type="primary"
            secondary
            :loading="isDemoLoggingIn"
            @click="handleDemoLogin"
            class="demo-dock-btn"
          >
            载入画像
            <template #icon><ArrowRight :size="12" /></template>
          </NButton>
        </div>
      </div>

      <!-- 步骤 2: 选择钱包支持且平台支持的链 -->
      <div v-else-if="currentStep === 2" class="step-view">
        <div class="wallet-banner">
          <div class="banner-left">
            <span class="banner-label">已选钱包</span>
            <strong class="banner-name">{{ chosenWallet?.name }}</strong>
          </div>
          <div class="banner-families">
            <span
              v-for="fam in chosenWallet?.families"
              :key="fam"
              class="chain-fam-pill"
              :class="fam.toLowerCase()"
            >
              {{ fam }}
            </span>
          </div>
        </div>

        <div class="step-guide">
          <Globe2 :size="15" class="guide-icon" />
          <span>点击目标公链，将直接唤起钱包原生签名完成免密授权</span>
        </div>

        <!-- 链选择列表 -->
        <div class="network-list">
          <div
            v-for="net in compatibleNetworks"
            :key="net.networkId"
            class="network-card"
            :class="{
              'is-paused': net.isPaused,
              'is-signing': signingChainId === net.networkId
            }"
            @click="!net.isPaused && !signingChainId && handleConnectChain(net)"
          >
            <div class="network-info">
              <div class="network-top">
                <span class="net-family-tag" :class="net.family.toLowerCase()">{{ net.family }}</span>
                <span class="network-name">{{ net.name }}</span>
                <span v-if="net.chainId" class="chain-id-text">ID: {{ net.chainId }}</span>
              </div>
              <div class="network-sub">
                <span class="token-symbol">原生币: {{ net.symbol }}</span>
                <span class="network-rpc" :title="net.rpc">
                  {{ net.rpc ? net.rpc.replace('https://', '') : '官方直连' }}
                </span>
              </div>
            </div>

            <div class="network-action">
              <span v-if="net.isPaused" class="paused-badge">
                <AlertTriangle :size="12" /> 维护熔断
              </span>
              <div v-else-if="signingChainId === net.networkId" class="signing-badge">
                <NSpin size="small" />
                <span>等待钱包签名...</span>
              </div>
              <NButton
                v-else
                size="small"
                type="primary"
                secondary
                class="connect-chain-btn"
                :disabled="walletStore.isConnecting"
              >
                {{ props.mode === 'bind' ? '签名绑定' : '连接登录' }}
              </NButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style>
.n-modal-mask {
  background-color: rgba(0, 0, 0, 0.75) !important;
  transition: none !important;
}

.n-modal {
  transition: none !important;
  opacity: 1 !important;
  transform: none !important;
}

.clean-connect-modal.n-modal,
.clean-connect-modal.n-card {
  --n-color-modal: #0f172a !important;
  --n-color: #0f172a !important;
  background-color: #0f172a !important;
  background: #0f172a !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 14px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.9) !important;
  opacity: 1 !important;
}

.clean-connect-modal .n-card__content,
.clean-connect-modal .n-card-header {
  background-color: #0f172a !important;
  background: #0f172a !important;
}
</style>

<style scoped>
.clean-connect-modal {
  width: 580px;
  max-width: calc(100vw - 32px);
  background-color: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  border-radius: 6px;
  padding: 4px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.back-btn:hover {
  color: #f8fafc;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-badge {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #f8fafc;
}

.modal-body-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.step-guide {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(30, 41, 59, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 12px;
  color: #94a3b8;
}

.guide-icon {
  color: #3b82f6;
  shrink: 0;
}

.wallet-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

@media (max-width: 540px) {
  .wallet-grid {
    grid-template-columns: 1fr;
  }
}

.wallet-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px;
  border-radius: 10px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s ease;
}

.wallet-card:hover {
  background: #162032;
  border-color: rgba(59, 130, 246, 0.35);
  transform: translateY(-1px);
}

.wallet-card.is-detected {
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(17, 24, 39, 0.95);
}

.wallet-card.is-detected:hover {
  border-color: rgba(16, 185, 129, 0.5);
}

.wallet-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e293b;
  flex-shrink: 0;
  overflow: hidden;
}

.wallet-custom-img img {
  width: 32px;
  height: 32px;
  border-radius: 8px;
}

.wallet-fallback-box {
  color: #94a3b8;
}

.wallet-info {
  flex: 1;
  min-width: 0;
}

.wallet-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 2px;
}

.wallet-name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.detected-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #10b981;
  font-weight: 500;
}

.detected-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.download-link {
  font-size: 11px;
  color: #64748b;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.download-link:hover {
  color: #3b82f6;
}

.wallet-desc {
  margin: 0 0 8px 0;
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.family-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chain-fam-pill {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 600;
  letter-spacing: 0.3px;
  background: #1e293b;
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.chain-fam-pill.evm {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
  border-color: rgba(59, 130, 246, 0.2);
}

.chain-fam-pill.tron {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
}

.chain-fam-pill.solana {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.1);
  border-color: rgba(168, 85, 247, 0.2);
}

.demo-experience-dock {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.06);
  border: 1px dashed rgba(59, 130, 246, 0.25);
  margin-top: 4px;
}

.demo-dock-info {
  flex: 1;
}

.demo-dock-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #60a5fa;
  margin-bottom: 2px;
}

.sparkle-icon {
  color: #3b82f6;
}

.demo-dock-desc {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
  line-height: 1.4;
}

.demo-dock-btn {
  font-size: 12px;
  font-weight: 500;
}

.wallet-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.banner-left {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.banner-label {
  font-size: 11px;
  color: #64748b;
}

.banner-name {
  font-size: 14px;
  color: #f8fafc;
}

.banner-families {
  display: flex;
  gap: 4px;
}

.network-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 2px;
}

.network-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 8px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all 0.15s ease;
}

.network-card:hover {
  background: #162032;
  border-color: rgba(59, 130, 246, 0.35);
}

.network-card.is-paused {
  opacity: 0.6;
  cursor: not-allowed;
  background: rgba(17, 24, 39, 0.5);
}

.network-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.network-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.net-family-tag {
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 4px;
  background: #1e293b;
  color: #94a3b8;
}

.net-family-tag.evm {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.15);
}

.net-family-tag.tron {
  color: #f87171;
  background: rgba(239, 68, 68, 0.15);
}

.net-family-tag.solana {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.15);
}

.network-name {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.chain-id-text {
  font-size: 11px;
  font-family: 'JetBrains Mono', monospace;
  color: #64748b;
}

.network-sub {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #64748b;
}

.token-symbol {
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
}

.network-rpc {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paused-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #f59e0b;
}

.signing-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #3b82f6;
}

.connect-chain-btn {
  font-size: 12px;
}
</style>
