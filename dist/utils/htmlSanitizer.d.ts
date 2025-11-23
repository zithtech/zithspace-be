/**
 * Sanitize HTML content to prevent XSS attacks
 * Allows safe HTML tags and attributes for rich text content
 */
export declare function sanitizeHtmlContent(html: string): string;
/**
 * Validate HTML content length
 * @param html - HTML string to validate
 * @param maxLength - Maximum allowed length (default: 50000 characters)
 * @returns true if valid, throws error if invalid
 */
export declare function validateHtmlLength(html: string, maxLength?: number): boolean;
/**
 * Strip all HTML tags and return plain text
 * Useful for search indexing or previews
 */
export declare function stripHtmlTags(html: string): string;
/**
 * Get plain text preview from HTML (first N characters)
 */
export declare function getHtmlPreview(html: string, maxLength?: number): string;
