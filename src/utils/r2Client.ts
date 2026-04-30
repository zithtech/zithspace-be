import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { nanoid } from "nanoid";

// Cloudflare R2 Configuration
const REGION = "auto";
const BUCKET_NAME = process.env.CF_R2_BUCKET_NAME || "zithspace";
const ACCOUNT_ID = process.env.CF_R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.CF_R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.CF_R2_SECRET_ACCESS_KEY;
const PUBLIC_URL = process.env.CF_R2_PUBLIC_URL;

// Validate required environment variables
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error("Missing required R2 environment variables");
}

// Create S3 client for R2
export const s3Client = new S3Client({
  region: REGION,
  endpoint: `https://a7b954c93286b9aecbd1cd369b491aa0.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID!,
    secretAccessKey: SECRET_ACCESS_KEY!,
  },
  forcePathStyle: true
});

/**
 * Upload image to Cloudflare R2
 * @param base64Image - Base64 encoded image string (with data:image/... prefix)
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param ticketId - Optional ticket ID for organization
 * @returns Public URL of uploaded image
 */
export async function uploadImageToR2(
  base64Image: string,
  tenantId: string,
  ticketId?: string,
): Promise<string> {
  try {
    // Extract content type and base64 data
    const matches = base64Image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid image format. Expected base64 encoded image.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Validate file size (max 5MB)
    const fileSizeInMB = buffer.length / (1024 * 1024);
    if (fileSizeInMB > 5) {
      throw new Error("Image size exceeds 5MB limit");
    }

    // Validate content type
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];
    if (!allowedTypes.includes(contentType)) {
      throw new Error("Invalid image type. Allowed: PNG, JPEG, JPG, GIF, WEBP");
    }

    // Generate unique file name
    const fileExt = contentType.split("/")[1];
    const uniqueId = nanoid(12);

    // Organize by tenant and optionally by ticket
    const folderPath = ticketId
      ? `${tenantId}/tickets/${ticketId}/images`
      : `${tenantId}/tickets/images`;

    const fileName = `${folderPath}/${uniqueId}.${fileExt}`;

    // Upload to R2
    const params = {
      Bucket: "zithspace",
      Key: fileName,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000", // Cache for 1 year
    };

    await s3Client.send(new PutObjectCommand(params));

    // Construct public URL
    let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com')) 
      ? PUBLIC_URL 
      : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    
    // Remove trailing slash if present to avoid double slashes
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    
    const imageUrl = `${baseUrl}/${fileName}`;

    return imageUrl;
  } catch (error: any) {
    console.error("R2 upload error:", error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
}

/**
 * Upload any file type to Cloudflare R2 (for ticket attachments)
 * @param base64File - Base64 encoded file string (with data:...;base64, prefix)
 * @param fileName - Original file name
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param ticketId - Ticket ID for organization
 * @returns Object with file URL and metadata
 */
export async function uploadFileToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  ticketId: string,
): Promise<{ fileUrl: string; fileSize: number; fileType: string }> {
  try {
    // Extract content type and base64 data
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Validate file size (max 5MB)
    const fileSizeInBytes = buffer.length;
    const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
    if (fileSizeInMB > 5) {
      throw new Error("File size exceeds 5MB limit");
    }

    // Generate unique file name while preserving original extension
    const fileExtension = fileName.split(".").pop() || "bin";
    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");

    // Organize by tenant and ticket in attachments folder
    const folderPath = `${tenantId}/tickets/${ticketId}/attachments`;
    const storedFileName = `${folderPath}/${uniqueId}_${sanitizedFileName}`;

    // Upload to R2
    const params = {
      Bucket: "zithspace",
      Key: storedFileName,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000", // Cache for 1 year
      ContentDisposition: `attachment; filename="${sanitizedFileName}"`, // Force download with original name
    };

    await s3Client.send(new PutObjectCommand(params));

    // Construct public URL
    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    const fileUrl = `${baseUrl}/${storedFileName}`;

    return {
      fileUrl,
      fileSize: fileSizeInBytes,
      fileType: contentType,
    };
  } catch (error: any) {
    console.error("R2 file upload error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Upload a job requisition attachment to Cloudflare R2
 * Stores under: {tenantId}/requisition_attachments/{requisitionId}/{category}/{uniqueId}_{fileName}
 */
export async function uploadRequisitionAttachmentToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  requisitionId: string,
  category: string,
): Promise<{ fileUrl: string; fileSize: number; fileType: string }> {
  try {
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Validate file size (max 5MB)
    const fileSizeInBytes = buffer.length;
    const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
    if (fileSizeInMB > 5) {
      throw new Error("File size exceeds 5MB limit");
    }

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const folderPath = `${tenantId}/requisition_attachments/${requisitionId}/${category}`;
    const storedFileName = `${folderPath}/${uniqueId}_${sanitizedFileName}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: storedFileName,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
      ContentDisposition: `attachment; filename="${sanitizedFileName}"`,
    };

    await s3Client.send(new PutObjectCommand(params));

    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    const fileUrl = `${baseUrl}/${storedFileName}`;

    return {
      fileUrl,
      fileSize: fileSizeInBytes,
      fileType: contentType,
    };
  } catch (error: any) {
    console.error("R2 requisition attachment upload error:", error);
    throw new Error(
      `Failed to upload requisition attachment: ${error.message}`,
    );
  }
}

/**
 * Upload employee document to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @param documentType - Type of document (e.g., experienceLetter)
 * @returns Public URL of uploaded document
 */
export async function uploadEmployeeDocumentToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  employeeId: string,
  documentType: string,
): Promise<string> {
  try {
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${tenantId}/employees/${employeeId}/documents/${documentType}/${uniqueId}_${sanitizedFileName}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    };

    await s3Client.send(new PutObjectCommand(params));

    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    return `${baseUrl}/${key}`;
  } catch (error: any) {
    console.error("R2 upload error:", error);
    throw new Error(`Failed to upload document: ${error.message}`);
  }
}

/**
 * Upload Client V2 document to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param clientId - Client ID
 * @param category - Main Category (e.g., Sales, Legal)
 * @param documentType - Sub Category of document
 * @returns Public URL of uploaded document
 */
export async function uploadClientDocumentToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  clientId: string,
  category: string,
  documentType: string,
): Promise<string> {
  try {
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    // Organize by tenant -> clients-v2 -> client ID -> category -> document type
    const key = `${tenantId}/clients-v2/${clientId}/documents/${category}/${documentType}/${uniqueId}_${sanitizedFileName}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    };

    await s3Client.send(new PutObjectCommand(params));

    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    return `${baseUrl}/${key}`;
  } catch (error: any) {
    console.error("R2 upload error (Client V2):", error);
    throw new Error(`Failed to upload client document: ${error.message}`);
  }
}

/**
 * Upload employee asset image to Cloudflare R2
 * @param base64 - Base64 encoded file string or an existing URL
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @param folder - The subfolder inside the employee's directory (e.g., 'assets', 'profile-pictures')
 * @returns Public URL of uploaded document
 */
export async function uploadEmployeeAssetToR2({
  base64,
  fileName = "asset.png",
  tenantId,
  employeeId,
  folder = "assets",
}: {
  base64: string;
  fileName?: string;
  tenantId: string;
  employeeId: string;
  folder?: string;
}): Promise<string> {
  try {
    if (!base64) {
      throw new Error("File content is missing");
    }

    // If it's already a URL, return it directly
    if (base64.startsWith("http")) {
      return base64;
    }

    const matches = base64.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${tenantId}/employees/${employeeId}/${folder}/${uniqueId}_${sanitizedFileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    return `${baseUrl}/${key}`;
  } catch (error: any) {
    console.error(`R2 ${folder} image upload error:`, error);
    throw new Error(`Failed to upload ${folder} image: ${error.message}`);
  }
}

/**
 * Upload candidate document to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param candidateId - Candidate ID
 * @param documentType - Type of document (e.g., resume, passport)
 * @returns Public URL of uploaded document
 */
export async function uploadCandidateDocumentToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  candidateId: string,
  documentType: string,
): Promise<string> {
  try {
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${tenantId}/candidates/${candidateId}/documents/${documentType}/${uniqueId}_${sanitizedFileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    const baseUrl =
      PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    return `${baseUrl}/${key}`;
  } catch (error: any) {
    console.error("R2 candidate document upload error:", error);
    throw new Error(`Failed to upload candidate document: ${error.message}`);
  }
}

/**
 * Delete any file from Cloudflare R2
 * @param fileUrl - Full URL of the file to delete
 * @param tenantId - Tenant ID for validation
 */
export async function deleteFileFromR2(
  fileUrl: string,
  tenantId: string,
): Promise<void> {
  try {
    // Extract file key from URL
    const urlParts = fileUrl.split("/");
    const publicUrlIndex = urlParts.findIndex((part) =>
      part.includes("r2.dev"),
    );

    if (publicUrlIndex === -1) {
      throw new Error("Invalid file URL");
    }

    const fileName = urlParts.slice(publicUrlIndex + 1).join("/");

    // Validate that the file belongs to the tenant
    if (!fileName.startsWith(tenantId)) {
      throw new Error("Unauthorized: File does not belong to this tenant");
    }

    // Delete from R2
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
    };

    await s3Client.send(new DeleteObjectCommand(params));
    console.log(`Deleted file: ${fileName}`);
  } catch (error: any) {
    console.error("R2 delete error:", error);
    throw new Error(`Failed to delete file: ${error.message}`);
  }
}

/**
 * Delete image from Cloudflare R2
 * @param imageUrl - Full URL of the image to delete
 * @param tenantId - Tenant ID for validation
 */
export async function deleteImageFromR2(
  imageUrl: string,
  tenantId: string,
): Promise<void> {
  try {
    // Extract file key from URL
    const urlParts = imageUrl.split("/");
    const bucketIndex = urlParts.indexOf(BUCKET_NAME);

    if (bucketIndex === -1) {
      throw new Error("Invalid image URL");
    }

    const fileName = urlParts.slice(bucketIndex + 1).join("/");

    // Validate that the file belongs to the tenant
    if (!fileName.startsWith(tenantId)) {
      throw new Error("Unauthorized: Image does not belong to this tenant");
    }

    // Delete from R2
    const params = {
      Bucket: BUCKET_NAME,
      Key: fileName,
    };

    await s3Client.send(new DeleteObjectCommand(params));
    console.log(`Deleted image: ${fileName}`);
  } catch (error: any) {
    console.error("R2 delete error:", error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
}

/**
 * Extract image URLs from HTML content
 * @param htmlContent - HTML string containing img tags
 * @returns Array of image URLs
 */
export function extractImageUrlsFromHtml(htmlContent: string): string[] {
  const imgRegex = /<img[^>]+src="([^">]+)"/g;
  const urls: string[] = [];
  let match;

  while ((match = imgRegex.exec(htmlContent)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Clean up orphaned images when ticket description is updated
 * @param oldHtml - Previous HTML content
 * @param newHtml - New HTML content
 * @param tenantId - Tenant ID
 */
export async function cleanupOrphanedImages(
  oldHtml: string,
  newHtml: string,
  tenantId: string,
): Promise<void> {
  try {
    const oldImages = extractImageUrlsFromHtml(oldHtml);
    const newImages = extractImageUrlsFromHtml(newHtml);

    // Find images that were removed
    const removedImages = oldImages.filter((url) => !newImages.includes(url));

    // Delete removed images from R2
    for (const imageUrl of removedImages) {
      try {
        await deleteImageFromR2(imageUrl, tenantId);
      } catch (error) {
        console.error(`Failed to delete orphaned image: ${imageUrl}`, error);
        // Continue with other deletions even if one fails
      }
    }

    if (removedImages.length > 0) {
      console.log(`Cleaned up ${removedImages.length} orphaned images`);
    }
  } catch (error) {
    console.error("Error cleaning up orphaned images:", error);
    // Don't throw error - cleanup is best effort
  }
}

/**
 * Generate a presigned URL for a file stored in R2
 * @param fileUrl - The public URL of the file
 * @param expiresIn - Expiration time in seconds (default 24 hours)
 */
export async function generatePresignedUrl(
  fileUrl: string,
  expiresIn: number = 86400,
): Promise<string> {
  try {
    // Extract key from URL
    // URL format: https://pub-xxx.r2.dev/tenantId/employees/abc/payslip.pdf
    const url = new URL(fileUrl);
    let key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;

    // If the key starts with the bucket name (common in some R2 URL formats), strip it
    if (key.startsWith(`${BUCKET_NAME}/`)) {
      console.log(`[R2] Stripping bucket name "${BUCKET_NAME}" from presigned key: ${key}`);
      key = key.substring(BUCKET_NAME.length + 1);
    }

    console.log(`[R2] Generating presigned URL for key: "${key}" (expires in ${expiresIn}s)`);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
    return signedUrl;
  } catch (error: any) {
    console.error("Error generating presigned URL:", error);
    throw new Error(`Failed to generate secure link: ${error.message}`);
  }
}

/**
 * Fetch a file from R2 and return its content as a Buffer
 * Uses the internal S3 client with credentials.
 * @param fileUrl - The public-facing URL of the file
 */
export async function getFileBufferFromR2(fileUrl: string): Promise<Buffer> {
  try {
    const url = new URL(fileUrl);
    let key = url.pathname.startsWith("/")
      ? url.pathname.slice(1)
      : url.pathname;

    // If the key starts with the bucket name (common in some R2 URL formats), strip it
    if (key.startsWith(`${BUCKET_NAME}/`)) {
      console.log(`[R2] Stripping bucket name "${BUCKET_NAME}" from key: ${key}`);
      key = key.substring(BUCKET_NAME.length + 1);
    }

    console.log(`[R2] Final key for fetch: "${key}" from URL: ${fileUrl}`);

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new Error("Empty body received from R2");
    }

    // Convert high-level stream to Buffer
    const streamToBuffer = async (stream: any): Promise<Buffer> => {
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };

    return await streamToBuffer(response.Body);
  } catch (error: any) {
    console.error(`Error fetching buffer from R2 for ${fileUrl}:`, error);
    throw error;
  }
}

//  * Upload Escalation document to Cloudflare R2
//  * @param base64File - Base64 encoded file string
//  * @param fileName - Original file name
//  * @param tenantId - Tenant ID
//  * @param escalationId - Temporary or generated escalation ID
//  * @returns Public URL of uploaded document
//  */
export async function uploadEscalationDocumentToR2(
  base64File: string,
  fileName: string,
  tenantId: string,
  escalationId: string,
): Promise<string> {
  try {
    const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid file format. Expected base64 encoded file.");
    }

    const contentType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    const uniqueId = nanoid(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
    const key = `${tenantId}/escalations/${escalationId}/documents/${uniqueId}_${sanitizedFileName}`;

    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000",
      ContentDisposition: `attachment; filename="${sanitizedFileName}"`
    };

    await s3Client.send(new PutObjectCommand(params));

    const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
    return `${baseUrl}/${key}`;
  } catch (error: any) {
    console.error("R2 escalation document upload error:", error);
    throw new Error(`Failed to upload escalation document: ${error.message}`);
  }
}
