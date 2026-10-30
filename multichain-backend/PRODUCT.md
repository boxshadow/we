# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **多链 Web3 散户与 DeFi 交互用户**：
   - 使用 TokenPocket、MetaMask、OKX Wallet、Phantom、TronLink 等桌面插件或移动端内置 DApp 浏览器。
   - 目标场景：需要跨 EVM（Ethereum/BSC/Base/Arbitrum）、TRON、Solana 多链生态进行免密授权登录、多链钱包地址归集绑定至同一主账号、便捷加签充值 Token，以及安全提现出金。
2. **Web3 系统运维与财务风控管理员 (Admin Operators)**：
   - 使用 Cyber Admin 管理中台，负责各公链网络节点配置、健康探测诊断、全局单链熔断维护、只收不发收款池管理、冷热金库自动化归集，以及提现与充值多链流水审计对账。

## Product Purpose

打造企业级高可靠、免助记词泄漏风险的下一代**多链资产网关 (CyberGate)**。通过将“多链多地址”聚合映射为“单唯一主账号”，消除公链生态割裂，提供无感加签充值、区块确认实时进度感知、服务端热钱包受控放款与自动补偿回滚，保障用户资产流转的绝对可靠性与追溯性。

## Positioning

**1 主账号 · 多链地址聚合绑定 + 充提物理隔离架构**：
- **无缝跨链身份聚合**：一次登录即可自由绑定 EVM、TRON、Solana 任意钱包；任意绑定钱包均可反向免密登录同一主账号，资产全网统一。
- **动态 rawTx 加签充值**：服务端智能构造调用 Calldata，前端调起原生钱包直接支付，免除外部复制地址转账繁琐与转错风险，且支持实时区块打包确认追踪与无 txHash 链上智能对账。
- **物理用途严格隔离**：`DEPOSIT` 充值收款池（只收不发）、`WITHDRAW` 出资热钱包（只出不进）、`TOKEN_DEPLOY` 发币钱包完全隔离，从根源杜绝充值池被渗透掏空风险。

## Operating Context

- **客户端交互环境**：现代浏览器、EIP-6963 规范钱包插件、移动端 Web3 App Webview（如 TokenPocket App、MetaMask Mobile）。
- **服务端运行环境**：Node.js / NestJS 模块化服务、Prisma SQLite / PostgreSQL 双模持久化、动态双通道 RPC 节点（HTTP 广播 + WebSocket 实时监听）、远程 KMS / 本地安全签名抽象。
- **网络状态流转**：包含主网与主流测试网（Ethereum Sepolia, Tron Nile, Solana Devnet 等），支持实时动态测速与熔断维护状态。

## Capabilities and Constraints

- **支持公链与 Token 体系**：
  - EVM 生态：Ethereum、BSC、Base、Arbitrum、Optimism 等；支持原生币（ETH、BNB）及 ERC-20 代币（USDT、USDC 等）。
  - TRON 生态：TRX 原生币及 TRC-20 代币（USDT）。
  - Solana 生态：SOL 原生币及 SPL Token。
- **业务能力矩阵**：
  - EIP-4361 SIWE / SIWS / TronWeb 免密挑战签名登录与 JWT 双令牌轮转。
  - 多链钱包绑定 (`bind-wallet`) 与解绑 (`unbind-wallet`)，首发主钱包防解绑安全锁定。
  - 充值意图生成、动态 `rawTx` 构建、前端钱包加签支付、实时区块进度轮询（EVM 3 块、TRON 2 块、Solana 1 块）、到账余额原子累加。
  - 提现出金前置风控、可用余额原子扣减 (`debitBalance`)、服务端热钱包签名转账广播、链上失败自动原路退还补偿回滚机制。
  - 资金自动巡检与阈值归集（Cron 自动划转至金库）。
- **技术与安全约束**：
  - 严禁在前端或公网暴露服务端热钱包私钥。
  - 充值收款池钱包严禁分配出金权限。
  - 提现必须满足幂等原子扣款与异常补偿回滚，严防负数与超额提现。

## Brand Commitments

- **产品命名**：CyberGate Multi-Chain Web3 Gateway（赛博多链网关）/ Cyber Admin 多链管理中台。
- **视觉风格基调**：深邃赛博朋克暗黑科技质感（Cyber Dark #070a13 / #090e1a / #0b0f19，荧光青 #00e5ff，矩阵紫 #8b5cf6，状态绿 #10b981，预警橙 #f59e0b）。
- **排版字体规范**：数据看板与数字指标采用 `Orbitron` / `JetBrains Mono` / `Fira Code` 等宽字体；界面文字采用 `Inter` / `system-ui`。

## Evidence on Hand

- **已落地代码与工程资产**：
  - DApp 前端：`multichain-dapp/`（Vue 3 + Vite + Naive UI），具备 TokenPocket 原生感知、两步选链、主账号卡片、加签充值与进度条、提现模态窗。
  - 服务端与管理后台：`multichain-backend/`（NestJS + Prisma），内置 Cyber Admin 控制台（`admin/`）。
  - 自动化测试用例：`test/`（13 套测试套件，64 个用例 100% 通过）。
  - 离线/在线数据库：`data/users.json` 与 SQLite `prisma/dev.db`。

## Product Principles

1. **安全与隔离第一 (Security by Isolation)**：入金钱包只收不发、出金金库物理隔离、无私钥泄露单点。
2. **极简极速免密交互 (Zero-Friction Web3 UX)**：消除助记词与繁琐输入，原生唤起钱包加签，秒级完成验证与绑定。
3. **确定性与透明可溯 (Deterministic & Verifiable Traceability)**：每一笔充值与提现均具备链上 Hash、精准区块确认数与不可篡改审计流水。
4. **异常容错与资金兜底 (Fault Tolerance & Compensation)**：链上网络抖动或转账异常必须实现 0 秒原路补偿回滚，杜绝死账。
