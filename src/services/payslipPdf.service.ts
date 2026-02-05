import puppeteer from "puppeteer";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from '../utils/r2Client'; 
import { generatePayslipHtml } from "@/templates/payslip.template";
import { PayslipData } from "@/types/salary";

/**
 * Generate Payslip PDF & Upload to R2 / S3
 */
export async function generateAndUploadPayslipPDF(
  data: PayslipData,
): Promise<string> {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    const page = await browser.newPage();

    // 1️⃣ Generate HTML
    const html = generatePayslipHtml(data);

    // 2️⃣ Load HTML
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // 3️⃣ Create PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
      preferCSSPageSize: true,
    });

    // 4️⃣ File path
    const fileName = `${data.company.id}/payslips/Payslip-${data.employee.employeeId}-${data.fromDate}.pdf`;

    // 5️⃣ Upload
    await s3Client.send(
      new PutObjectCommand({
        Bucket: "zithspace",
        Key: fileName,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ContentDisposition: `inline; filename="Payslip-${data.employee.employeeName}.pdf"`,
      }),
    );

    // 6️⃣ Public URL
    return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${fileName}`;
  } catch (err) {
    console.error("Payslip PDF Error:", err);
    throw err;
  } finally {
    await browser.close();
  }
}
