import CryptoJS from 'crypto-js';
import {
  APP_TOKEN_SECRET,
  DOMAIN_SERVICE_SECRET,
  FALLBACK_APP_VERSION,
} from '../constants';

export function md5Hex(value: string): string {
  return CryptoJS.MD5(value).toString(CryptoJS.enc.Hex);
}

export function createToken(
  timestamp: string | number,
  version = FALLBACK_APP_VERSION,
  secret = APP_TOKEN_SECRET,
): { token: string; tokenparam: string } {
  const ts = String(timestamp);
  return {
    token: md5Hex(`${ts}${secret}`),
    tokenparam: `${ts},${version}`,
  };
}

export function decryptApiData(
  encoded: string,
  timestamp: string | number,
  secret = APP_TOKEN_SECRET,
): string {
  try {
    const key = CryptoJS.enc.Utf8.parse(md5Hex(`${timestamp}${secret}`));
    const ciphertext = CryptoJS.enc.Base64.parse(encoded.trim());
    const params = CryptoJS.lib.CipherParams.create({ ciphertext });
    const bytes = CryptoJS.AES.decrypt(params, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const decoded = bytes.toString(CryptoJS.enc.Utf8);
    if (!decoded) throw new Error('empty plaintext');
    return decoded;
  } catch (cause) {
    throw new Error('JM 响应解密失败，上游协议或密钥可能已经变更。', { cause });
  }
}

export function decryptDomainService(encoded: string): string {
  const clean = [...encoded].findIndex((char) => char.charCodeAt(0) < 128);
  return decryptApiData(clean < 0 ? encoded : encoded.slice(clean), '', DOMAIN_SERVICE_SECRET);
}

export function extractJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('响应中没有完整 JSON 对象。');
  return JSON.parse(text.slice(start, end + 1));
}

export function decodeApiEnvelope(raw: unknown, timestamp: string | number): unknown {
  const envelope =
    typeof raw === 'string' ? (extractJsonObject(raw) as Record<string, unknown>) : raw as Record<string, unknown>;
  if (!envelope || typeof envelope !== 'object') throw new Error('JM API 返回格式无效。');
  const code = Number(envelope.code);
  if (code !== 200) {
    const message = String(envelope.errorMsg || `JM API 返回状态 ${code || '未知'}`);
    throw new Error(message);
  }
  if (Array.isArray(envelope.data)) {
    if (envelope.data.length === 0) throw new Error(String(envelope.errorMsg || 'JM API 没有返回数据。'));
    return envelope.data;
  }
  if (typeof envelope.data !== 'string') throw new Error('JM API 缺少加密数据。');
  return JSON.parse(decryptApiData(envelope.data, timestamp));
}
