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
  Globe2
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
    message.warning(`公链 [${network.name}] 当前处于平台熔断保护状态，暂停接入！`);
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
</script>

<template>
  <NModal
    :show="props.show"
    @update:show="(val) => emit('update:show', val)"
    preset="card"
    class="clean-connect-modal"
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
            {{ props.mode === 'bind' ? '请选择您要绑定至当前主账号的钱包扩展或 App 环境' : '系统优先检测当前设备安装的钱包插件与 App 运行环境' }}
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
              <span v-else class="wallet-emoji-box">{{ item.wallet.icon }}</span>
            </div>

            <!-- 钱包信息 -->
            <div class="wallet-info">
              <div class="wallet-title-row">
                <span class="wallet-name">{{ item.wallet.name }}</span>
                <NTag
                  v-if="item.detected"
                  type="success"
                  size="small"
                  round
                  class="status-tag"
                >
                  <template #icon><CheckCircle2 :size="11" /></template>
                  已就绪
                </NTag>
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
            @click="!net.isPaused && !walletStore.isConnecting && handleConnectChain(net)"
          >
            <div class="net-left">
              <div class="net-avatar" :class="net.family.toLowerCase()">
                {{ net.icon || (net.family === 'EVM' ? 'ETH' : net.family === 'SOLANA' ? 'SOL' : 'TRX') }}
              </div>
              <div class="net-info">
                <div class="net-name-row">
                  <span class="net-name">{{ net.name }}</span>
                  <span class="net-family-badge">{{ net.family }}</span>
                  <span v-if="net.chainId" class="net-id-badge">ID: {{ net.chainId }}</span>
                </div>
                <div class="net-sub">
                  币种: <span class="net-symbol mono-text">{{ net.symbol }}</span> · RPC: {{ net.rpc }}
                </div>
              </div>
            </div>

            <div class="net-right">
              <NTag v-if="net.isPaused" type="warning" size="small" round>
                <template #icon><AlertTriangle :size="11" /></template>
                熔断维护
              </NTag>
              <div v-else-if="signingChainId === net.networkId" class="signing-indicator">
                <NSpin size="small" />
                <span>等待签名</span>
              </div>
              <NButton
                v-else
                type="primary"
                size="small"
                secondary
                class="connect-act-btn"
                :disabled="walletStore.isConnecting"
              >
                {{ props.mode === 'bind' ? '签名绑定' : '连接' }}
              </NButton>
            </div>
          </div>

          <NAlert v-if="compatibleNetworks.length === 0" type="warning" class="empty-chains-alert">
            当前后台没有为该钱包开启任何支持的公链节点。请联系管理员在后台开启对应网络。
          </NAlert>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
:deep(.clean-connect-modal) {
  max-width: 500px;
  width: 92vw;
  background: #0f172a !important;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
  border-radius: 14px;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.back-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-badge {
  font-size: 11px;
  color: #3b82f6;
  font-weight: 600;
}

.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: #f8fafc;
  margin: 0;
}

.modal-body-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.step-guide {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  font-size: 12px;
  color: #94a3b8;
}

.guide-icon {
  color: #64748b;
  flex-shrink: 0;
}

/* 钱包列表 */
.wallet-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 380px;
  overflow-y: auto;
  padding-right: 2px;
}

.wallet-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: #0b1120;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.wallet-card:hover {
  background: #111827;
  border-color: rgba(255, 255, 255, 0.16);
}

.wallet-card.is-detected {
  border-color: rgba(59, 130, 246, 0.3);
}

.wallet-icon-wrapper {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  flex-shrink: 0;
}

.wallet-icon-wrapper img {
  width: 30px;
  height: 30px;
  border-radius: 6px;
}

.wallet-svg-box {
  display: flex;
  align-items: center;
  justify-content: center;
}

.wallet-emoji-box {
  font-size: 20px;
}

.wallet-info {
  flex: 1;
  min-width: 0;
}

.wallet-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 2px;
}

.wallet-name {
  font-weight: 600;
  font-size: 14px;
  color: #f8fafc;
}

.wallet-desc {
  font-size: 11px;
  color: #64748b;
  margin: 0 0 4px 0;
}

.download-link {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #64748b;
  text-decoration: none;
}

.download-link:hover {
  color: #3b82f6;
}

.family-tags {
  display: flex;
  align-items: center;
  gap: 4px;
}

.chain-fam-pill {
  font-size: 9px;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  color: #94a3b8;
}

.chain-fam-pill.evm {
  color: #60a5fa;
  background: rgba(59, 130, 246, 0.1);
}

.chain-fam-pill.solana {
  color: #c084fc;
  background: rgba(168, 85, 247, 0.1);
}

.chain-fam-pill.tron {
  color: #f87171;
  background: rgba(239, 68, 68, 0.1);
}

/* 步骤 2 头部横幅 */
.wallet-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.banner-left {
  display: flex;
  flex-direction: column;
}

.banner-label {
  font-size: 10px;
  color: #64748b;
}

.banner-name {
  font-size: 14px;
  color: #f8fafc;
  font-weight: 600;
}

.banner-families {
  display: flex;
  gap: 6px;
}

/* 网络列表 */
.network-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 340px;
  overflow-y: auto;
  padding-right: 2px;
}

.network-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: #0b1120;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}

.network-card:hover:not(.is-paused) {
  background: #111827;
  border-color: rgba(255, 255, 255, 0.18);
}

.network-card.is-paused {
  opacity: 0.5;
  cursor: not-allowed;
}

.network-card.is-signing {
  border-color: #3b82f6;
  background: rgba(59, 130, 246, 0.08);
}

.net-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.net-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.05);
  color: #cbd5e1;
}

.net-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.net-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.net-name {
  font-weight: 600;
  font-size: 13px;
  color: #f8fafc;
}

.net-family-badge {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  color: #94a3b8;
}

.net-id-badge {
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
  color: #64748b;
}

.net-sub {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 240px;
}

.net-symbol {
  color: #94a3b8;
  font-weight: 500;
}

.signing-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #3b82f6;
  font-weight: 500;
}

.connect-act-btn {
  font-size: 12px;
}

@media (max-width: 640px) {
  :deep(.clean-connect-modal) {
    width: 94vw;
  }
  .net-sub {
    max-width: 140px;
  }
}
</style>
