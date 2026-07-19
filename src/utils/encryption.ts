import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars-long!';

/**
 * Derive a stable 32-byte key from ENCRYPTION_KEY (which may be any length)
 * so AES-256 always gets a correctly-sized key.
 */
function derivedKey(): Buffer {
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

/**
 * Simple reversible encoding for development (not secure for production)
 * Using base64 encoding for now - in production, use proper encryption
 */
export function encrypt(text: string): string {
  try {
    // For now, use simple base64 encoding
    // In production, replace with proper AES encryption
    return Buffer.from(text).toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Simple reversible decoding for development
 */
export function decrypt(encodedText: string): string {
  try {
    // For now, use simple base64 decoding
    // In production, replace with proper AES decryption
    return Buffer.from(encodedText, 'base64').toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    console.error('Failed to decrypt:', encodedText);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Authenticated AES-256-GCM encryption for secrets at rest (e.g. tenant API
 * keys). Uses a random 96-bit nonce and a SHA-256-derived 32-byte key, and
 * stores the auth tag so tampering is detected on decrypt.
 *
 * Output format: `v2:<iv-hex>:<tag-hex>:<ciphertext-hex>`.
 */
export function encryptSecure(text: string): string {
  try {
    const iv = crypto.randomBytes(12); // GCM standard 96-bit nonce
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts a payload produced by {@link encryptSecure}. Throws if the format
 * is unexpected or the auth tag fails (tampered/corrupt ciphertext).
 */
export function decryptSecure(encryptedData: string): string {
  try {
    const parts = encryptedData.split(':');
    if (parts[0] !== 'v2' || parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }
    const [, ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}
