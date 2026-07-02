import { S3Client } from "@aws-sdk/client-s3";
export declare const BUCKET_NAME: string;
export declare const s3Client: S3Client;
/**
 * Upload image to Cloudflare R2
 * @param base64Image - Base64 encoded image string (with data:image/... prefix)
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param ticketId - Optional ticket ID for organization
 * @returns Public URL of uploaded image
 */
export declare function uploadImageToR2(base64Image: string, tenantId: string, ticketId?: string): Promise<string>;
/**
 * Upload any file type to Cloudflare R2 (for ticket attachments)
 * @param base64File - Base64 encoded file string (with data:...;base64, prefix)
 * @param fileName - Original file name
 * @param tenantId - Tenant ID for multi-tenant isolation
 * @param ticketId - Ticket ID for organization
 * @returns Object with file URL and metadata
 */
export declare function uploadFileToR2(base64File: string, fileName: string, tenantId: string, ticketId: string): Promise<{
    fileUrl: string;
    fileSize: number;
    fileType: string;
}>;
/**
 * Upload a job requisition attachment to Cloudflare R2
 * Stores under: {tenantId}/requisition_attachments/{requisitionId}/{category}/{uniqueId}_{fileName}
 */
export declare function uploadRequisitionAttachmentToR2(base64File: string, fileName: string, tenantId: string, requisitionId: string, category: string): Promise<{
    fileUrl: string;
    fileSize: number;
    fileType: string;
}>;
/**
 * Upload employee document to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @param documentType - Type of document (e.g., experienceLetter)
 * @returns Public URL of uploaded document
 */
export declare function uploadEmployeeDocumentToR2(base64File: string, fileName: string, tenantId: string, employeeId: string, documentType: string): Promise<string>;
/**
 * Upload a generated performance report (PDF) to Cloudflare R2.
 * Accepts a base64 data URL; returns the public URL + the object key.
 */
export declare function uploadGeneratedReportToR2(base64File: string, tenantId: string, userId: string, periodKey: string): Promise<{
    url: string;
    key: string;
}>;
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
export declare function uploadClientDocumentToR2(base64File: string, fileName: string, tenantId: string, clientId: string, category: string, documentType: string): Promise<string>;
/**
 * Upload employee asset image to Cloudflare R2
 * @param base64 - Base64 encoded file string or an existing URL
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param employeeId - Employee ID
 * @param folder - The subfolder inside the employee's directory (e.g., 'assets', 'profile-pictures')
 * @returns Public URL of uploaded document
 */
export declare function uploadEmployeeAssetToR2({ base64, fileName, tenantId, employeeId, folder, }: {
    base64: string;
    fileName?: string;
    tenantId: string;
    employeeId: string;
    folder?: string;
}): Promise<string>;
/**
 * Upload candidate document to Cloudflare R2
 * @param base64File - Base64 encoded file string
 * @param fileName - Original file name
 * @param tenantId - Tenant ID
 * @param candidateId - Candidate ID
 * @param documentType - Type of document (e.g., resume, passport)
 * @returns Public URL of uploaded document
 */
export declare function uploadCandidateDocumentToR2(base64File: string, fileName: string, tenantId: string, candidateId: string, documentType: string): Promise<string>;
/**
 * Upload a bug-list attachment to Cloudflare R2.
 * Path: {tenantId}/bug-list/{folderId}/{sheetId}/{bugId}/{uniqueId}_{fileName}
 */
export declare function uploadBugAttachmentToR2(base64File: string, fileName: string, tenantId: string, folderId: string, sheetId: string, bugId: string): Promise<{
    fileUrl: string;
    fileSize: number;
    fileType: string;
}>;
/**
 * Delete any file from Cloudflare R2
 * @param fileUrl - Full URL of the file to delete
 * @param tenantId - Tenant ID for validation
 */
export declare function deleteFileFromR2(fileUrl: string, tenantId: string): Promise<void>;
/**
 * Delete bug attachment from Cloudflare R2
 * More robust than deleteFileFromR2 as it doesn't depend on .r2.dev in URL
 */
export declare function deleteBugAttachmentFromR2(fileUrl: string, tenantId: string): Promise<void>;
/**
 * Delete image from Cloudflare R2
 * @param imageUrl - Full URL of the image to delete
 * @param tenantId - Tenant ID for validation
 */
export declare function deleteImageFromR2(imageUrl: string, tenantId: string): Promise<void>;
/**
 * Extract image URLs from HTML content
 * @param htmlContent - HTML string containing img tags
 * @returns Array of image URLs
 */
export declare function extractImageUrlsFromHtml(htmlContent: string): string[];
/**
 * Clean up orphaned images when ticket description is updated
 * @param oldHtml - Previous HTML content
 * @param newHtml - New HTML content
 * @param tenantId - Tenant ID
 */
export declare function cleanupOrphanedImages(oldHtml: string, newHtml: string, tenantId: string): Promise<void>;
/**
 * Generate a presigned URL for a file stored in R2
 * @param fileUrl - The public URL of the file
 * @param expiresIn - Expiration time in seconds (default 24 hours)
 * @param download - If true, adds ResponseContentDisposition to force download
 */
export declare function generatePresignedUrl(fileUrl: string, expiresIn?: number, download?: boolean): Promise<string>;
/**
 * Fetch a file from R2 and return its content as a Buffer
 * Uses the internal S3 client with credentials.
 * @param fileUrl - The public-facing URL of the file
 */
export declare function getFileBufferFromR2(fileUrl: string): Promise<Buffer>;
export declare function uploadEscalationDocumentToR2(base64File: string, fileName: string, tenantId: string, escalationId: string): Promise<string>;
