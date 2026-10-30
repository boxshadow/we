# Web3 多链资产托管与风控中台系统 (Multi-Chain Custody Platform)

企业级 Web3 多链资产管理、托管与风控系统，涵盖 EVM（Ethereum / BSC / Polygon / Arbitrum / Base）、Solana 与 Tron 三大公链生态。支持机构级收款池管理、双轨对账提现出金、Rust 离线硬件 KMS 签名机与 Google Authenticator 2FA 双因素安全鉴权。

---

## 1. 架构总览与子工程目录

本项目采用 **Monorepo** 架构进行统一代码治理与容器编排：

```
.
├── docker-compose.yml              # Docker 集群统一编排启动文件
├── multichain-backend/             # NestJS 服务端与管理后台工程
│   ├── src/                        # NestJS 核心业务模块 (公链适配器、充提金流、2FA、对账、自动归集)
│   ├── admin/                      # Vue 3 + Naive UI 现代单页管理中台 SPA 源码
│   ├── public/admin-dist/          # 管理后台打包静态产物
│   └── prisma/                     # 数据库模型与迁移文件
├── multichain-dapp/                # Vue 3 + Naive UI 客户端 Web3 DApp 交互工程
│   └── src/                        # MetaMask、Phantom、TronLink 钱包连接与充提视图
└── multichain-kms-vault/           # Rust 独立离线 KMS 密室与硬件签名机微服务
    ├── Cargo.toml                  # Rust 依赖声明 (ed25519-dalek, k256, axum, tokio)
    └── src/                        # EVM (secp256k1)、Solana (Ed25519) 与 Tron 签名引擎
```

---

## 2. 核心技术栈

- **后端中枢**：NestJS 11、TypeScript、Prisma ORM、Node.js 原生 Crypto (PBKDF2、HMAC-SHA1 RFC 6238 TOTP)。
- **管理中台**：Vue 3 (Composition API)、TypeScript、Vite、Naive UI、Vue Router 4、Pinia。
- **客户端 DApp**：Vue 3、TypeScript、Naive UI、Vite、Ethers.js、Solana Web3.js、TronWeb。
- **硬件隔离签名机 (KMS Vault)**：Rust (2021 Edition)、Axum Web 框架、Tokio 异步运行时、`k256`、`ed25519-dalek`、`sha3`。
- **容器与部署**：Docker、Docker Compose、Alpine Linux。

---

## 3. 快速启动指引

### 3.1 容器化一键启动 (推荐)

在项目根目录下执行以下命令，即可拉起包含 Rust KMS 签名密室与 NestJS 后端集群：

```bash
docker compose up -d --build
```

容器健康启动后，各服务端口映射如下：

| 服务模块 | 访问地址 | 默认账号 / 说明 |
| :--- | :--- | :--- |
| **机构管理中台** | `http://localhost:3000/admin` | 账号：`founder`，初始口令：`FounderPassword2026!` (首次登录强制绑定 Google 2FA) |
| **后端 RESTful API** | `http://localhost:3000/api` | API 服务根路径 |
| **Swagger 接口文档** | `http://localhost:3000/api/docs` | OpenAPI 3.0 接口全景文档 |
| **Rust KMS 签名密室** | `http://127.0.0.1:8550` | 仅限内网访问的离线签名引擎 (健康检查：`http://127.0.0.1:8550/health`) |

### 3.2 启动 Web3 客户端 DApp

在本地终端进入 `multichain-dapp` 目录：

```bash
cd multichain-dapp
pnpm install
pnpm run dev
```

浏览器访问 `http://localhost:5173` 即可进行多链钱包连接、充值与提现测试。

---

## 4. 自动化测试

项目内置完整的单元测试与端到端集成测试套件：

```bash
cd multichain-backend
pnpm test
```

测试覆盖范围包括：
- 多链充值入账与防重放幂等校验
- 双轨提现对账引擎（预计算 TxHash 挂起与 Nonce 探针自愈机制）
- Rust 离线签名机通信与签名验证
- 账号密码加盐哈希与 RFC 6238 TOTP 谷歌二次验证
- Founder 初始账号强制扫码绑定拦截与鉴权放行
