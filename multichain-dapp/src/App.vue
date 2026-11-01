<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  NConfigProvider,
  NMessageProvider,
  NDialogProvider,
  NNotificationProvider,
  NButton,
  NTooltip,
  darkTheme
} from 'naive-ui';
import {
  Wallet,
  ExternalLink,
  Layers,
  ChevronDown,
  LogOut,
  ShieldCheck,
  Activity
} from 'lucide-vue-next';
import { cleanDarkThemeOverrides } from './styles/theme';
import { useWalletStore } from './stores/wallet';
import ConnectModal from './components/ConnectModal.vue';

const walletStore = useWalletStore();
const showConnectModal = ref(false);

onMounted(() => {
  walletStore.init();
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('connect') === '1') {
      showConnectModal.value = true;
    }
  }
});

const formatAddr = (addr: string) => {
  if (!addr) return '';
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const formatShortAddr = (addr: string) => {
  if (!addr) return '';
  if (addr.length <= 10) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-3)}`;
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
                    <span class="brand-sub">Portal</span>
                  </div>
                </div>

                <!-- 导航操作项 -->
                <div class="nav-actions">
                  <!-- 后台管理快捷跳转 -->
                  <a href="/admin" target="_blank" class="nav-link" title="管理中台" aria-label="管理中台">
                    <span class="nav-link-text">管理中台</span>
                    <ExternalLink :size="13" class="nav-link-icon" />
                  </a>

                  <!-- 网络与连接状态 -->
                  <div v-if="walletStore.accessToken && walletStore.user" class="session-actions">
                    <div
                      class="addr-badge"
                      @click="showConnectModal = true"
                      title="点击管理多链钱包与切换网络"
                    >
                      <span class="dot-online"></span>
                      <span class="addr-chain">{{ walletStore.user.primaryWallet.chain }}</span>
                      <span class="addr-text addr-text-full mono-text">{{ formatAddr(walletStore.connectedAddress) }}</span>
                      <span class="addr-text addr-text-short mono-text">{{ formatShortAddr(walletStore.connectedAddress) }}</span>
                      <span class="wallets-count-tag">{{ walletStore.user.wallets?.length || 1 }} 链已绑</span>
                      <ChevronDown :size="12" class="addr-arrow" />
                    </div>

                    <NTooltip trigger="hover">
                      <template #trigger>
                        <button class="logout-btn" @click="walletStore.disconnect" aria-label="断开会话" title="断开连接">
                          <LogOut :size="14" />
                        </button>
                      </template>
                      断开当前连接
                    </NTooltip>
                  </div>

                  <NButton
                    v-else
                    type="primary"
                    size="medium"
                    class="nav-connect-btn"
                    @click="showConnectModal = true"
                  >
                    <template #icon><Wallet :size="15" /></template>
                    <span class="connect-btn-text">连接钱包</span>
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
                    多链 RPC 与 KMS Enclave 运行就绪
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

::selection {
  background: rgba(59, 130, 246, 0.35);
  color: #ffffff;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: #090d16;
}

::-webkit-scrollbar-thumb {
  background: #1e293b;
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: #334155;
}

::selection {
  background: rgba(59, 130, 246, 0.35);
  color: #f8fafc;
}

/* 统一代码与地址等宽字体 */
.mono-text {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
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
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  align-items: baseline;
  gap: 6px;
  white-space: nowrap;
}

.brand-name {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: #f8fafc;
}

.brand-sub {
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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
  white-space: nowrap;
  flex-shrink: 0;
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
  white-space: nowrap;
  flex-shrink: 0;
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
  flex-shrink: 0;
}

.addr-chain {
  font-size: 10px;
  color: #60a5fa;
  font-weight: 700;
  letter-spacing: 0.3px;
  background: rgba(59, 130, 246, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
  flex-shrink: 0;
}

.addr-text {
  font-size: 13px;
  color: #f1f5f9;
  font-weight: 500;
}

.addr-text-short {
  display: none;
}

.wallets-count-tag {
  font-size: 11px;
  color: #94a3b8;
  background: #1e293b;
  padding: 1px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.addr-arrow {
  color: #64748b;
  flex-shrink: 0;
}

.logout-btn {
  background: #111827;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.logout-btn:hover {
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.4);
  background: rgba(239, 68, 68, 0.08);
}

.nav-connect-btn {
  font-weight: 600;
  white-space: nowrap;
  flex-shrink: 0;
}

.app-main {
  flex: 1;
  max-width: 1140px;
  width: 100%;
  margin: 0 auto;
  padding: 28px 24px 64px;
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
    padding: 10px 14px;
    gap: 8px;
  }
  .app-main {
    padding: 14px 12px 48px;
  }
  .brand {
    gap: 8px;
  }
  .logo-box {
    width: 28px;
    height: 28px;
    border-radius: 6px;
  }
  .brand-name {
    font-size: 15px;
  }
  .brand-sub {
    display: none;
  }
  .nav-actions {
    gap: 6px;
  }
  .session-actions {
    gap: 6px;
  }
  .nav-link {
    width: 32px;
    height: 32px;
    padding: 0;
    justify-content: center;
    border-radius: 8px;
  }
  .nav-link-text {
    display: none;
  }
  .addr-badge {
    padding: 4px 8px;
    gap: 5px;
    border-radius: 8px;
  }
  .addr-chain {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: 3px;
  }
  .addr-text {
    font-size: 12px;
  }
  .addr-text-full {
    display: none;
  }
  .addr-text-short {
    display: inline-block;
  }
  .wallets-count-tag {
    display: none;
  }
  .addr-arrow {
    display: none;
  }
  .logout-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  .nav-connect-btn {
    height: 32px;
    font-size: 13px;
    padding: 0 10px;
  }
  .app-footer {
    padding: 16px 14px;
  }
  .footer-container {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
}

@media (max-width: 360px) {
  .nav-container {
    padding: 8px 10px;
  }
  .brand-name {
    font-size: 14px;
  }
  .addr-badge {
    padding: 3px 6px;
    gap: 4px;
  }
  .addr-text {
    font-size: 11px;
  }
  .connect-btn-text {
    font-size: 12px;
  }
}
</style>
