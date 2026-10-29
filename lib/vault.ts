'use client';

/**
 * Enterprise Encrypted Local Metadata Vault & State Protection Safeguard
 * Master Blueprint PMUSIC Architecture - Batch 3 (Poin 55 & 96)
 *
 * Guarantees:
 * 1. Hardware-accelerated AES-GCM 256-bit encryption via Web Crypto API.
 * 2. Deterministic PBKDF2 device-unique key derivation with SHA-256.
 * 3. Transparent fallback for older browser engines.
 * 4. Poin 96: State integrity verification with schema validation & safe fallbacks.
 */

const VAULT_SALT_KEY = 'pmusic_vault_salt_v1';
const VAULT_ITERATIONS = 10000;

function getDeviceSalt(): Uint8Array {
  if (typeof window === 'undefined') return new Uint8Array(16);
  try {
    let saltHex = localStorage.getItem(VAULT_SALT_KEY);
    if (!saltHex || saltHex.length !== 32) {
      const salt = new Uint8Array(16);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(salt);
      } else {
        for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
      }
      saltHex = Array.from(salt)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(VAULT_SALT_KEY, saltHex);
    }
    const match = saltHex.match(/.{1,2}/g);
    return new Uint8Array(match ? match.map((byte) => parseInt(byte, 16)) : new Array(16).fill(0));
  } catch {
    return new Uint8Array([112, 109, 117, 115, 105, 99, 115, 97, 108, 116, 49, 50, 51, 52, 53, 54]);
  }
}

async function deriveVaultKey(): Promise<CryptoKey | null> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) return null;
  try {
    const salt = getDeviceSalt();
    const encoder = new TextEncoder();
    const secretSeed = encoder.encode('pmusic_client_vault_v1_seed_master_protection');

    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      secretSeed,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as unknown as BufferSource,
        iterations: VAULT_ITERATIONS,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    return null;
  }
}

/**
 * Poin 55: Encrypts structured metadata or strings before writing to IndexedDB or localStorage.
 */
export async function encryptVaultData(data: any): Promise<string> {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);
  const cryptoKey = await deriveVaultKey();

  if (!cryptoKey || typeof window === 'undefined' || !window.crypto?.subtle) {
    // Obfuscation fallback if Web Crypto is unavailable
    return `pm_b64:${btoa(encodeURIComponent(jsonStr))}`;
  }

  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(jsonStr);

    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      encodedData
    );

    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const cipherArray = new Uint8Array(cipherBuffer);
    const cipherB64 = btoa(String.fromCharCode(...cipherArray));

    return `pm_enc:${ivHex}:${cipherB64}`;
  } catch (err) {
    console.warn('[Vault] Encryption fallback engaged:', err);
    return `pm_b64:${btoa(encodeURIComponent(jsonStr))}`;
  }
}

/**
 * Poin 55: Decrypts vault ciphertext back into structured object or string.
 */
export async function decryptVaultData<T = any>(ciphertext: string): Promise<T | null> {
  if (!ciphertext || typeof ciphertext !== 'string') return null;

  // Plain B64 Fallback
  if (ciphertext.startsWith('pm_b64:')) {
    try {
      const decoded = decodeURIComponent(atob(ciphertext.slice(7)));
      try {
        return JSON.parse(decoded) as T;
      } catch {
        return decoded as unknown as T;
      }
    } catch {
      return null;
    }
  }

  if (!ciphertext.startsWith('pm_enc:')) {
    try {
      return JSON.parse(ciphertext) as T;
    } catch {
      return ciphertext as unknown as T;
    }
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) return null;

  const ivHex = parts[1];
  const cipherB64 = parts[2];

  const cryptoKey = await deriveVaultKey();
  if (!cryptoKey || typeof window === 'undefined' || !window.crypto?.subtle) return null;

  try {
    const ivMatch = ivHex.match(/.{1,2}/g);
    const iv = new Uint8Array(ivMatch ? ivMatch.map((b) => parseInt(b, 16)) : []);

    const rawCipher = atob(cipherB64);
    const cipherArray = new Uint8Array(rawCipher.length);
    for (let i = 0; i < rawCipher.length; i++) {
      cipherArray[i] = rawCipher.charCodeAt(i);
    }

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      cipherArray
    );

    const decoder = new TextDecoder();
    const decryptedStr = decoder.decode(decryptedBuffer);

    try {
      return JSON.parse(decryptedStr) as T;
    } catch {
      return decryptedStr as unknown as T;
    }
  } catch (err) {
    console.warn('[Vault] Decryption failed or ciphertext corrupted:', err);
    return null;
  }
}

/**
 * Poin 96: Data Protection & State Integrity Safeguard.
 * Validates input against schema validator; if corrupted or malformed, returns safe default.
 */
export function validateStateIntegrity<T>(
  data: any,
  schemaValidator: (candidate: any) => boolean,
  fallbackDefault: T
): T {
  if (!data) return fallbackDefault;
  try {
    if (schemaValidator(data)) {
      return data as T;
    }
  } catch {}
  return fallbackDefault;
}
