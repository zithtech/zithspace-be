// src/modules/pipeline/routes.ts
import { Router } from 'express';
import { resolveTenant } from '@/middleware/tenantContext';
import { authenticateToken } from '@/middleware/auth';
import { requirePermission } from '@/middleware/permission';
import { Permissions } from '@/types/permissions';
import { requireSubscriptionFeature } from '@/modules/entitlements/entitlements.middleware';
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
  requestDocuments,
  getCandidateDocuments,
  verifyDocument,
  getPortalDocuments,
  uploadPortalDocument,
  uploadManualDocument,
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

// Public Portal Routes
pipelineRouter.get('/portal/:token/documents', getPortalDocuments);
pipelineRouter.post('/portal/:token/documents/:docId/upload', upload.single('document'), uploadPortalDocument);

pipelineRouter.use(resolveTenant);
pipelineRouter.use(authenticateToken);

// Candidates
pipelineRouter.post('/candidates/parse-resume', requirePermission(Permissions.RECRUITMENT_CREATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), upload.single('resume'), parseResume);
pipelineRouter.post('/candidates', requirePermission(Permissions.RECRUITMENT_CREATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), createCandidate);
pipelineRouter.get('/candidates', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), listCandidates);
pipelineRouter.get('/candidates/:id', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), getCandidate);
pipelineRouter.put('/candidates/:id', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), updateCandidate);
pipelineRouter.put('/candidates/:id/status', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), updateCandidateStatus);
pipelineRouter.delete('/candidates/:id', requirePermission(Permissions.RECRUITMENT_DELETE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), deleteCandidate);
pipelineRouter.get('/candidates/:id/logs', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), getCandidateLogs);
pipelineRouter.get('/candidates/:id/emails', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), getCandidateEmails);
pipelineRouter.post('/candidates/:id/documents/request', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), requestDocuments);
pipelineRouter.get('/candidates/:id/documents', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), getCandidateDocuments);
pipelineRouter.post('/candidates/:id/documents/upload', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), upload.single('document'), uploadManualDocument);
pipelineRouter.put('/candidates/:id/documents/:docId/verify', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), verifyDocument);
pipelineRouter.post('/emails/:emailId/resend', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), resendCandidateEmail);
pipelineRouter.post('/emails/:emailId/send-draft', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), sendDraftEmail);

// Configs
pipelineRouter.post('/configs', requirePermission(Permissions.RECRUITMENT_SETTING_CREATE), requireSubscriptionFeature('hrms_candidate_pipeline_configurations', { exact: false }), createConfig);
pipelineRouter.get('/configs', requirePermission(Permissions.RECRUITMENT_SETTING_READ), requireSubscriptionFeature('hrms_candidate_pipeline_configurations', { exact: false }), listConfigs);
pipelineRouter.put('/configs/:id', requirePermission(Permissions.RECRUITMENT_SETTING_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_configurations', { exact: false }), updateConfig);
pipelineRouter.delete('/configs/:id', requirePermission(Permissions.RECRUITMENT_SETTING_DELETE), requireSubscriptionFeature('hrms_candidate_pipeline_configurations', { exact: false }), deleteConfig);

// Interviews & Evaluations
pipelineRouter.post('/interviews', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), scheduleInterview);
pipelineRouter.post('/interviews/:id/evaluate', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), evaluateInterview);
pipelineRouter.get('/candidates/:candidateId/interviews', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), listCandidateInterviews);

// Offers
pipelineRouter.post('/offers', requirePermission(Permissions.RECRUITMENT_UPDATE), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), generateOffer);
pipelineRouter.get('/candidates/:candidateId/offers', requirePermission(Permissions.RECRUITMENT_READ), requireSubscriptionFeature('hrms_candidate_pipeline_candidates', { exact: false }), listCandidateOffers);
