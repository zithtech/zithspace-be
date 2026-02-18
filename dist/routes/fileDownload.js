"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("@/middleware/auth");
const tenantContext_1 = require("@/middleware/tenantContext");
const r2Client_1 = require("@/utils/r2Client");
const client_s3_1 = require("@aws-sdk/client-s3");
const router = (0, express_1.Router)();
// Apply tenant context resolution to all routes
router.use(tenantContext_1.resolveTenant);
// Apply authentication to all routes
router.use(auth_1.authenticateToken);
router.use(auth_1.requireAuth);
/**
 * @route   GET /api/files/download/:fileName
 * @desc    Download file from R2 storage with proper headers
 * @access  Private (authenticated users within tenant)
 * @param   fileName - Encoded file path/name
 * @query   preview - Set to 'true' for inline display (for preview), 'false' for attachment download
 */
router.get('/download/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        const { preview = 'false' } = req.query;
        const tenantId = req.tenantId;
        if (!tenantId) {
            return res.status(401).json({
                success: false,
                error: 'Tenant context required'
            });
        }
        // Decode the file name
        const decodedFileName = decodeURIComponent(fileName);
        // Validate that the file belongs to the tenant (security check)
        if (!decodedFileName.startsWith(tenantId)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied: File does not belong to this tenant'
            });
        }
        // Extract the original filename from the stored filename
        const originalFileName = decodedFileName.split('_').slice(1).join('_') || decodedFileName.split('/').pop() || 'download';
        // Get the file from R2
        const command = new client_s3_1.GetObjectCommand({
            Bucket: 'zithspace',
            Key: decodedFileName,
        });
        const response = await r2Client_1.s3Client.send(command);
        // Set appropriate headers
        const isPreview = preview === 'true';
        if (isPreview) {
            // For preview, try to display inline
            res.setHeader('Content-Type', response.ContentType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalFileName)}"`);
            res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour for preview
        }
        else {
            // For download, force download
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalFileName)}"`);
            res.setHeader('Cache-Control', 'private, max-age=86400'); // Cache for 24 hours for download
        }
        // Set content length if available
        if (response.ContentLength) {
            res.setHeader('Content-Length', response.ContentLength);
        }
        // Set CORS headers for preview
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.setHeader('Access-Control-Allow-Headers', 'Range');
        // Handle range requests for video/audio files
        const range = req.headers.range;
        if (range && response.ContentType && ['video/', 'audio/'].some(type => response.ContentType.includes(type))) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : response.ContentLength - 1;
            const chunksize = (end - start) + 1;
            res.status(206);
            res.setHeader('Content-Range', `bytes ${start}-${end}/${response.ContentLength}`);
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Length', chunksize);
            // Stream the specific range
            const stream = response.Body;
            stream.on('data', (chunk) => {
                // We need to handle range streaming properly
                // For now, we'll send the full file but with proper headers
            });
        }
        // Stream the file to the client
        const body = response.Body;
        if (body.pipe) {
            body.pipe(res);
        }
        else {
            // Handle case where Body is a Blob
            const buffer = Buffer.from(await body.arrayBuffer());
            res.send(buffer);
        }
    }
    catch (error) {
        console.error('File download error:', error);
        if (error.name === 'NoSuchKey') {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }
        if (error.name === 'AccessDenied') {
            return res.status(403).json({
                success: false,
                error: 'Access denied to file'
            });
        }
        res.status(500).json({
            success: false,
            error: 'Failed to download file',
            ...(process.env.NODE_ENV === 'development' && { details: error.message })
        });
    }
});
/**
 * @route   GET /api/files/preview/:fileName
 * @desc    Preview file from R2 storage (inline display)
 * @access  Private (authenticated users within tenant)
 * @param   fileName - Encoded file path/name
 */
router.get('/preview/:fileName', async (req, res) => {
    // Redirect to download endpoint with preview=true
    res.redirect(`/api/files/download/${encodeURIComponent(req.params.fileName)}?preview=true`);
});
exports.default = router;
//# sourceMappingURL=fileDownload.js.map