import { createRouter, createWebHistory } from 'vue-router';
import DashboardView from '../views/DashboardView.vue';
import NetworksView from '../views/NetworksView.vue';
import AuditAnalyticsView from '../views/AuditAnalyticsView.vue';
import AuditLedgerView from '../views/AuditLedgerView.vue';
import DepositWalletsView from '../views/DepositWalletsView.vue';
import WithdrawWalletsView from '../views/WithdrawWalletsView.vue';
import TokensAndBalancesView from '../views/TokensAndBalancesView.vue';
import UsersView from '../views/UsersView.vue';
import EncryptionConfigView from '../views/EncryptionConfigView.vue';
import LoginView from '../views/LoginView.vue';
import { adminAuthClient } from '../api/adminClient';

const router = createRouter({
  history: createWebHistory('/admin-dist/'),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { title: '管理员登录 · Web3 Custody' }
    },
    {
      path: '/',
      name: 'dashboard',
      component: DashboardView,
      meta: { title: '金库运营与风控总览', requiresAuth: true }
    },
    {
      path: '/networks',
      name: 'networks',
      component: NetworksView,
      meta: { title: '多链节点与熔断控制', requiresAuth: true }
    },
    {
      path: '/deposit-wallets',
      name: 'deposit-wallets',
      component: DepositWalletsView,
      meta: { title: '充值归集钱包管理', requiresAuth: true }
    },
    {
      path: '/withdraw-wallets',
      name: 'withdraw-wallets',
      component: WithdrawWalletsView,
      meta: { title: '提现出金热钱包管理', requiresAuth: true }
    },
    {
      path: '/tokens-balances',
      name: 'tokens-balances',
      component: TokensAndBalancesView,
      meta: { title: '多链代币与资产余额', requiresAuth: true }
    },
    {
      path: '/encryption-service',
      name: 'encryption-service',
      component: EncryptionConfigView,
      meta: { title: 'KMS 与安全 Enclave 签名服务', requiresAuth: true }
    },
    {
      path: '/audit',
      redirect: '/audit/analytics'
    },
    {
      path: '/audit/analytics',
      name: 'audit-analytics',
      component: AuditAnalyticsView,
      meta: { title: '充提数据可视化分析', requiresAuth: true }
    },
    {
      path: '/audit/ledger',
      name: 'audit-ledger',
      component: AuditLedgerView,
      meta: { title: '资金流水与对账总账', requiresAuth: true }
    },
    {
      path: '/users',
      name: 'users',
      component: UsersView,
      meta: { title: '用户资产与地址画像', requiresAuth: true }
    }
  ]
});

// 全局路由鉴权守卫：拦截未授权访问并自动引导至登录页
router.beforeEach((to, _from, next) => {
  if (to.meta.title) {
    document.title = `${to.meta.title} - Cyber Custody`;
  }

  const isAuthenticated = adminAuthClient.isAuthenticated();

  if (to.path === '/login') {
    if (isAuthenticated) {
      next('/');
    } else {
      next();
    }
  } else {
    if (!isAuthenticated) {
      next('/login');
    } else {
      next();
    }
  }
});

export default router;
