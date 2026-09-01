import { Response } from "express";
import { AuthRequest, ApiResponse } from "@/types";
import pool from "@/config/dbpool";
import { uploadBufferToR2 } from "@/utils/r2Client";
import { UnifiedAuthService } from "@/services/UnifiedAuthService";
import { CalendarProvider } from "@prisma/client";
import { createDocumentModel } from "@/models/document.model";
import { createDocumentTreeModel, getLastNodePositionModel } from "@/models/documentTree.model";
import axios from "axios";
import { recordTransaction, Section, Module, Page, Action, EntityType } from "@/utils/transactionHistory";
import { FileExtractor } from "@/utils/FileExtractor";
import { NotionAuthService } from "@/services/NotionAuthService";

export class DocumentHubUploadController {
  
  /**
   * Helper to create the Document and DocumentTree records for an imported/uploaded file
   */
  private static async createExternalDocumentRecord(
    req: AuthRequest,
    hubId: string,
    fileMeta: {
      fileName: string,
      mimeType: string,
      fileSize: number,
      sourceType: string,
      externalFileId: string | null,
      attachmentUrl: string,
    },
    extractedBlocks: any[] = [],
    parentId: string | null = null
  ) {
    const tenantId = req.tenantId!;
    const userId = req.user!.id;

    // Check if the hub exists
    const hubQuery = await pool.query(`SELECT id, name FROM document_hub WHERE id = $1 AND "tenantId" = $2 AND is_deleted = false`, [hubId, tenantId]);
    if (hubQuery.rows.length === 0) {
      throw new Error("Document Hub not found");
    }

    // Check for duplicates (if external source)
    if (fileMeta.externalFileId) {
      const existingQuery = await pool.query(
        `SELECT id FROM documents WHERE "documentHubId" = $1 AND "tenantId" = $2 AND content->0->'props'->>'externalFileId' = $3`,
        [hubId, tenantId, fileMeta.externalFileId]
      );
      if (existingQuery.rows.length > 0) {
        throw new Error("File already imported into this Document Hub");
      }
    }

    // Use extracted blocks directly without embedding a file attachment link
    const blocknoteContent = extractedBlocks.length > 0 ? extractedBlocks : [{ type: "paragraph", content: [] }];

    // Create Document record
    const doc = await createDocumentModel({
      tenantId,
      documentHubId: hubId,
      title: fileMeta.fileName,
      content: blocknoteContent,
      createdById: userId,
      visibility: "public",
      shareToken: require("crypto").randomBytes(32).toString("hex"),
    });

    // Create DocumentTree node
    const lastPosition = await getLastNodePositionModel(hubId, tenantId, parentId);
    const position = lastPosition !== null ? lastPosition + 1 : 0;

    const newNode = await createDocumentTreeModel({
      tenantId,
      documentHubId: hubId,
      parentId,
      title: fileMeta.fileName,
      type: "file",
      position,
      createdById: userId,
      documentId: doc.id,
    });

    // Record Transaction History
    recordTransaction({
      req,
      section: Section.WORK,
      module: Module.DOCUMENT_HUB,
      page: Page.DOCUMENT_HUB_LIST,
      action: Action.CREATE,
      actionLabel: `Imported file ${fileMeta.fileName} from ${fileMeta.sourceType}`,
      entityType: EntityType.DOCUMENT,
      entityId: doc.id,
      entityLabel: fileMeta.fileName,
      parentEntityType: EntityType.DOCUMENT_HUB,
      parentEntityId: hubId,
      afterData: { title: fileMeta.fileName, type: "file", sourceType: fileMeta.sourceType },
      statusCode: 201,
    });

    return newNode;
  }

  /**
   * 1. My Computer - Upload Local File
   */
  static async uploadLocalFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user || !req.file) {
        res.status(400).json({ success: false, error: "File and context required" } as ApiResponse);
        return;
      }

      const { hubId } = req.params;
      const file = req.file;
      const { parentId } = req.body;

      // Extract blocks
      let extractedBlocks: any[] = [];
      try {
          extractedBlocks = await FileExtractor.extractBlocks(file.buffer, file.mimetype, file.originalname);
      } catch (extractError) {
          console.error("Failed to extract blocks from local file:", extractError);
      }

      // Upload to Cloudflare R2
      const r2Result = await uploadBufferToR2(
        file.buffer,
        file.mimetype,
        file.originalname,
        req.tenantId,
        `document-hubs/${hubId}`
      );

      // Create Document Record
      const node = await DocumentHubUploadController.createExternalDocumentRecord(req, hubId, {
        fileName: file.originalname,
        mimeType: r2Result.fileType,
        fileSize: r2Result.fileSize,
        sourceType: "my_computer",
        externalFileId: null,
        attachmentUrl: r2Result.fileUrl
      }, extractedBlocks, parentId || null);

      res.status(201).json({ success: true, data: node } as ApiResponse);
    } catch (error: any) {
      console.error("Local file upload error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to upload file" } as ApiResponse);
    }
  }

  /**
   * Generic file upload for Document Editor (inline images, audio, video)
   */
  static async uploadEditorMedia(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user || !req.file) {
        res.status(400).json({ success: false, error: "File required" } as ApiResponse);
        return;
      }
      const file = req.file;
      const r2Result = await uploadBufferToR2(
        file.buffer,
        file.mimetype,
        file.originalname,
        req.tenantId,
        `editor-media`
      );
      res.json({ success: true, url: r2Result.fileUrl });
    } catch (error: any) {
      console.error("Error uploading editor media:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to upload media" } as ApiResponse);
    }
  }


  /**
   * 2. Google Drive - List Files & Folders
   */
  static async listGoogleDriveFiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
        return;
      }

      const folderId = (req.query.folderId as string) || "root";
      const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.GOOGLE);

      const q = `'${folderId}' in parents and trashed = false`;
      const response = await axios.get("https://www.googleapis.com/drive/v3/files", {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          q,
          fields: "files(id, name, mimeType, size)",
          orderBy: "folder,name"
        }
      });

      res.status(200).json({ success: true, data: response.data.files } as ApiResponse);
    } catch (error: any) {
      console.error("Google Drive list files error:", error.response?.data || error.message);
      const isMissing = error.message === "No integration found";
      const status = error.response?.status;
      const responseStatus = isMissing || status === 401 ? 403 : (status || 500);
      
      let googleErrorMsg = error.response?.data?.error?.message || error.message;
      if (typeof error.response?.data === 'string') googleErrorMsg = error.response.data;

      res.status(responseStatus).json({ 
        success: false, 
        error: isMissing ? "Google Drive integration not found" : `Google Error: ${googleErrorMsg}` 
      } as ApiResponse);
    }
  }

  /**
   * 3. Google Drive - Import File
   */
  static async importGoogleDriveFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
        return;
      }

      const { hubId } = req.params;
      const { fileId, fileName, mimeType, parentId } = req.body;

      if (!fileId || !fileName) {
        res.status(400).json({ success: false, error: "fileId and fileName are required" } as ApiResponse);
        return;
      }

      const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.GOOGLE);

      // Download or Export file from Google Drive
      let response;
      if (mimeType === 'application/vnd.google-apps.document') {
          response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: "arraybuffer"
          });
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
          response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/csv`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: "arraybuffer"
          });
      } else if (mimeType === 'application/vnd.google-apps.presentation') {
          response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: "arraybuffer"
          });
      } else {
          response = await axios.get(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              headers: { Authorization: `Bearer ${accessToken}` },
              responseType: "arraybuffer"
          });
      }

      const buffer = Buffer.from(response.data);

      // Extract blocks
      let extractedBlocks: any[] = [];
      try {
          const exportMime = mimeType === 'application/vnd.google-apps.document' ? 'text/plain' 
                           : mimeType === 'application/vnd.google-apps.spreadsheet' ? 'text/csv'
                           : mimeType === 'application/vnd.google-apps.presentation' ? 'text/plain'
                           : mimeType;
          extractedBlocks = await FileExtractor.extractBlocks(buffer, exportMime, fileName);
      } catch (err) {
          console.error("Content extraction failed:", err);
          extractedBlocks = [
              {
                  type: "paragraph",
                  content: [{ type: "text", text: "File imported successfully, but the content could not be extracted.", styles: { italic: true, textColor: "gray" } }]
              }
          ];
      }

      // Upload to R2
      const r2Result = await uploadBufferToR2(
        buffer,
        mimeType || response.headers['content-type'] || 'application/octet-stream',
        fileName,
        req.tenantId,
        `document-hubs/${hubId}`
      );

      // Create Document Record
      const node = await DocumentHubUploadController.createExternalDocumentRecord(req, hubId, {
        fileName,
        mimeType: r2Result.fileType,
        fileSize: r2Result.fileSize,
        sourceType: "google_drive",
        externalFileId: fileId,
        attachmentUrl: r2Result.fileUrl
      }, extractedBlocks, parentId || null);

      res.status(201).json({ success: true, data: node } as ApiResponse);
    } catch (error: any) {
      console.error("Google Drive import error:", error.response?.data || error.message);
      const isMissing = error.message === "No integration found";
      const status = error.response?.status;
      const isDuplicate = error.message === "File already imported into this Document Hub";
      
      let responseStatus = status || 500;
      if (isMissing || status === 401) responseStatus = 403;
      if (isDuplicate) responseStatus = 409;

      const errorMessage = isDuplicate ? error.message : (isMissing ? "Google Drive integration not found" : "Failed to import Google Drive file");
      res.status(responseStatus).json({ success: false, error: errorMessage } as ApiResponse);
    }
  }

    /**
     * 4. Zoho Drive - List Files & Folders (WorkDrive API)
     */
    static async listZohoDriveFiles(req: AuthRequest, res: Response): Promise<void> {
      try {
        if (!req.tenantId || !req.user) {
          res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
          return;
        }
  
        const folderId = (req.query.folderId as string) || "root";
        const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.ZOHO);
  
        let endpoint = "";
        let myFolderId = "";
        
        if (folderId === "root") {
            // Fetch users/me to get the user's myfolderId (My Folders root)
            const meResponse = await axios.get("https://www.zohoapis.in/workdrive/api/v1/users/me", {
                headers: { 
                    Authorization: `Zoho-oauthtoken ${accessToken}`,
                    Accept: "application/vnd.api+json"
                }
            });
            
            // Try multiple paths depending on exact JSON API response structure
            const attrs = meResponse.data?.data?.attributes || meResponse.data?.attributes || {};
            myFolderId = attrs.preferred_org_info?.privatespace_id || 
                         attrs.last_viewed_org_info?.privatespace_id ||
                         meResponse.data?.myfolderId || 
                         meResponse.data?.data?.myfolderId;
                         
            if (!myFolderId) {
                console.error("Zoho Drive users/me response missing myfolderId. Raw data:", meResponse.data);
                res.status(200).json({ success: true, data: [] } as ApiResponse);
                return;
            }
            endpoint = `https://www.zohoapis.in/workdrive/api/v1/files/${myFolderId}/files`;
        } else {
            // Fetch files in a folder
            endpoint = `https://www.zohoapis.in/workdrive/api/v1/files/${folderId}/files`;
        }
  
        const response = await axios.get(endpoint, {
          headers: { 
              Authorization: `Zoho-oauthtoken ${accessToken}`,
              Accept: "application/vnd.api+json"
          }
        });
  
        const items = response.data.data || [];
        const mappedFiles = items.map((item: any) => {
            const isFolder = item.type === 'workspaces' || item.type === 'folders' || item.attributes?.is_folder;
            return {
                id: item.id,
                name: item.attributes?.name || "Untitled",
                mimeType: isFolder ? "folder" : (item.attributes?.mime_type || "application/octet-stream"),
                size: item.attributes?.size || 0
            };
        });
  
        res.status(200).json({ success: true, data: mappedFiles } as ApiResponse);
      } catch (error: any) {
        console.error("Zoho Drive list files error:", error.response?.data || error.message);
        const isMissing = error.message === "No integration found";
        const status = error.response?.status;
        const responseStatus = isMissing || status === 401 ? 403 : (status || 500);
        
        let zohoErrorMsg = error.response?.data?.errors?.[0]?.title || error.message;
        res.status(responseStatus).json({ 
          success: false, 
          error: isMissing ? "Zoho Drive integration not found" : `Zoho Error: ${zohoErrorMsg}` 
        } as ApiResponse);
      }
    }
  
    /**
     * 5. Zoho Drive - Import File
     */
    static async importZohoDriveFile(req: AuthRequest, res: Response): Promise<void> {
      try {
        if (!req.tenantId || !req.user) {
          res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
          return;
        }
  
        const { hubId } = req.params;
        const { fileId, fileName, mimeType, parentId } = req.body;
  
        if (!fileId || !fileName) {
          res.status(400).json({ success: false, error: "fileId and fileName are required" } as ApiResponse);
          return;
        }
  
        const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.ZOHO);
  
        // Download file from Zoho WorkDrive
        const response = await axios.get(`https://www.zohoapis.in/workdrive/api/v1/download/${fileId}`, {
            headers: { 
                Authorization: `Zoho-oauthtoken ${accessToken}`,
                Accept: "application/vnd.api+json"
            },
            responseType: "arraybuffer"
        });
  
        const buffer = Buffer.from(response.data);
  
        // Determine actual mime type and filename since Zoho API converts native formats
        // (e.g. zwriter) into docx during download.
        const actualMimeType = response.headers['content-type'] || mimeType || 'application/octet-stream';
        let actualFileName = fileName;
        
        const disposition = response.headers['content-disposition'];
        if (disposition) {
            const utf8Match = disposition.match(/filename\*\s*=\s*(?:UTF-\d+''|)([^;]+)/i);
            const asciiMatch = disposition.match(/filename\s*=\s*['"]?([^'";]+)['"]?/i);
            if (utf8Match && utf8Match[1]) {
                actualFileName = decodeURIComponent(utf8Match[1].trim());
            } else if (asciiMatch && asciiMatch[1]) {
                actualFileName = decodeURIComponent(asciiMatch[1].trim());
            }
        }

        // Extract blocks
        let extractedBlocks: any[] = [];
        try {
            extractedBlocks = await FileExtractor.extractBlocks(buffer, actualMimeType, actualFileName);
        } catch (extractError) {
            console.error("Failed to extract blocks from Zoho Drive file:", extractError);
            extractedBlocks = [
                {
                    type: "paragraph",
                    content: [{ type: "text", text: "File imported successfully, but the content could not be extracted.", styles: { italic: true, textColor: "gray" } }]
                }
            ];
        }
  
        // Upload to Cloudflare R2
        const r2Result = await uploadBufferToR2(
          buffer,
          actualMimeType,
          actualFileName,
          req.tenantId,
          `document-hubs/${hubId}`
        );
  
        // Create Document Record
        const node = await DocumentHubUploadController.createExternalDocumentRecord(req, hubId, {
          fileName: actualFileName,
          mimeType: actualMimeType,
          fileSize: buffer.length,
          sourceType: "zoho_drive",
          externalFileId: fileId,
          attachmentUrl: r2Result.fileUrl
        }, extractedBlocks, parentId || null);
  
        res.status(201).json({ success: true, data: node } as ApiResponse);
      } catch (error: any) {
        console.error("Zoho Drive import error:", error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message } as ApiResponse);
      }
    }

    /**
     * 6. Microsoft OneDrive - List Files & Folders
     */
    static async listOneDriveFiles(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
                return;
            }

            const folderId = (req.query.folderId as string) || "root";
            const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.MICROSOFT);

            // Fetch files from Microsoft Graph API
            const endpoint = folderId === "root"
                ? `https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,file,folder,size,fileSystemInfo`
                : `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$select=id,name,file,folder,size,fileSystemInfo`;

            const response = await axios.get(endpoint, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            // Map response to standard { id, name, mimeType, size } format
            const data = (response.data.value || []).map((item: any) => ({
                id: item.id,
                name: item.name,
                mimeType: item.folder ? "folder" : (item.file?.mimeType || "application/octet-stream"),
                size: item.size
            }));

            // Optional: sort folders first
            data.sort((a: any, b: any) => {
                if (a.mimeType === "folder" && b.mimeType !== "folder") return -1;
                if (a.mimeType !== "folder" && b.mimeType === "folder") return 1;
                return a.name.localeCompare(b.name);
            });

            res.status(200).json({ success: true, data } as ApiResponse);
        } catch (error: any) {
            console.error("OneDrive list files error:", error.response?.data || error.message);
            const statusCode = error.response?.status || 500;
            res.status(statusCode).json({ success: false, error: error.response?.data?.error?.message || error.message } as ApiResponse);
        }
    }

    /**
     * 7. Microsoft OneDrive - Import File
     */
    static async importOneDriveFile(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
                return;
            }

            const { hubId } = req.params;
            const { fileId, fileName, mimeType, parentId } = req.body;

            if (!fileId || !fileName) {
                res.status(400).json({ success: false, error: "fileId and fileName are required" } as ApiResponse);
                return;
            }

            const accessToken = await UnifiedAuthService.getValidAccessToken(req.user.id, CalendarProvider.MICROSOFT);

            // Download file from OneDrive (Microsoft Graph API)
            const response = await axios.get(`https://graph.microsoft.com/v1.0/me/drive/items/${fileId}/content`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                responseType: "arraybuffer"
            });

            const buffer = Buffer.from(response.data);

            const actualMimeType = response.headers['content-type'] || mimeType || 'application/octet-stream';
            let actualFileName = fileName;

            // Try to parse content-disposition just in case
            const disposition = response.headers['content-disposition'];
            if (disposition) {
                const utf8Match = disposition.match(/filename\*\s*=\s*(?:UTF-\d+''|)([^;]+)/i);
                const asciiMatch = disposition.match(/filename\s*=\s*['"]?([^'";]+)['"]?/i);
                if (utf8Match && utf8Match[1]) {
                    actualFileName = decodeURIComponent(utf8Match[1].trim());
                } else if (asciiMatch && asciiMatch[1]) {
                    actualFileName = decodeURIComponent(asciiMatch[1].trim());
                }
            }

            // Extract blocks
            let extractedBlocks: any[] = [];
            try {
                extractedBlocks = await FileExtractor.extractBlocks(buffer, actualMimeType, actualFileName);
            } catch (extractError) {
                console.error("Failed to extract blocks from OneDrive file:", extractError);
                extractedBlocks = [
                    {
                        type: "paragraph",
                        content: [{ type: "text", text: "File imported successfully, but the content could not be extracted.", styles: { italic: true, textColor: "gray" } }]
                    }
                ];
            }

            // Upload to Cloudflare R2
            const r2Result = await uploadBufferToR2(
                buffer,
                actualMimeType,
                actualFileName,
                req.tenantId,
                `document-hubs/${hubId}`
            );

            // Create Document Record
            const node = await DocumentHubUploadController.createExternalDocumentRecord(req, hubId, {
                fileName: actualFileName,
                mimeType: actualMimeType,
                fileSize: buffer.length,
                sourceType: "microsoft_onedrive",
                externalFileId: fileId,
                attachmentUrl: r2Result.fileUrl
            }, extractedBlocks, parentId || null);

            res.status(201).json({ success: true, data: node } as ApiResponse);
        } catch (error: any) {
            console.error("OneDrive import error:", error.response?.data || error.message);
            const statusCode = error.response?.status || 500;
            res.status(statusCode).json({ success: false, error: error.response?.data?.error?.message || error.message } as ApiResponse);
        }
    }

    static async listNotionFiles(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
                return;
            }

            const accessToken = await NotionAuthService.getValidAccessToken(req.user.id, req.tenantId);

            const allResults: any[] = [];
            let cursor = undefined;
            let hasMore = true;

            while (hasMore) {
                const response = await axios.post("https://api.notion.com/v1/search", {
                    sort: {
                        direction: "descending",
                        timestamp: "last_edited_time"
                    },
                    page_size: 100,
                    ...(cursor ? { start_cursor: cursor } : {})
                }, {
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Notion-Version": "2022-06-28",
                        "Content-Type": "application/json"
                    }
                });

                allResults.push(...response.data.results);
                hasMore = response.data.has_more;
                cursor = response.data.next_cursor;
                
                // Safety limit to prevent infinite loops / too many pages (e.g. max 1000)
                if (allResults.length >= 1000) {
                    hasMore = false;
                }
            }

            const folderId = (req.query.folderId as string) || "root";
            const allIds = new Set(allResults.map(p => p.id));

            let filteredResults = [];
            if (folderId === "root") {
                filteredResults = allResults.filter(page => {
                    const parent = page.parent;
                    if (!parent) return true;
                    if (parent.type === "workspace") return true;
                    const pId = parent.page_id || parent.database_id || parent.block_id;
                    if (!pId) return true;
                    return !allIds.has(pId);
                });
            } else {
                filteredResults = allResults.filter(page => {
                    const parent = page.parent;
                    if (!parent) return false;
                    const pId = parent.page_id || parent.database_id || parent.block_id;
                    return pId === folderId;
                });
            }

            const files = filteredResults.map((page: any) => {
                let title = "Untitled";
                
                // Notion properties can be named anything, but typically 'title' or 'Name' 
                // contains the title array. Let's find any property of type 'title'
                if (page.properties) {
                    const titleProp = Object.values(page.properties).find((p: any) => p.type === 'title') as any;
                    if (titleProp && titleProp.title && titleProp.title.length > 0) {
                        title = titleProp.title.map((t: any) => t.plain_text).join("");
                    } else if (page.properties.title && page.properties.title.title && page.properties.title.title.length > 0) {
                        title = page.properties.title.title[0].plain_text;
                    } else if (page.properties.Name && page.properties.Name.title && page.properties.Name.title.length > 0) {
                        title = page.properties.Name.title[0].plain_text;
                    }
                } else if (page.title && page.title.length > 0) {
                    // Sometimes title is direct on the database object
                    title = page.title.map((t: any) => t.plain_text).join("");
                }

                const hasChildren = allResults.some(child => {
                    const childParent = child.parent;
                    if (!childParent) return false;
                    const childPId = childParent.page_id || childParent.database_id || childParent.block_id;
                    return childPId === page.id;
                });

                let finalMimeType = page.object === "database" ? "application/vnd.notion.database" : "application/vnd.notion.page";
                if (finalMimeType === "application/vnd.notion.page" && hasChildren) {
                    // Treat pages that have sub-pages as folders so the user can navigate into them
                    finalMimeType = "folder";
                }

                return {
                    id: page.id,
                    name: title,
                    mimeType: finalMimeType,
                    size: 0
                };
            });

            res.status(200).json({ success: true, data: files } as ApiResponse);
        } catch (error: any) {
            console.error("Notion list files error:", error.response?.data || error.message);
            if (error.message === "Notion is not connected. Please connect your Notion account.") {
                res.status(403).json({ success: false, error: error.message } as ApiResponse);
                return;
            }
            res.status(500).json({ success: false, error: error.response?.data?.message || "Failed to list Notion files" } as ApiResponse);
        }
    }

    static async importNotionFile(req: AuthRequest, res: Response): Promise<void> {
        try {
            if (!req.tenantId || !req.user) {
                res.status(400).json({ success: false, error: "Context required" } as ApiResponse);
                return;
            }

            const { hubId } = req.params;
            const { fileId, fileName, mimeType, parentId } = req.body;

            if (!fileId || !fileName) {
                res.status(400).json({ success: false, error: "fileId and fileName are required" } as ApiResponse);
                return;
            }

            const accessToken = await NotionAuthService.getValidAccessToken(req.user.id, req.tenantId);

            const fetchNotionBlocks = async (blockId: string): Promise<any[]> => {
                let allBlocks: any[] = [];
                let cursor = undefined;
                do {
                    const response = await axios.get(`https://api.notion.com/v1/blocks/${blockId}/children`, {
                        headers: { 
                            "Authorization": `Bearer ${accessToken}`,
                            "Notion-Version": "2022-06-28"
                        },
                        params: {
                            page_size: 100,
                            start_cursor: cursor
                        }
                    });
                    allBlocks = allBlocks.concat(response.data.results);
                    cursor = response.data.next_cursor;
                } while (cursor);
                return allBlocks;
            };

            const mapNotionRichText = (richTextArray: any[]) => {
                if (!richTextArray || richTextArray.length === 0) return [];
                return richTextArray.map(rt => {
                    const styles: any = {};
                    if (rt.annotations) {
                        if (rt.annotations.bold) styles.bold = true;
                        if (rt.annotations.italic) styles.italic = true;
                        if (rt.annotations.strikethrough) styles.strike = true;
                        if (rt.annotations.underline) styles.underline = true;
                        if (rt.annotations.code) styles.code = true;
                    }
                    return {
                        type: "text",
                        text: rt.plain_text,
                        styles
                    };
                });
            };

            const parseBlocks = async (notionBlocks: any[]): Promise<any[]> => {
                const extracted: any[] = [];
                // Process in chunks of 3 to safely parallelize without hitting Notion rate limits
                const chunkSize = 3;
                for (let i = 0; i < notionBlocks.length; i += chunkSize) {
                    const chunk = notionBlocks.slice(i, i + chunkSize);
                    const chunkResults = await Promise.all(chunk.map(async (block) => {
                        let children: any[] = [];
                        if (block.has_children) {
                            const childBlocks = await fetchNotionBlocks(block.id);
                            children = await parseBlocks(childBlocks);
                        }

                        if (block.type === "paragraph" && block.paragraph.rich_text) {
                            return {
                                type: "paragraph",
                                content: mapNotionRichText(block.paragraph.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "heading_1" && block.heading_1.rich_text) {
                            return {
                                type: "heading",
                                props: { level: 1 },
                                content: mapNotionRichText(block.heading_1.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "heading_2" && block.heading_2.rich_text) {
                            return {
                                type: "heading",
                                props: { level: 2 },
                                content: mapNotionRichText(block.heading_2.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "heading_3" && block.heading_3.rich_text) {
                            return {
                                type: "heading",
                                props: { level: 3 },
                                content: mapNotionRichText(block.heading_3.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "bulleted_list_item" && block.bulleted_list_item.rich_text) {
                            return {
                                type: "bulletListItem",
                                content: mapNotionRichText(block.bulleted_list_item.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "numbered_list_item" && block.numbered_list_item.rich_text) {
                            return {
                                type: "numberedListItem",
                                content: mapNotionRichText(block.numbered_list_item.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        } else if (block.type === "toggle" && block.toggle.rich_text) {
                            return {
                                type: "toggleListItem",
                                content: mapNotionRichText(block.toggle.rich_text),
                                children: children.length > 0 ? children : undefined
                            };
                        }
                        return null;
                    }));
                    extracted.push(...chunkResults.filter(Boolean));
                }
                return extracted;
            };

            const rootBlocks = await fetchNotionBlocks(fileId);
            const extractedBlocks = await parseBlocks(rootBlocks);

            const generateTextContent = (blocks: any[], depth: number = 0): string => {
                let text = "";
                const indent = "  ".repeat(depth);
                for (const b of blocks) {
                    const lineText = b.content ? b.content.map((c: any) => c.text).join("") : "";
                    if (b.type === "bulletListItem") text += indent + "• " + lineText + "\n";
                    else if (b.type === "numberedListItem") text += indent + "1. " + lineText + "\n";
                    else if (b.type === "toggleListItem") text += indent + "▸ " + lineText + "\n";
                    else text += indent + lineText + "\n\n";

                    if (b.children && b.children.length > 0) {
                        text += generateTextContent(b.children, depth + 1);
                    }
                }
                return text;
            };

            const textContent = generateTextContent(extractedBlocks);

            const buffer = Buffer.from(textContent, "utf-8");
            const r2Result = await uploadBufferToR2(
                buffer,
                "text/plain",
                fileName + ".txt",
                req.tenantId,
                `external/notion/${hubId}`
            );

            const node = await DocumentHubUploadController.createExternalDocumentRecord(req, hubId, {
                fileName: fileName + ".txt",
                mimeType: "text/plain",
                fileSize: buffer.length,
                sourceType: "notion",
                externalFileId: fileId,
                attachmentUrl: r2Result.fileUrl
            }, extractedBlocks, parentId || null);

            res.status(201).json({ success: true, data: node } as ApiResponse);
        } catch (error: any) {
            console.error("Notion import error:", error.response?.data || error.message);
            if (error.message === "Notion is not connected. Please connect your Notion account.") {
                res.status(403).json({ success: false, error: error.message } as ApiResponse);
                return;
            }
            const statusCode = error.response?.status || 500;
            res.status(statusCode).json({ success: false, error: error.response?.data?.message || error.message } as ApiResponse);
        }
    }
}
