"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3Client = void 0;
exports.uploadImageToR2 = uploadImageToR2;
exports.uploadFileToR2 = uploadFileToR2;
exports.uploadEmployeeDocumentToR2 = uploadEmployeeDocumentToR2;
exports.uploadEmployeeAssetToR2 = uploadEmployeeAssetToR2;
exports.deleteFileFromR2 = deleteFileFromR2;
exports.deleteImageFromR2 = deleteImageFromR2;
exports.extractImageUrlsFromHtml = extractImageUrlsFromHtml;
exports.cleanupOrphanedImages = cleanupOrphanedImages;
const client_s3_1 = require("@aws-sdk/client-s3");
const nanoid_1 = require("nanoid");
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
exports.s3Client = new client_s3_1.S3Client({
    region: REGION,
    endpoint: `https://a7b954c93286b9aecbd1cd369b491aa0.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});
/**
 * Upload image to Cloudflare R2
 * @param base64Image - Base64 encoded image string (with data:image/... prefix)
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param ticketId - Optional ticket ID for organization
 * @returns Public URL of uploaded image
 */
async function uploadImageToR2(base64Image, tenantId, ticketId) {
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
        const uniqueId = (0, nanoid_1.nanoid)(12);
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
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        // Construct public URL
        const imageUrl = `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${fileName}`;
        return imageUrl;
    }
    catch (error) {
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
async function uploadFileToR2(base64File, fileName, tenantId, ticketId) {
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
        const uniqueId = (0, nanoid_1.nanoid)(12);
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
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        // Construct public URL
        const fileUrl = `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${storedFileName}`;
        return {
            fileUrl,
            fileSize: fileSizeInBytes,
            fileType: contentType,
        };
    }
    catch (error) {
        console.error("R2 file upload error:", error);
        throw new Error(`Failed to upload file: ${error.message}`);
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
async function uploadEmployeeDocumentToR2(base64File, fileName, tenantId, employeeId, documentType) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/employees/${employeeId}/documents/${documentType}/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${key}`;
    }
    catch (error) {
        console.error("R2 upload error:", error);
        throw new Error(`Failed to upload document: ${error.message}`);
    }
}
/**
 * Upload employee asset image to Cloudflare R2
 * @param base64File - Base64 encoded file string or an existing URL
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @returns Public URL of uploaded document
 */
async function uploadEmployeeAssetToR2(base64File, fileName, tenantId, employeeId) {
    try {
        // If it's already a URL, return it directly (for edits where image is not changed)
        if (base64File.startsWith("http")) {
            return base64File;
        }
        const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/employees/${employeeId}/assets/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        return `https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev/${key}`;
    }
    catch (error) {
        console.error("R2 asset image upload error:", error);
        throw new Error(`Failed to upload asset image: ${error.message}`);
    }
}
/**
 * Delete any file from Cloudflare R2
 * @param fileUrl - Full URL of the file to delete
 * @param tenantId - Tenant ID for validation
 */
async function deleteFileFromR2(fileUrl, tenantId) {
    try {
        // Extract file key from URL
        const urlParts = fileUrl.split("/");
        const publicUrlIndex = urlParts.findIndex((part) => part.includes("r2.dev"));
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
        await exports.s3Client.send(new client_s3_1.DeleteObjectCommand(params));
        console.log(`Deleted file: ${fileName}`);
    }
    catch (error) {
        console.error("R2 delete error:", error);
        throw new Error(`Failed to delete file: ${error.message}`);
    }
}
/**
 * Delete image from Cloudflare R2
 * @param imageUrl - Full URL of the image to delete
 * @param tenantId - Tenant ID for validation
 */
async function deleteImageFromR2(imageUrl, tenantId) {
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
        await exports.s3Client.send(new client_s3_1.DeleteObjectCommand(params));
        console.log(`Deleted image: ${fileName}`);
    }
    catch (error) {
        console.error("R2 delete error:", error);
        throw new Error(`Failed to delete image: ${error.message}`);
    }
}
/**
 * Extract image URLs from HTML content
 * @param htmlContent - HTML string containing img tags
 * @returns Array of image URLs
 */
function extractImageUrlsFromHtml(htmlContent) {
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    const urls = [];
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
async function cleanupOrphanedImages(oldHtml, newHtml, tenantId) {
    try {
        const oldImages = extractImageUrlsFromHtml(oldHtml);
        const newImages = extractImageUrlsFromHtml(newHtml);
        // Find images that were removed
        const removedImages = oldImages.filter((url) => !newImages.includes(url));
        // Delete removed images from R2
        for (const imageUrl of removedImages) {
            try {
                await deleteImageFromR2(imageUrl, tenantId);
            }
            catch (error) {
                console.error(`Failed to delete orphaned image: ${imageUrl}`, error);
                // Continue with other deletions even if one fails
            }
        }
        if (removedImages.length > 0) {
            console.log(`Cleaned up ${removedImages.length} orphaned images`);
        }
    }
    catch (error) {
        console.error("Error cleaning up orphaned images:", error);
        // Don't throw error - cleanup is best effort
    }
}
//# sourceMappingURL=r2Client.js.map