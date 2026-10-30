# CyberGate Multi-Chain Web3 DApp (独立工程)

下一代**多链资产网关 DApp 前端独立工程**，基于 **Vue 3 + Vite + Naive UI (赛博暗黑科技主题)** 构建。原生兼容 **TokenPocket (TP 钱包)、MetaMask、OKX Wallet、Phantom、TronLink** 及任意 EIP-6963 规范钱包，支持 **EVM、TRON、Solana** 无缝聚合认证与跨链账户绑定。

---

## 🌟 核心特性与业务交互

### 1. TokenPocket (TP 钱包) 原生置顶感知
- 深度探测 `window.tokenpocket`、`window.ethereum.isTokenPocket`、`window.tronWeb.isTokenPocket`、`window.tronLink.isTokenPocket`、EIP-6963 `vip.tokenpocket` 协议以及手机 App UA。
- 本机只要安装了 TP 钱包，在钱包列表中直接**自动置顶**并打上闪烁脉冲绿标 `🟢 已就绪`。

### 2. 两步自适应选链与免密直调签名 (两步自适应选链)
- **步骤 1 (选择钱包)**：展示客户端检测到的主流扩展与 App 环境；
- **步骤 2 (选择支持公链)**：智能计算**已选钱包生态 (EVM / TRON / Solana) 与后端平台已激活公链网络的交集**；
  - *例如：选择 TokenPocket，支持列表呈现以太坊、BSC、Polygon、TRON、Solana；选择 MetaMask，仅呈现 EVM 兼容链；选择 TronLink 则仅呈现 TRON。*
- **告别扫码，直调原生授权**：点击目标公链直接触发原生免密挑战签名（EVM `personal_sign` / Solana `signMessage` / TRON `trx.sign`），无缝获取 JWT 双令牌并登录。

### 3. 单账号多链绑定架构 (1 Master Account · N Chain Addresses)
- **唯一主账号**：每个用户在系统中全局仅有 1 个统一主账号 (`userId: uuid`)；
- **跨链绑定 (`bind-wallet`)**：在已登录状态下，点击【绑定新链】调起新公链钱包签名，通过 `POST /api/auth/bind-wallet` 将新地址追加至同一个主账号的 `wallets` 列表中；
- **跨链免密反向登录**：绑定完成后，用户未来使用名下任意一条链的地址登录，均自动解析命中同一个主账号，资产与数据完全互通；
- **安全解绑 (`unbind-wallet`)**：支持解绑非主钱包地址（首发主钱包受安全保护禁止解绑）。

### 4. 实时交互控制台与数据库状态同步
- **实时 Telemetry 控制台**：页面底部内置极客风格的日志终端，实时打印链路探测、Nonce 挑战获取、签名上报及 Token 轮转流水；
- **数据库主账号画像同步**：直观展示服务端 `data/users.json` 中的主账号画像，名下聚合的全部公链地址矩阵一目了然。

---

## 📁 目录结构

```text
src/
├── api/
│   └── client.ts         # 统一 API 客户端 (获取公链、Nonce挑战、登录、绑定、解绑、用户库总览)
├── components/
│   └── ConnectModal.vue  # 核心连接弹窗：TP置顶、两步选链、登录/绑定双模式自适应
├── router/
│   └── index.ts          # Vue Router 路由配置
├── stores/
│   └── wallet.ts         # Pinia 状态中心：钱包环境感知、EVM/Solana/Tron 签名、会话维持
├── styles/
│   └── theme.ts          # Naive UI 赛博流光暗黑主题配置 (Cyan #00e5ff + Navy #070a13)
├── types/
│   └── wallet.ts         # 全链路 TypeScript 类型定义
├── views/
│   └── HomeView.vue      # DApp 主界面：Hero横幅、统一主账号卡片、多链矩阵、实时终端
├── App.vue               # 顶栏导航、全局 Naive UI Provider、管理后台快捷通道
└── main.ts               # 项目入口文件
```

---

## 🚀 启动与构建

```bash
# 安装依赖
pnpm install

# 启动本地开发服务器 (默认端口 5173)
pnpm dev

# 编译打包 (vue-tsc 类型检查 + vite build)
pnpm build

# 预览打包产物
pnpm preview
```

### 🌐 代理配置 (`vite.config.ts`)
开发模式下，Vite 已配置透明代理转发：
- `/api/*` -> 透明代理至服务端 `http://localhost:3000/api/*`
- `/admin/*` -> 透明代理至管理后台 `http://localhost:3000/admin/*`
- `/admin-dist/*` -> 静态托管代理
