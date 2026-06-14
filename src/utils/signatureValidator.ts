import { Jimp } from 'jimp';

export interface SignatureValidationResult {
  isValid: boolean;
  error?: string;
}

export async function validateSignatureImage(base64Data: string): Promise<SignatureValidationResult> {
  // If the data is a URL or not base64, bypass validation (e.g. existing signature URL)
  if (!base64Data || base64Data.startsWith('http://') || base64Data.startsWith('https://') || !base64Data.startsWith('data:')) {
    return { isValid: true };
  }

  // 1. Basic image verification
  const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return {
      isValid: false,
      error: "Invalid signature image. Please upload a clear signature on a transparent or white background."
    };
  }

  const mimeType = matches[1].toLowerCase();
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
  if (!allowedMimeTypes.includes(mimeType)) {
    return {
      isValid: false,
      error: "Invalid signature image. Please upload a clear signature on a transparent or white background."
    };
  }

  // 2. Size check (2MB)
  const imageBuffer = Buffer.from(matches[2], 'base64');
  const sizeInBytes = imageBuffer.length;
  const maxBytes = 2 * 1024 * 1024; // 2MB
  if (sizeInBytes > maxBytes) {
    return {
      isValid: false,
      error: "Invalid signature image. Please upload a clear signature on a transparent or white background."
    };
  }

  try {
    const image = await Jimp.read(imageBuffer);
    const width = image.bitmap.width;
    const height = image.bitmap.height;
    const totalPixels = width * height;

    if (totalPixels === 0) {
      return {
        isValid: false,
        error: "Signature image is blank or has too few details."
      };
    }

    const data = image.bitmap.data; // Buffer containing RGBA values
    let backgroundPixels = 0;
    let inkPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // A pixel is background if transparent (alpha < 50) or near-white (R, G, B > 240)
      if (a < 50 || (r > 240 && g > 240 && b > 240)) {
        backgroundPixels++;
      } else {
        inkPixels++;
      }
    }

    const backgroundRatio = backgroundPixels / totalPixels;
    const inkRatio = inkPixels / totalPixels;

    // Reject if background ratio < 70% (ink/stroke ratio > 30%)
    if (backgroundRatio < 0.7) {
      return {
        isValid: false,
        error: "Invalid signature image. Please upload a clear signature on a transparent or white background."
      };
    }

    // Reject if ink ratio < 0.5% (completely blank or too few details)
    if (inkRatio < 0.005) {
      return {
        isValid: false,
        error: "Signature image is blank or has too few details."
      };
    }

    return { isValid: true };
  } catch (err: any) {
    console.error("Signature validation error:", err);
    return {
      isValid: false,
      error: "Invalid signature image. Please upload a clear signature on a transparent or white background."
    };
  }
}
