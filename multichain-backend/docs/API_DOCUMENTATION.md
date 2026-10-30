# Multi-Chain Web3 Backend 接口技术规格与参考文档

本文档为 **Multi-Chain Web3 Backend (EVM / Solana / Tron)** 的完整接口定义规范，面向前端 DApp 工程师、客户端开发、智能合约工程师及系统运维人员。

---

## 目录
1. [全局约定与设计规范](#1-全局约定与设计规范)
2. [Web3 钱包登录与多链身份管理 (/api/auth)](#2-web3-钱包登录与多链身份管理-apiauth)
3. [DApp 充值、提现与转账业务 (/api/transfer)](#3-dapp-充值提现与转账业务-apitransfer)
4. [管理后台专属充值资金归集 (/api/admin/sweep)](#4-管理后台专属充值资金归集-apiadminsweep)
5. [管理后台多链中台与双通道节点配置 (/api/admin/networks)](#5-管理后台多链中台与双通道节点配置-apiadminnetworks)
6. [代币发行与部署 (/api/token)](#6-代币发行与部署-apitoken)
7. [锁仓与解锁仓/池 (/api/lock)](#7-锁仓与解锁仓池-apilock)
8. [DEX 流动性与代币兑换 (/api/dex)](#8-dex-流动性与代币兑换-apidex)
9. [实时行情与价格监控 (/api/price)](#9-实时行情与价格监控-apiprice)
10. [系统健康检查与探针 (/)](#10-系统健康检查与探针-)

---

## 1. 全局约定与设计规范

### 1.1 服务基础地址与在线 Swagger UI
* **API 根路径**：`http://localhost:3000/api`
* **交互式 Swagger API 文档**：`http://localhost:3000/api/docs` （支持在线填参调试）

### 1.2 认证与鉴权机制
* 受保护接口采用标准 HTTP Bearer 认证头：
  ```http
  Authorization: Bearer <accessToken>
  ```
* `accessToken` 有效期为 **2 小时**。
* `refreshToken` 有效期为 **7 天**，用于静默刷新 Token。

### 1.3 精度与大数规范 (BigNumber)
* **严禁传输原生浮点数**：由于 JavaScript IEEE 754 浮点数存在精度损失问题，所有涉及代币数量、资金金额、Gas 数量的字段（如 `amount`, `balance`, `initialSupply` 等）**在入参与出参中一律采用十进制字符串（String）传递**。

### 1.4 HTTP 状态码约定
| 状态码 | 英文短语 | 含义与触发场景 |
| :--- | :--- | :--- |
| `200` | OK | 请求成功，返回业务数据 |
| `201` | Created | 资源创建成功（如充值意图生成、代币成功部署） |
| `400` | Bad Request | 请求参数校验失败、Nonce 失效/被二次使用、链上余额不足等 |
| `401` | Unauthorized | Web3 签名校验失败、JWT Token 缺失或已过期 |
| `403` | Forbidden | 账号已被封禁冻结、越权访问 |
| `404` | Not Found | 请求的资源不存在（如用户未找到、指定网络未配置） |
| `409` | Conflict | 资源冲突（如试图绑定的新钱包已被其他主账号绑定） |
| `500` | Internal Error | 链上 RPC 节点异常或未预期的系统异常 |

---

## 2. Web3 钱包登录与多链身份管理 (/api/auth)

系统基于 **EIP-4361 (Sign-In with Ethereum / SIWE)** 与跨链挑战应答规范（SIWS / TronWeb），支持将 EVM、Solana、Tron 等不同链上的多个公钥钱包地址绑定至同一个平台主账号 (`UserEntity`)。

---

### 2.1 获取登录或绑定挑战消息 (Nonce Challenge)
* **请求方式**：`GET`
* **接口路径**：`/api/auth/nonce`
* **权限要求**：公开接口（无需鉴权）
* **业务说明**：在调起钱包签名之前调用，后端生成带有 5 分钟有效期的防重放随机数（Nonce）与符合 EIP-4361 标准的人类可读挑战文本。

#### 请求参数
| 参数名 | 类型 | 位置 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `chain` | String | Query | 是 | `EVM` | 钱包所属链大类：`EVM`、`SOLANA`、`TRON` |
| `address` | String | Query | 是 | `0x1111...` | 申请签名的钱包公钥地址 |
| `networkId` | String | Query | 否 | `ethereum` | 具体网络标识符（如 `ethereum`, `bsc`, `solana`, `tron`） |

#### 返回体示例 (200 OK)
```json
{
  "nonce": "e3b0c44298fc1c149afbf4c8996fb924",
  "message": "localhost wants you to sign in with your EVM (ethereum) account:\n0x1111111111111111111111111111111111111111\n\nSign in with your Web3 wallet to authenticate.\n\nURI: http://localhost:3000\nVersion: 1\nChain: EVM\nNonce: e3b0c44298fc1c149afbf4c8996fb924\nIssued At: 2026-10-07T05:30:00.000Z\nExpiration Time: 2026-10-07T05:35:00.000Z",
  "chain": "EVM",
  "address": "0x1111111111111111111111111111111111111111",
  "domain": "localhost",
  "uri": "http://localhost:3000",
  "issuedAt": 1791351000000,
  "expiresAt": 1791351300000
}
```

#### 返回字段含义说明
| 字段名 | 类型 | 含义与说明 |
| :--- | :--- | :--- |
| `nonce` | string | 后端生成的 16 字节十六进制随机数，单次消费防重放 |
| `message` | string | **核心字段**：前端需原封不动传给钱包进行 `personal_sign` 签名的文本文本 |
| `chain` | string | 请求对应的公链生态大类 |
| `address` | string | 对应的钱包公钥地址 |
| `issuedAt` | number | 挑战创建时间戳（毫秒） |
| `expiresAt` | number | 挑战过期时间戳（毫秒，默认 5 分钟后过期） |

---

### 2.2 Web3 钱包免密登录 / 自动注册 (Login with Wallet)
* **请求方式**：`POST`
* **接口路径**：`/api/auth/login`
* **权限要求**：公开接口
* **业务说明**：前端获得钱包私钥签名后提交。后端完成密码学验签（支持 EVM EOA、EIP-1271 智能合约钱包、Solana Ed25519、TronWeb）。若为新地址自动注册主账号；若已绑定任意主账号则直接登录并签发 JWT 双 Token。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `chain` | string | 是 | `EVM` | 钱包所属公链家族：`EVM`、`SOLANA`、`TRON` |
| `address` | string | 是 | `0x1111...` | 登录钱包公钥地址 |
| `signature` | string | 是 | `0x3f5b...` | 钱包私钥对挑战文本签名后的十六进制或 Base58 签名值 |
| `message` | string | 是 | `localhost wants you...` | 之前从 `/api/auth/nonce` 获得的未篡改完整挑战文本 |
| `networkId` | string | 否 | `ethereum` | 当前操作网络标识符 |

#### 请求体示例
```json
{
  "chain": "EVM",
  "address": "0x1111111111111111111111111111111111111111",
  "signature": "0x546e8c7d...validSignature",
  "message": "localhost wants you to sign in with your EVM account:\n0x1111111111111111111111111111111111111111\n\nSign in with your Web3 wallet to authenticate.\n\nURI: http://localhost:3000\nVersion: 1\nChain: EVM\nNonce: e3b0c44298fc1c149afbf4c8996fb924\nIssued At: 2026-10-07T05:30:00.000Z\nExpiration Time: 2026-10-07T05:35:00.000Z",
  "networkId": "ethereum"
}
```

#### 返回体示例 (200 OK)
```json
{
  "user": {
    "id": "12d1e18c-ba3b-4ca1-9b25-8b5acf1a36b0",
    "nickname": "User_0x1111...1111",
    "role": "USER",
    "status": "ACTIVE",
    "primaryWallet": {
      "chain": "EVM",
      "address": "0x1111111111111111111111111111111111111111"
    },
    "wallets": [
      {
        "chain": "EVM",
        "address": "0x1111111111111111111111111111111111111111",
        "isPrimary": true,
        "boundAt": 1791351020000
      }
    ],
    "createdAt": 1791351020000,
    "updatedAt": 1791351020000,
    "lastLoginAt": 1791351020000
  },
  "tokens": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 7200
  }
}
```

#### 返回字段说明
| 字段路径 | 类型 | 含义与说明 |
| :--- | :--- | :--- |
| `user.id` | string | 系统分配的全局唯一主账号 UUID |
| `user.role` | string | 用户角色：`USER` (普通用户) 或 `ADMIN` (系统管理员) |
| `user.status` | string | 账号状态：`ACTIVE` (正常) 或 `BANNED` (已冻结) |
| `user.primaryWallet` | object | 注册时的初始主钱包 |
| `user.wallets` | array | **名下所有绑定的多链钱包列表**，后续绑定 Solana/Tron 地址均聚合在此 |
| `tokens.accessToken`| string | JWT 短效鉴权令牌 (2 小时)，用于调用受保护 API |
| `tokens.refreshToken`| string | JWT 刷新令牌 (7 天)，用于换取新的 AccessToken |
| `tokens.expiresIn` | number | AccessToken 有效期秒数 (7200 秒) |

---

### 2.3 获取当前用户画像及已绑定钱包列表 (Get Profile)
* **请求方式**：`GET`
* **接口路径**：`/api/auth/me`
* **权限要求**：`Bearer Token`
* **业务说明**：查看当前登录用户主账号详情及名下已绑定的全部链钱包。

#### 返回体示例 (200 OK)
返回完整的 `UserEntity` 对象（同 2.2 中的 `user` 结构）。

---

### 2.4 绑定新公链钱包至当前主账号 (Bind Wallet)
* **请求方式**：`POST`
* **接口路径**：`/api/auth/bind-wallet`
* **权限要求**：`Bearer Token`
* **业务说明**：用户已登录主账号后，在个人中心点击「绑定 Solana 钱包」或「绑定波场钱包」。需先调用 `/api/auth/nonce` 拿到针对新地址的挑战，并在对应钱包签名后提交。
* **业务保障**：
  * 若目标地址已被其他主账号绑定，抛出 `409 ConflictException` 杜绝多主账号冲突；
  * 绑定成功后，下次在只安装了对应新钱包的设备上直接登录，系统能直接认出该主账号。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `chain` | string | 是 | `SOLANA` | 待绑定的新公链类型 (`EVM` / `SOLANA` / `TRON`) |
| `address` | string | 是 | `7YgP...solAddress` | 待绑定的新钱包公钥地址 |
| `signature` | string | 是 | `4Jq7...` | 新钱包私钥对 Nonce 的有效签名 |
| `message` | string | 是 | `localhost wants...` | 针对新地址签发的有效挑战文本 |

#### 返回体示例 (200 OK)
返回更新后的 `UserEntity` 对象，其 `wallets` 数组将包含新绑定的钱包项。

---

### 2.5 解绑指定钱包 (Unbind Wallet)
* **请求方式**：`POST`
* **接口路径**：`/api/auth/unbind-wallet`
* **权限要求**：`Bearer Token`
* **业务说明**：从当前主账号中移除一个已绑定的钱包。
* **安全保护**：
  * **禁止解绑主钱包**（`isPrimary: true`）；
  * **禁止解绑账号下的最后一个钱包**（防止产生无地址可登录的孤儿主账号）。

#### 请求体参数 (Body)
```json
{
  "chain": "SOLANA",
  "address": "7YgP...solAddress"
}
```

---

### 2.6 刷新访问令牌 (Refresh Token)
* **请求方式**：`POST`
* **接口路径**：`/api/auth/refresh`
* **权限要求**：公开接口
* **请求体参数**：
  ```json
  {
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
* **返回体**：返回全新的 `AuthTokens`（包含新生成的 `accessToken` 与新的 `refreshToken`）。

---

## 3. DApp 充值、提现与转账业务 (/api/transfer)

面向 DApp 用户端出入金全生命周期业务。**遵循严格的充提分离安全架构**：系统内置独立用途钱包池，充值收款分配专属 `DEPOSIT` 钱包池，提现出款由独立具备足够余额的 `WITHDRAW` 热钱包出金。

---

### 3.1 创建充值订单意图 (Create Deposit Intent)
* **请求方式**：`POST`
* **接口路径**：`/api/transfer/workflow/deposit`
* **权限要求**：公开接口
* **业务说明**：用户在 DApp 前端输入欲充值金额与币种，系统从专属 `DEPOSIT` 充值钱包池中随机挑选一个收款地址 A 分配给用户，生成一个拥有 30 分钟时效的入金订单。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `network` | string | 是 | `ethereum` | 充值目标网络 (如 `ethereum`, `bsc`, `solana`, `tron`) |
| `amount` | string | 是 | `100.5` | 计划充值的金额（大数字符串） |
| `tokenAddress` | string | 否 | `0xdAC17F...` | 充值代币合约地址（不传表示充值底层原生币 ETH/SOL/TRX） |

#### 返回体示例 (201 Created)
```json
{
  "id": "c75895ff-3972-40dc-83db-da44e704b16e",
  "chain": "EVM",
  "depositAddress": "0xDepositOnlyWallet111111111111111111111111",
  "amount": "100.5",
  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "status": "PENDING",
  "createdAt": 1791351100000,
  "expiresAt": 1791352900000
}
```

#### 返回字段说明
| 字段名 | 类型 | 含义与说明 |
| :--- | :--- | :--- |
| `id` | string | 充值订单唯一编号 (UUID) |
| `depositAddress` | string | **分配给用户的充值专属收款地址 A**，前端生成充值二维码供用户转账 |
| `status` | string | 订单状态：`PENDING` (待支付), `CONFIRMED` (已确认), `EXPIRED` (已过期) |
| `expiresAt` | number | 订单过期时间戳（30 分钟有效） |

---

### 3.2 确认充值交易 (Confirm Deposit Tx)
* **请求方式**：`POST`
* **接口路径**：`/api/transfer/workflow/deposit/confirm`
* **权限要求**：公开接口
* **业务说明**：用户在钱包中完成转账后，前端将广播生成的 `txHash` 提交给后端。后端即刻调用链上适配器校验交易真实性、收款方是否为该订单的 `depositAddress`、金额是否足额，防重放通过后确认订单。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `orderId` | string | 是 | `c75895ff...` | 第一步获取的充值订单 UUID |
| `txHash` | string | 是 | `0x3a4b...` | 用户钱包广播交易产生的链上交易哈希 |

#### 返回体示例 (200 OK)
```json
{
  "id": "c75895ff-3972-40dc-83db-da44e704b16e",
  "chain": "EVM",
  "depositAddress": "0xDepositOnlyWallet111111111111111111111111",
  "amount": "100.5",
  "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "txHash": "0x3a4b...txHash",
  "status": "CONFIRMED",
  "createdAt": 1791351100000,
  "expiresAt": 1791352900000,
  "confirmedAt": 1791351150000
}
```

---

### 3.3 发起用户提现出金 (Process Withdrawal)
* **请求方式**：`POST`
* **接口路径**：`/api/transfer/workflow/withdraw`
* **权限要求**：业务端鉴权（通常在用户已登录并经过平台风控后调用）
* **业务说明**：后端从专属 `WITHDRAW` 出金热钱包池中智能挑选一个具备充足余额的钱包 B，由钱包 B 执行链上原生转账，将资产打至用户的接收地址。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `network` | string | 是 | `ethereum` | 出金网络标识符 (如 `ethereum`, `bsc`, `solana`, `tron`) |
| `userAddress` | string | 是 | `0xUserDest...` | 用户外部收款钱包地址 |
| `amount` | string | 是 | `5.0` | 申请出金的金额字符串 |
| `tokenAddress` | string | 否 | `0xdAC17F...` | 提现代币合约地址（留空为提现原生币） |

#### 返回体示例 (200 OK)
```json
{
  "id": "8d8af3c5-cc13-48c9-8a67-9e2d4123e744",
  "chain": "EVM",
  "fromAddress": "0xWithdrawOnlyKmsWallet222222222222222222222",
  "toAddress": "0xUserDestinationAddress111111111111111111",
  "amount": "5.0",
  "txHash": "0xWithdrawTxHash999",
  "status": "CONFIRMED",
  "createdAt": 1791351200000,
  "confirmedAt": 1791351205000
}
```

#### 返回字段说明
| 字段名 | 类型 | 含义与说明 |
| :--- | :--- | :--- |
| `fromAddress` | string | 系统智能挑选的专属出金钱包 B（保障零私钥泄露，来自 KMS/MPC 托管） |
| `toAddress` | string | 用户接收地址 |
| `txHash` | string | 链上出款广播交易哈希 |

---

### 3.4 查询链上交易状态与确认回执 (Verify Tx)
* **请求方式**：`GET`
* **接口路径**：`/api/transfer/:chain/verify/:txHash`
* **权限要求**：公开接口
* **路径参数**：
  * `chain` (Path): 公链生态或网络标识 (`ethereum`, `solana`, `tron` 等)
  * `txHash` (Path): 待查询的交易哈希
* **返回体示例 (200 OK)**：
  ```json
  {
    "confirmed": true,
    "blockNumber": 19482015,
    "status": "CONFIRMED",
    "from": "0x1111...",
    "to": "0x2222...",
    "amount": "100.0",
    "tokenAddress": "0xdAC17F..."
  }
  ```

---

### 3.5 查询账户链上余额 (Get Balance)
* **请求方式**：`GET`
* **接口路径**：`/api/transfer/:chain/balance/:address`
* **权限要求**：公开接口
* **查询参数**：
  * `tokenAddress` (Query, 可选): 代币合约地址。若不传则查询该地址的原生币（ETH/SOL/TRX）余额。
* **返回体示例 (200 OK)**：
  ```json
  {
    "address": "0x1111111111111111111111111111111111111111",
    "balance": "1542.859",
    "tokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  }
  ```

---

## 4. 管理后台专属充值资金归集 (/api/admin/sweep)

> ⚠️ **安全架构红线**：资金归集功能属于敏感高危资金操作，**仅存在于管理后台内网 `SweepAdminController`，绝不对前端或公开业务下发！**

充提分离的生命周期闭环：
`用户充值` $\to$ `DEPOSIT 专属收款池` $\to$ **`资金归集 (Sweep)`** $\to$ `冷金库 (Treasury) / WITHDRAW 出金热钱包池`。

---

### 4.1 执行充值资金归集 (Sweep Deposit Funds)
* **请求方式**：`POST`
* **接口路径**：`/api/admin/sweep`
* **权限要求**：**Admin Only**
* **安全审计机制**：
  * 系统在执行归集转账前，会强制调用 `walletSignerManager` 校验源地址 `fromDepositWallet` 的注册用途；
  * 若源地址用途不是 `DEPOSIT`（例如误填为 `WITHDRAW` 出金钱包），**系统直接拦截并抛出 400 安全违规异常，防止资金逻辑倒流**。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `network` | string | 是 | `ethereum` | 网络标识符 (如 `ethereum`, `bsc`, `solana`, `tron`) |
| `fromDepositWallet` | string | 是 | `0xDeposit...` | 归集源收款地址（必须为系统注册的 `DEPOSIT` 专属钱包） |
| `toTargetAddress` | string | 是 | `0xTreasury...`| 归集目标地址（主冷金库或出金热钱包） |
| `tokenAddress` | string | 否 | `0xdAC17F...` | 待归集代币合约地址（留空归集原生币） |
| `amount` | string | 否 | `50.0` | 归集金额（若留空则自动扣除微量预留 Gas 后**全额归集**） |

#### 请求体示例
```json
{
  "network": "ethereum",
  "fromDepositWallet": "0xDepositOnlyWallet111111111111111111111111",
  "toTargetAddress": "0xTreasuryColdVault222222222222222222222222",
  "amount": "50.0"
}
```

#### 返回体示例 (200 OK)
```json
{
  "sweepId": "a918e692-411a-4d43-9ce1-a3f191b65d38",
  "network": "ethereum",
  "fromDepositWallet": "0xDepositOnlyWallet111111111111111111111111",
  "toTargetAddress": "0xTreasuryColdVault222222222222222222222222",
  "amount": "50.0",
  "txHash": "0xSweepTxHash777",
  "timestamp": 1791351300000
}
```

---

### 4.2 查询充值地址待归集余额及审计状态 (Sweepable Balance)
* **请求方式**：`GET`
* **接口路径**：`/api/admin/sweep/balance/:network/:address`
* **权限要求**：**Admin Only**
* **业务说明**：在执行归集前，后台管理页面可调用此接口核验该地址是否为合法充值收款钱包，并查看其实时链上可归集金额。

#### 返回体示例 (200 OK)
```json
{
  "network": "ethereum",
  "depositWallet": "0xDepositOnlyWallet111111111111111111111111",
  "balance": "50.0",
  "isValidDepositWallet": true
}
```

---

## 5. 管理后台多链中台与双通道节点配置 (/api/admin/networks)

多链中台支持在管理后台动态增删查改公链（如添加 Base、Arbitrum、Optimism 等新 EVM L2）。采用 **HTTP + WebSocket 双通道架构**：HTTP 节点负责交易广播与只读合约调用，WebSocket 节点负责实时充值入金监听与事件订阅。

---

### 5.1 获取所有公链网络配置列表
* **请求方式**：`GET`
* **接口路径**：`/api/admin/networks`
* **权限要求**：**Admin Only**
* **返回体示例 (200 OK)**：
```json
[
  {
    "networkId": "ethereum",
    "name": "Ethereum Mainnet",
    "family": "EVM",
    "chainId": 1,
    "nativeCurrency": { "name": "Ether", "symbol": "ETH", "decimals": 18 },
    "httpRpc": {
      "primaryUrl": "https://eth.llamarpc.com",
      "fallbackUrls": ["https://rpc.ankr.com/eth"],
      "timeoutMs": 10000
    },
    "wsRpc": {
      "primaryUrl": "wss://ethereum.publicnode.com",
      "reconnectIntervalMs": 5000
    },
    "contracts": {
      "routerAddress": "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      "lockerAddress": "0x663DC29D3021943FAaa50519f71A9Ec3A8D7E304"
    },
    "security": {
      "isPaused": false,
      "maxTransferLimitPerTx": "1000000"
    }
  }
]
```

---

### 5.2 动态注册全新公链网络 (Register Network)
* **请求方式**：`POST`
* **接口路径**：`/api/admin/networks`
* **权限要求**：**Admin Only**
* **业务说明**：在管理后台页面配置新链（如新增 Arbitrum One），无需修改后端源码或重启进程，底层适配器即刻完成 Viem / Web3 驱动的热绑定。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `networkId` | string | 是 | `arbitrum` | 全局唯一标识符（小写英文字母） |
| `name` | string | 是 | `Arbitrum One` | 网络可读名称 |
| `family` | string | 是 | `EVM` | 公链大类：`EVM`、`SOLANA`、`TRON` |
| `chainId` | number | 否 | `42161` | EVM Chain ID（EVM 体系必填） |
| `nativeCurrency` | object | 是 | `{ name, symbol, decimals }` | 原生币基础元数据 |
| `httpRpc` | object | 是 | `{ primaryUrl, fallbackUrls, timeoutMs }` | **HTTP 节点配置**（广播交易、查询） |
| `wsRpc` | object | 否 | `{ primaryUrl, reconnectIntervalMs }` | **WebSocket 节点配置**（实时事件监听） |
| `contracts` | object | 否 | `{ routerAddress, lockerAddress }` | DEX 路由合约与锁仓合约地址 |
| `security` | object | 否 | `{ isPaused: false }` | 初始安全配置 |

---

### 5.3 热更新网络节点配置 (Update Network)
* **请求方式**：`PUT`
* **接口路径**：`/api/admin/networks/:id`
* **权限要求**：**Admin Only**
* **业务说明**：当第三方 RPC 提供商发生限流、异常或需要切换主备节点时，在管理后台提交即可热替换节点 URL。

---

### 5.4 双通道节点健康与测速诊断 (Test RPC)
* **请求方式**：`POST`
* **接口路径**：`/api/admin/networks/:id/test-rpc`
* **权限要求**：**Admin Only**
* **业务说明**：管理后台的一键测速诊断工具。后端会并发向该网络的 HTTP 节点发起块高查询探测延迟，并向 WebSocket 节点发起实时握手与 Ping/Pong 测速。

#### 返回体示例 (200 OK)
```json
{
  "networkId": "ethereum",
  "httpHealthy": true,
  "httpLatencyMs": 85,
  "wsHealthy": true,
  "wsLatencyMs": 112,
  "testedAt": 1791351320000
}
```

---

### 5.5 紧急安全熔断暂停/恢复 (Pause / Resume)
* **请求方式**：`PATCH`
* **接口路径**：`/api/admin/networks/:id/pause`
* **权限要求**：**Admin Only**
* **请求体**：`{ "paused": true }`（暂停）或 `{ "paused": false }`（恢复）。
* **业务说明**：当某条链发生硬分叉或极端黑天鹅攻击时，一键切断该链的全部充值、出金与交易，接口将拒绝相关请求。

---

## 6. 代币发行与部署 (/api/token)

统一发行多链代币（EVM ERC20、Solana SPL Token、Tron TRC20），系统自动调度专职发币钱包（`TOKEN_DEPLOY`）完成链上部署与铸造。

---

### 6.1 发行并部署新代币 (Deploy Token)
* **请求方式**：`POST`
* **接口路径**：`/api/token/:chain/deploy`
* **权限要求**：业务端授权调用
* **路径参数**：`chain`（如 `ethereum`, `bsc`, `solana`, `tron`）

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `name` | string | 是 | `My Security Token` | 代币全称 |
| `symbol` | string | 是 | `MST` | 代币符号/代码 (Ticker) |
| `decimals` | number | 是 | `18` | 小数位精度 (EVM 通常为 18，Solana 为 9，USDT 为 6) |
| `initialSupply` | string | 是 | `10000000` | 初始发行总量 (字符串大数，如一千万) |
| `recipient` | string | 否 | `0xRecipient...` | 初始代币铸造接收人（不填默认转给发币钱包） |

#### 返回体示例 (201 Created)
```json
{
  "tokenAddress": "0xTokenContractAddress1111111111111111111111",
  "txResult": {
    "success": true,
    "txHash": "0xDeployTxHash123456789",
    "blockNumber": 19482100
  }
}
```

---

## 7. 锁仓与解锁仓/池 (/api/lock)

支持代币时间锁（Vesting/Lock）与 DEX 流动性池 LP 凭证锁定（防撤池 Rug Pull），到期后支持提取解锁。

---

### 7.1 锁仓代币或 LP 凭证 (Lock Token)
* **请求方式**：`POST`
* **接口路径**：`/api/lock/:chain` 或 `/api/lock/:chain/lock`
* **权限要求**：业务端调用

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `tokenAddress` | string | 是 | `0xTokenOrLp...` | 锁定标的代币合约或 LP Pair 合约地址 |
| `amount` | string | 是 | `1000000.0` | 锁定数量 |
| `unlockTimestamp` | number | 是 | `1799999999` | 解锁到期 UNIX 时间戳 (秒) |
| `beneficiary` | string | 是 | `0xBeneficiary...` | 锁仓到期后的法定提取受益人公钥地址 |

#### 返回体示例 (200 OK)
```json
{
  "success": true,
  "txHash": "0xLockTxHash123",
  "blockNumber": 19482150
}
```

---

### 7.2 提取并解锁代币或 LP 池 (Unlock Token / Pool)
* **请求方式**：`POST`
* **接口路径**：`/api/lock/:chain/unlock`
* **权限要求**：业务端调用
* **业务约束**：当前链上时间必须大于锁仓时的 `unlockTimestamp`，且接收人地址必须与受益人一致。

#### 请求体参数 (Body)
| 参数名 | 类型 | 必填 | 示例值 | 含义与说明 |
| :--- | :--- | :--- | :--- | :--- |
| `tokenAddress` | string | 是 | `0xTokenOrLp...` | 已锁定的代币或 LP 合约地址 |
| `lockId` | string | 是 | `lock-evm-001` | 锁仓订单记录的编号或合约内锁 ID |
| `amount` | string | 是 | `1000000.0` | 申请解锁提取的数量 |
| `recipient` | string | 是 | `0xBeneficiary...` | 资产提取接收人地址 |

#### 返回体示例 (200 OK)
```json
{
  "success": true,
  "txHash": "0xUnlockTxHash456",
  "blockNumber": 19482200
}
```

---

## 8. DEX 流动性与代币兑换 (/api/dex)

统一对接主流去中心化交易所（Uniswap V2、PancakeSwap、Raydium、SunSwap）。

---

### 8.1 添加流动性 (Add Liquidity)
* **请求方式**：`POST`
* **接口路径**：`/api/dex/:chain/liquidity/add`
* **请求体参数 (Body)**：
  * `tokenA` (string): 代币 A 合约地址
  * `tokenB` (string): 代币 B 合约地址
  * `amountA` (string): 注入代币 A 数量
  * `amountB` (string): 注入代币 B 数量
  * `recipient` (string): LP 凭证接收人地址
  * `slippagePercent` (number, 可选): 滑点容忍百分比 (默认 0.5)

---

### 8.2 移除流动性 (Remove Liquidity)
* **请求方式**：`POST`
* **接口路径**：`/api/dex/:chain/liquidity/remove`
* **请求体参数 (Body)**：
  * `poolAddress` (string): 流动性池 Pair 合约地址
  * `lpAmount` (string): 待销毁赎回的 LP 凭证数量
  * `recipient` (string): 底层代币对接收人地址

---

### 8.3 DEX 资产兑换/买卖 (Swap)
* **请求方式**：`POST`
* **接口路径**：`/api/dex/:chain/swap`
* **请求体参数 (Body)**：
  * `tokenIn` (string): 输入（支付）代币合约
  * `tokenOut` (string): 输出（目标）代币合约
  * `amountIn` (string): 支付代币数量
  * `minAmountOut` (string): 最小预期获得数量（滑点保护）
  * `recipient` (string): 兑换后代币接收人地址

---

## 9. 实时行情与价格监控 (/api/price)

---

### 9.1 查询代币实时价格 (Get Token Price)
* **请求方式**：`GET`
* **接口路径**：`/api/price/:chain/:tokenAddress`
* **权限要求**：公开接口
* **查询参数**：
  * `quoteTokenAddress` (Query, 可选): 计价币合约地址（默认锚定 USDT / USDC）

#### 返回体示例 (200 OK)
```json
{
  "tokenAddress": "0xTokenAddress111111111111111111111111111",
  "priceUsd": 3.42,
  "quoteTokenAddress": "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  "timestamp": 1791351340000
}
```

---

## 10. 系统健康检查与探针 (/)

* **请求方式**：`GET`
* **接口路径**：`/api`
* **权限要求**：公开
* **返回**：`Hello World!` (HTTP 200 OK，用于负载均衡与 K8s 存活探针)。
