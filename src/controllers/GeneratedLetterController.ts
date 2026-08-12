import { getFileBufferFromR2 } from '../utils/r2Client';
import { Response } from 'express';
import { AuthRequest, ApiResponse, ValidationError } from '../types';
import { GeneratedLetterService } from '../services/GeneratedLetterService';

export class GeneratedLetterController {
  static async getGeneratedLetters(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { templateId, categoryId, status, referenceEntityId, search } = req.query;
      const letters = await GeneratedLetterService.getGeneratedLetters(req.tenantId, {
        templateId: templateId as string,
        categoryId: categoryId as string,
        status: status as string,
        referenceEntityId: referenceEntityId as string,
        search: search as string,
      });

      res.status(200).json({
        success: true,
        data: letters,
      } as ApiResponse);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch generated documents',
      } as ApiResponse);
    }
  }

  static async getGeneratedLetterById(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const letter = await GeneratedLetterService.getGeneratedLetterById(req.tenantId, id);

      res.status(200).json({
        success: true,
        data: letter,
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Generated document not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to fetch generated document',
      } as ApiResponse);
    }
  }

  static async previewLetter(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { templateId, values, generatedDocumentId, customContent } = req.body;
      if (!values) {
        throw new ValidationError('Placeholder values are required');
      }
      if (!templateId && !generatedDocumentId && !customContent) {
        throw new ValidationError('Either a template ID, a generated document ID, or custom content is required for preview');
      }


      const renderedHtml = await GeneratedLetterService.previewLetter(req.tenantId, templateId, values, generatedDocumentId, customContent);

      res.status(200).json({
        success: true,
        data: { renderedHtml },
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Template not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to generate live preview',
      } as ApiResponse);
    }
  }

  static async generateLetter(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { templateId, referenceEntityId, referenceEntityType, documentNumber, documentName, values, customContent } = req.body;
      if (!templateId || !values) {
        throw new ValidationError('Template ID and values map are required');
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const doc = await GeneratedLetterService.generateLetter(
        req.tenantId,
        {
          templateId,
          referenceEntityId,
          referenceEntityType,
          documentNumber,
          documentName,
          values,
          customContent,
        },
        req.user.id,
        ipAddress
      );

      res.status(201).json({
        success: true,
        data: doc,
        message: 'Document generated successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to generate document',
      } as ApiResponse);
    }
  }

  static async updateLetter(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id } = req.params;
      const { templateId, referenceEntityId, referenceEntityType, documentNumber, documentName, values, customContent } = req.body;
      if (!templateId || !values) {
        throw new ValidationError('Template ID and values map are required');
      }

      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      const doc = await GeneratedLetterService.updateGeneratedLetter(
        req.tenantId,
        id,
        {
          templateId,
          referenceEntityId,
          referenceEntityType,
          documentNumber,
          documentName,
          values,
          customContent,
        },
        req.user.id,
        ipAddress
      );

      res.status(200).json({
        success: true,
        data: doc,
        message: 'Document updated successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error instanceof ValidationError ? 400 : 500).json({
        success: false,
        message: error.message || 'Failed to update document',
      } as ApiResponse);
    }
  }

  static async downloadPDF(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const doc = await GeneratedLetterService.getGeneratedLetterById(req.tenantId, id);

      if (!doc.pdfFilePath || doc.pdfFilePath.includes('/api/')) {
        throw new Error('PDF file is missing or still processing.');
      }

      const pdfBuffer = await getFileBufferFromR2(doc.pdfFilePath);

      // Safe filename handling whether template exists or not
      const templateName = doc.template ? doc.template.templateName.replace(/\s+/g, '_') : 'Document';
      const filename = `${doc.documentNumber}_${templateName}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to download PDF',
      } as ApiResponse);
    }
  }

  static async downloadDOCX(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId) {
        throw new ValidationError('Tenant context required');
      }

      const { id } = req.params;
      const doc = await GeneratedLetterService.getGeneratedLetterById(req.tenantId, id);

      if (!doc.docxFilePath || doc.docxFilePath.includes('/api/')) {
        throw new Error('DOCX file is missing or still processing.');
      }

      const docxBuffer = await getFileBufferFromR2(doc.docxFilePath);

      // Safe filename handling whether template exists or not
      const templateName = doc.template ? doc.template.templateName.replace(/\s+/g, '_') : 'Document';
      const filename = `${doc.documentNumber}_${templateName}.docx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', docxBuffer.length);
      res.send(docxBuffer);
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to download DOCX',
      } as ApiResponse);
    }
  }

  static async deleteGeneratedLetter(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.tenantId || !req.user) {
        throw new ValidationError('Tenant context and user authentication required');
      }

      const { id } = req.params;
      const ipAddress = req.ip || req.socket.remoteAddress || undefined;
      await GeneratedLetterService.deleteGeneratedLetter(req.tenantId, id, req.user.id, ipAddress);

      res.status(200).json({
        success: true,
        message: 'Generated document deleted successfully',
      } as ApiResponse);
    } catch (error: any) {
      res.status(error.message === 'Generated document not found' ? 404 : 500).json({
        success: false,
        message: error.message || 'Failed to delete generated document',
      } as ApiResponse);
    }
  }
}
