import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-chars-long!';

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
 * Proper AES-256-CBC encryption for production use
 */
export function encryptSecure(text: string): string {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', ENCRYPTION_KEY);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Combine iv and encrypted data
    const result = iv.toString('hex') + ':' + encrypted;
    
    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Proper AES-256-CBC decryption for production use
 */
export function decryptSecure(encryptedData: string): string {
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipher('aes-256-cbc', ENCRYPTION_KEY);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}
