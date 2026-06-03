import { Jimp } from 'jimp';
import jsQR from 'jsqr';

export interface ExtractedPaymentDetails {
  upiId: string;
  merchantName: string | null;
  bankHandle: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  details?: ExtractedPaymentDetails;
}

/**
 * Derive the Bank/Provider name from the UPI ID handle
 */
export function getProviderFromUpiId(upiId: string): string {
  const parts = upiId.split('@');
  if (parts.length < 2) return '';
  const handle = parts[1].trim().toLowerCase();

  const handleMap: { [key: string]: string } = {
    'okaxis': 'Axis Bank',
    'okhdfcbank': 'HDFC Bank',
    'oksbi': 'SBI',
    'ibl': 'ICICI Bank',
    'ybl': 'PhonePe',
    'paytm': 'Paytm',
    'okicici': 'ICICI Bank',
    'axl': 'PhonePe',
    'okbi': 'Bank of India',
    'okunion': 'Union Bank',
    'barodampay': 'Bank of Baroda',
    'upi': 'BHIM',
  };

  return handleMap[handle] || handle;
}

/**
 * Parse EMVCo / Bharat QR format payload
 */
export function parseEMVCo(payload: string): { upiId?: string; merchantName?: string } | null {
  if (!payload.startsWith("000201")) {
    return null;
  }

  try {
    const tags: { [tag: string]: string } = {};
    let index = 0;
    while (index < payload.length) {
      if (index + 4 > payload.length) break;
      const tag = payload.substring(index, index + 2);
      const lengthStr = payload.substring(index + 2, index + 4);
      const length = parseInt(lengthStr, 10);
      if (isNaN(length) || length <= 0) break;
      if (index + 4 + length > payload.length) break;
      const value = payload.substring(index + 4, index + 4 + length);
      tags[tag] = value;
      index += 4 + length;
    }

    // Extract UPI ID from Tag 26 to 51 (Merchant Account Information)
    let upiId: string | undefined;
    for (let tagNum = 26; tagNum <= 51; tagNum++) {
      const tagStr = tagNum.toString();
      const tagVal = tags[tagStr];
      if (tagVal) {
        // Parse nested TLV structure for Tag 26-51
        let subIndex = 0;
        const subTags: { [subTag: string]: string } = {};
        while (subIndex < tagVal.length) {
          if (subIndex + 4 > tagVal.length) break;
          const subTag = tagVal.substring(subIndex, subIndex + 2);
          const subLength = parseInt(tagVal.substring(subIndex + 2, subIndex + 4), 10);
          if (isNaN(subLength) || subLength <= 0) break;
          if (subIndex + 4 + subLength > tagVal.length) break;
          const subValue = tagVal.substring(subIndex + 4, subIndex + 4 + subLength);
          subTags[subTag] = subValue;
          subIndex += 4 + subLength;
        }

        // Global unique identifier must point to UPI/BharatQR
        const gui = subTags['00']?.toLowerCase();
        if (gui === 'org.npci.upi' || gui === 'org.npci.bharatqr') {
          if (subTags['01']) {
            upiId = subTags['01'];
            break;
          }
        }
      }
    }

    // Tag 59 is the payee / merchant name in EMVCo spec
    const merchantName = tags['59'] || null;

    if (upiId) {
      return { upiId, merchantName };
    }
  } catch (err) {
    console.error("Error parsing EMVCo QR code:", err);
  }

  return null;
}

/**
 * Parse UPI url payload (e.g. upi://pay?pa=...&pn=...)
 */
export function parseUPIUrl(payload: string): { upiId?: string; merchantName?: string } | null {
  if (!payload.startsWith("upi://pay?")) {
    return null;
  }

  try {
    // Standard URL query parsing
    const urlParts = payload.split("?");
    const paramsString = urlParts[1];
    if (!paramsString) return null;

    const params = new URLSearchParams(paramsString);
    const pa = params.get("pa");
    const pn = params.get("pn");

    if (pa) {
      return {
        upiId: pa,
        merchantName: pn || null
      };
    }
  } catch (err) {
    console.error("Error parsing UPI url:", err);
  }

  return null;
}

/**
 * Validate payment QR code from base64 image data string
 */
export async function validatePaymentQR(base64Data: string): Promise<ValidationResult> {
  // 1. Basic image verification
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return {
      isValid: false,
      error: "Unsupported file type. Please upload a valid JPG, JPEG, or PNG image."
    };
  }

  const mimeType = matches[1].toLowerCase();
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      isValid: false,
      error: "Unsupported file type. Please upload a valid JPG, JPEG, or PNG image."
    };
  }

  // 2. Size check (2MB)
  const imageBuffer = Buffer.from(matches[2], 'base64');
  const sizeInBytes = imageBuffer.length;
  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (sizeInBytes > maxBytes) {
    return {
      isValid: false,
      error: "Image must be smaller than 2MB"
    };
  }

  try {
    // 3. Decode QR code using Jimp and jsQR
    const image = await Jimp.read(imageBuffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const imageData = new Uint8ClampedArray(image.bitmap.data);
    
    const qrResult = jsQR(imageData, width, height);
    if (!qrResult || !qrResult.data) {
      return {
        isValid: false,
        error: "Invalid QR Code image. Please upload a valid payment QR code."
      };
    }

    const payload = qrResult.data.trim();

    // 4. Payment URL / EMVCo validation
    let parsedDetails = parseUPIUrl(payload);
    if (!parsedDetails) {
      parsedDetails = parseEMVCo(payload);
    }

    if (!parsedDetails || !parsedDetails.upiId) {
      return {
        isValid: false,
        error: "Invalid QR Code image. Please upload a valid payment QR code."
      };
    }

    const upiId = parsedDetails.upiId;
    const merchantName = parsedDetails.merchantName;
    const bankHandle = getProviderFromUpiId(upiId);

    return {
      isValid: true,
      details: {
        upiId,
        merchantName,
        bankHandle
      }
    };
  } catch (err: any) {
    console.error("QR Code validation error:", err);
    return {
      isValid: false,
      error: "Invalid QR Code image. Please upload a valid payment QR code."
    };
  }
}
