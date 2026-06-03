import { validateSignatureImage } from '../utils/signatureValidator';
import { Jimp } from 'jimp';

async function test() {
  console.log("=== Testing Signature Validation ===");

  // 1. Test unsupported file type
  const invalidTypeRes = await validateSignatureImage("data:text/plain;base64,YWJj");
  console.log("Invalid Type Result:", invalidTypeRes);
  console.assert(invalidTypeRes.isValid === false, "Should fail invalid type");
  console.assert(
    invalidTypeRes.error === "Invalid signature image. Please upload a clear signature on a transparent or white background.",
    "Incorrect error message for invalid type"
  );

  // 2. Test 1x1 transparent PNG (blank signature)
  const pixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const blankRes = await validateSignatureImage(pixelPng);
  console.log("Blank Image (1x1 transparent) Result:", blankRes);
  console.assert(blankRes.isValid === false, "Should fail blank image");
  console.assert(
    blankRes.error === "Signature image is blank or has too few details.",
    "Incorrect error message for blank image"
  );

  // 3. Test a blank image (all white, 100x100) using Jimp to create and validate
  const whiteImg = new Jimp({ width: 100, height: 100, color: 0xFFFFFFFF });
  const whiteBuffer = await whiteImg.getBuffer('image/png');
  const whiteBase64 = `data:image/png;base64,${whiteBuffer.toString('base64')}`;
  
  const whiteRes = await validateSignatureImage(whiteBase64);
  console.log("All-white Image Result:", whiteRes);
  console.assert(whiteRes.isValid === false, "Should fail all-white image");
  console.assert(
    whiteRes.error === "Signature image is blank or has too few details.",
    "Incorrect error message for all-white image"
  );

  // 4. Test a high density image (e.g. screenshot/photo) - completely black or dark background
  const blackImg = new Jimp({ width: 100, height: 100, color: 0x000000FF }); // Solid black
  const blackBuffer = await blackImg.getBuffer('image/png');
  const blackBase64 = `data:image/png;base64,${blackBuffer.toString('base64')}`;

  const blackRes = await validateSignatureImage(blackBase64);
  console.log("Solid Black Image Result:", blackRes);
  console.assert(blackRes.isValid === false, "Should fail solid black/high density image");
  console.assert(
    blackRes.error === "Invalid signature image. Please upload a clear signature on a transparent or white background.",
    "Incorrect error message for high density image"
  );

  // 5. Test a valid signature image (white background with some black ink/strokes)
  // We want to make a 100x100 white image and draw a stroke
  // Stroke: let's draw some black pixels. Total pixels: 10,000.
  // Ink ratio needs to be >= 0.5% (50 pixels) and <= 30% (3,000 pixels).
  // Let's set 200 pixels to black (2% ink ratio).
  const validImg = new Jimp({ width: 100, height: 100, color: 0xFFFFFFFF });
  for (let x = 10; x < 90; x++) {
    // Draw a diagonal line
    validImg.setPixelColor(0x000000FF, x, x);
    validImg.setPixelColor(0x000000FF, x, x + 1);
    validImg.setPixelColor(0x000000FF, x, x - 1);
  }
  const validBuffer = await validImg.getBuffer('image/png');
  const validBase64 = `data:image/png;base64,${validBuffer.toString('base64')}`;

  const validRes = await validateSignatureImage(validBase64);
  console.log("Valid Signature Image Result:", validRes);
  console.assert(validRes.isValid === true, "Should pass valid signature image");

  console.log("All signature validation tests passed successfully!");
}

test().catch(console.error);
