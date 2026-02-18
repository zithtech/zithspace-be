import { S3Client } from '@aws-sdk/client-s3';
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
 * Delete any file from Cloudflare R2
 * @param fileUrl - Full URL of the file to delete
 * @param tenantId - Tenant ID for validation
 */
export declare function deleteFileFromR2(fileUrl: string, tenantId: string): Promise<void>;
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
