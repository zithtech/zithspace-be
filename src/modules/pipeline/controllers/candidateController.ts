// src/modules/pipeline/controllers/candidateController.ts
import { Response } from 'express';
import { AuthRequest } from '@/types';
import { handle, actorOf, ok } from '../http';
import * as candidateService from '../services/candidateService';
import * as logService from '../services/logService';
import { parseResumeFile } from '../services/resumeParser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
  ok(res, { parsed, file_path: req.file.path });
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
  const { status } = req.body;
  const candidate = await candidateService.updateCandidateStatus(actor.tenantId, actor.userId, req.params.id, status);
  if (!candidate) return ok(res, { error: 'Not found' }, 404);
  ok(res, candidate);
});

export const resendCandidateEmail = handle(async (req: AuthRequest, res: Response) => {
  const actor = actorOf(req);
  const email = await candidateService.resendEmail(actor.tenantId, actor.userId, req.params.emailId);
  ok(res, email);
});
