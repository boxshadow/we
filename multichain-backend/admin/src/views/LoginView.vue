<template>
  <div class="login-container">
    <div class="ambient-glow"></div>

    <div class="login-card-wrapper">
      <div class="login-card">
        <!-- Logo & Header -->
        <div class="login-header">
          <div class="logo-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 class="system-title">Web3 Custody Admin</h1>
          <p class="system-subtitle">多链资产管理与风控系统</p>
        </div>

        <!-- Login Form -->
        <n-form
          ref="formRef"
          :model="formValue"
          :rules="rules"
          size="large"
          class="login-form"
          @submit.prevent="handleLogin"
        >
          <n-form-item path="username" label="账号">
            <n-input
              v-model:value="formValue.username"
              placeholder="请输入账号"
              clearable
              :disabled="loading"
              @keydown.enter="handleLogin"
            >
              <template #prefix>
                <n-icon :component="PersonOutline" class="input-icon" />
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="password" label="口令">
            <n-input
              v-model:value="formValue.password"
              type="password"
              show-password-on="click"
              placeholder="请输入密码"
              clearable
              :disabled="loading"
              @keydown.enter="handleLogin"
            >
              <template #prefix>
                <n-icon :component="LockClosedOutline" class="input-icon" />
              </template>
            </n-input>
          </n-form-item>

          <n-form-item path="twoFactorCode" label="Google 身份验证码">
            <n-input
              ref="twoFactorInputRef"
              v-model:value="formValue.twoFactorCode"
              placeholder="6 位动态验证码 (首次登录留空)"
              maxlength="6"
              clearable
              :disabled="loading"
              @keydown.enter="handleLogin"
            >
              <template #prefix>
                <n-icon :component="KeyOutline" class="input-icon" />
              </template>
            </n-input>
          </n-form-item>

          <div class="form-actions">
            <n-button
              type="primary"
              block
              size="large"
              :loading="loading"
              class="submit-btn"
              @click="handleLogin"
            >
              登录
            </n-button>
          </div>
        </n-form>
      </div>
    </div>

    <!-- 首次登录 2FA 绑定弹窗 (Mandatory Onboarding Modal) -->
    <n-modal
      v-model:show="showSetupModal"
      :mask-closable="false"
      preset="card"
      title="安全初始化：绑定 Google 身份验证器"
      style="width: 440px; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;"
    >
      <div class="setup-modal-content">
        <p class="setup-desc">
          检测到账号首次登录，必须使用 Google Authenticator 或其他支持 TOTP 的验证器扫码绑定后方可进入系统。
        </p>

        <div class="qr-container">
          <img
            v-if="setupData.qrCodeDataUrl"
            :src="setupData.qrCodeDataUrl"
            alt="2FA QR Code"
            class="qr-image"
          />
          <div v-else class="qr-placeholder">正在生成密钥二维码...</div>
        </div>

        <div class="secret-box">
          <div class="secret-header">
            <span class="secret-title">手动录入密钥 (Base32)</span>
            <n-button text size="tiny" type="info" @click="copySecret(setupData.secret)">
              复制密钥
            </n-button>
          </div>
          <div class="secret-code"><code>{{ setupData.secret }}</code></div>
        </div>

        <div class="confirm-box">
          <div class="confirm-label">输入手机验证器显示的 6 位验证码</div>
          <n-input
            v-model:value="setupTwoFactorCode"
            placeholder="6 位数字"
            maxlength="6"
            size="large"
            clearable
            :disabled="setupLoading"
            @keydown.enter="handleConfirmSetup"
          >
            <template #prefix>
              <n-icon :component="KeyOutline" class="input-icon" />
            </template>
          </n-input>
        </div>

        <div class="setup-actions">
          <n-button
            type="primary"
            block
            size="large"
            :loading="setupLoading"
            class="submit-btn"
            @click="handleConfirmSetup"
          >
            完成绑定并进入系统
          </n-button>
          <div class="cancel-action">
            <n-button text size="small" @click="showSetupModal = false">
              取消并返回
            </n-button>
          </div>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useMessage, type FormInst } from 'naive-ui';
import {
  PersonOutline,
  LockClosedOutline,
  KeyOutline,
} from '@vicons/ionicons5';
import { adminAuthClient } from '../api/adminClient';

const router = useRouter();
const message = useMessage();
const formRef = ref<FormInst | null>(null);
const twoFactorInputRef = ref<any>(null);

const loading = ref(false);

// 首次登录扫码绑定状态
const showSetupModal = ref(false);
const setupLoading = ref(false);
const setupTwoFactorCode = ref('');
const setupData = reactive({
  setupToken: '',
  username: '',
  secret: '',
  otpAuthUri: '',
  qrCodeDataUrl: '',
});

const formValue = reactive({
  username: '',
  password: '',
  twoFactorCode: '',
});

const rules = {
  username: {
    required: true,
    message: '请输入账号',
    trigger: ['blur', 'input'],
  },
  password: {
    required: true,
    message: '请输入密码',
    trigger: ['blur', 'input'],
  },
};

onMounted(() => {
  if (adminAuthClient.isAuthenticated()) {
    router.replace('/');
  }
});

/**
 * 账号口令及 2FA 登录处理
 */
async function handleLogin() {
  formRef.value?.validate(async (errors) => {
    if (errors) return;

    loading.value = true;
    try {
      const res = await adminAuthClient.login({
        username: formValue.username.trim(),
        password: formValue.password,
        twoFactorCode: formValue.twoFactorCode.trim(),
      });

      // 分支 1: 账号首次登录，必须先扫码绑定 2FA
      if ('requireTwoFactorSetup' in res && res.requireTwoFactorSetup) {
        setupData.setupToken = res.setupToken;
        setupData.username = res.username;
        setupData.secret = res.secret;
        setupData.otpAuthUri = res.otpAuthUri;
        setupData.qrCodeDataUrl = res.qrCodeDataUrl;
        setupTwoFactorCode.value = '';
        showSetupModal.value = true;
        message.info('首次登录需要绑定 Google 身份验证器');
        return;
      }

      // 分支 2: 账号已绑定 2FA，但用户未输入 6 位验证码
      if ('requireTwoFactorCode' in res && res.requireTwoFactorCode) {
        message.warning('请输入 Google 身份验证码');
        nextTick(() => {
          twoFactorInputRef.value?.focus();
        });
        return;
      }

      // 分支 3: 登录成功
      if ('accessToken' in res) {
        message.success('登录成功');
        router.replace('/');
      }
    } catch (err: any) {
      message.error(err.message || '登录失败，请核对信息');
    } finally {
      loading.value = false;
    }
  });
}

/**
 * 首次登录绑定并激活 2FA
 */
async function handleConfirmSetup() {
  if (!setupTwoFactorCode.value || setupTwoFactorCode.value.trim().length !== 6) {
    message.warning('请输入 6 位动态验证码');
    return;
  }

  setupLoading.value = true;
  try {
    await adminAuthClient.confirm2faSetup(
      setupData.setupToken,
      setupTwoFactorCode.value.trim(),
    );
    showSetupModal.value = false;
    message.success('身份验证器绑定成功');
    router.replace('/');
  } catch (err: any) {
    message.error(err.message || '绑定失败，请核对动态验证码');
  } finally {
    setupLoading.value = false;
  }
}

function copySecret(text: string) {
  if (!text) return;
  navigator.clipboard.writeText(text);
  message.success('密钥已复制到剪贴板');
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  width: 100vw;
  background: #0b0f17;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.ambient-glow {
  position: absolute;
  width: 600px;
  height: 600px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 248, 0.06) 0%, rgba(11, 15, 23, 0) 70%);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.login-card-wrapper {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 400px;
  padding: 24px;
}

.login-card {
  background: #111827;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 32px 28px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
}

.login-header {
  text-align: center;
  margin-bottom: 28px;
}

.logo-box {
  width: 44px;
  height: 44px;
  margin: 0 auto 12px;
  background: rgba(56, 189, 248, 0.08);
  border: 1px solid rgba(56, 189, 248, 0.2);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.system-title {
  margin: 0 0 6px;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #f8fafc;
}

.system-subtitle {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.login-form {
  margin-top: 4px;
}

:deep(.n-form-item) {
  margin-bottom: 18px;
}

:deep(.n-form-item-label) {
  font-size: 13px;
  font-weight: 500;
  color: #94a3b8;
  padding-bottom: 6px;
}

:deep(.n-input) {
  background: #0b0f17 !important;
  border-color: #1e293b !important;
  border-radius: 8px !important;
}

:deep(.n-input:hover) {
  border-color: #334155 !important;
}

:deep(.n-input.n-input--focus) {
  border-color: #38bdf8 !important;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15) !important;
}

.input-icon {
  color: #64748b;
  font-size: 16px;
}

.form-actions {
  margin-top: 24px;
}

.submit-btn {
  background: #2563eb !important;
  color: #ffffff !important;
  font-weight: 500;
  border: none !important;
  border-radius: 8px !important;
  transition: all 0.15s ease;
}

.submit-btn:hover {
  background: #1d4ed8 !important;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
}

.setup-modal-content {
  text-align: center;
}

.setup-desc {
  font-size: 13px;
  color: #94a3b8;
  margin: 0 0 16px;
  line-height: 1.5;
  text-align: left;
}

.qr-container {
  display: inline-block;
  padding: 12px;
  background: #0b0f17;
  border-radius: 10px;
  border: 1px solid #1e293b;
  margin-bottom: 16px;
}

.qr-image {
  width: 170px;
  height: 170px;
  display: block;
}

.qr-placeholder {
  width: 170px;
  height: 170px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 12px;
}

.secret-box {
  background: #0b0f17;
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #1e293b;
  margin-bottom: 16px;
  text-align: left;
}

.secret-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.secret-title {
  font-size: 11px;
  color: #64748b;
}

.secret-code code {
  font-size: 13px;
  color: #38bdf8;
  font-family: 'JetBrains Mono', monospace;
  letter-spacing: 1.2px;
}

.confirm-box {
  margin-bottom: 20px;
  text-align: left;
}

.confirm-label {
  font-size: 12px;
  font-weight: 500;
  color: #cbd5e1;
  margin-bottom: 6px;
}

.setup-actions {
  margin-top: 8px;
}

.cancel-action {
  margin-top: 10px;
  text-align: center;
}
</style>
