/**
 * Web3 地址与哈希脱敏展示与格式化工具函数
 */

export function maskAddress(addr?: string, prefixLen = 6, suffixLen = 4): string {
  if (!addr) return '-';
  const clean = addr.trim();
  if (clean.length <= prefixLen + suffixLen + 2) return clean;
  return `${clean.slice(0, prefixLen)}...${clean.slice(-suffixLen)}`;
}

export function maskTxHash(hash?: string, prefixLen = 8, suffixLen = 6): string {
  if (!hash) return '-';
  const clean = hash.trim();
  if (clean.length <= prefixLen + suffixLen + 2) return clean;
  return `${clean.slice(0, prefixLen)}...${clean.slice(-suffixLen)}`;
}

export function copyText(text: string, successCallback?: () => void) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      successCallback?.();
    });
  } else {
    const input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    successCallback?.();
  }
}

export function getExplorerAddressUrl(chain?: string, address?: string): string {
  if (!address) return '#';
  const c = (chain || 'ethereum').toLowerCase();
  if (c.includes('tron')) {
    return `https://tronscan.org/#/address/${address}`;
  }
  if (c.includes('sol')) {
    return `https://solscan.io/account/${address}`;
  }
  if (c.includes('bsc') || c.includes('binance')) {
    return `https://bscscan.com/address/${address}`;
  }
  if (c.includes('poly')) {
    return `https://polygonscan.com/address/${address}`;
  }
  if (c.includes('base')) {
    return `https://basescan.org/address/${address}`;
  }
  if (c.includes('arb')) {
    return `https://arbiscan.io/address/${address}`;
  }
  return `https://etherscan.io/address/${address}`;
}

export function getExplorerTxUrl(chain?: string, txHash?: string): string {
  if (!txHash) return '#';
  const c = (chain || 'ethereum').toLowerCase();
  if (c.includes('tron')) {
    return `https://tronscan.org/#/transaction/${txHash}`;
  }
  if (c.includes('sol')) {
    return `https://solscan.io/tx/${txHash}`;
  }
  if (c.includes('bsc') || c.includes('binance')) {
    return `https://bscscan.com/tx/${txHash}`;
  }
  if (c.includes('poly')) {
    return `https://polygonscan.com/tx/${txHash}`;
  }
  if (c.includes('base')) {
    return `https://basescan.org/tx/${txHash}`;
  }
  if (c.includes('arb')) {
    return `https://arbiscan.io/tx/${txHash}`;
  }
  return `https://etherscan.io/tx/${txHash}`;
}
