<template>
  <n-layout has-sider style="height: 100vh;">
    <!-- Sider -->
    <n-layout-sider
      bordered
      collapse-mode="width"
      :collapsed-width="64"
      :width="230"
      :collapsed="collapsed"
      show-trigger
      @collapse="collapsed = true"
      @expand="collapsed = false"
      style="background: #0e1420; border-color: #1e293b;"
    >
      <div class="logo-container">
        <div class="logo-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div v-if="!collapsed" class="logo-text">
          <div class="logo-title">Web3 Custody</div>
          <div class="logo-sub">多链资金运营中枢</div>
        </div>
      </div>

      <n-menu
        :collapsed="collapsed"
        :collapsed-width="64"
        :collapsed-icon-size="20"
        :options="menuOptions"
        :value="activeKey"
        :default-expanded-keys="['audit-group']"
        @update:value="handleMenuSelect"
      />
    </n-layout-sider>

    <!-- Main Content Area -->
    <n-layout>
      <!-- Header -->
      <n-layout-header bordered class="header-container">
        <div class="header-left">
          <div class="status-indicator">
            <span class="status-dot"></span>
            <span class="status-text">服务端正常运行 (:3000)</span>
          </div>
        </div>

        <div class="header-right">
          <n-button
            size="small"
            secondary
            tag="a"
            href="http://localhost:5173"
            target="_blank"
            class="header-link-btn"
          >
            <template #icon>
              <n-icon size="14"><OpenOutline /></n-icon>
            </template>
            访问 DApp 客户端
          </n-button>

          <div class="admin-user-pill">
            <span class="admin-role-badge">{{ adminRole }}</span>
            <span class="admin-name">{{ adminUsername }}</span>
            <span class="totp-badge">
              <n-icon size="12"><ShieldCheckmarkOutline /></n-icon>
              Google 2FA
            </span>
          </div>

          <n-popconfirm
            positive-text="确认退出"
            negative-text="取消"
            @positive-click="handleLogout"
          >
            <template #trigger>
              <n-button size="small" tertiary type="error" class="logout-btn">
                <template #icon>
                  <n-icon size="14"><LogOutOutline /></n-icon>
                </template>
                安全登出
              </n-button>
            </template>
            确定要注销当前管理员访问凭证并退出管理中枢吗？
          </n-popconfirm>
        </div>
      </n-layout-header>

      <!-- Content View -->
      <n-layout-content content-style="padding: 24px 28px; min-height: calc(100vh - 64px); background: #0b0f17;">
        <router-view />
      </n-layout-content>
    </n-layout>
  </n-layout>
</template>

<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { NIcon, useMessage } from 'naive-ui';
import {
  SpeedometerOutline,
  HardwareChipOutline,
  ShieldCheckmarkOutline,
  WalletOutline,
  CashOutline,
  ArrowUpCircleOutline,
  PeopleOutline,
  StatsChartOutline,
  ReceiptOutline,
  KeyOutline,
  OpenOutline,
  LogOutOutline,
} from '@vicons/ionicons5';
import { adminAuthClient } from '../api/adminClient';

const router = useRouter();
const route = useRoute();
const message = useMessage();
const collapsed = ref(false);

const storedAdmin = adminAuthClient.getStoredAdmin();
const adminUsername = ref(storedAdmin?.username || 'admin');
const adminRole = ref(storedAdmin?.role || 'SUPER_ADMIN');

onMounted(async () => {
  try {
    const profile = await adminAuthClient.getMe();
    adminUsername.value = profile.username;
    adminRole.value = profile.role;
  } catch {
    // 凭证失效时拦截器会自动处理
  }
});

async function handleLogout() {
  await adminAuthClient.logout();
  message.info('管理员会话已安全退出');
  router.replace('/login');
}

const activeKey = computed(() => {
  const name = route.name as string;
  if (name === 'audit' || name === 'audit-analytics') return 'audit-analytics';
  if (name === 'audit-ledger') return 'audit-ledger';
  return name || 'dashboard';
});

function renderIcon(icon: any) {
  return () => h(NIcon, null, { default: () => h(icon) });
}

const menuOptions = [
  {
    label: '指挥监控大屏',
    key: 'dashboard',
    icon: renderIcon(SpeedometerOutline),
  },
  {
    label: '多链网络与节点',
    key: 'networks',
    icon: renderIcon(HardwareChipOutline),
  },
  {
    label: '充值收款钱包池',
    key: 'deposit-wallets',
    icon: renderIcon(WalletOutline),
  },
  {
    label: '提现出金热钱包',
    key: 'withdraw-wallets',
    icon: renderIcon(ArrowUpCircleOutline),
  },
  {
    label: '多链代币与资产',
    key: 'tokens-balances',
    icon: renderIcon(CashOutline),
  },
  {
    label: '三方加密服务配置',
    key: 'encryption-service',
    icon: renderIcon(KeyOutline),
  },
  {
    label: '金流审计与运营',
    key: 'audit-group',
    icon: renderIcon(ShieldCheckmarkOutline),
    children: [
      {
        label: '运营可视化大屏',
        key: 'audit-analytics',
        icon: renderIcon(StatsChartOutline),
      },
      {
        label: '充提流水总账本',
        key: 'audit-ledger',
        icon: renderIcon(ReceiptOutline),
      },
    ],
  },
  {
    label: '全网用户与资产画像',
    key: 'users',
    icon: renderIcon(PeopleOutline),
  },
];

function handleMenuSelect(key: string) {
  router.push({ name: key });
}
</script>

<style scoped>
.logo-container {
  height: 64px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  border-bottom: 1px solid #1e293b;
}

.logo-badge {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #2563eb;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.logo-title {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  letter-spacing: -0.01em;
}

.logo-sub {
  font-size: 11px;
  color: #64748b;
}

.header-container {
  height: 64px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #0e1420;
  border-bottom: 1px solid #1e293b;
}

.header-left, .header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 20px;
  font-size: 12px;
  color: #34d399;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.header-link-btn {
  font-size: 12px;
  background: #182234;
  border: 1px solid #283548;
  color: #cbd5e1;
}

.header-link-btn:hover {
  background: #233148;
  color: #60a5fa;
  border-color: #3b82f6;
}

.admin-user-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  background: #161f30;
  border: 1px solid #222f46;
  border-radius: 6px;
  font-size: 12px;
}

.admin-role-badge {
  font-size: 10px;
  font-weight: 600;
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  padding: 2px 6px;
  border-radius: 4px;
}

.admin-name {
  color: #e2e8f0;
  font-weight: 500;
}

.totp-badge {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  padding: 1px 6px;
  border-radius: 4px;
}

.logout-btn {
  font-size: 12px;
}
</style>
