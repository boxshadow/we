import { EthereumProvider } from '@walletconnect/ethereum-provider';
import { WalletConnectModal } from '@walletconnect/modal';
import QRCode from 'qrcode';

// Expose on window object
declare global {
  interface Window {
    EthereumProvider: typeof EthereumProvider;
    WalletConnectModal: typeof WalletConnectModal;
    QRCode: typeof QRCode;
    WCHelper: any;
  }
}

window.EthereumProvider = EthereumProvider;
window.WalletConnectModal = WalletConnectModal;
window.QRCode = QRCode;

export { EthereumProvider, WalletConnectModal, QRCode };

console.log('[WalletConnect SDK] Bundled official modules loaded successfully');
