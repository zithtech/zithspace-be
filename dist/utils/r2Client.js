"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.s3Client = exports.BUCKET_NAME = void 0;
exports.uploadImageToR2 = uploadImageToR2;
exports.uploadFileToR2 = uploadFileToR2;
exports.uploadRequisitionAttachmentToR2 = uploadRequisitionAttachmentToR2;
exports.uploadEmployeeDocumentToR2 = uploadEmployeeDocumentToR2;
exports.uploadExitDocumentToR2 = uploadExitDocumentToR2;
exports.uploadGeneratedReportToR2 = uploadGeneratedReportToR2;
exports.uploadClientDocumentToR2 = uploadClientDocumentToR2;
exports.uploadEmployeeAssetToR2 = uploadEmployeeAssetToR2;
exports.uploadResumeToR2 = uploadResumeToR2;
exports.uploadCandidateDocumentToR2 = uploadCandidateDocumentToR2;
exports.uploadBugAttachmentToR2 = uploadBugAttachmentToR2;
exports.deleteFileFromR2 = deleteFileFromR2;
exports.deleteBugAttachmentFromR2 = deleteBugAttachmentFromR2;
exports.deleteImageFromR2 = deleteImageFromR2;
exports.extractImageUrlsFromHtml = extractImageUrlsFromHtml;
exports.cleanupOrphanedImages = cleanupOrphanedImages;
exports.generatePresignedUrl = generatePresignedUrl;
exports.getFileBufferFromR2 = getFileBufferFromR2;
exports.uploadEscalationDocumentToR2 = uploadEscalationDocumentToR2;
exports.uploadDocumentToR2 = uploadDocumentToR2;
exports.uploadRunAttachmentToR2 = uploadRunAttachmentToR2;
exports.uploadSubmissionAttachmentToR2 = uploadSubmissionAttachmentToR2;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const nanoid_1 = require("nanoid");
// Cloudflare R2 Configuration
const REGION = "auto";
exports.BUCKET_NAME = process.env.CF_R2_BUCKET_NAME || "zithspace";
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
    forcePathStyle: true
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
        const matches = base64Image.match(/^data:(image\/\w+);base64,(.*)$/);
        if (!matches) {
            throw new Error(`Invalid image format. Expected data URI. Received prefix: ${base64Image.substring(0, 30)}...`);
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
            Bucket: exports.BUCKET_NAME,
            Key: fileName,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000", // Cache for 1 year
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
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
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error(`Invalid file format. Expected data URI (data:mime/type;base64,data...). Received prefix: ${base64File.substring(0, 30)}...`);
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
            Bucket: exports.BUCKET_NAME,
            Key: storedFileName,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000", // Cache for 1 year
            ContentDisposition: `attachment; filename="${sanitizedFileName}"`, // Force download with original name
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        // Construct public URL
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com'))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        // Remove trailing slash if present to avoid double slashes
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        const fileUrl = `${baseUrl}/${storedFileName}`;
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
 * Upload a job requisition attachment to Cloudflare R2
 * Stores under: {tenantId}/requisition_attachments/{requisitionId}/{category}/{uniqueId}_{fileName}
 */
async function uploadRequisitionAttachmentToR2(base64File, fileName, tenantId, requisitionId, category) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
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
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const folderPath = `${tenantId}/requisition_attachments/${requisitionId}/${category}`;
        const storedFileName = `${folderPath}/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: exports.BUCKET_NAME,
            Key: storedFileName,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
            ContentDisposition: `attachment; filename="${sanitizedFileName}"`,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        const fileUrl = `${baseUrl}/${storedFileName}`;
        return {
            fileUrl,
            fileSize: fileSizeInBytes,
            fileType: contentType,
        };
    }
    catch (error) {
        console.error("R2 requisition attachment upload error:", error);
        throw new Error(`Failed to upload requisition attachment: ${error.message}`);
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
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
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
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        return `${baseUrl}/${key}`;
    }
    catch (error) {
        console.error("R2 upload error:", error);
        throw new Error(`Failed to upload document: ${error.message}`);
    }
}
/**
 * Upload Exit Document (like resignation letter) to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @returns Public URL of uploaded document
 */
async function uploadExitDocumentToR2(base64File, fileName, tenantId, employeeId) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        // Organize by tenant -> employee-exits -> employee ID -> document
        const key = `${tenantId}/employee-exits/${employeeId}/documents/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        return `${baseUrl}/${key}`;
    }
    catch (error) {
        console.error("R2 upload error (Exit Document):", error);
        throw new Error(`Failed to upload exit document: ${error.message}`);
    }
}
/**
 * Upload a generated performance report (PDF) to Cloudflare R2.
 * Accepts a base64 data URL; returns the public URL + the object key.
 */
async function uploadGeneratedReportToR2(base64File, tenantId, userId, periodKey) {
    const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
    if (!matches) {
        throw new Error("Invalid file format. Expected base64 encoded PDF.");
    }
    const contentType = matches[1] || "application/pdf";
    const buffer = Buffer.from(matches[2], "base64");
    const key = `${tenantId}/performance-reports/${periodKey}/${userId}_${(0, nanoid_1.nanoid)(8)}.pdf`;
    await exports.s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: exports.BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
    const baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes("r2.cloudflarestorage.com")
        ? PUBLIC_URL
        : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev").replace(/\/$/, "");
    return { url: `${baseUrl}/${key}`, key };
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
async function uploadClientDocumentToR2(base64File, fileName, tenantId, clientId, category, documentType) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        // Organize by tenant -> clients-v2 -> client ID -> category -> document type
        const key = `${tenantId}/clients-v2/${clientId}/documents/${category}/${documentType}/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        return `${baseUrl}/${key}`;
    }
    catch (error) {
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
async function uploadEmployeeAssetToR2({ base64, fileName = "asset.png", tenantId, employeeId, folder = "assets", }) {
    try {
        if (!base64) {
            throw new Error("File content is missing");
        }
        // If it's already a URL, return it directly
        if (base64.startsWith("http")) {
            return base64;
        }
        const matches = base64.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/employees/${employeeId}/${folder}/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        return `${baseUrl}/${key}`;
    }
    catch (error) {
        console.error(`R2 ${folder} image upload error:`, error);
        throw new Error(`Failed to upload ${folder} image: ${error.message}`);
    }
}
/**
 * Upload a resume file (from disk path) to Cloudflare R2.
 * Returns a public URL suitable for Google Docs Viewer.
 * Path: {tenantId}/resumes/{uniqueId}_{fileName}
 */
async function uploadResumeToR2(filePath, fileName, tenantId, mimeType) {
    const fs = await Promise.resolve().then(() => __importStar(require('fs')));
    const buffer = fs.readFileSync(filePath);
    const uniqueId = (0, nanoid_1.nanoid)(12);
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const key = `${tenantId}/resumes/${uniqueId}_${sanitizedFileName}`;
    await exports.s3Client.send(new client_s3_1.PutObjectCommand({
        Bucket: exports.BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
        ContentDisposition: 'inline',
        CacheControl: 'public, max-age=31536000',
    }));
    let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com'))
        ? PUBLIC_URL
        : 'https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev';
    if (baseUrl.endsWith('/'))
        baseUrl = baseUrl.slice(0, -1);
    return `${baseUrl}/${key}`;
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
async function uploadCandidateDocumentToR2(base64File, fileName, tenantId, candidateId, documentType) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/candidates/${candidateId}/documents/${documentType}/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        }));
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com'))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        // Remove trailing slash if present to avoid double slashes
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        return `${baseUrl}/${key}`;
    }
    catch (error) {
        console.error("R2 candidate document upload error:", error);
        throw new Error(`Failed to upload candidate document: ${error.message}`);
    }
}
/**
 * Upload a bug-list attachment to Cloudflare R2.
 * Path: {tenantId}/bug-list/{folderId}/{sheetId}/{bugId}/{uniqueId}_{fileName}
 */
async function uploadBugAttachmentToR2(base64File, fileName, tenantId, folderId, sheetId, bugId) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const fileSizeInBytes = buffer.length;
        const fileSizeInMB = fileSizeInBytes / (1024 * 1024);
        if (fileSizeInMB > 5) {
            throw new Error("File size exceeds 5MB limit");
        }
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/bug-list/${folderId}/${sheetId}/${bugId}/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
            ContentDisposition: `attachment; filename="${sanitizedFileName}"`,
        }));
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com'))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        if (baseUrl.endsWith("/"))
            baseUrl = baseUrl.slice(0, -1);
        const fileUrl = `${baseUrl}/${key}`;
        return { fileUrl, fileSize: fileSizeInBytes, fileType: contentType };
    }
    catch (error) {
        console.error("R2 bug attachment upload error:", error);
        throw new Error(`Failed to upload bug attachment: ${error.message}`);
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
            Bucket: exports.BUCKET_NAME,
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
 * Delete bug attachment from Cloudflare R2
 * More robust than deleteFileFromR2 as it doesn't depend on .r2.dev in URL
 */
async function deleteBugAttachmentFromR2(fileUrl, tenantId) {
    try {
        // The key in R2 starts with tenantId/bug-list/
        const keyMarker = `${tenantId}/bug-list/`;
        const markerIndex = fileUrl.indexOf(keyMarker);
        if (markerIndex === -1) {
            // Fallback: try to see if it's just the key already
            if (fileUrl.startsWith(keyMarker)) {
                await exports.s3Client.send(new client_s3_1.DeleteObjectCommand({
                    Bucket: exports.BUCKET_NAME,
                    Key: fileUrl,
                }));
                return;
            }
            throw new Error(`Invalid bug attachment URL: Could not find key marker ${keyMarker}`);
        }
        const key = fileUrl.substring(markerIndex);
        // Delete from R2
        await exports.s3Client.send(new client_s3_1.DeleteObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
        }));
        console.log(`Deleted bug attachment: ${key}`);
    }
    catch (error) {
        console.error("R2 bug attachment delete error:", error);
        throw new Error(`Failed to delete bug attachment: ${error.message}`);
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
        const bucketIndex = urlParts.indexOf(exports.BUCKET_NAME);
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
            Bucket: exports.BUCKET_NAME,
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
/**
 * Generate a presigned URL for a file stored in R2
 * @param fileUrl - The public URL of the file
 * @param expiresIn - Expiration time in seconds (default 24 hours)
 * @param download - If true, adds ResponseContentDisposition to force download
 */
async function generatePresignedUrl(fileUrl, expiresIn = 86400, download = false) {
    try {
        // Extract key from URL
        // URL format: https://pub-xxx.r2.dev/tenantId/employees/abc/payslip.pdf
        const url = new URL(fileUrl);
        let key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        // If the key starts with the bucket name (common in some R2 URL formats), strip it
        if (key.startsWith(`${exports.BUCKET_NAME}/`)) {
            console.log(`[R2] Stripping bucket name "${exports.BUCKET_NAME}" from presigned key: ${key}`);
            key = key.substring(exports.BUCKET_NAME.length + 1);
        }
        // Decode URI component to handle spaces and other special characters in key
        key = decodeURIComponent(key);
        console.log(`[R2] Generating presigned URL for key: "${key}" (expires in ${expiresIn}s)`);
        const command = new client_s3_1.GetObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            ...(download && { ResponseContentDisposition: `attachment; filename="${key.split('/').pop()}"` })
        });
        const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(exports.s3Client, command, { expiresIn });
        return signedUrl;
    }
    catch (error) {
        console.error("Error generating presigned URL:", error);
        throw new Error(`Failed to generate secure link: ${error.message}`);
    }
}
/**
 * Fetch a file from R2 and return its content as a Buffer
 * Uses the internal S3 client with credentials.
 * @param fileUrl - The public-facing URL of the file
 */
async function getFileBufferFromR2(fileUrl) {
    try {
        const url = new URL(fileUrl);
        let key = url.pathname.startsWith("/")
            ? url.pathname.slice(1)
            : url.pathname;
        // If the key starts with the bucket name (common in some R2 URL formats), strip it
        if (key.startsWith(`${exports.BUCKET_NAME}/`)) {
            console.log(`[R2] Stripping bucket name "${exports.BUCKET_NAME}" from key: ${key}`);
            key = key.substring(exports.BUCKET_NAME.length + 1);
        }
        // Decode URI component to handle spaces and other special characters in key
        key = decodeURIComponent(key);
        console.log(`[R2] Final key for fetch: "${key}" from URL: ${fileUrl}`);
        const command = new client_s3_1.GetObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
        });
        const response = await exports.s3Client.send(command);
        if (!response.Body) {
            throw new Error("Empty body received from R2");
        }
        // Convert high-level stream to Buffer
        const streamToBuffer = async (stream) => {
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        };
        return await streamToBuffer(response.Body);
    }
    catch (error) {
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
async function uploadEscalationDocumentToR2(base64File, fileName, tenantId, escalationId) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.*)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected base64 encoded file.");
        }
        const contentType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/escalations/${escalationId}/documents/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
            ContentDisposition: `inline; filename="${sanitizedFileName}"`
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        const baseUrl = PUBLIC_URL || "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        return `${baseUrl}/${key}`;
    }
    catch (error) {
        console.error("R2 escalation document upload error:", error);
        throw new Error(`Failed to upload escalation document: ${error.message}`);
    }
}
async function uploadDocumentToR2(buffer, fileName, tenantId, documentId, contentType) {
    try {
        const fileExtension = fileName.split(".").pop() || "bin";
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
        const folderPath = `${tenantId}/documents/${documentId}`;
        const storedFileName = `${folderPath}/${uniqueId}_${sanitizedFileName}`;
        const params = {
            Bucket: exports.BUCKET_NAME,
            Key: storedFileName,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
            ContentDisposition: `attachment; filename="${sanitizedFileName}"`,
        };
        await exports.s3Client.send(new client_s3_1.PutObjectCommand(params));
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes('r2.cloudflarestorage.com'))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        if (baseUrl.endsWith('/')) {
            baseUrl = baseUrl.slice(0, -1);
        }
        return `${baseUrl}/${storedFileName}`;
    }
    catch (error) {
        console.error("R2 document upload error:", error);
        throw new Error(`Failed to upload document: ${error.message}`);
    }
}
/**
 * Upload an attachment captured while executing a test run (screenshot, log,
 * recording) to Cloudflare R2, organised by tenant, run and result.
 */
async function uploadRunAttachmentToR2(base64File, fileName, tenantId, runId, resultId) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected a base64 data URI.");
        }
        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const fileSizeInBytes = buffer.length;
        if (fileSizeInBytes / (1024 * 1024) > 10) {
            throw new Error("File size exceeds the 10MB limit");
        }
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = (fileName || "attachment").replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/qa/test-runs/${runId}/${resultId}/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
        }));
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes("r2.cloudflarestorage.com"))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        if (baseUrl.endsWith("/"))
            baseUrl = baseUrl.slice(0, -1);
        return { fileUrl: `${baseUrl}/${key}`, fileSize: fileSizeInBytes, fileType: contentType };
    }
    catch (error) {
        console.error("R2 run attachment upload error:", error);
        throw new Error(`Failed to upload attachment: ${error.message}`);
    }
}
/**
 * Upload supporting evidence attached to a QA Submission (test evidence,
 * screenshots, reports, documents) to Cloudflare R2, organised by tenant and
 * submission.
 */
async function uploadSubmissionAttachmentToR2(base64File, fileName, tenantId, submissionId) {
    try {
        const matches = base64File.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error("Invalid file format. Expected a base64 data URI.");
        }
        const contentType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const fileSizeInBytes = buffer.length;
        if (fileSizeInBytes / (1024 * 1024) > 10) {
            throw new Error("File size exceeds the 10MB limit");
        }
        const uniqueId = (0, nanoid_1.nanoid)(12);
        const sanitizedFileName = (fileName || "attachment").replace(/[^a-zA-Z0-9.-]/g, "_");
        const key = `${tenantId}/qa/submissions/${submissionId}/${uniqueId}_${sanitizedFileName}`;
        await exports.s3Client.send(new client_s3_1.PutObjectCommand({
            Bucket: exports.BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: "public, max-age=31536000",
        }));
        let baseUrl = (PUBLIC_URL && !PUBLIC_URL.includes("r2.cloudflarestorage.com"))
            ? PUBLIC_URL
            : "https://pub-7f315f14b4bb4930bd64cae157207c92.r2.dev";
        if (baseUrl.endsWith("/"))
            baseUrl = baseUrl.slice(0, -1);
        return { fileUrl: `${baseUrl}/${key}`, fileSize: fileSizeInBytes, fileType: contentType };
    }
    catch (error) {
        console.error("R2 submission attachment upload error:", error);
        throw new Error(`Failed to upload attachment: ${error.message}`);
    }
}
//# sourceMappingURL=r2Client.js.map