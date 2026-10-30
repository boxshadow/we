---
name: CyberGate
description: High-craft Web3 multi-chain identity and asset gateway interface
colors:
  primary: "#3b82f6"
  primary-hover: "#60a5fa"
  primary-pressed: "#2563eb"
  neutral-bg: "#090d16"
  surface-card: "#0f172a"
  surface-elevated: "#111827"
  surface-secondary: "#1e293b"
  border: "rgba(255, 255, 255, 0.08)"
  text-primary: "#f8fafc"
  text-heading: "#f1f5f9"
  text-light: "#cbd5e1"
  text-secondary: "#94a3b8"
  text-muted: "#64748b"
  success: "#10b981"
  warning: "#f59e0b"
  danger: "#ef4444"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.5px"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  title-sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  subheading:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
  sm:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  xs:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  xs: "4px"
  sm: "6px"
  base: "8px"
  md: "10px"
  lg: "12px"
  card: "14px"
  xl: "16px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "14px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.md}"
---

# Design System

## Overview
CyberGate 采用了源自 Linear 与 Vercel 的极简现代深色金融科技设计语言。彻底剥离传统 Web3 常见的霓虹荧光、刺眼光晕、拟态渐变与粗糙 Emoji 标签，代之以深邃克制的黑曜底色、极细 1px 微妙边框、理性的宝石蓝核心操作点缀，以及高信息密度的等宽数据排版。

## Colors
- **Canvas / Background**: `#090d16` 纯净深邃黑曜底色。
- **Card / Surface**: `#0f172a` 深板岩微层级卡片，hover 时提升至 `#111827`。
- **Primary Accent**: `#3b82f6` (Blue-500) 优雅电光蓝，hover `#60a5fa`，pressed `#2563eb`。
- **Text Hierarchy**:
  - High Emphasis (`#f8fafc`): 标题、核心资产数值、重要操作文本。
  - Medium Emphasis (`#94a3b8`): 标签名称、引导说明、次级信息。
  - Low Emphasis (`#64748b`): 时间戳、占位符、边框修饰、协议版权声明。
- **Semantic Feedback**:
  - Success: `#10b981` (Emerald) 链上验证就绪、入账成功。
  - Warning: `#f59e0b` (Amber) 节点熔断维护、区块打包确认中。
  - Danger: `#ef4444` (Red) 失败异常、解绑危险操作。

## Typography
- **UI / Display Font**: `-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif`，注重平滑反锯齿渲染与清爽字间距。
- **Data / Crypto Monospace Font**: `'JetBrains Mono', 'Fira Code', ui-monospace, monospace`，严格限制于钱包公钥地址、txHash、区块高度与数值度量，禁止将等宽字体作为装饰性大标题。

## Layout
- **Page Container**: 最大宽度 `1140px`，居中对齐，留白呼吸感充足。
- **Information Architecture**:
  1. Header：品牌标志、中台跳转、连接钱包状态。
  2. Account & Balances：主账号 ID、已绑定公链数、快捷充提入口。
  3. Linked Wallets：多链绑定矩阵与解绑管理。
  4. Networks Status：节点健康态网格。
  5. Collapsible Dev Drawer：开发者底层 `users.json` 快照与实时日志终端，默认折叠收纳。

## Elevation & Depth
- 严格禁止零模糊的霓虹光晕（No zero-offset glowing halos）。
- 采用微阴影系统：`box-shadow: 0 1px 3px rgba(0,0,0,0.3)` 与 `0 20px 40px -15px rgba(0, 0, 0, 0.5)`（仅用于弹窗）。
- 靠纯色阶差（`#090d16` 到 `#0f172a`）和 1px 微边框（`rgba(255, 255, 255, 0.08)`）建立空间层级。

## Shapes
- **Corner Radius**:
  - 小组件/标签/输入框：`6px - 8px`
  - 主卡片：`12px`
  - 模态弹窗：`14px`
- 摒弃大圆角和胶囊形过度装饰，保持金融级现代规整感。

## Components
- **Primary Buttons**: 纯色无渐变蓝色按钮，高度 40px，字重 600。
- **Asset Cards**: 左侧公链标签与币种、中间 24px 大数余额、右侧快捷微操作按钮。
- **Block Progress**: 细线 `NProgress` 配合无干扰的步骤点，实时显示 `X/3` 块确认。

## Do's and Don'ts
- **DO**: 使用清晰的动宾短语（“连接钱包”、“充值入金”、“复制地址”）。
- **DO**: 将等宽字体用于所有密码学散列值与资产数值。
- **DON'T**: 严禁在按钮、标签或卡片标题中使用 Emoji 符号（如 🚀, 🪙, 💸, 🛡️, ⚡）。
- **DON'T**: 严禁使用多色高饱和度渐变文字（`.gradient-text`）或刺眼的脉冲光圈。
- **DON'T**: 严禁将开发调试终端或原始 JSON 文件默认展示在核心主页面上。
