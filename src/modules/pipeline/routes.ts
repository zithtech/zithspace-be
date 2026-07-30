// src/modules/pipeline/routes.ts
import { Router } from 'express';
import { resolveTenant } from '@/middleware/tenantContext';
import { authenticateToken } from '@/middleware/auth';
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
pipelineRouter.post('/candidates/parse-resume', upload.single('resume'), parseResume);
pipelineRouter.post('/candidates', createCandidate);
pipelineRouter.get('/candidates', listCandidates);
pipelineRouter.get('/candidates/:id', getCandidate);
pipelineRouter.put('/candidates/:id', updateCandidate);
pipelineRouter.put('/candidates/:id/status', updateCandidateStatus);
pipelineRouter.delete('/candidates/:id', deleteCandidate);
pipelineRouter.get('/candidates/:id/logs', getCandidateLogs);
pipelineRouter.get('/candidates/:id/emails', getCandidateEmails);
pipelineRouter.post('/emails/:emailId/resend', resendCandidateEmail);

// Configs
pipelineRouter.post('/configs', createConfig);
pipelineRouter.get('/configs', listConfigs);
pipelineRouter.put('/configs/:id', updateConfig);
pipelineRouter.delete('/configs/:id', deleteConfig);

// Interviews & Evaluations
pipelineRouter.post('/interviews', scheduleInterview);
pipelineRouter.post('/interviews/:id/evaluate', evaluateInterview);
pipelineRouter.get('/candidates/:candidateId/interviews', listCandidateInterviews);

// Offers
pipelineRouter.post('/offers', generateOffer);
pipelineRouter.get('/candidates/:candidateId/offers', listCandidateOffers);
