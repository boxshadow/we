<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  NButton,
  darkTheme
} from 'naive-ui';
import {
  Wallet,
  ExternalLink,
  Layers,
  ChevronDown,
  Terminal
} from 'lucide-vue-next';
import { cleanDarkThemeOverrides } from './styles/theme';
import { useWalletStore } from './stores/wallet';
import ConnectModal from './components/ConnectModal.vue';

const walletStore = useWalletStore();
const showConnectModal = ref(false);

onMounted(() => {
  walletStore.init();
});

const formatAddr = (addr: string) => {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="cleanDarkThemeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <div class="app-layout">
            <!-- 顶部导航栏 -->
            <header class="app-nav">
              <div class="nav-container">
                <!-- 品牌 Logo -->
                <div class="brand">
                  <div class="logo-box">
                    <Layers :size="18" class="logo-icon" />
                  </div>
                  <div class="brand-text">
                    <span class="brand-name">CyberGate</span>
                    <span class="brand-sub">Multi-Chain</span>
                  </div>
                </div>

                <!-- 导航操作项 -->
                <div class="nav-actions">
                  <!-- 后台管理快捷跳转 -->
                  <a href="/admin" target="_blank" class="nav-link">
                    <span>管理中台</span>
                    <ExternalLink :size="13" />
                  </a>

                  <!-- 网络与连接状态 -->
                  <div
                    v-if="walletStore.accessToken"
                    class="addr-badge"
                    @click="showConnectModal = true"
                    title="点击管理多链钱包与切换网络"
                  >
                    <span class="dot-online"></span>
                    <span class="addr-chain">{{ walletStore.activeNetwork?.name || '已连接' }}</span>
                    <span class="addr-text">{{ formatAddr(walletStore.connectedAddress) }}</span>
                    <ChevronDown :size="14" class="addr-arrow" />
                  </div>

                  <NButton
                    v-else
                    type="primary"
                    size="medium"
                    class="nav-connect-btn"
                    @click="showConnectModal = true"
                  >
                    <template #icon><Wallet :size="15" /></template>
                    连接钱包
                  </NButton>
                </div>
              </div>
            </header>

            <!-- 主页面视图 -->
            <main class="app-main">
              <router-view />
            </main>

            <!-- 底部声明 -->
            <footer class="app-footer">
              <div class="footer-container">
                <div class="footer-left">
                  <span>CyberGate Multi-Chain Gateway © 2026. Enterprise Web3 Settlement Infrastructure.</span>
                </div>
                <div class="footer-right">
                  <span class="status-indicator">
                    <span class="status-dot"></span>
                    多链节点运行就绪
                  </span>
                </div>
              </div>
            </footer>

            <!-- 全局连接弹窗 -->
            <ConnectModal v-model:show="showConnectModal" />
          </div>
        </NNotificationProvider>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
/* 全局基础重置与排版规范 */
html, body {
  margin: 0;
  padding: 0;
  background-color: #090d16;
  color: #f8fafc;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

/* 统一代码与地址等宽字体 */
.mono-text {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
</style>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #090d16;
}

.app-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(9, 13, 22, 0.88);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.nav-container {
  max-width: 1140px;
  margin: 0 auto;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.logo-box {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #f8fafc;
}

.brand-sub {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: #94a3b8;
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.15s ease;
}

.nav-link:hover {
  color: #f8fafc;
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.04);
}

.addr-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.addr-badge:hover {
  border-color: rgba(59, 130, 246, 0.4);
  background: #172033;
}

.dot-online {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10b981;
}

.addr-chain {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
  text-transform: uppercase;
}

.addr-text {
  font-size: 13px;
  font-family: 'JetBrains Mono', monospace;
  color: #f1f5f9;
  font-weight: 500;
}

.addr-arrow {
  color: #64748b;
}

.nav-connect-btn {
  font-weight: 600;
}

.app-main {
  flex: 1;
  max-width: 1140px;
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.app-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: #090d16;
  padding: 20px 24px;
}

.footer-container {
  max-width: 1140px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: #64748b;
  flex-wrap: wrap;
  gap: 12px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #94a3b8;
  font-size: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

@media (max-width: 640px) {
  .nav-container {
    padding: 12px 16px;
  }
  .app-main {
    padding: 20px 16px 48px;
  }
  .brand-sub {
    display: none;
  }
}
</style>
