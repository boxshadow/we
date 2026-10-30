import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * 极简现代深色主题 (Linear / Vercel 极简科技风格)
 * 纯净黑曜与深板岩底色，克制理性的高雅蓝调，极细精致边框，彻底剥离刺眼荧光与浮夸光效
 */
export const cleanDarkThemeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#3b82f6',
    primaryColorHover: '#60a5fa',
    primaryColorPressed: '#2563eb',
    primaryColorSuppl: '#3b82f6',
    infoColor: '#38bdf8',
    successColor: '#10b981',
    warningColor: '#f59e0b',
    errorColor: '#ef4444',
    bodyColor: '#090d16',
    cardColor: '#0f172a',
    modalColor: '#0f172a',
    popoverColor: '#0f172a',
    textColorBase: '#f8fafc',
    textColor1: '#f8fafc',
    textColor2: '#94a3b8',
    textColor3: '#64748b',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '10px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    fontFamilyMono: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
  },
  Card: {
    color: '#0f172a',
    colorModal: '#0f172a',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    colorEmbedded: '#0b1120',
    titleFontWeight: '600',
    titleFontSizeMedium: '15px'
  },
  Button: {
    borderRadiusMedium: '8px',
    borderRadiusLarge: '10px',
    borderRadiusSmall: '6px',
    fontWeight: '500'
  },
  Modal: {
    borderRadius: '14px'
  },
  Tag: {
    borderRadius: '6px'
  },
  Tabs: {
    tabFontWeight: '500',
    tabFontWeightActive: '600'
  },
  Input: {
    borderRadius: '8px'
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px'
      }
    }
  }
};
