# Multi-Chain Web3 Backend Service (EVM / Solana / Tron)

一套面向生产级 Web3 业务的**多链模块化服务端框架**，支持 **EVM（Ethereum/BSC/Base/Arbitrum/Polygon等多链）、Solana、Tron（波场）** 三大主流生态。

采用 **策略/适配器模式（Strategy & Adapter Pattern）**、**充提隔离安全架构** 与 **双通道节点架构（HTTP + WebSocket）**，业务层无需关心底层公链差异，支持在管理后台动态增删查改新链节点。

> 📖 **完整接口技术文档**：详见 [API 完整技术规格与字段详解文档](file:///Users/dafudagui02/.gemini/antigravity/scratch/multichain-backend/docs/API_DOCUMENTATION.md)  
> 🛡️ **多链账号绑定与数据库迁移指南**：详见 [多链统一身份与数据库迁移全流程追溯指南](file:///Users/dafudagui02/.gemini/antigravity/scratch/multichain-backend/docs/MULTICHAIN_ACCOUNT_AND_DATABASE_GUIDE.md)  
> 🌐 **在线交互式 Swagger UI**：启动后访问 `http://localhost:3000/api/docs` 即可在线调试与查看数据模型。
> 🛰️ **内置管理后台 (Vue 3 + Naive UI)**：启动后访问 `http://localhost:3000/admin`。

---

## 🌟 核心特性与业务模块

1. **动态多链与双通道节点中台 (`NetworkRegistryModule`)**
   - **双通道架构（HTTP + WS）**：每个网络配置专属 HTTP 节点（交易广播、状态查询、合约调用）与 WebSocket 节点（实时价格监听、充值事件监听、区块头订阅）。
   - **动态后台热配置**：支持在 Admin 控制台动态增删修改 EVM L2/新链（如 BSC, Base, Arbitrum, Optimism, Polygon 等），无需修改代码或重启服务。
   - **双通道健康诊断**：内置一键节点测速诊断接口，检测 HTTP 响应延迟与 WS 握手成功率。
   - **全局安全熔断**：支持单链一键暂停维护（Pause）。

2. **充提分离与发币专属隔离架构 (`WalletModule` & `TransferModule`)**
   - **严格用途隔离**：
     - `DEPOSIT`（充值专属钱包池）：仅用于生成收款意图，严禁出金转账。
     - `WITHDRAW`（出金专属热钱包池）：专职出款，出款前强制链上余额检验。
     - `TOKEN_DEPLOY`（发币专属钱包）：代币发行部署专职权限，与高频交易钱包物理隔离。
   - **零私钥安全抽象 (SignerProvider)**：服务层不碰私钥，支持本地托管、数据库加密解密，或远程 KMS/MPC 托管。
   - **资金归集闭环 (`SweepService`)**：将充值钱包沉淀资金自动归集汇总到冷金库或出金热钱包。

3. **锁仓与解锁仓/池 (`LockModule`)**
   - **锁仓/池**：支持项目方代币锁定、LP 凭证时间锁锁定或黑洞永久销毁。
   - **解锁仓/池 (`unlockToken`)**：支持到期时间判定与 Locker 合约提取解锁回指定受益人。

4. **代币发行 (`TokenModule`)**
   - 统一的发币接口：EVM ERC20、Solana SPL Token、Tron TRC20。

5. **DEX 交易与流动性 (`DexModule`)**
   - 流动性添加（Add Liquidity）与移除（Remove Liquidity）。
   - 市场兑换/买卖（Swap，支持滑点保护）。
   - 预集成 Uniswap V2、PancakeSwap、Raydium、SunSwap 等协议。

6. **Web3 钱包免密登录与多链身份打通 (`AuthModule` & `UserModule`)**
   - **WalletConnect / Web3 签名鉴权**：遵循标准 EIP-4361 (Sign-In with Ethereum, SIWE) 及跨链规范 (SIWS / TronWeb)，通过服务端 Nonce 挑战与密码学签名比对完成身份认证。
   - **多链钱包绑定同一个主账号**：支持用户在同一主账号 (`UserEntity`) 下绑定多个不同公链的地址（EVM, Solana, Tron）。用户下次无论使用 MetaMask、Phantom 还是 TronLink 登录，系统均能通过地址反向索引无缝解析并登录到同一个主账号。
   - **EIP-1271 智能合约钱包兼容**：支持 Gnosis Safe 多签、OKX AA 等抽象账户的链上 `isValidSignature` 校验。
   - **防重放攻击与单次 Nonce 销毁**：5 分钟 TTL，一旦提交立即销毁。
   - **无状态双 Token 体系**：签发 Access Token (2h) 与 Refresh Token (7d)，无缝续期。

7. **行情监控 (`PriceModule`)**
   - 毫秒级多级缓存与主流流动性池实时价格抓取。

---

## 🏗️ 系统架构图

```text
               ┌────────────────────────────────────────────────────────┐
               │              REST API 控制器 (Controllers)              │
               │  /api/admin/networks  │  /api/transfer  │  /api/lock   │
               └──────────────────────────┬─────────────────────────────┘
                                          │
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │           统一网络中台与多签安全中心                      │
               │  NetworkRegistryService (动态多链配置与双通道 RPC)        │
               │  WalletSignerManager (DEPOSIT / WITHDRAW / DEPLOY 隔离)│
               └──────────────────────────┬─────────────────────────────┘
                                          │  注入动态 PublicClient / Connection
                                          ▼
               ┌────────────────────────────────────────────────────────┐
               │                 多链适配器驱动层 (Adapters)              │
               │   EvmAdapter      │     SolanaAdapter     │  TronAdapter│
               │ (HTTP+WS Viem)    │ (HTTP+WS Web3.js)     │ (HTTP+WS    │
               │                   │                       │  TronWeb)   │
               └────────────────────────────────────────────────────────┘
```

---

## 📁 目录结构

```text
src/
├── common/                     # 通用基础设施
│   ├── enums/                  # 枚举 (ChainType, TxStatus)
│   ├── types/                  # DTO 类与业务响应定义
│   └── utils/                  # BigNumber 安全大数运算工具
├── config/                     # 默认配置
├── modules/
│   ├── network/                # 动态多链中台与双通道管理
│   │   ├── interfaces/         # NetworkConfigEntity, RpcHealthTestResult
│   │   ├── dto/                # CreateNetworkDto, UpdateNetworkDto
│   │   ├── network-registry.service.ts
│   │   ├── network-admin.controller.ts # 后台管理 REST API
│   │   └── network.module.ts
│   ├── wallet/                 # 统一钱包与签名中台 (充提分离)
│   │   ├── interfaces/         # WalletPurpose (DEPOSIT, WITHDRAW, TOKEN_DEPLOY)
│   │   ├── providers/          # Local, EncryptedDb, RemoteKms
│   │   └── wallet-signer.manager.ts
│   ├── adapters/               # 公链底层适配器
│   │   ├── interfaces/         # ITransferAdapter, ILockAdapter (含 unlock) 等
│   │   ├── evm/                # Viem 动态多链驱动
│   │   ├── solana/             # Solana Web3.js & SPL-Token 双通道驱动
│   │   ├── tron/               # TronWeb 驱动
│   │   └── adapters.module.ts
│   ├── user/                   # 主账号实体与多链地址聚合索引
│   │   ├── entities/           # UserEntity, BoundWallet
│   │   ├── user.service.ts     # 多链绑定、冲突检测、安全解绑
│   │   └── user.module.ts
│   ├── auth/                   # Web3 签名鉴权与 Token 签发 (EIP-4361 / SIWE)
│   │   ├── dto/                # LoginWalletDto, BindWalletDto 等
│   │   ├── guards/             # JwtAuthGuard
│   │   ├── decorators/         # @CurrentUser
│   │   ├── signature-verifier.service.ts # 跨链密码学验签 (EVM/Solana/Tron/EIP-1271)
│   │   ├── auth.service.ts
│   │   ├── auth.controller.ts
│   │   └── auth.module.ts
│   ├── transfer/               # 充值、提现、归集、转账、验签业务服务
│   ├── token/                  # 发币业务服务
│   ├── dex/                    # 流动性与 Swap 业务服务
│   ├── lock/                   # 锁仓与解锁仓/池业务服务
│   └── price/                  # 价格与行情监控服务
├── app.module.ts               # 主应用模块集成
└── main.ts                     # 应用入口
```

---

## 🔐 Web3 钱包登录与多链绑定 API (`/api/auth`)

全流程免密码挑战应答签名鉴权：

| 请求方式 | 路由路径 | 参数 | 鉴权 | 说明 |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/auth/nonce` | `chain`, `address`, `networkId?` | 公开 | **获取 Nonce 挑战**：生成符合 EIP-4361 标准的签名消息文本 |
| `POST` | `/api/auth/login` | `LoginWalletDto` | 公开 | **钱包登录**：校验签名，自动绑定/注册主账号，签发 JWT 双 Token |
| `GET` | `/api/auth/me` | - | `Bearer Token` | **获取个人资料**：查看主账号信息与所有绑定的多链钱包列表 |
| `POST` | `/api/auth/bind-wallet` | `BindWalletDto` | `Bearer Token` | **绑定新链钱包**：在已登录账号下绑定新钱包（需新钱包私钥签名） |
| `POST` | `/api/auth/unbind-wallet`| `UnbindWalletDto` | `Bearer Token` | **解绑钱包**：移除指定地址（禁止解绑主钱包或唯一钱包） |
| `POST` | `/api/auth/refresh` | `RefreshTokenDto` | 公开 | **刷新令牌**：使用 Refresh Token 换取新 Access Token |

---

## 📡 管理后台专属 API (Admin Only)

严格限制在管理后台内网或授权调用，**绝不下发给前端或普通用户客户端**：

### 1. 动态多链中台管理
| 请求方式 | 路由路径 | 说明 |
| :--- | :--- | :--- |
| `GET` | `/api/admin/networks` | 获取所有已配置链列表（含 HTTP 与 WS 节点） |
| `GET` | `/api/admin/networks/:id` | 获取指定网络详情 |
| `POST` | `/api/admin/networks` | 动态添加新网络（如添加新 EVM L2、Arbitrum、Base 等） |
| `PUT` | `/api/admin/networks/:id` | 热更新网络节点（切换主备 HTTP/WS 节点、更新合约） |
| `POST` | `/api/admin/networks/:id/test-rpc` | **双通道健康诊断**：实时测试 HTTP 响应与 WS 握手延迟 |
| `PATCH` | `/api/admin/networks/:id/pause` | 紧急熔断：一键暂停/恢复指定网络的业务交互 |
| `DELETE` | `/api/admin/networks/:id` | 删除自定义网络 |

### 2. 充值资金归集管理 (`SweepAdminController`)
| 请求方式 | 路由路径 | 参数 | 说明 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/admin/sweep` | `SweepDto` | **后台资金归集**：从 `DEPOSIT` 充值地址将沉淀资金划转至金库或出金热钱包 |
| `GET` | `/api/admin/sweep/balance/:network/:address` | - | 查询指定充值专属钱包的待归集余额及 DEPOSIT 身份审计状态 |

---

## 🔒 锁仓与解锁仓/池 API

| 请求方式 | 路由路径 | 参数 | 说明 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/lock/:network/lock` | `LockDto` | 锁定代币或 LP 凭证（指定解锁时间戳与受益人） |
| `POST` | `/api/lock/:network/unlock` | `UnlockDto` | **解锁仓/池**：从 Locker 合约提取已到期 LP 或代币 |

---

## 💸 前端/DApp 用户端业务 API (Public)

面向前端 DApp 及客户端用户的标准出入金接口（**无归集接口**）：

| 请求方式 | 路由路径 | 参数 | 说明 |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/transfer/workflow/deposit` | `CreateDepositDto` | 创建充值订单，从 `DEPOSIT` 专属钱包池随机匹配收款地址 A 给前端 |
| `POST` | `/api/transfer/workflow/deposit/confirm` | `SubmitDepositTxDto` | 验证用户端广播的 txHash，确认入金并防重放 |
| `POST` | `/api/transfer/workflow/withdraw` | `CreateWithdrawDto` | 创建出金提现，从 `WITHDRAW` 专属池挑选有足额余额的钱包 B 出款 |
| `GET` | `/api/transfer/:chain/verify/:txHash` | - | 查询交易链上确认状态 |
| `GET` | `/api/transfer/:chain/balance/:address` | - | 查询指定账户的原生币或代币余额 |

---

## 🧪 自动化测试验证

系统配备完备的单元测试与业务流集成测试：

```bash
# 执行全部 47 个测试用例 (覆盖多链架构、充提隔离、EIP-4361、账户多链绑定等)
pnpm test

# 生产环境编译打包
pnpm build
```

所有测试涵盖：
- Web3 WalletConnect / SIWE / SIWS 挑战应答登录与防重放攻击
- 多链地址绑定同一主账号与反向索引登录验证
- 严格充提与发币专属钱包隔离（防串用审计）
- 动态双通道多链配置与节点热替换
- 锁仓与解锁仓流程
- 紧急熔断（Paused Guard）

---

## 🗄️ 数据库迁移与数据填充手册 (对标 Laravel Artisan)

开发与测试环境已内置完整迁移与数据填充支持，命令与 Laravel Artisan 习惯保持高度一致：

```bash
# 1. 执行数据库迁移 (对标 php artisan migrate)
pnpm migrate        # 或 pnpm db:migrate

# 2. 填充种子数据 (对标 php artisan db:seed)
pnpm db:seed

# 3. 彻底重置并重新填充 (对标 php artisan migrate:fresh --seed)
pnpm db:fresh

# 4. 终端查看当前所有主账号及绑定的多链地址
pnpm db:view

# 5. 从磁盘立即刷新并重新同步内存中的用户索引（开发热更）
pnpm db:reload

# 6. 清空/重置数据库（恢复初始无用户状态）
pnpm db:reset
```

> 💡 更多关于生产级 PostgreSQL / Prisma 迁移操作（`prisma migrate dev`、`prisma migrate deploy`、`prisma migrate reset`）与数据表一对多模型设计，请参考 [多链统一身份与数据库迁移全流程追溯指南](file:///Users/dafudagui02/.gemini/antigravity/scratch/multichain-backend/docs/MULTICHAIN_ACCOUNT_AND_DATABASE_GUIDE.md)。

---

## 🚀 启动与开发指南

```bash
# 启动后端服务 (严禁执行 pnpm start:prod)
pnpm start:dev

# 启动集成管理后台 (Admin 独立热重载模式)
pnpm admin:dev

# 构建编译管理后台 (构建至 public/admin-dist 供 NestJS 静态托管)
pnpm admin:build

# 启动独立 DApp (位于 multichain-dapp 目录，默认端口 5173)
cd ../multichain-dapp && pnpm dev
```

