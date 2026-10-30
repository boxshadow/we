import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { apiClient } from '../api/client';
import type { SupportedNetwork, WalletConfig, UserProfile, ChainFamily } from '../types/wallet';

export const useWalletStore = defineStore('wallet', () => {
  // 状态
  const supportedNetworks = ref<SupportedNetwork[]>([]);
  const eip6963Providers = ref<Map<string, any>>(new Map());
  const selectedWallet = ref<WalletConfig | null>(null);
  const activeNetwork = ref<SupportedNetwork | null>(null);
  const connectedAddress = ref<string>('');
  const accessToken = ref<string | null>(localStorage.getItem('dapp_access_token'));
  const refreshToken = ref<string | null>(localStorage.getItem('dapp_refresh_token'));
  const user = ref<UserProfile | null>(null);
  const isConnecting = ref(false);
  const logs = ref<{ time: string; type: 'info' | 'warn' | 'success' | 'error'; message: string; data?: any }[]>([]);

  function log(message: string, type: 'info' | 'warn' | 'success' | 'error' = 'info', data?: any) {
    logs.value.unshift({
      time: new Date().toLocaleTimeString(),
      type,
      message,
      data
    });
    if (logs.value.length > 50) logs.value.pop();
  }

  // 主流已知钱包清单 (TokenPocket TP 钱包原生置顶优先)
  const knownWallets: WalletConfig[] = [
    {
      id: 'tokenpocket',
      name: 'TokenPocket',
      sub: 'TP 钱包 (多链: EVM · TRON · Solana)',
      families: ['EVM', 'TRON', 'SOLANA'],
      icon: '🔷',
      svgIcon: `<svg class="w-8 h-8 rounded-xl shrink-0" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="#2980FE"/><path d="M10 11C10 9.89543 10.8954 9 12 9H24C25.1046 9 26 9.89543 26 11V15C26 16.1046 25.1046 17 24 17H20V26C20 26.5523 19.5523 27 19 27H17C16.4477 27 16 26.5523 16 26V17H12C10.8954 17 10 16.1046 10 15V11Z" fill="white"/></svg>`,
      rdns: 'vip.tokenpocket',
      downloadUrl: 'https://www.tokenpocket.pro/',
      detect: () => {
        const w = window as any;
        const ua = (navigator.userAgent || '').toLowerCase();
        return !!(
          w.tokenpocket ||
          w.ethereum?.isTokenPocket ||
          w.ethereum?.isTp ||
          w.solana?.isTokenPocket ||
          w.tronWeb?.isTokenPocket ||
          w.tronLink?.isTokenPocket ||
          (w.tronWeb && w.tokenpocket) ||
          eip6963Providers.value.has('vip.tokenpocket') ||
          eip6963Providers.value.has('vip.tokenpocket.wallet') ||
          eip6963Providers.value.has('tokenpocket') ||
          ua.includes('tokenpocket')
        );
      },
      getProvider: (family) => {
        const w = window as any;
        if (family === 'TRON') {
          return w.tokenpocket?.tronWeb || (w.tronWeb?.isTokenPocket ? w.tronWeb : null) || w.tronWeb || w.tronLink;
        }
        if (family === 'SOLANA') {
          return w.tokenpocket?.solana || (w.solana?.isTokenPocket ? w.solana : null) || w.solana;
        }
        return eip6963Providers.value.get('vip.tokenpocket')?.provider ||
               eip6963Providers.value.get('vip.tokenpocket.wallet')?.provider ||
               eip6963Providers.value.get('tokenpocket')?.provider ||
               w.tokenpocket?.ethereum ||
               (w.ethereum?.isTokenPocket ? w.ethereum : null) ||
               (w.ethereum?.providers?.find((p: any) => p.isTokenPocket)) ||
               w.ethereum;
      }
    },
    {
      id: 'metamask',
      name: 'MetaMask',
      sub: '小狐狸钱包 (仅支持 EVM 兼容公链)',
      families: ['EVM'],
      icon: '🦊',
      svgIcon: `<svg class="w-8 h-8 rounded-xl shrink-0" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="#F6851B" fill-opacity="0.2"/><path d="M26 11L18 17L19.5 13L26 11Z" fill="#E2761B"/><path d="M10 11L18 17L16.5 13L10 11Z" fill="#E4761B"/><path d="M24 23L21.5 26.5L25.5 27.5L26.5 23L24 23Z" fill="#E4761B"/><path d="M12 23L14.5 26.5L10.5 27.5L9.5 23L12 23Z" fill="#E4761B"/><circle cx="18" cy="18" r="3" fill="#F6851B"/></svg>`,
      rdns: 'io.metamask',
      downloadUrl: 'https://metamask.io/download/',
      detect: () => {
        const w = window as any;
        if (w.ethereum?.isTokenPocket && !eip6963Providers.value.has('io.metamask') && !w.ethereum?.providers?.some((p: any) => p.isMetaMask && !p.isTokenPocket)) {
          return false;
        }
        return !!(w.ethereum?.isMetaMask || eip6963Providers.value.has('io.metamask'));
      },
      getProvider: () => {
        const w = window as any;
        return eip6963Providers.value.get('io.metamask')?.provider || (w.ethereum?.isMetaMask && !w.ethereum?.isTokenPocket ? w.ethereum : w.ethereum?.providers?.find((p: any) => p.isMetaMask && !p.isTokenPocket) || w.ethereum);
      }
    },
    {
      id: 'okx',
      name: 'OKX Wallet',
      sub: '欧易 Web3 钱包 (多链: EVM · TRON · Solana)',
      families: ['EVM', 'SOLANA', 'TRON'],
      icon: '⬛',
      svgIcon: `<svg class="w-8 h-8 rounded-xl shrink-0" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="#000000"/><rect x="9" y="9" width="6" height="6" fill="white"/><rect x="21" y="9" width="6" height="6" fill="white"/><rect x="15" y="15" width="6" height="6" fill="white"/><rect x="9" y="21" width="6" height="6" fill="white"/><rect x="21" y="21" width="6" height="6" fill="white"/></svg>`,
      rdns: 'com.okex.wallet',
      downloadUrl: 'https://www.okx.com/web3',
      detect: () => {
        const w = window as any;
        return !!(w.okxwallet || eip6963Providers.value.has('com.okex.wallet'));
      },
      getProvider: (family) => {
        const w = window as any;
        if (family === 'SOLANA') return w.okxwallet?.solana;
        if (family === 'TRON') return w.okxwallet?.tronWeb || w.tronWeb;
        return eip6963Providers.value.get('com.okex.wallet')?.provider || w.okxwallet?.ethereum || w.okxwallet;
      }
    },
    {
      id: 'phantom',
      name: 'Phantom',
      sub: '幻影钱包 (主要支持 Solana 及 EVM)',
      families: ['SOLANA', 'EVM'],
      icon: '🟣',
      svgIcon: `<svg class="w-8 h-8 rounded-xl shrink-0" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="#AB9FF2" fill-opacity="0.2"/><circle cx="18" cy="18" r="9" fill="#AB9FF2"/><circle cx="15.5" cy="17" r="1.5" fill="#1C182A"/><circle cx="20.5" cy="17" r="1.5" fill="#1C182A"/></svg>`,
      rdns: 'app.phantom',
      downloadUrl: 'https://phantom.app/download',
      detect: () => {
        const w = window as any;
        return !!(w.phantom || w.solana?.isPhantom || eip6963Providers.value.has('app.phantom'));
      },
      getProvider: (family) => {
        const w = window as any;
        if (family === 'SOLANA') return w.phantom?.solana || w.solana;
        return eip6963Providers.value.get('app.phantom')?.provider || w.phantom?.ethereum;
      }
    },
    {
      id: 'tronlink',
      name: 'TronLink',
      sub: '波场助手 (专为 TRON 生态设计)',
      families: ['TRON'],
      icon: '🔴',
      svgIcon: `<svg class="w-8 h-8 rounded-xl shrink-0" viewBox="0 0 36 36" fill="none"><rect width="36" height="36" rx="9" fill="#FF0018" fill-opacity="0.2"/><path d="M10 11L26 14L19 27L10 11Z" stroke="#FF0018" stroke-width="2" fill="none"/><path d="M10 11L19 17L26 14" stroke="#FF0018" stroke-width="1.5"/><path d="M19 17V27" stroke="#FF0018" stroke-width="1.5"/></svg>`,
      downloadUrl: 'https://www.tronlink.org/',
      detect: () => {
        const w = window as any;
        return !!(w.tronWeb || w.tronLink);
      },
      getProvider: () => {
        const w = window as any;
        return w.tronWeb || w.tronLink;
      }
    }
  ];

  // 计算并排序钱包列表：检测到的优先置顶
  const walletList = computed(() => {
    const list = [...knownWallets];
    eip6963Providers.value.forEach(({ info, provider }, rdns) => {
      if (!list.some(w => w.rdns === rdns)) {
        list.push({
          id: rdns,
          name: info.name,
          sub: 'EIP-6963 自动感知扩展',
          families: ['EVM'],
          icon: '📱',
          iconImg: info.icon,
          rdns,
          detect: () => true,
          getProvider: () => provider
        });
      }
    });

    return list.map(w => ({
      wallet: w,
      detected: w.detect ? w.detect() : false
    })).sort((a, b) => {
      if (a.detected && !b.detected) return -1;
      if (!a.detected && b.detected) return 1;
      return 0;
    });
  });

  // 初始化拉取
  async function init() {
    // 监听 EIP-6963
    if (typeof window !== 'undefined') {
      window.addEventListener('eip6963:announceProvider', (event: any) => {
        const { info, provider } = event.detail;
        eip6963Providers.value.set(info.rdns, { info, provider });
      });
      window.dispatchEvent(new Event('eip6963:requestProvider'));
    }

    try {
      supportedNetworks.value = await apiClient.getNetworks();
      if (supportedNetworks.value.length > 0) {
        activeNetwork.value = supportedNetworks.value[0];
      }
    } catch (e: any) {
      log(`拉取网络配置异常: ${e.message}`, 'warn');
    }

    // 恢复已登录会话
    if (accessToken.value) {
      try {
        user.value = await apiClient.getProfile(accessToken.value);
        connectedAddress.value = user.value.primaryWallet.address;
        log(`恢复会话成功: [${user.value.primaryWallet.chain}] ${user.value.primaryWallet.address}`, 'success');
      } catch {
        disconnect();
      }
    }
  }

  // 核心认证连接流程
  async function connectWalletWithChain(wallet: WalletConfig, network: SupportedNetwork) {
    isConnecting.value = true;
    selectedWallet.value = wallet;
    activeNetwork.value = network;
    log(`🚀 准备通过 ${wallet.name} 登录 ${network.name} (${network.family})...`, 'info');

    try {
      if (network.family === 'EVM') {
        const provider = wallet.getProvider?.('EVM');
        if (!provider) throw new Error(`未检测到 ${wallet.name} 的 EVM Provider！`);
        await executeEvmAuth(provider, network);
      } else if (network.family === 'SOLANA') {
        const provider = wallet.getProvider?.('SOLANA');
        if (!provider) throw new Error(`未检测到 ${wallet.name} 的 Solana Provider！`);
        await executeSolanaAuth(provider, network);
      } else if (network.family === 'TRON') {
        const tronWeb = wallet.getProvider?.('TRON');
        if (!tronWeb) throw new Error(`未检测到 ${wallet.name} 的 TRON Provider！`);
        await executeTronAuth(tronWeb, network);
      }
    } catch (err: any) {
      log(`❌ 授权签名失败: ${err.message}`, 'error');
      throw err;
    } finally {
      isConnecting.value = false;
    }
  }

  async function executeEvmAuth(provider: any, net: SupportedNetwork) {
    log('[EVM] 正在请求账户授权 (eth_requestAccounts)...');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const address = accounts[0];
    connectedAddress.value = address;

    if (net.chainIdHex) {
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: net.chainIdHex }]
        });
      } catch (e) {
        // ignore switch error if not supported
      }
    }

    log(`[REQ] 获取 Nonce 挑战: GET /api/auth/nonce?chain=EVM`);
    const challenge = await apiClient.getNonce('EVM', address, net.networkId);

    log('📝 调起 personal_sign 个人签名...', 'warn');
    const signature = await provider.request({
      method: 'personal_sign',
      params: [challenge.message, address]
    });

    log(`✅ 签名成功，向后端提交验签: POST /api/auth/login`, 'info');
    const res = await apiClient.login({
      chain: 'EVM',
      address,
      signature,
      message: challenge.message,
      networkId: net.networkId
    });

    setSession(res);
  }

  async function executeSolanaAuth(provider: any, net: SupportedNetwork) {
    log('[SOLANA] 正在连接账户...');
    const resp = await provider.connect();
    const address = (resp.publicKey || provider.publicKey).toString();
    connectedAddress.value = address;

    log(`[REQ] 获取 Nonce 挑战: GET /api/auth/nonce?chain=SOLANA`);
    const challenge = await apiClient.getNonce('SOLANA', address);

    log('📝 调起 Solana signMessage 签名...', 'warn');
    const encoded = new TextEncoder().encode(challenge.message);
    const signed = await provider.signMessage(encoded, 'utf8');
    const rawSig = signed.signature || signed;
    const signature = '0x' + Array.from(rawSig).map((b: any) => b.toString(16).padStart(2, '0')).join('');

    const res = await apiClient.login({
      chain: 'SOLANA',
      address,
      signature,
      message: challenge.message,
      networkId: 'solana'
    });

    setSession(res);
  }

  async function executeTronAuth(tronWeb: any, net: SupportedNetwork) {
    const address = tronWeb.defaultAddress?.base58;
    if (!address) {
      throw new Error('未检测到波场激活账户，请确认已在钱包中登录并解锁 TRON 地址！');
    }
    connectedAddress.value = address;

    log(`[REQ] 获取 Nonce 挑战: GET /api/auth/nonce?chain=TRON`);
    const challenge = await apiClient.getNonce('TRON', address);

    log('📝 调起波场 trx.sign 签名...', 'warn');
    const signature = await tronWeb.trx.sign(tronWeb.toHex(challenge.message));

    const res = await apiClient.login({
      chain: 'TRON',
      address,
      signature,
      message: challenge.message,
      networkId: 'tron'
    });

    setSession(res);
  }

  // 核心跨链绑定流程（同一主账号绑定多链）
  async function bindWalletWithChain(wallet: WalletConfig, network: SupportedNetwork) {
    if (!accessToken.value || !user.value) {
      throw new Error('请先连接并登录主账号，再进行跨链绑定！');
    }

    isConnecting.value = true;
    log(`🔗 开始跨链绑定：通过 ${wallet.name} 接入 ${network.name} (${network.family})...`, 'info');

    try {
      let targetAddress = '';
      let signature = '';
      let messageToSign = '';

      if (network.family === 'EVM') {
        const provider = wallet.getProvider?.('EVM');
        if (!provider) throw new Error(`未检测到 ${wallet.name} 的 EVM 扩展 Provider！`);
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        targetAddress = accounts[0];

        if (user.value.wallets.some(w => w.chain === 'EVM' && w.address.toLowerCase() === targetAddress.toLowerCase())) {
          throw new Error(`当前 EVM 地址 [${targetAddress}] 已绑定在主账号名下！`);
        }

        const challenge = await apiClient.getNonce('EVM', targetAddress, network.networkId);
        messageToSign = challenge.message;
        log(`📝 调起待绑定 EVM 钱包签名...`, 'warn');
        signature = await provider.request({
          method: 'personal_sign',
          params: [messageToSign, targetAddress]
        });
      } else if (network.family === 'SOLANA') {
        const provider = wallet.getProvider?.('SOLANA');
        if (!provider) throw new Error(`未检测到 ${wallet.name} 的 Solana 扩展 Provider！`);
        const resp = await provider.connect();
        targetAddress = (resp.publicKey || provider.publicKey).toString();

        if (user.value.wallets.some(w => w.chain === 'SOLANA' && w.address === targetAddress)) {
          throw new Error(`当前 Solana 地址 [${targetAddress}] 已绑定在主账号名下！`);
        }

        const challenge = await apiClient.getNonce('SOLANA', targetAddress);
        messageToSign = challenge.message;
        log(`📝 调起待绑定 Solana 钱包签名...`, 'warn');
        const encoded = new TextEncoder().encode(messageToSign);
        const signed = await provider.signMessage(encoded, 'utf8');
        const rawSig = signed.signature || signed;
        signature = '0x' + Array.from(rawSig).map((b: any) => b.toString(16).padStart(2, '0')).join('');
      } else if (network.family === 'TRON') {
        const tronWeb = wallet.getProvider?.('TRON');
        if (!tronWeb) throw new Error(`未检测到 ${wallet.name} 的 TRON Provider！`);
        targetAddress = tronWeb.defaultAddress?.base58;
        if (!targetAddress) {
          throw new Error('未检测到波场激活账户，请在钱包中确认 TRON 地址已解锁！');
        }

        if (user.value.wallets.some(w => w.chain === 'TRON' && w.address === targetAddress)) {
          throw new Error(`当前波场地址 [${targetAddress}] 已绑定在主账号名下！`);
        }

        const challenge = await apiClient.getNonce('TRON', targetAddress);
        messageToSign = challenge.message;
        log(`📝 调起待绑定波场 trx.sign 签名...`, 'warn');
        signature = await tronWeb.trx.sign(tronWeb.toHex(messageToSign));
      }

      log(`📤 提交跨链绑定请求: POST /api/auth/bind-wallet`, 'info');
      const updatedProfile = await apiClient.bindWallet(accessToken.value, {
        chain: network.family,
        address: targetAddress,
        signature,
        message: messageToSign
      });

      user.value = updatedProfile;
      log(`🎉 跨链绑定成功！主账号 [${user.value.id}] 现拥有 ${user.value.wallets.length} 条公链地址`, 'success', updatedProfile);
      return updatedProfile;
    } catch (err: any) {
      log(`❌ 跨链绑定失败: ${err.message}`, 'error');
      throw err;
    } finally {
      isConnecting.value = false;
    }
  }

  // 跨链解绑流程
  async function unbindWallet(chain: ChainFamily, address: string) {
    if (!accessToken.value) throw new Error('未登录');
    log(`⚠️ 准备解绑钱包: [${chain}] ${address}...`, 'warn');
    try {
      const updated = await apiClient.unbindWallet(accessToken.value, { chain, address });
      user.value = updated;
      log(`✅ 解绑成功: [${chain}] ${address}`, 'success');
      return updated;
    } catch (err: any) {
      log(`❌ 解绑失败: ${err.message}`, 'error');
      throw err;
    }
  }

  function setSession(res: { tokens: any; user: UserProfile }) {
    accessToken.value = res.tokens.accessToken;
    refreshToken.value = res.tokens.refreshToken;
    user.value = res.user;
    localStorage.setItem('dapp_access_token', res.tokens.accessToken);
    localStorage.setItem('dapp_refresh_token', res.tokens.refreshToken);
    log(`🎉 登录成功！已签发 JWT 双令牌，主账号识别成功！`, 'success', res.user);
  }

  function getActiveProvider(family?: ChainFamily) {
    const f = family || activeNetwork.value?.family || 'EVM';
    if (selectedWallet.value && selectedWallet.value.getProvider) {
      return selectedWallet.value.getProvider(f);
    }
    const w = window as any;
    if (f === 'TRON') return w.tronWeb || w.tokenpocket?.tronWeb;
    if (f === 'SOLANA') return w.solana || w.tokenpocket?.solana;
    return w.ethereum || w.tokenpocket?.ethereum;
  }

  function disconnect() {
    accessToken.value = null;
    refreshToken.value = null;
    user.value = null;
    connectedAddress.value = '';
    localStorage.removeItem('dapp_access_token');
    localStorage.removeItem('dapp_refresh_token');
    log('已退出登录并清除本地凭证', 'warn');
  }

  return {
    supportedNetworks,
    walletList,
    selectedWallet,
    activeNetwork,
    connectedAddress,
    accessToken,
    user,
    isConnecting,
    logs,
    init,
    log,
    getActiveProvider,
    connectWalletWithChain,
    bindWalletWithChain,
    unbindWallet,
    disconnect
  };
});
