import { Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';
import { AuthRequest } from '@/types';
import { dbPool } from '@/utils/dbPool';
import { uploadFileToR2, deleteFileFromR2, getFileFromR2 } from '@/utils/r2Client';
import axios from 'axios';


// Configure storage for temporary processing
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  fileFilter: (req: any, file: Express.Multer.File, cb: FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.csv' || ext === '.xls') {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) or CSV files (.csv) are allowed'));
    }
  },
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit for large sheets
}).single('file');

export class ExcelController {

  /**
   * Initialize Schema (Raw SQL)
   * Ensures tables exist for Folder/File hierarchy
   */
  static async initSchema(req: AuthRequest, res: Response) {
    const sql = `
      CREATE TABLE IF NOT EXISTS excel_folders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        parent_id UUID REFERENCES excel_folders(id) ON DELETE CASCADE,
        tenant_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS excel_files (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        folder_id UUID REFERENCES excel_folders(id) ON DELETE CASCADE,
        file_url TEXT NOT NULL,
        file_size INTEGER,
        tenant_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `;
    try {
      await dbPool.query(sql);
      console.log('[Excel] Database tables initialized');
      return res.status(200).json({ success: true, message: 'Database tables initialized' });
    } catch (err: any) {
      console.error('[Excel] Schema init failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }


  /**
   * Create a folder (Raw Query)
   */
  static async createFolder(req: AuthRequest, res: Response) {
    const { name, parentId } = req.body;
    const tenantId = req.tenantId;

    try {
      const sql = 'INSERT INTO excel_folders (name, parent_id, tenant_id) VALUES ($1, $2, $3) RETURNING *';
      const folder = await dbPool.one(sql, [name, parentId || null, tenantId]);

      return res.status(201).json({ success: true, data: folder });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * List folders and files in a directory (Hierarchical view like Document Hub)
   */
  static async listContent(req: AuthRequest, res: Response) {
    const { parentId } = req.query;
    const tenantId = req.tenantId;

    console.log(`[Excel] Fetching content for parent: ${parentId || 'ROOT'} (Tenant: ${tenantId})`);

    try {
      // List sub-folders
      const folderSql = 'SELECT * FROM excel_folders WHERE tenant_id = $1 AND parent_id IS NOT DISTINCT FROM $2';
      const folders = await dbPool.rows(folderSql, [tenantId, parentId || null]);

      // List files
      const fileSql = 'SELECT * FROM excel_files WHERE tenant_id = $1 AND folder_id IS NOT DISTINCT FROM $2';
      const files = await dbPool.rows(fileSql, [tenantId, parentId || null]);

      console.log(`[Excel] Found ${folders.length} folders and ${files.length} files`);

      return res.status(200).json({
        success: true,
        data: { folders, files }
      });
    } catch (err: any) {
      console.error('[Excel] List content failed:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }


  /**
   * Save Workbook to R2 and DB (Raw Query)
   */
  static async saveWorkbook(req: AuthRequest, res: Response) {
    const { id, name, folderId, content } = req.body; // 'id' from frontend is 'fileId'
    const tenantId = req.tenantId;

    try {
      // 1. Upload to R2
      const uploadResult = await uploadFileToR2(content, name || 'workbook.xlsx', tenantId!, "excel-hub");
      
      let file;
      if (id) {
        // Update existing file record
        const sql = `
          UPDATE excel_files 
          SET name = $1, file_url = $2, file_size = $3, updated_at = NOW() 
          WHERE id = $4 AND tenant_id = $5 
          RETURNING *
        `;
        file = await dbPool.one(sql, [
          name || 'Untitled Spreadsheet', 
          uploadResult.fileUrl, 
          uploadResult.fileSize, 
          id,
          tenantId
        ]);
      } else {
        // Create new file record
        const sql = `
          INSERT INTO excel_files (name, folder_id, file_url, file_size, tenant_id) 
          VALUES ($1, $2, $3, $4, $5) 
          RETURNING *
        `;
        file = await dbPool.one(sql, [
          name || 'Untitled Spreadsheet', 
          folderId || null, 
          uploadResult.fileUrl, 
          uploadResult.fileSize, 
          tenantId
        ]);
      }

      return res.status(id ? 200 : 201).json({ success: true, data: file });
    } catch (err: any) {
      console.error('[ExcelSave] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }


  /**
   * Proxy fetch for R2 files to bypass CORS
   */
  static async getFileContent(req: AuthRequest, res: Response) {
    const { fileUrl } = req.query;
    if (!fileUrl) return res.status(400).json({ success: false, error: 'No file URL provided' });

    try {
      // Use our R2 client to fetch the file (handles auth and parsing)
      const buffer = await getFileFromR2(fileUrl as string);
      
      // Convert buffer to string
      const content = buffer.toString('utf-8');
      
      return res.status(200).json({
        success: true,
        data: JSON.parse(content)
      });
    } catch (err: any) {
      console.error('[ExcelProxy] Error:', err.message);
      return res.status(500).json({ 
        success: false, 
        error: err.message.includes('JSON') ? 'Invalid file format' : 'Failed to fetch file content from storage' 
      });
    }
  }


  /**
   * Delete a spreadsheet and its R2 file
   */
  static async deleteSpreadsheet(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const tenantId = req.tenantId;

    try {
      // 1. Get file metadata to get the R2 URL
      const fileSql = 'SELECT file_url FROM excel_files WHERE id = $1 AND tenant_id = $2';
      const file = await dbPool.one(fileSql, [id, tenantId]);

      if (!file) {
        return res.status(404).json({ success: false, error: 'Spreadsheet not found' });
      }

      // 2. Delete from Database
      await dbPool.query('DELETE FROM excel_files WHERE id = $1 AND tenant_id = $2', [id, tenantId]);

      // 3. Delete from R2 (Optional/Best Effort)
      try {
        await deleteFileFromR2(file.file_url, tenantId!);
      } catch (err) {
        console.error('[ExcelDelete] R2 cleanup failed:', err);
      }

      return res.status(200).json({ success: true, message: 'Spreadsheet deleted successfully' });
    } catch (err: any) {
      console.error('[ExcelDelete] Error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Legacy Parser (Keep for backward compatibility)
   */
  static async uploadExcel(req: AuthRequest, res: Response) {
    try {
      if (!req.tenantId || !req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const uploadPromise = () => new Promise<void>((resolve, reject) => {
        upload(req, res, (err) => err ? reject(err) : resolve());
      });

      await uploadPromise();
      if (!req.file) return res.status(400).json({ success: false, error: 'No file' });

      const workbook = XLSX.readFile(req.file.path, { cellDates: true });
      const result: Record<string, any[]> = {};

      workbook.SheetNames.forEach(sheetName => {
        result[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
      });

      fs.unlinkSync(req.file.path);

      return res.status(200).json({ success: true, data: result });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}
