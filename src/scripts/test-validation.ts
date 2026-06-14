import { parseUPIUrl, parseEMVCo, getProviderFromUpiId, validatePaymentQR } from '../utils/qrValidator';

async function test() {
  console.log("=== Testing UPI URL Parsing ===");
  const upi1 = parseUPIUrl("upi://pay?pa=recipient@okaxis&pn=MerchantName");
  console.log("UPI URL 1:", upi1);
  console.assert(upi1?.upiId === "recipient@okaxis", "Failed UPI ID extraction");
  console.assert(upi1?.merchantName === "MerchantName", "Failed Merchant Name extraction");

  const upi2 = parseUPIUrl("upi://pay?pa=test@okhdfcbank");
  console.log("UPI URL 2:", upi2);
  console.assert(upi2?.upiId === "test@okhdfcbank", "Failed UPI ID extraction");
  console.assert(upi2?.merchantName === null, "Failed Merchant Name extraction");

  const upiFail = parseUPIUrl("https://example.com");
  console.log("UPI URL Fail:", upiFail);
  console.assert(upiFail === null, "UPI URL should return null for generic websites");

  console.log("\n=== Testing EMVCo / Bharat QR Parsing ===");
  // EMVCo format: Tag-Length-Value
  // 000201: tag 00, len 02, val 01
  // 010211: tag 01, len 02, val 11
  // 2636: tag 26, len 36, value:
  //    0012org.npci.upi (sub-tag 00, len 12, val org.npci.upi)
  //    0116recipient@okaxis (sub-tag 01, len 16, val recipient@okaxis)
  // 5912MerchantName: tag 59, len 12, val MerchantName
  const emvcoPayload = "00020101021126360012org.npci.upi0116recipient@okaxis5912MerchantName";
  const emvcoParsed = parseEMVCo(emvcoPayload);
  console.log("EMVCo Parsed:", emvcoParsed);
  console.assert(emvcoParsed?.upiId === "recipient@okaxis", "Failed EMVCo UPI ID extraction");
  console.assert(emvcoParsed?.merchantName === "MerchantName", "Failed EMVCo Merchant Name extraction");

  const emvcoFail = parseEMVCo("00020101021126300010org.npci.xxx0115recipient@okaxis");
  console.log("EMVCo Fail:", emvcoFail);
  console.assert(emvcoFail === null, "EMVCo should return null for non-NPCI provider");

  console.log("\n=== Testing Provider/Bank Handle Mapping ===");
  const handles = [
    { upi: 'test@okaxis', expected: 'Axis Bank' },
    { upi: 'test@okhdfcbank', expected: 'HDFC Bank' },
    { upi: 'test@oksbi', expected: 'SBI' },
    { upi: 'test@ibl', expected: 'ICICI Bank' },
    { upi: 'test@ybl', expected: 'PhonePe' },
    { upi: 'test@paytm', expected: 'Paytm' },
    { upi: 'test@unknown', expected: 'unknown' },
  ];
  for (const h of handles) {
    const derived = getProviderFromUpiId(h.upi);
    console.log(`UPI: ${h.upi} -> Derived: ${derived}`);
    console.assert(derived === h.expected, `Failed handle mapping for ${h.upi}: expected ${h.expected}, got ${derived}`);
  }

  console.log("\n=== Testing File Type & Size Validation ===");
  const invalidTypeRes = await validatePaymentQR("data:text/plain;base64,YWJj");
  console.log("Invalid Type Result:", invalidTypeRes);
  console.assert(invalidTypeRes.isValid === false, "Should fail invalid type");
  console.assert(invalidTypeRes.error?.includes("Unsupported file type"), "Incorrect invalid type error message");

  // A 1x1 transparent pixel PNG image base64
  // It has a valid type/size but does NOT contain a QR code.
  const pixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
  const noQrRes = await validatePaymentQR(pixelPng);
  console.log("No QR Code Result:", noQrRes);
  console.assert(noQrRes.isValid === false, "Should fail when no QR is detected");
  console.assert(noQrRes.error === "Invalid QR Code image. Please upload a valid payment QR code.", "Incorrect no-qr error message");

  console.log("\nAll tests completed successfully!");
}

test().catch(console.error);
