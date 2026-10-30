import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * 机构级金融中台主题配置 (Institutional FinTech Dark Theme)
 * 对标 Coinbase Prime / Stripe / Linear：板岩深蓝底色 (#0B0F17) + 沉稳钴蓝主色 (#3B82F6) + 克制中性层次
 */
export const cyberThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    primaryColorPressed: '#2563eb',
    primaryColorSuppl: '#3b82f6',
    infoColor: '#38bdf8',
    successColor: '#10b981',
    warningColor: '#f59e0b',
    errorColor: '#ef4444',
    bodyColor: '#0b0f17',
    cardColor: '#111827',
    modalColor: '#111827',
    popoverColor: '#111827',
    textColorBase: '#f8fafc',
    textColor1: '#f8fafc',
    textColor2: '#cbd5e1',
    textColor3: '#64748b',
    borderColor: '#1e293b',
    borderRadius: '8px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontFamilyMono: "'JetBrains Mono', monospace",
  },
  Card: {
    borderColor: '#1e293b',
    borderRadius: '10px',
    colorEmbedded: '#0e1420',
    titleFontWeight: '600',
  },
  Button: {
    borderRadiusMedium: '6px',
    borderRadiusLarge: '8px',
    fontWeight: '500',
  },
  DataTable: {
    borderRadius: '8px',
    borderColor: '#1e293b',
    thColor: '#161f30',
    tdColor: '#111827',
    tdColorHover: '#172236',
  },
  Modal: {
    borderRadius: '12px',
  },
  Tag: {
    borderRadius: '4px',
  },
};
