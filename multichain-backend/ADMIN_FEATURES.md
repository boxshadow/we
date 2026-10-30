# Web3 多链管理后台与运营监控中心功能交付清单 (ADMIN_FEATURES.md)

> 本文档详细记录了本次为多链管理后台构建的充值配置、提现配置、多维流水筛选、运营可视化大屏、全网用户全维画像等全部核心功能与系统设计规范。

---

## 目录
1. [系统总体架构与生态分类模型](#1-系统总体架构与生态分类模型)
2. [多链充值收款钱包配置 (Deposit Wallets)](#2-多链充值收款钱包配置-deposit-wallets)
3. [多链提现出金热钱包配置 (Withdrawal Hot Vaults)](#3-多链提现出金热钱包配置-withdrawal-hot-vaults)
4. [金流审计与多维复合筛选体系](#4-金流审计与多维复合筛选体系)
5. [运营可视化面板 (Operations Analytics Dashboard)](#5-运营可视化面板-operations-analytics-dashboard)
6. [全网用户列表与多链资产全维画像抽屉](#6-全网用户列表与多链资产全维画像抽屉)
7. [后端 API 接口清单与协议规范](#7-后端-api-接口清单与协议规范)
8. [前端页面路由与操作指引](#8-前端页面路由与操作指引)
9. [管理后台独立鉴权与双因素认证 (Admin Auth & Google 2FA)](#9-管理后台独立鉴权与双因素认证-admin-auth--google-2fa)

---

## 1. 系统总体架构与生态分类模型

为满足多链资产管理与安全性要求，系统对公链生态进行了科学的 **3 分类统一架构**：

```
                              ┌──────────────────────────────────────────────┐
                              │             多链中台统一资产体系              │
                              └──────────────────────┬───────────────────────┘
                                                     │
             ┌───────────────────────────────────────┼────────────────────────────────────────┐
             ▼                                       ▼                                        ▼
   ┌───────────────────┐                   ┌───────────────────┐                    ┌───────────────────┐
   │    EVM 生态组     │                   │    TRON 生态组    │                    │   SOLANA 生态组   │
   │ (多链共享地址池)  │                   │   (波场独立金库)  │                    │   (SPL 独立地址)  │
   ├───────────────────┤                   ├───────────────────┤                    ├───────────────────┤
   │ • Ethereum        │                   │ • TRC20 USDT      │                    │ • SPL Token       │
   │ • BSC (BNB Chain) │                   │ • TRX 原生币      │                    │ • SOL 原生代币    │
   │ • Polygon / Matic │                   │ • Base58 专属地址 │                    │ • Base58 专属地址 │
   │ • Arbitrum / Base │                   │   (以 T 开头 34位)│                    │   (32-44位)       │
   │ • 同一私钥跨链通用│                   │ • 独立链上出入金  │                    │ • 高并发微秒级确认│
   └───────────────────┘                   └───────────────────┘                    └───────────────────┘
```

### 核心设计原则：
1. **EVM 体系同一组地址通用**：由于以太坊、BSC、Polygon、Arbitrum 等 EVM 公链的密码学曲线（secp256k1）与公私钥算法完全一致，系统配置的 EVM 收款/出款地址自动跨所有 EVM 链通用，无需在各 EVM 链重复配置，大幅降低运维成本。
2. **TRON 与 SOLANA 彻底隔离独立池**：
   - TRON 采用 Base58 编码格式（`T` 开头 34 字符），独立维护波场金库地址池；
   - Solana 采用 Ed25519 曲线与 Base58 编码（32~44 字符），独立维护 SPL Token 金库地址池。
3. **数据库唯一性约束与架构优化**：
   - 数据库模型 `ConfiguredDepositWallet` 与 `ConfiguredWithdrawWallet` 均以 `chain (EVM/SOLANA/TRON)` + `address` 为联合唯一索引（`@@unique([chain, address])`），天然支持 EVM 地址复用与异构链地址强校验。

---

## 2. 多链充值收款钱包配置 (Deposit Wallets)

### 2.1 业务能力
- **三组生态标签切换**：
  - 🔷 **EVM 生态组 (Ethereum · BSC · Polygon 通用)**：展示用于以太坊、BSC 等公链收款的通用地址；
  - 🔴 **TRON 生态组 (波场 TRC20 独立池)**：展示接收 TRC20-USDT 等资产的专属地址；
  - 🟢 **SOLANA 生态组 (SPL Token 独立池)**：展示接收 SOL 及 SPL 代币的专属地址；
  - 📑 **全量充值钱包矩阵**：跨生态全局视图。
- **动态负载与随机分配**：
  - 用户在 DApp 发起充值时，后端 `DepositWalletService.getRandomActiveDepositWallet(family)` 根据用户所选链所属的生态（`EVM` / `TRON` / `SOLANA`），从已激活的地址池中动态负载选取收款地址，防止单个地址资金过度集中。
- **严格的前端与服务端公钥校验**：
  - EVM：校验 `^0x[a-fA-F0-9]{40}$`；
  - TRON：校验 `^T[a-km-zA-HJ-NP-Z1-9]{33}$`；
  - SOLANA：校验 `^[1-9A-HJ-NP-Za-km-z]{32,44}$`。
- **可视化指标卡片**：
  - EVM 通用充值钱包数、TRON 充值收款钱包数、SOLANA 充值收款钱包数、在线激活通道数。

---

## 3. 多链提现出金热钱包配置 (Withdrawal Hot Vaults)

### 3.1 业务能力
- **出资热钱包分组管理**：
  - 🔷 **EVM 出资组**：负责在 Ethereum、BSC、Polygon 等 EVM 链上向用户提现地址发起原子打款；
  - 🔴 **TRON 出资组**：负责波场链上快速广播放款；
  - 🟢 **SOLANA 出资组**：负责 Solana SPL 高速批量出金。
- **安全与风控保护机制**：
  - **单日出金额度控制 (`dailyLimit`)**：为每个出资热钱包设置最大单日打款上限（例如 $100,000.00）；
  - **当日累计出金追踪 (`spentToday`)**：实时累加当日放款金额，超额自动熔断拦截；
  - **储备水位监控 (`balance`)**：实时跟踪出金热钱包的可用流动性余额；
  - **一键通道启停 (`isActive`)**：管理员可随时下线或上线指定热钱包放款节点。
- **自动放款联动**：
  - 用户提交提现申请通过初审后，`WithdrawService` 自动从匹配公链生态的激活出资金库中调度出资地址并发起链上打款。

---

## 4. 金流审计与多维复合筛选体系

针对系统资金流转构建了统一、高精度的账本与筛选引擎：

### 4.1 多维复合筛选工具栏
所有账本视图均支持以下复合筛选条件，并支持毫秒级重置：
1. **公链生态筛选**：全部生态、EVM 兼容组、TRON 波场组、Solana 组；
2. **代币种类筛选**：全部代币、USDT、USDC、ETH、BNB、TRX、SOL 等；
3. **状态多态筛选**：
   - 资金流水状态：`PENDING` (待对账/待确认)、`CONFIRMED` (已确认完成)、`REJECTED` (异常/驳回)；
   - 充值入账状态：已入账加余额 (`isCredited: true`)、待区块确认入账 (`isCredited: false`)；
   - 提现出金状态：`COMPLETED` (已放款)、`PENDING` (放款中)、`FAILED` (打款失败风控拦截)。
4. **关键字模糊检索**：支持输入链上 **TxHash**、**用户充/提钱包地址**、**用户主账号 UUID**、**订单号**。
5. **时间范围过滤**：支持自定义开始日期与结束日期过滤。

### 4.2 三大专用明细账本
- 🌐 **全局资金流水总账本 (Unified Transactions Ledger)**：
  - 汇聚全平台多链充值入账、提现出款与冷热金库归集统一流水；
  - 字段包含：流水类型、公链生态、代币/金额、出资原地址 (From)、收款目标地址 (To)、链上 TxHash、确认状态、产生时间。
- 📥 **充值入金订单记录 (Deposit Orders)**：
  - 记录用户前端调起钱包加签或移动端扫码专属金库充值明细；
  - 字段包含：订单编号、用户主账号、公链生态、代币/金额、专属收款地址 (Wallet A)、用户打款来源、TxHash、区块确认进度 (如 0/3、12/12)、入账状态、创建/确认时间。
- 📤 **提现出金放款记录 (Withdrawal Orders)**：
  - 记录服务端使用专属提现热钱包向用户出资打款记录；
  - 字段包含：提现订单号、用户主账号、公链生态、提现金额、出款金库 (From Vault)、用户接收地址 (To Address)、TxHash、放款状态、异常报错追踪、申请/放款时间。

---

## 5. 运营可视化面板 (Operations Analytics Dashboard)

在资金流水与订单明细顶部，集成了全平台运营级可视化数据大屏：

### 5.1 六大核心运营 KPI 指标卡
1. 🟢 **今日充值入金**：今日成功入金总额（美元计价）与今日充值总笔数；
2. 🟡 **今日提现出金**：今日实际放款出金总额与提现总笔数；
3. 🔵 **24h 净资金流动**：充值入金减去提现出金的平台净沉淀额（正流入显示蓝色/正收益）；
4. 🟣 **待确认充值**：链上等待区块确认与验签对账中的充值订单数；
5. 🔴 **待处理提现**：排队等待热钱包出资签名的提现订单数；
6. 🩵 **出资金库健康度**：热钱包流动性充盈百分比与运行状态评级。

### 5.2 资金生态与金库水位图表
- **多链公链充提资金生态分布条**：直观展示 EVM 共享池 vs TRON 独立池 vs Solana 独立池的资金流水占比分布；
- **出金热钱包储备水位动态监控**：实时列出各大生态出资金库的实时余额（USDT/Token）并以标签标明「充足 / 预警」；
- **资金流向 7 天趋势追踪**：直观展示近 7 日充值入金与提现出金的对比走势。

---

## 6. 全网用户列表与多链资产全维画像抽屉

### 6.1 用户总览列表
- **主账号聚合架构**：每个用户拥有唯一的 Web3 Master Account UUID，支持一人跨链绑定多公链钱包。
- **列表展示字段**：
  - 用户主账号 ID (UUID，支持一键复制)
  - 用户昵称 / 角色身份 (`USER` / `ADMIN`)
  - 账号风控状态 (`ACTIVE` / `BANNED`)
  - 绑定的多链公钥数 (如「3 条公链: EVM, SOLANA, TRON」)
  - 用户托管总资产估值 (美元计价)
  - 注册时间
  - 操作：**🔍 查看全维画像**
- **顶部用户资产统计指标**：
  - 注册主账号总数
  - 多链跨链绑定用户数 (绑定 ≥2 种公链生态的用户数)
  - 用户托管资产总估值
  - 活跃账户健康状态率

### 6.2 用户全维画像与资产详情抽屉 (User Profile Drawer)
点击任意用户的「查看全维画像」按钮，右侧滑出全功能画像抽屉：
1. **用户身份头衔卡片**：
   - 用户头像、昵称、角色标签、账号状态标签；
   - 用户唯一主账号 UUID (带复制按钮)；
   - 注册时间与最后活跃时间。
2. **核心资金 KPI**：
   - 估算总资产 ($)
   - 累计充值到账 ($)
   - 累计提现出金 ($)
   - 充提订单总数 (笔)
3. **四大全维详情 Tab 模块**：
   - 🔗 **绑定公钥矩阵 (Bound Public Keys)**：
     - 展示该用户绑定的所有公链地址卡片（区分 EVM 首发主钱包、TRON 绑定副钱包、SOLANA 绑定副钱包）；
     - 显示地址完整哈希、绑定时间与一键复制功能。
   - 💰 **多链资产余额 (Multi-chain Token Balances)**：
     - 展示用户在全公链各个代币的独立存管余额账本；
     - 表格列出：公链网络 (Ethereum, Tron, Solana 等)、代币符号 (USDT, ETH, TRX, SOL 等)、代币合约地址、存管可用余额 (采用高精度 BigNumber 避免浮点误差)、最后变动时间。
   - 📥 **充值历史 (Deposit History)**：
     - 用户个人的专属充值订单全记录；
     - 包含订单号、充值网络、代币与金额、收款金库地址、入账状态。
   - 📤 **提现历史 (Withdrawal History)**：
     - 用户个人的专属提现出金申请全记录；
     - 包含提现订单号、公链网络、提现金额、目标地址、放款状态。

---

## 7. 后端 API 接口清单与协议规范

| 模块 | 请求方式 | 路由路径 | 说明与核心参数 |
| :--- | :---: | :--- | :--- |
| **充值钱包** | `GET` | `/api/admin/deposit-wallets` | 获取充值收款钱包列表，支持 `?chain=EVM\|SOLANA\|TRON` 过滤 |
| **充值钱包** | `POST` | `/api/admin/deposit-wallets` | 添加收款钱包，参数：`{ chain, address, label }` (严格地址正则校验) |
| **充值钱包** | `DELETE` | `/api/admin/deposit-wallets/:id` | 删除指定的充值收款钱包 |
| **提现钱包** | `GET` | `/api/admin/withdraw-wallets` | 获取提现出资金库列表，支持 `?chain=EVM\|SOLANA\|TRON` 过滤 |
| **提现钱包** | `POST` | `/api/admin/withdraw-wallets` | 添加提现出资钱包，参数：`{ chain, address, label, balance, dailyLimit }` |
| **提现钱包** | `PATCH` | `/api/admin/withdraw-wallets/:id/status` | 快速启停出资金库通道，参数：`{ isActive: boolean }` |
| **提现钱包** | `DELETE` | `/api/admin/withdraw-wallets/:id` | 删除指定的提现出资热钱包 |
| **金流审计** | `GET` | `/api/admin/ledger/transactions` | 全平台资金流水，支持 `type, chain, network, token, status, search, startDate, endDate` |
| **充值订单** | `GET` | `/api/admin/ledger/deposits` | 充值订单明细，支持 `isCredited, chain, network, search, startDate, endDate` |
| **提现订单** | `GET` | `/api/admin/ledger/withdrawals` | 提现放款明细，支持 `status, chain, network, search, startDate, endDate` |
| **运营大屏** | `GET` | `/api/admin/ledger/analytics` | 获取 KPI 统计指标、各生态资金分布比例、热钱包储备水位、7日趋势 |
| **用户画像** | `GET` | `/api/admin/users` | 全网用户列表检索，支持 `search, role, status, page, pageSize` |
| **用户画像** | `GET` | `/api/admin/users/:userId/detail` | 获取单个用户的多链公钥矩阵、各链Token余额账本与充提历史 |

---

## 8. 前端页面路由与操作指引

前端管理后台基于 **Vue 3 + Vite + Naive UI** 构建，支持 SPA HTML5 History 模式导航：

1. **管理后台访问入口**：`http://localhost:3000/admin` (自动 302 重定向至 `/admin-dist/`)
2. **多链充值收款钱包配置**：
   - 路由：`http://localhost:3000/admin-dist/deposit-wallets`
   - 功能：切换 EVM、TRON、SOLANA 选项卡，管理只收不发的收款池。
3. **多链提现出金热钱包配置**：
   - 路由：`http://localhost:3000/admin-dist/withdraw-wallets`
   - 功能：监控三大出资热钱包的水位、单日打款限额与实时在线状态。
4. **金流审计与运营看板**：
   - 路由：`http://localhost:3000/admin-dist/audit`
   - 功能：查看 6 大运营 KPI、生态分布条、热钱包监控，并在三个选项卡中按生态/代币/状态/关键字检索流水、充值与提现。
5. **全网用户与资产画像**：
   - 路由：`http://localhost:3000/admin-dist/users`
   - 功能：检索多链主账号，点击「查看全维画像」抽屉深度审查用户的多公钥绑定矩阵与各链 Token 资产明细。

---

## 9. 管理后台独立鉴权与双因素认证 (Admin Auth & Google 2FA)

为保障中台资金管理与节点风控安全，管理后台彻底与客户端 Web3 钱包签名解耦，采用企业级 **账号 + PBKDF2 强密码哈希 + RFC 6238 TOTP Google Authenticator 动态二次验证**：

### 9.1 安全与架构设计
- **完全解耦 Web3 钱包**：客户端用户继续使用多链钱包（MetaMask、Phantom、TronLink 等）签名登录；中台管理员严格使用独立管理凭证体系。
- **PBKDF2 密码加盐哈希**：采用 Node.js 原生 Crypto `pbkdf2Sync`，100,000 次 SHA-512 迭代与 16 字节随机 Salt，采用时序恒定对比 `timingSafeEqual` 防御时序侧信道攻击。
- **零外部依赖 RFC 6238 TOTP 实现**：支持标准 Base32 解码、HMAC-SHA1 动态截断算法，允许前后 30 秒容差窗口，完美兼容 Google Authenticator、Microsoft Authenticator、1Password 等标准应用。
- **独立 Admin JWT 令牌机制**：签发声明包含 `type: 'ADMIN'` 与 RBAC 角色声明（`SUPER_ADMIN`, `ADMIN`, `OPERATOR`, `AUDITOR`），有效时长 8 小时。所有 `/api/admin/*` 路由均挂载 `AdminJwtAuthGuard`，客户端普通用户的 JWT 无法越权访问后台。
- **前端暗色极客交互体验**：提供独立 `/login` 路由页面，支持实时 2FA 动态码校验与二维码扫码绑定绑定弹窗；全局路由守卫在未授权时无缝拦截并重定向。

### 9.2 管理后台认证 API
| 功能模块 | 请求方法 | 路由路径 | 描述说明 |
| :--- | :--- | :--- | :--- |
| **管理员登录** | `POST` | `/api/admin/auth/login` | 账号 + 密码登录；未绑定 2FA 时自动返回二维码及 setupToken 触发首次绑定 |
| **首次绑定激活** | `POST` | `/api/admin/auth/2fa/confirm-setup` | 提交 setupToken 与 6 位动态验证码，确认绑定成功后自动签发 Admin JWT |
| **当前资料** | `GET` | `/api/admin/auth/me` | 获取当前已登录管理员 Profile，包含角色、2FA 绑定状态、最后登录时间 |
| **2FA 配置** | `GET` | `/api/admin/auth/2fa/setup` | 获取当前管理员的 2FA Secret、otpauth 协议链接及高清 DataURL 登录二维码 |
| **重置为未绑定** | `POST` | `/api/admin/auth/2fa/reset-demo` | 将管理员重置为未绑定 2FA 状态 (开发演示与测试首次登录流程用) |
| **实时验证码** | `GET` | `/api/admin/auth/2fa/live-code` | 获取指定密钥的实时 6 位 TOTP 动态码 (开发测试调试用) |
| **退出登录** | `POST` | `/api/admin/auth/logout` | 清理服务端管理员会话痕迹 |
| **演示凭据** | `GET` | `/api/admin/auth/demo-credentials` | 获取内置超级管理员测试账号、密码及实时生成的当前动态 2FA 码（开发调试用） |

### 9.3 首次登录绑定验证器闭环机制 (First-time 2FA Onboarding)
1. **密码核验与状态识别**：管理员或创始人输入账号密码后，后端自动识别该账号是否已完成 2FA 绑定 (`isTwoFactorEnabled === false`)；
2. **安全凭据生成与隔离**：服务端实时生成 160-bit 强随机 Base32 密钥，签发 15 分钟有效期的专属 `ADMIN_SETUP_2FA` 临时会话凭据 (`setupToken`)，并渲染暗色高对比二维码 DataURL；在此阶段绝对不签发正式管理员 JWT；
3. **前端引导与扫码导入**：前端自动弹出「安全初始化：绑定 Google 身份验证器」弹窗，展示二维码及 Base32 明文密钥，用户使用手机 Google Authenticator / 1Password 扫描添加；
4. **回传校验与双向确认**：用户输入手机 App 生成的 6 位动态验证码，后端基于 RFC 6238 算法核验通过后，正式持久化密钥并置 `isTwoFactorEnabled = true`，自动签发 8 小时 Admin JWT 登入系统；
5. **后续登录**：后续每次登录均必须同时输入账号、密码及手机实时 6 位动态验证码。

### 9.4 纯净极简登录交互规范 (Distilled UI)
遵循 `/impeccable` 设计准则，登录界面彻底移除所有测试面板、示例凭证框及说明文字，仅保留品牌 Logo、标题、账号、口令、动态验证码（首次登录留空）与登录按钮。整体采用深色金融板岩主题（`#0b0f17` 底色，`#111827` 精致卡片与 1px 微边框），保证生产环境的纯粹、高级与沉浸体验。

### 9.5 初始账号体系与凭证
- **初始创始人账号 (Founder)**：
  - **登录账号**：`founder`
  - **初始密码**：`FounderPassword2026!`
  - **角色权限**：`FOUNDER` (最高系统所有权)
  - **2FA 初始状态**：`强制未绑定 (必须首次扫码绑定后方可登录)`
- **内置运维超管 (Super Admin)**：
  - **登录账号**：`admin`
  - **默认密码**：`AdminPassword2026!`
  - **角色权限**：`SUPER_ADMIN`
  - **2FA 密钥**：`JBSWY3DPEHPK3PXP`
