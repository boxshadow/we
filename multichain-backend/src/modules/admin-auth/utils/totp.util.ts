import crypto from 'node:crypto';
import QRCode from 'qrcode';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Base32 解码为 Buffer (RFC 4648)
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

/**
 * Buffer 编码为 Base32 字符串 (RFC 4648)
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * 生成 16 字节随机密钥的 Base32 编码 (供 Google 身份验证器使用)
 */
export function generateTwoFactorSecret(): string {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * 根据 Base32 密钥和时间戳生成标准 6 位 TOTP 动态码 (RFC 6238, HMAC-SHA1)
 */
export function generateTOTP(secretBase32: string, timeMs: number = Date.now()): string {
  const key = base32Decode(secretBase32);
  const counter = Math.floor(timeMs / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1000000).toString().padStart(6, '0');
}

/**
 * 校验用户输入的 6 位 Google 二次验证码 (容差窗口默认 +-1 个步长，即 +-30 秒)
 */
export function verifyTOTP(
  inputCode: string,
  secretBase32: string,
  window: number = 1,
  timeMs: number = Date.now(),
): boolean {
  if (!inputCode || inputCode.trim().length !== 6) {
    return false;
  }

  const cleanCode = inputCode.trim();
  const currentCounter = Math.floor(timeMs / 1000 / 30);

  for (let error = -window; error <= window; error++) {
    const testTime = (currentCounter + error) * 30 * 1000;
    try {
      const expectedCode = generateTOTP(secretBase32, testTime);
      if (crypto.timingSafeEqual(Buffer.from(cleanCode), Buffer.from(expectedCode))) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * 生成 Google 身份验证器规范的 otpauth URI
 */
export function getOtpAuthUri(
  username: string,
  secretBase32: string,
  issuer: string = 'CyberAdmin',
): string {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${label}?secret=${secretBase32}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * 生成绑定二维码 Data URL (Base64 PNG)
 */
export async function generateQrCodeDataUrl(otpAuthUri: string): Promise<string> {
  return QRCode.toDataURL(otpAuthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    color: {
      dark: '#00e5ff',
      light: '#0b111e',
    },
  });
}
