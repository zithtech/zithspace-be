// src/modules/pipeline/controllers/candidateController.ts
import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as candidateService from '../services/candidateService';
import * as logService from '../services/logService';
import * as documentService from '../services/documentService';
import { parseResumeFile } from '../services/resumeParser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadCandidateDocumentToR2, uploadResumeToR2 } from '../../../utils/r2Client';
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '@/utils/transactionHistory';

const uploadDir = path.join(process.cwd(), 'uploads', 'resumes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});
export const upload = multer({ storage });

export const parseResume = handle(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new Error('No resume file provided');
  const actor = actorOf(req);
  const parsed = await parseResumeFile(req.file.path, req.file.mimetype);
  
  let file_url: string;
  try {
    // Upload to R2 so the URL is publicly accessible (required for Google Docs Viewer)
    file_url = await uploadResumeToR2(
      req.file.path,
      req.file.originalname,
      actor.tenantId,
      req.file.mimetype,
    );
  } catch (uploadErr) {
    console.error('R2 upload failed, falling back to local URL:', uploadErr);
    file_url = `${process.env.API_BASE_URL || ''}/uploads/resumes/${req.file.filename}`;
  } finally {
    // Clean up the temp file from disk regardless of outcome
    try { fs.unlinkSync(req.file.path); } catch {}
  }

  ok(res, { parsed, file_url });
});

const candidateSchema = z.object({
  role: z.string(),
  name: z.string().trim().min(1, 'Name is required').regex(/^[a-zA-Z\s\.\-']*$/, 'Name contains invalid characters'),
  email: z.string().email('Invalid email address').optional().nullable(),
  mobile: z.string().regex(/^[0-9\+\-\s]*$/, 'Invalid mobile number').min(7, 'Mobile must be at least 7 characters').max(15, 'Mobile cannot exceed 15 characters').optional().nullable(),
  total_experience: z.preprocess((val) => Number(val) || undefined, z.number().min(0).max(60).optional().nullable()),
  current_ctc: z.preprocess((val) => Number(val) || undefined, z.number().min(0).optional().nullable()),
  expected_ctc: z.preprocess((val) => Number(val) || undefined, z.number().min(0).optional().nullable()),
  resume_url: z.string().optional().nullable(),
  skills: z.array(z.string()).optional(),
});

export const createCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = candidateSchema.parse(req.body) as candidateService.CreateCandidateDto;
  const candidate = await candidateService.createCandidate(actor.tenantId, actor.userId, data);
  recordTransaction({
    req,
    section: Section.HR,
    module: Module.RECRUITMENT,
    page: Page.CANDIDATE_PIPELINE_LIST,
    action: Action.CREATE,
    actionLabel: `Candidate "${candidate.name}" added to pipeline`,
    entityType: EntityType.CANDIDATE,
    entityId: candidate.id,
    entityLabel: candidate.name,
    afterData: { role: candidate.role, email: candidate.email },
  });
  ok(res, candidate, 201);
});

export const listCandidates = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const search = (req.query.search as string) || '';
  const result = await candidateService.listCandidates(actor.tenantId, page, limit, search);
  ok(res, result);
});

export const getCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const candidate = await candidateService.getCandidate(actor.tenantId, req.params.id);
  ok(res, candidate);
});

export const getCandidateLogs = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const logs = await logService.listCandidateLogs(actor.tenantId, req.params.id);
  ok(res, logs);
});

export const getCandidateEmails = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const emails = await candidateService.listCandidateEmails(actor.tenantId, req.params.id);
  ok(res, emails);
});

export const updateCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = candidateSchema.partial().parse(req.body) as Partial<candidateService.CreateCandidateDto>;
  
  const before = await candidateService.getCandidate(actor.tenantId, req.params.id);
  const candidate = await candidateService.updateCandidate(actor.tenantId, actor.userId, req.params.id, data);
  if (!candidate) return ok(res, { error: 'Not found' }, 404);

  if (before) {
    const diff = diffShallow(before, candidate);
    if (diff.changedFields.length > 0) {
      recordTransaction({
        req,
        section: Section.HR,
        module: Module.RECRUITMENT,
        page: Page.CANDIDATE_PIPELINE_DETAIL,
        action: Action.UPDATE,
        actionLabel: `Updated candidate "${candidate.name}"`,
        entityType: EntityType.CANDIDATE,
        entityId: candidate.id,
        entityLabel: candidate.name,
        beforeData: diff.before,
        afterData: diff.after,
        changedFields: diff.changedFields,
      });
    }
  }

  ok(res, candidate);
});

export const deleteCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const existing = await candidateService.getCandidate(actor.tenantId, req.params.id).catch(() => null);
  await candidateService.deleteCandidate(actor.tenantId, req.params.id);

  if (existing) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.CANDIDATE_PIPELINE_LIST,
      action: Action.DELETE,
      actionLabel: `Deleted candidate "${existing.name}"`,
      entityType: EntityType.CANDIDATE,
      entityId: existing.id,
      entityLabel: existing.name,
      beforeData: { role: existing.role, email: existing.email, status: existing.status },
    });
  }

  ok(res, { success: true });
});

export const updateCandidateStatus = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const { status, rejected_round_id } = req.body;
  
  const before = await candidateService.getCandidate(actor.tenantId, req.params.id);
  const candidate = await candidateService.updateCandidateStatus(actor.tenantId, actor.userId, req.params.id, status, rejected_round_id);
  if (!candidate) return ok(res, { error: 'Not found' }, 404);

  if (before && before.status !== candidate.status) {
    recordTransaction({
      req,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.CANDIDATE_PIPELINE_DETAIL,
      action: Action.STATUS_CHANGE,
      actionLabel: `Changed status for candidate "${candidate.name}" from "${before.status}" to "${candidate.status}"`,
      entityType: EntityType.CANDIDATE,
      entityId: candidate.id,
      entityLabel: candidate.name,
      beforeData: { status: before.status },
      afterData: { status: candidate.status },
      changedFields: ['status'],
    });
  }

  ok(res, candidate);
});

export const resendCandidateEmail = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const email = await candidateService.resendEmail(actor.tenantId, actor.userId, req.params.emailId);
  ok(res, email);
});

export const sendDraftEmail = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const { subject, body } = req.body;
  const email = await candidateService.updateAndSendEmail(actor.tenantId, actor.userId, req.params.emailId, subject, body);
  ok(res, email);
});

// Documents
export const requestDocuments = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const { documents } = req.body;
  const result = await documentService.requestCandidateDocuments(actor.tenantId, actor.userId, req.params.id, documents);
  ok(res, result);
});

export const getCandidateDocuments = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const docs = await documentService.getCandidateDocuments(actor.tenantId, req.params.id);
  ok(res, docs);
});

export const uploadManualDocument = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  if (!req.file) throw new Error('No document file provided');
  
  const fileData = fs.readFileSync(req.file.path);
  const base64Str = fileData.toString('base64');
  
  const docType = req.body.document_type;
  if (!docType) throw new Error('document_type is required');
  
  const result = await documentService.uploadManualDocument(
    actor.tenantId,
    actor.userId,
    req.params.id,
    docType,
    base64Str,
    req.file.originalname,
    req.file.mimetype
  );
  
  ok(res, result);
});

export const verifyDocument = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const { status, remarks } = req.body;
  const doc = await documentService.verifyCandidateDocument(actor.tenantId, actor.userId, req.params.id, req.params.docId, status, remarks);
  ok(res, doc);
});

// Portal
export const getPortalDocuments = handle(async (req: AuthRequest, res: Response) => {
  const result = await documentService.getPortalDocuments(req.params.token);
  ok(res, result);
});

export const uploadPortalDocument = handle(async (req: AuthRequest, res: Response) => {
  if (!req.file) throw new Error('No document file provided');
  
  const fileData = fs.readFileSync(req.file.path);
  const base64Str = fileData.toString('base64');
  
  const result = await documentService.uploadPortalDocument(
    req.params.token, 
    req.params.docId, 
    base64Str, 
    req.file.originalname, 
    req.file.mimetype
  );

  fs.unlinkSync(req.file.path);
  ok(res, result);
});

