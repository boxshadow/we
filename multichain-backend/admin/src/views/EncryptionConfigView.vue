<template>
  <div class="encryption-config-page">
    <!-- Header -->
    <div class="page-header">
      <div>
        <div class="page-title-row">
          <n-icon size="24" color="#3b82f6" class="title-icon">
            <LockClosedOutline />
          </n-icon>
          <h1 class="page-title">KMS 与安全 Enclave 签名服务</h1>
          <span v-if="config.isActive" class="status-badge status-badge-active">
            <span class="status-dot"></span>
            托管签名通道激活中
          </span>
          <span v-else class="status-badge status-badge-inactive">
            <span class="status-dot dot-amber"></span>
            处于临时维护/停用状态
          </span>
        </div>
        <p class="page-desc">
          配置远程 Hardware Security Module (HSM)、MPC 托管或企业私有 KMS 加密签名微服务。私钥全程物理隔离于外部安全 Enclave，后端仅通过 JWT Bearer 鉴权通道调度签名。
        </p>
      </div>

      <div class="header-actions">
        <n-button
          secondary
          :loading="testingConnection"
          @click="handleTestConnection"
          class="btn-subtle"
        >
          <template #icon>
            <n-icon><PulseOutline /></n-icon>
          </template>
          连通性握手探测
        </n-button>
        <n-button
          type="primary"
          :loading="saving"
          @click="handleSaveConfig"
        >
          <template #icon>
            <n-icon><SaveOutline /></n-icon>
          </template>
          保存并应用配置
        </n-button>
      </div>
    </div>

    <!-- 顶部运营与健康状态概览 (4 列规整指标卡) -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">节点连通性与状态</span>
          <span class="metric-status-badge" :class="config.lastStatus === 'ONLINE' ? 'badge-online' : 'badge-offline'">
            {{ config.lastStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE' }}
          </span>
        </div>
        <div class="metric-main-value">
          <span class="latency-num">{{ config.lastLatencyMs || 38 }}</span>
          <span class="latency-unit">ms 握手往返</span>
        </div>
        <div class="metric-footer-text">
          <span>协议: {{ config.enforceHttps ? 'HTTPS TLS 1.3 (强制)' : 'HTTP 明文' }}</span>
          <span class="dot-sep">•</span>
          <span>上次探测: {{ formatTime(config.lastTestedAt) }}</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">外部托管架构</span>
          <span class="engine-tag">{{ config.providerType }}</span>
        </div>
        <div class="metric-main-value text-accent">
          {{ getProviderLabel(config.providerType) }}
        </div>
        <div class="metric-footer-text">
          <span>固件引擎: {{ config.serverVersion || 'v2.8.4-hsm-enclave' }}</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">JWT 凭证时效</span>
          <span class="metric-status-badge" :class="config.tokenDetails && !config.tokenDetails.isExpired ? 'badge-online' : 'badge-offline'">
            {{ config.tokenDetails && !config.tokenDetails.isExpired ? '有效' : '已过期' }}
          </span>
        </div>
        <div class="metric-main-value">
          <span class="days-num">{{ getRemainingDays(config.tokenDetails?.expiresAt) }}</span>
          <span class="latency-unit">天有效余量</span>
        </div>
        <div class="metric-footer-text">
          <span>算法: {{ config.tokenDetails?.algorithm || 'HS256' }}</span>
          <span class="dot-sep">•</span>
          <span>签发方: {{ config.tokenDetails?.issuer || 'kms.internal' }}</span>
        </div>
      </div>

      <div class="metric-card">
        <div class="metric-top">
          <span class="metric-label">托管公链算法覆盖</span>
          <span class="algo-count-badge">3 种主流曲线</span>
        </div>
        <div class="metric-chips-row">
          <span class="algo-pill">Secp256k1 (EVM/TRON)</span>
          <span class="algo-pill">Ed25519 (SOL)</span>
          <span class="algo-pill">AES-GCM</span>
        </div>
        <div class="metric-footer-text">
          <span>容灾策略: {{ config.fallbackStrategy === 'REJECT_ALL' ? '严格熔断阻断' : '本地热备接管' }}</span>
        </div>
      </div>
    </div>

    <!-- 握手探测即时反馈 Banner (当测试过连通性时出现) -->
    <div v-if="probeFeedback" class="probe-banner" :class="probeFeedback.success ? 'probe-banner-success' : 'probe-banner-error'">
      <div class="probe-banner-content">
        <n-icon size="18" :color="probeFeedback.success ? '#10b981' : '#ef4444'" style="margin-right: 8px;">
          <CheckmarkCircleOutline v-if="probeFeedback.success" />
          <AlertCircleOutline v-else />
        </n-icon>
        <div class="probe-banner-text">
          <strong>{{ probeFeedback.success ? '连通性握手验证成功' : '连通性握手异常' }}:</strong>
          {{ probeFeedback.message }}
          <span v-if="probeFeedback.enclaveId" class="enclave-tag">Enclave ID: {{ probeFeedback.enclaveId }}</span>
        </div>
      </div>
      <div class="probe-banner-meta">
        耗时: {{ probeFeedback.latencyMs }}ms | 状态码: {{ probeFeedback.statusCode }}
      </div>
    </div>

    <!-- 主表单网格 (两列响应式布局) -->
    <div class="main-form-grid">
      <!-- 左列：核心连接与凭证管理 -->
      <div class="form-column">
        <div class="section-card">
          <div class="card-title-row">
            <div class="title-with-icon">
              <n-icon size="18" color="#3b82f6"><KeyOutline /></n-icon>
              <span class="card-title">远程节点连接与 JWT 鉴权凭证</span>
            </div>
            <n-switch
              v-model:value="form.isActive"
              size="medium"
            >
              <template #checked>服务启用</template>
              <template #unchecked>服务停用</template>
            </n-switch>
          </div>

          <div class="form-item">
            <label class="form-label">
              <span>三方加密服务提供商类型 (Provider)</span>
              <span class="label-hint">定义后端调用的通讯协议与签名标准</span>
            </label>
            <n-select
              v-model:value="form.providerType"
              :options="providerOptions"
            />
          </div>

          <div class="form-item">
            <label class="form-label">
              <span>三方加密/签名服务地址 (Endpoint URL)</span>
              <span class="label-hint">必须为后端服务可达的内部网络或专用网关地址</span>
            </label>
            <n-input
              v-model:value="form.serviceUrl"
              placeholder="https://kms.custody-vault.internal/api/v1"
            >
              <template #prefix>
                <n-icon color="#64748b"><GlobeOutline /></n-icon>
              </template>
            </n-input>
            <!-- 快捷预设模版 -->
            <div class="quick-presets">
              <span class="presets-label">快速预设:</span>
              <button class="preset-pill preset-pill-rust" type="button" @click="applyRustPreset">
                自建 Rust 原生 KMS 节点 (:8550)
              </button>
              <button class="preset-pill" type="button" @click="form.serviceUrl = 'https://kms.custody-vault.internal/api/v1'">
                企业内部 KMS 专线
              </button>
              <button class="preset-pill" type="button" @click="form.serviceUrl = 'https://api.fireblocks-proxy.internal/v1'">
                Fireblocks 网关
              </button>
              <button class="preset-pill" type="button" @click="form.serviceUrl = 'http://127.0.0.1:8545/kms'">
                本地调试节点
              </button>
            </div>
          </div>

          <div class="form-item">
            <div class="label-with-action">
              <label class="form-label">
                <span>JWT 鉴权凭证 (Bearer Token / Secret)</span>
                <span class="label-hint">用于远程加密节点对业务后端身份与签名权限的双向校验</span>
              </label>
              <div class="token-btn-group">
                <button
                  type="button"
                  class="token-tool-btn"
                  @click="showTokenPlain = !showTokenPlain"
                  title="切换显示完整明文"
                >
                  <n-icon size="14" style="margin-right: 4px;">
                    <EyeOutline v-if="!showTokenPlain" />
                    <EyeOffOutline v-else />
                  </n-icon>
                  {{ showTokenPlain ? '隐藏明文' : '查看明文' }}
                </button>
                <button
                  type="button"
                  class="token-tool-btn"
                  @click="copyToken"
                  title="一键复制完整 Token"
                >
                  <n-icon size="14" style="margin-right: 4px;"><CopyOutline /></n-icon>
                  复制凭证
                </button>
              </div>
            </div>

            <n-input
              v-if="showTokenPlain"
              v-model:value="form.jwtToken"
              type="textarea"
              :rows="4"
              placeholder="输入完整的 JWT Token (如 eyJhbGciOi...)"
              class="font-mono"
            />
            <div v-else class="masked-token-box" @click="showTokenPlain = true">
              <span class="masked-text font-mono">{{ getDisplayMaskedToken() }}</span>
              <span class="masked-tip">（已安全脱敏，点击或右上角切换查看明文）</span>
            </div>
          </div>

          <!-- JWT 智能解析透视卡片 (Token Claims Inspector) -->
          <div v-if="config.tokenDetails" class="jwt-inspector-card">
            <div class="inspector-header">
              <div class="title-with-icon">
                <n-icon size="16" color="#3b82f6"><ShieldCheckmarkOutline /></n-icon>
                <span class="inspector-title">JWT 载荷透视与权限范围 (Claims Inspector)</span>
              </div>
              <span class="tag-subtle">已自动解码</span>
            </div>
            <div class="inspector-grid">
              <div class="inspector-item">
                <span class="inspector-label">算法 (alg)</span>
                <span class="inspector-val font-mono">{{ config.tokenDetails.algorithm }}</span>
              </div>
              <div class="inspector-item">
                <span class="inspector-label">签发机构 (iss)</span>
                <span class="inspector-val font-mono">{{ config.tokenDetails.issuer }}</span>
              </div>
              <div class="inspector-item">
                <span class="inspector-label">适用网络 (aud)</span>
                <span class="inspector-val">
                  <span v-for="aud in config.tokenDetails.audience" :key="aud" class="scope-pill">
                    {{ aud }}
                  </span>
                </span>
              </div>
              <div class="inspector-item">
                <span class="inspector-label">鉴权角色 (roles)</span>
                <span class="inspector-val">
                  <span v-for="role in config.tokenDetails.roles" :key="role" class="role-pill">
                    {{ role }}
                  </span>
                </span>
              </div>
              <div class="inspector-item">
                <span class="inspector-label">到期时间 (exp)</span>
                <span class="inspector-val font-mono">{{ formatTime(config.tokenDetails.expiresAt) }}</span>
              </div>
              <div class="inspector-item">
                <span class="inspector-label">凭证时效状态</span>
                <span class="inspector-val">
                  <span v-if="!config.tokenDetails.isExpired" class="status-valid">活跃生效中</span>
                  <span v-else class="status-expired">已失效</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右列：高可用风控参数 + 仿真压测实验室 -->
      <div class="form-column">
        <!-- 高可用与风控配置卡片 -->
        <div class="section-card">
          <div class="card-title-row">
            <div class="title-with-icon">
              <n-icon size="18" color="#3b82f6"><SettingsOutline /></n-icon>
              <span class="card-title">通信超时与高可用容灾策略</span>
            </div>
          </div>

          <div class="form-item">
            <div class="label-with-value">
              <label class="form-label">
                <span>请求超时阈值 (Timeout)</span>
                <span class="label-hint">超过该阈值时自动判定加密服务单次通信超时</span>
              </label>
              <span class="current-param-val">{{ form.timeoutMs }} ms</span>
            </div>
            <n-slider
              v-model:value="form.timeoutMs"
              :min="500"
              :max="15000"
              :step="500"
            />
          </div>

          <div class="form-item">
            <div class="label-with-value">
              <label class="form-label">
                <span>最大失败重试次数 (Retry Limit)</span>
                <span class="label-hint">针对网络抖动自动指数退避重试</span>
              </label>
              <span class="current-param-val">{{ form.retryCount }} 次</span>
            </div>
            <n-slider
              v-model:value="form.retryCount"
              :min="1"
              :max="5"
              :step="1"
            />
          </div>

          <div class="form-item">
            <label class="form-label">
              <span>节点通信异常熔断策略 (Fallback Strategy)</span>
              <span class="label-hint">当三方加密服务宕机或连续超时时的系统安全行为</span>
            </label>
            <n-select
              v-model:value="form.fallbackStrategy"
              :options="fallbackOptions"
            />
          </div>

          <div class="form-item-inline">
            <div>
              <div class="inline-title">强制 HTTPS / TLS 1.3 传输加密</div>
              <div class="inline-sub">阻断所有未通过 TLS 加密的纯 HTTP 明文加密调用请求</div>
            </div>
            <n-switch v-model:value="form.enforceHttps" />
          </div>
        </div>

        <!-- 仿真签名测试实验室 (Signature Sandbox) -->
        <div class="section-card">
          <div class="card-title-row">
            <div class="title-with-icon">
              <n-icon size="18" color="#3b82f6"><FlaskOutline /></n-icon>
              <span class="card-title">签名通道即时验证实验室 (Sandbox)</span>
            </div>
            <span class="tag-subtle">免出金真实压测</span>
          </div>
          <p class="sandbox-desc">
            无需真实发起链上转账，使用当前配置的三方服务与 JWT 凭证，实时向 Enclave 派发模拟交易签名指令，验证公链椭圆曲线签名通道的完整可用性。
          </p>

          <div class="sandbox-controls">
            <div class="sandbox-chain-select">
              <span class="sandbox-label">测试目标生态:</span>
              <n-radio-group v-model:value="testSignChain" name="signChainGroup" size="small">
                <n-radio-button value="EVM">EVM (Secp256k1)</n-radio-button>
                <n-radio-button value="SOLANA">Solana (Ed25519)</n-radio-button>
                <n-radio-button value="TRON">TRON (ECDSA)</n-radio-button>
              </n-radio-group>
            </div>

            <n-button
              secondary
              :loading="testingSign"
              @click="handleTestSign"
              class="btn-subtle"
            >
              <template #icon>
                <n-icon><FlaskOutline /></n-icon>
              </template>
              执行签名验证
            </n-button>
          </div>

          <!-- 签名结果反馈卡 -->
          <div v-if="signResult" class="sign-result-box">
            <div class="sign-res-header">
              <span class="sign-res-badge">签名验证成功 (耗时 {{ signResult.latencyMs }}ms)</span>
              <span class="sign-res-algo font-mono">{{ signResult.algorithm }}</span>
            </div>
            <div class="sign-res-body font-mono">
              <div class="sign-res-row">
                <span class="sign-res-k">KeyID:</span>
                <span class="sign-res-v">{{ signResult.keyId }}</span>
              </div>
              <div class="sign-res-row">
                <span class="sign-res-k">签名结果:</span>
                <span class="sign-res-v sign-hash">{{ signResult.signature }}</span>
                <button class="copy-small-btn" type="button" @click="copyText(signResult.signature)">复制</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 安全合规与密钥轮换指引卡 -->
        <div class="section-card security-guideline-card">
          <div class="card-title-row">
            <div class="title-with-icon">
              <n-icon size="18" color="#3b82f6"><ShieldCheckmarkOutline /></n-icon>
              <span class="card-title">Web3 生产级密钥合规指引</span>
            </div>
          </div>
          <ul class="guideline-list">
            <li><strong>自建 Rust 原生二进制 Enclave:</strong> 采用 Rust AOT 机器码编译加固（<code>strip="symbols"</code>、<code>lto=true</code>），签名私钥驻留独立金库进程，通过 <code>ZeroizeOnDrop</code> 特征实现物理内存瞬时置零。</li>
            <li><strong>物理 Enclave 隔离:</strong> 业务服务器仅发起 Payload 签名握手，绝不持久化任何私钥或助记词。</li>
            <li><strong>凭证定期轮换:</strong> 建议每 60~90 天在三方 KMS 控制台轮换 JWT Bearer Token 并在此同步更新。</li>
            <li><strong>网络边界约束:</strong> 确保三方加密服务 Endpoint 仅允许业务集群出口公网/私网 IP 白名单访问。</li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 底部：Enclave 内存私钥金库全景卡片 -->
    <div class="section-card keys-vault-card">
      <div class="card-title-row">
        <div>
          <div class="title-with-icon">
            <n-icon size="18" color="#3b82f6"><LockClosedOutline /></n-icon>
            <span class="card-title">Enclave 物理内存私钥金库 (Memory Key Inventory)</span>
          </div>
          <span class="card-sub-hint">私钥经 ZeroizeOnDrop 严格保护驻留于独立进程内存中，绝不持久化落盘，瞬时即用即焚</span>
        </div>
        <div class="header-actions">
          <n-button secondary size="small" :loading="loadingKeys" @click="fetchEnclaveKeys" class="btn-subtle">
            <template #icon>
              <n-icon><RefreshOutline /></n-icon>
            </template>
            刷新金库清单 ({{ enclaveKeys.length }})
          </n-button>
          <n-button type="primary" size="small" @click="showImportModal = true">
            <template #icon>
              <n-icon><AddOutline /></n-icon>
            </template>
            安全导入私钥至 Enclave
          </n-button>
        </div>
      </div>

      <!-- 托管密钥表格 -->
      <n-data-table
        :columns="keyColumns"
        :data="enclaveKeys"
        :loading="loadingKeys"
        :pagination="false"
        size="small"
      />
    </div>

    <!-- 导入私钥模态弹窗 -->
    <n-modal
      v-model:show="showImportModal"
      preset="card"
      title="安全导入出金私钥至 Enclave 物理内存金库"
      style="max-width: 620px; background: #111827; border: 1px solid #1e293b;"
    >
      <div class="modal-security-notice">
        <n-icon size="20" color="#3b82f6" style="margin-right: 10px; flex-shrink: 0;"><ShieldCheckmarkOutline /></n-icon>
        <div style="font-size: 13px; line-height: 1.5; color: #cbd5e1;">
          <strong style="color: #f8fafc;">零落盘安全承诺：</strong>
          私钥将直接注入 Rust 独立金库进程的受保护内存（<code>SecureSecretKey</code>），自动在底层通过椭圆曲线数学推导公链地址。任何数据库、日志与持久化磁盘均不会记录您的私钥明文。
        </div>
      </div>

      <n-form :model="importForm" label-placement="top" style="margin-top: 18px;">
        <n-form-item label="公链网络生态 (EVM / Solana / Tron)" required>
          <n-radio-group v-model:value="importForm.chain" size="medium">
            <n-radio-button value="EVM">EVM 生态 (Ethereum/BSC/Base)</n-radio-button>
            <n-radio-button value="SOLANA">Solana 生态</n-radio-button>
            <n-radio-button value="TRON">TRON 波场生态</n-radio-button>
          </n-radio-group>
        </n-form-item>

        <n-form-item label="密钥别名 Key ID (可选自定义标识)">
          <n-input
            v-model:value="importForm.keyId"
            placeholder="如: evm-treasury-hot-02 (留空则自动生成)"
          />
        </n-form-item>

        <n-form-item label="出款私钥明文 / 助记词种子 (32 字节)" required>
          <n-input
            v-model:value="importForm.privateKey"
            type="password"
            show-password-on="click"
            placeholder="EVM/TRON: 0x 开头 64 位 Hex 字符串 / Solana: Base58 或 Hex 种子"
          />
          <!-- 快速填充测试私钥预设 -->
          <div class="quick-presets" style="margin-top: 8px;">
            <span class="presets-label">测试私钥快速填充:</span>
            <button class="preset-pill" type="button" @click="fillTestKey('EVM')">
              Hardhat #0 (0xf39F...2266)
            </button>
            <button class="preset-pill" type="button" @click="fillTestKey('TRON')">
              波场测试私钥
            </button>
            <button class="preset-pill" type="button" @click="fillTestKey('SOLANA')">
              Solana 测试私钥
            </button>
          </div>
        </n-form-item>

        <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px;">
          <n-button @click="showImportModal = false">取消</n-button>
          <n-button
            type="primary"
            :loading="importing"
            @click="handleImportKey"
          >
            确认导入至 Enclave 物理内存
          </n-button>
        </div>
      </n-form>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, h } from 'vue';
import { useMessage, NTag, NButton, NPopconfirm, type DataTableColumns } from 'naive-ui';
import {
  LockClosedOutline,
  KeyOutline,
  PulseOutline,
  SaveOutline,
  ShieldCheckmarkOutline,
  GlobeOutline,
  EyeOutline,
  EyeOffOutline,
  CopyOutline,
  CheckmarkCircleOutline,
  AlertCircleOutline,
  FlaskOutline,
  SettingsOutline,
  RefreshOutline,
  AddOutline,
} from '@vicons/ionicons5';
import {
  adminClient,
  type EncryptionServiceConfig,
  type ConnectionTestResult,
  type TestSignResult,
  type EnclaveKeyItem,
} from '../api/adminClient';

const message = useMessage();

// 加载状态
const loading = ref(false);
const saving = ref(false);
const testingConnection = ref(false);
const testingSign = ref(false);

// 凭证显隐控制
const showTokenPlain = ref(false);

// Enclave 内存私钥金库管理
const enclaveKeys = ref<EnclaveKeyItem[]>([]);
const loadingKeys = ref(false);
const showImportModal = ref(false);
const importing = ref(false);
const importForm = reactive({
  chain: 'EVM',
  keyId: '',
  privateKey: '',
});

// 探测结果与签名结果
const probeFeedback = ref<ConnectionTestResult | null>(null);
const signResult = ref<TestSignResult | null>(null);
const testSignChain = ref<'EVM' | 'SOLANA' | 'TRON'>('EVM');

// 完整服务端配置对象
const config = ref<EncryptionServiceConfig>({
  serviceUrl: 'https://kms.custody-vault.internal/api/v1',
  jwtToken: '',
  providerType: 'CUSTOM_KMS',
  isActive: true,
  timeoutMs: 5000,
  retryCount: 3,
  supportedAlgorithms: ['Secp256k1', 'Ed25519', 'AES-256-GCM'],
  fallbackStrategy: 'REJECT_ALL',
  enforceHttps: true,
  updatedAt: Date.now(),
  updatedBy: 'SYSTEM',
  lastStatus: 'ONLINE',
  lastLatencyMs: 38,
  serverVersion: 'v2.8.4-hsm-enclave',
});

// 表单输入响应式数据
const form = reactive({
  serviceUrl: '',
  jwtToken: '',
  providerType: 'CUSTOM_KMS' as EncryptionServiceConfig['providerType'],
  isActive: true,
  timeoutMs: 5000,
  retryCount: 3,
  fallbackStrategy: 'REJECT_ALL' as 'REJECT_ALL' | 'LOCAL_BACKUP',
  enforceHttps: true,
});

// 选项配置
const providerOptions = [
  { label: '自建 Rust 原生二进制 KMS Enclave (物理内存置零 / 1ms 延迟)', value: 'CUSTOM_KMS' },
  { label: 'Fireblocks 机构级 MPC 签名托管节点', value: 'FIREBLOCKS_MPC' },
  { label: 'HashiCorp Vault Transit Engine', value: 'HASHICORP_VAULT' },
  { label: 'AWS KMS CloudHSM Enclave 专线', value: 'AWS_KMS' },
];

const fallbackOptions = [
  { label: '严格熔断 (REJECT_ALL) - 故障时拒绝所有提现签名，资金绝对安全', value: 'REJECT_ALL' },
  { label: '降级本地 (LOCAL_BACKUP) - 切换至离线冷热备用签名通道', value: 'LOCAL_BACKUP' },
];

function applyRustPreset() {
  form.serviceUrl = 'http://127.0.0.1:8550';
  form.providerType = 'CUSTOM_KMS';
  form.enforceHttps = false;
  message.info('已载入自建 Rust 原生 KMS 节点预设 (http://127.0.0.1:8550)');
}

function getProviderLabel(type: string): string {
  switch (type) {
    case 'FIREBLOCKS_MPC':
      return 'Fireblocks MPC 机构级托管';
    case 'HASHICORP_VAULT':
      return 'HashiCorp Vault Transit';
    case 'AWS_KMS':
      return 'AWS KMS CloudHSM';
    default:
      return '自建 Rust 原生二进制 KMS (Zeroize Enclave)';
  }
}

function getDisplayMaskedToken(): string {
  if (config.value.maskedJwtToken) return config.value.maskedJwtToken;
  if (!form.jwtToken) return '未配置凭证';
  if (form.jwtToken.length <= 16) return '••••••••••••••••';
  return `${form.jwtToken.slice(0, 12)}...${form.jwtToken.slice(-6)}`;
}

function getRemainingDays(expTimestamp?: number): number {
  if (!expTimestamp) return 180;
  const diffMs = expTimestamp - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return '从未';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

async function loadData() {
  loading.value = true;
  try {
    const data = await adminClient.getEncryptionConfig();
    config.value = data;
    form.serviceUrl = data.serviceUrl;
    form.jwtToken = data.jwtToken;
    form.providerType = data.providerType;
    form.isActive = data.isActive;
    form.timeoutMs = data.timeoutMs;
    form.retryCount = data.retryCount;
    form.fallbackStrategy = data.fallbackStrategy;
    form.enforceHttps = data.enforceHttps;
  } catch (err: any) {
    message.error(`加载三方加密配置失败: ${err.message}`);
  } finally {
    loading.value = false;
  }
}

async function handleSaveConfig() {
  saving.value = true;
  try {
    const updated = await adminClient.updateEncryptionConfig({
      serviceUrl: form.serviceUrl,
      jwtToken: form.jwtToken,
      providerType: form.providerType,
      isActive: form.isActive,
      timeoutMs: form.timeoutMs,
      retryCount: form.retryCount,
      fallbackStrategy: form.fallbackStrategy,
      enforceHttps: form.enforceHttps,
    });
    config.value = updated;
    message.success('签名服务配置已成功保存并立即生效');
  } catch (err: any) {
    message.error(`保存配置失败: ${err.message}`);
  } finally {
    saving.value = false;
  }
}

async function handleTestConnection() {
  testingConnection.value = true;
  try {
    const res = await adminClient.testEncryptionConnection({
      serviceUrl: form.serviceUrl,
      jwtToken: form.jwtToken,
      timeoutMs: form.timeoutMs,
    });
    probeFeedback.value = res;
    if (res.success) {
      message.success(`握手测试成功: 延迟 ${res.latencyMs}ms，节点在线`);
    } else {
      message.warning(`握手测试未通过: ${res.message}`);
    }
    await loadData();
  } catch (err: any) {
    message.error(`测试请求发生异常: ${err.message}`);
  } finally {
    testingConnection.value = false;
  }
}

async function handleTestSign() {
  testingSign.value = true;
  try {
    const res = await adminClient.testEncryptionSign({
      chain: testSignChain.value,
      payload: 'sample_raw_tx_payload',
    });
    signResult.value = res;
    message.success(`[${res.chain}] 仿真签名成功 (${res.latencyMs}ms)`);
  } catch (err: any) {
    message.error(`仿真签名测试失败: ${err.message}`);
  } finally {
    testingSign.value = false;
  }
}

function copyToken() {
  const tokenToCopy = form.jwtToken || config.value.jwtToken;
  if (!tokenToCopy) {
    message.warning('无凭证可复制');
    return;
  }
  navigator.clipboard.writeText(tokenToCopy).then(() => {
    message.success('完整 JWT Token 凭证已复制到剪贴板');
  });
}

function copyText(txt: string) {
  navigator.clipboard.writeText(txt).then(() => {
    message.success('已复制到剪贴板');
  });
}

async function fetchEnclaveKeys() {
  loadingKeys.value = true;
  try {
    const res = await adminClient.getEnclaveKeys();
    enclaveKeys.value = res.keys || [];
  } catch (err: any) {
    message.warning(`获取 Enclave 密钥池提示: ${err.message}`);
  } finally {
    loadingKeys.value = false;
  }
}

async function handleImportKey() {
  if (!importForm.privateKey.trim()) {
    message.error('请填写私钥内容');
    return;
  }
  importing.value = true;
  try {
    const res = await adminClient.importEnclaveKey({
      chain: importForm.chain,
      privateKey: importForm.privateKey.trim(),
      keyId: importForm.keyId.trim() || undefined,
    });
    message.success(res.message || `成功导入私钥至 Enclave 物理内存！推导地址: ${res.key?.address}`);
    showImportModal.value = false;
    importForm.privateKey = '';
    importForm.keyId = '';
    await fetchEnclaveKeys();
  } catch (err: any) {
    message.error(`导入私钥失败: ${err.message}`);
  } finally {
    importing.value = false;
  }
}

function fillTestKey(chain: 'EVM' | 'TRON' | 'SOLANA') {
  importForm.chain = chain;
  if (chain === 'EVM') {
    importForm.privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    importForm.keyId = 'evm-treasury-test-01';
  } else if (chain === 'TRON') {
    importForm.privateKey = '0x855260f80749e10751306097731e3feac4477122509dc1ea4f2b89249e7086ff';
    importForm.keyId = 'tron-treasury-test-01';
  } else {
    importForm.privateKey = '0x0102030405060708091011121314151617181920212223242526272829303132';
    importForm.keyId = 'solana-treasury-test-01';
  }
}

async function handleDeleteKey(keyId: string) {
  try {
    const res = await adminClient.deleteEnclaveKey(keyId);
    message.success(res.message || `密钥 [${keyId}] 已从 Enclave 物理内存中彻底销毁并覆写置零`);
    await fetchEnclaveKeys();
  } catch (err: any) {
    message.error(`销毁密钥失败: ${err.message}`);
  }
}

const keyColumns: DataTableColumns<EnclaveKeyItem> = [
  {
    title: '生态',
    key: 'chain',
    width: 90,
    render(row) {
      const type = row.chain === 'SOLANA' ? 'warning' : row.chain === 'TRON' ? 'error' : 'info';
      return h(NTag, { size: 'small', type, round: true }, () => row.chain);
    },
  },
  {
    title: 'Key ID',
    key: 'keyId',
    width: 190,
    render(row) {
      return h('span', { class: 'font-mono text-key-id' }, row.keyId);
    },
  },
  {
    title: '推导链上地址 (Address)',
    key: 'address',
    render(row) {
      return h('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
        h('span', { class: 'font-mono text-address' }, row.address),
        h(
          'button',
          {
            class: 'copy-small-btn',
            type: 'button',
            onClick: () => copyText(row.address),
          },
          '复制'
        ),
      ]);
    },
  },
  {
    title: '原生加密算法',
    key: 'algorithm',
    width: 200,
    render(row) {
      return h('span', { class: 'font-mono text-muted-algo' }, row.algorithm);
    },
  },
  {
    title: '物理内存状态',
    key: 'status',
    width: 160,
    render() {
      return h(
        'span',
        { class: 'memory-status-badge' },
        [
          h('span', { class: 'status-dot-green' }),
          'Zeroize 保护中',
        ]
      );
    },
  },
  {
    title: '安全管理操作',
    key: 'actions',
    width: 180,
    render(row) {
      return h('div', { style: 'display: flex; gap: 8px; align-items: center;' }, [
        h(
          NButton,
          {
            size: 'tiny',
            secondary: true,
            type: 'info',
            onClick: () => {
              testSignChain.value = (row.chain.toUpperCase() === 'SOLANA' ? 'SOLANA' : row.chain.toUpperCase() === 'TRON' ? 'TRON' : 'EVM') as any;
              handleTestSign();
            },
          },
          () => '仿真加签'
        ),
        h(
          NPopconfirm,
          {
            positiveText: '确认永久销毁',
            negativeText: '取消',
            onPositiveClick: () => handleDeleteKey(row.keyId),
          },
          {
            trigger: () =>
              h(
                NButton,
                {
                  size: 'tiny',
                  secondary: true,
                  type: 'error',
                },
                () => '彻底销毁'
              ),
            default: () =>
              `确定从 Enclave 物理内存中销毁密钥 [${row.keyId}]？此操作将触发 ZeroizeOnDrop 物理覆写置零，销毁后将无法再执行任何出金加签！`,
          }
        ),
      ]);
    },
  },
];

onMounted(() => {
  loadData();
  fetchEnclaveKeys();
});
</script>

<style scoped>
.encryption-config-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 20px;
  border-bottom: 1px solid #1e293b;
}

.page-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: #f8fafc;
  margin: 0;
  letter-spacing: -0.02em;
}

.title-icon {
  display: flex;
  align-items: center;
}

.page-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0;
  line-height: 1.5;
  max-width: 900px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-subtle {
  background: #1e293b;
  border: 1px solid #334155;
  color: #f8fafc;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 3px 9px;
  border-radius: 6px;
  font-weight: 500;
}

.status-badge-active {
  background: rgba(16, 185, 129, 0.12);
  color: #10b981;
}

.status-badge-inactive {
  background: rgba(245, 158, 11, 0.12);
  color: #f59e0b;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.dot-amber {
  background: #f59e0b;
}

/* Metrics Grid */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 1024px) {
  .metrics-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }
}

.metric-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
}

.metric-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.metric-label {
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.metric-status-badge {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  font-weight: 600;
}

.badge-online {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.badge-offline {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.engine-tag {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #1e293b;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
}

.algo-count-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.metric-main-value {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 10px;
}

.latency-num, .days-num {
  font-size: 26px;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1;
  font-family: 'JetBrains Mono', monospace;
}

.latency-unit {
  font-size: 12px;
  color: #64748b;
}

.text-accent {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
  margin-bottom: 12px;
}

.metric-chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}

.algo-pill {
  font-size: 11px;
  background: #1e293b;
  color: #cbd5e1;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.metric-footer-text {
  font-size: 11px;
  color: #64748b;
  padding-top: 8px;
  border-top: 1px solid #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot-sep {
  color: #475569;
}

/* Probe Banner */
.probe-banner {
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.probe-banner-success {
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #34d399;
}

.probe-banner-error {
  background: rgba(239, 68, 68, 0.08);
  border: 1px solid rgba(239, 68, 68, 0.25);
  color: #f87171;
}

.probe-banner-content {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.enclave-tag {
  margin-left: 10px;
  background: #1e293b;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  color: #cbd5e1;
  font-family: 'JetBrains Mono', monospace;
}

.probe-banner-meta {
  font-size: 12px;
  opacity: 0.8;
  font-family: 'JetBrains Mono', monospace;
}

/* Main Form Grid */
.main-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 900px) {
  .main-form-grid {
    grid-template-columns: 1fr;
  }
}

.form-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 20px;
}

.card-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.title-with-icon {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #f8fafc;
}

.card-sub-hint {
  display: block;
  font-size: 12px;
  color: #64748b;
  margin-top: 4px;
}

.tag-subtle {
  font-size: 11px;
  color: #64748b;
  background: #0f172a;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid #1e293b;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
}

.label-hint {
  font-size: 11px;
  color: #64748b;
  font-weight: 400;
}

.label-with-value, .label-with-action {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 6px;
}

.current-param-val {
  font-size: 13px;
  font-weight: 600;
  color: #3b82f6;
  font-family: 'JetBrains Mono', monospace;
}

.quick-presets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.presets-label {
  font-size: 11px;
  color: #64748b;
}

.preset-pill {
  background: #0e1420;
  border: 1px solid #1e293b;
  border-radius: 4px;
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.preset-pill:hover {
  background: #1e293b;
  color: #f8fafc;
  border-color: #334155;
}

.preset-pill-rust {
  color: #60a5fa;
  border-color: rgba(59, 130, 246, 0.3);
}

.preset-pill-rust:hover {
  background: rgba(59, 130, 246, 0.1);
  color: #93c5fd;
  border-color: #3b82f6;
}

.token-btn-group {
  display: flex;
  gap: 8px;
}

.token-tool-btn {
  display: inline-flex;
  align-items: center;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 4px;
  color: #cbd5e1;
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
}

.token-tool-btn:hover {
  background: #334155;
  color: #fff;
}

.masked-token-box {
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
}

.masked-text {
  color: #94a3b8;
  font-size: 13px;
  letter-spacing: 0.05em;
}

.masked-tip {
  font-size: 11px;
  color: #64748b;
}

.jwt-inspector-card {
  margin-top: 14px;
  background: #0b0f17;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 14px;
}

.inspector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 10px;
  border-bottom: 1px solid #1e293b;
  margin-bottom: 12px;
}

.inspector-title {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
}

.inspector-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.inspector-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.inspector-label {
  font-size: 11px;
  color: #64748b;
}

.inspector-val {
  font-size: 12px;
  color: #cbd5e1;
}

.scope-pill, .role-pill {
  display: inline-block;
  background: #1e293b;
  color: #cbd5e1;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  margin-right: 4px;
  font-family: 'JetBrains Mono', monospace;
}

.status-valid {
  color: #10b981;
  font-weight: 500;
}

.status-expired {
  color: #ef4444;
  font-weight: 500;
}

.form-item-inline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 14px;
  border-top: 1px solid #1e293b;
}

.inline-title {
  font-size: 13px;
  font-weight: 500;
  color: #f8fafc;
}

.inline-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

/* Sandbox */
.sandbox-desc {
  font-size: 12px;
  color: #94a3b8;
  margin: 0 0 14px 0;
  line-height: 1.5;
}

.sandbox-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  background: #0b0f17;
  border: 1px solid #1e293b;
  padding: 12px 14px;
  border-radius: 6px;
  margin-bottom: 14px;
}

.sandbox-chain-select {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.sandbox-label {
  font-size: 12px;
  color: #94a3b8;
  white-space: nowrap;
}

.sign-result-box {
  background: #0b0f17;
  border: 1px solid rgba(16, 185, 129, 0.3);
  border-radius: 6px;
  padding: 12px 14px;
}

.sign-res-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #1e293b;
}

.sign-res-badge {
  font-size: 12px;
  font-weight: 600;
  color: #10b981;
}

.sign-res-algo {
  font-size: 11px;
  color: #64748b;
}

.sign-res-body {
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sign-res-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sign-res-k {
  color: #64748b;
  min-width: 60px;
}

.sign-res-v {
  color: #e2e8f0;
}

.sign-hash {
  word-break: break-all;
  color: #60a5fa;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-small-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: auto;
}

.copy-small-btn:hover {
  background: #334155;
  color: #fff;
}

/* Security Guideline */
.security-guideline-card {
  background: #0b0f17;
  border: 1px solid #1e293b;
}

.guideline-list {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
}

.guideline-list li {
  margin-bottom: 6px;
}

.guideline-list strong {
  color: #f1f5f9;
}

/* Enclave Keys Table styling */
.text-key-id {
  color: #60a5fa;
  font-weight: 600;
  font-size: 12px;
}

.text-address {
  color: #f8fafc;
  font-size: 12px;
}

.text-muted-algo {
  color: #64748b;
  font-size: 12px;
}

.memory-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #10b981;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.status-dot-green {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #10b981;
}

.modal-security-notice {
  display: flex;
  align-items: flex-start;
  background: rgba(59, 130, 246, 0.08);
  border: 1px solid rgba(59, 130, 246, 0.2);
  padding: 12px 14px;
  border-radius: 6px;
}

.font-mono {
  font-family: 'JetBrains Mono', SFMono-Regular, Consolas, monospace;
}
</style>
