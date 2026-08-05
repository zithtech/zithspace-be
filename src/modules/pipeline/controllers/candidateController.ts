// src/modules/pipeline/controllers/candidateController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as candidateService from '../services/candidateService';
import * as logService from '../services/logService';
import * as documentService from '../services/documentService';
import { parseResumeFile } from '../services/resumeParser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadCandidateDocumentToR2 } from '../../../utils/r2Client';

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
  const parsed = await parseResumeFile(req.file.path, req.file.mimetype);
  const file_url = `${process.env.API_BASE_URL || ''}/uploads/resumes/${req.file.filename}`;
  ok(res, { parsed, file_url });
});

export const createCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const data = req.body;
  const candidate = await candidateService.createCandidate(actor.tenantId, actor.userId, data);
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
  const data = req.body;
  const candidate = await candidateService.updateCandidate(actor.tenantId, actor.userId, req.params.id, data);
  if (!candidate) return ok(res, { error: 'Not found' }, 404);
  ok(res, candidate);
});

export const deleteCandidate = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  await candidateService.deleteCandidate(actor.tenantId, req.params.id);
  ok(res, { success: true });
});

export const updateCandidateStatus = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const { status, rejected_round_id } = req.body;
  const candidate = await candidateService.updateCandidateStatus(actor.tenantId, actor.userId, req.params.id, status, rejected_round_id);
  if (!candidate) return ok(res, { error: 'Not found' }, 404);
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

