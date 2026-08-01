// src/modules/pipeline/routes.ts
import { Router } from 'express';
import { resolveTenant } from '@/middleware/tenantContext';
import { authenticateToken } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import {
  parseResume,
  upload,
  createCandidate,
  listCandidates,
  getCandidate,
  getCandidateLogs,
  updateCandidate,
  deleteCandidate,
  updateCandidateStatus,
  resendCandidateEmail,
  sendDraftEmail,
  getCandidateEmails,
} from './controllers/candidateController';
import { 
  createConfig, 
  listConfigs, 
  updateConfig, 
  deleteConfig 
} from './controllers/configController';
import {
  scheduleInterview,
  evaluateInterview,
  listCandidateInterviews,
  generateOffer,
  listCandidateOffers,
} from './controllers/interviewController';

export const pipelineRouter = Router();

pipelineRouter.use(resolveTenant);
pipelineRouter.use(authenticateToken);




// Candidates
pipelineRouter.post('/candidates/parse-resume', requirePermission(Permissions.RECRUITMENT_CREATE), upload.single('resume'), parseResume);
pipelineRouter.post('/candidates', requirePermission(Permissions.RECRUITMENT_CREATE), createCandidate);
pipelineRouter.get('/candidates', requirePermission(Permissions.RECRUITMENT_READ), listCandidates);
pipelineRouter.get('/candidates/:id', requirePermission(Permissions.RECRUITMENT_READ), getCandidate);
pipelineRouter.put('/candidates/:id', requirePermission(Permissions.RECRUITMENT_UPDATE), updateCandidate);
pipelineRouter.put('/candidates/:id/status', requirePermission(Permissions.RECRUITMENT_UPDATE), updateCandidateStatus);
pipelineRouter.delete('/candidates/:id', requirePermission(Permissions.RECRUITMENT_DELETE), deleteCandidate);
pipelineRouter.get('/candidates/:id/logs', requirePermission(Permissions.RECRUITMENT_READ), getCandidateLogs);
pipelineRouter.get('/candidates/:id/emails', requirePermission(Permissions.RECRUITMENT_READ), getCandidateEmails);
pipelineRouter.post('/emails/:emailId/resend', requirePermission(Permissions.RECRUITMENT_UPDATE), resendCandidateEmail);
pipelineRouter.post('/emails/:emailId/send-draft', requirePermission(Permissions.RECRUITMENT_UPDATE), sendDraftEmail);

// Configs
pipelineRouter.post('/configs', requirePermission(Permissions.RECRUITMENT_SETTING_CREATE), createConfig);
pipelineRouter.get('/configs', requirePermission(Permissions.RECRUITMENT_SETTING_READ), listConfigs);
pipelineRouter.put('/configs/:id', requirePermission(Permissions.RECRUITMENT_SETTING_UPDATE), updateConfig);
pipelineRouter.delete('/configs/:id', requirePermission(Permissions.RECRUITMENT_SETTING_DELETE), deleteConfig);

// Interviews & Evaluations
pipelineRouter.post('/interviews', requirePermission(Permissions.RECRUITMENT_UPDATE), scheduleInterview);
pipelineRouter.post('/interviews/:id/evaluate', requirePermission(Permissions.RECRUITMENT_UPDATE), evaluateInterview);
pipelineRouter.get('/candidates/:candidateId/interviews', requirePermission(Permissions.RECRUITMENT_READ), listCandidateInterviews);

// Offers
pipelineRouter.post('/offers', requirePermission(Permissions.RECRUITMENT_UPDATE), generateOffer);
pipelineRouter.get('/candidates/:candidateId/offers', requirePermission(Permissions.RECRUITMENT_READ), listCandidateOffers);
