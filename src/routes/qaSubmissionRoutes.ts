import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { resolveTenant } from '../middleware/tenantContext';
import { requireAnyPermission } from '../middleware/permission';
import { requireAiAccess } from '../middleware/aiAccess';
import { Permissions } from '../types/permissions';
import * as qaSubmissionController from '../controllers/qaSubmissionController';

/**
 * QA Submissions — the reporting stage after Test Runs and the Bug List.
 *
 * Submit, QA Sign-off and Approve are gated on their own permissions rather
 * than on `update`: they are three separate authorities (§32), and a QA
 * engineer who may report results is not automatically the person who signs
 * them off or approves them.
 */
const router = express.Router();

router.use(resolveTenant);
router.use(authenticateToken);

const canRead = requireAnyPermission(Permissions.QA_SUBMISSION_READ, Permissions.QA_MANAGE);
const canCreate = requireAnyPermission(Permissions.QA_SUBMISSION_CREATE, Permissions.QA_MANAGE);
const canUpdate = requireAnyPermission(Permissions.QA_SUBMISSION_UPDATE, Permissions.QA_MANAGE);
const canDelete = requireAnyPermission(Permissions.QA_SUBMISSION_DELETE, Permissions.QA_MANAGE);
const canSubmit = requireAnyPermission(Permissions.QA_SUBMISSION_SUBMIT, Permissions.QA_MANAGE);
const canSignOff = requireAnyPermission(Permissions.QA_SUBMISSION_SIGNOFF, Permissions.QA_MANAGE);
const canApprove = requireAnyPermission(Permissions.QA_APPROVAL_APPROVE, Permissions.QA_MANAGE);
const canSendBack = requireAnyPermission(
  Permissions.QA_APPROVAL_SEND_BACK,
  Permissions.QA_APPROVAL_APPROVE,
  Permissions.QA_MANAGE,
);

// ─── Collection ──────────────────────────────────────────────────────────────
router.get('/', canRead, qaSubmissionController.getSubmissions);
router.get('/stats', canRead, qaSubmissionController.getSubmissionStats);
router.get('/scope-runs', canRead, qaSubmissionController.getScopeRuns);
router.post('/', canCreate, qaSubmissionController.createSubmission);

// ─── AI (§18) — static paths before the dynamic :id routes ───────────────────
router.post('/:id/ai/summary', canUpdate, requireAiAccess, qaSubmissionController.generateQaSummary);
router.post('/ai/grammar', canUpdate, requireAiAccess, qaSubmissionController.qaSummaryGrammar);

// ─── Lifecycle ───────────────────────────────────────────────────────────────
router.post('/:id/submit', canSubmit, qaSubmissionController.submitSubmission);
router.post('/:id/status', canUpdate, qaSubmissionController.changeSubmissionStatus);
router.get('/:id/sign-off', canRead, qaSubmissionController.getSignoffPreview);
router.post('/:id/sign-off', canSignOff, qaSubmissionController.signOffSubmission);
router.post('/:id/approve', canApprove, qaSubmissionController.approveSubmission);
router.post('/:id/send-back', canSendBack, qaSubmissionController.sendBackSubmission);
router.post('/:id/reopen', canSignOff, qaSubmissionController.reopenSubmission);

// ─── Sections ────────────────────────────────────────────────────────────────
router.get('/:id/cases', canRead, qaSubmissionController.getSubmissionCases);
router.get('/:id/versions/:version', canRead, qaSubmissionController.getSubmissionVersion);
router.post('/:id/known-issues', canUpdate, qaSubmissionController.upsertKnownIssue);
router.delete('/:id/known-issues/:issueId', canUpdate, qaSubmissionController.deleteKnownIssue);
router.post('/:id/attachments', canUpdate, qaSubmissionController.addAttachment);
router.delete('/:id/attachments/:attachmentId', canUpdate, qaSubmissionController.deleteAttachment);

// ─── Record (dynamic ids last) ───────────────────────────────────────────────
router.get('/:id', canRead, qaSubmissionController.getSubmission);
router.put('/:id', canUpdate, qaSubmissionController.updateSubmission);
router.delete('/:id', canDelete, qaSubmissionController.deleteSubmission);

export default router;
