import { Router } from 'express';
import { SkillExperienceController } from '@/controllers/SkillExperience.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';

const router = Router();

// Middleware (same as lead settings)
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= SKILLS =================
// Create Skill
router.post('/skills', requirePermission('skills.create'), SkillExperienceController.createSkill);
// Sync Skills (Bulk)
router.post('/skills/sync', requirePermission('skills.manage'), SkillExperienceController.syncSkills);
// Get All Skills
router.get('/skills', requirePermission('skills.read'), SkillExperienceController.getSkills);
// Update Skill
router.put('/skills/:id', requirePermission('skills.update'), SkillExperienceController.updateSkill);
// Delete Skill
router.delete('/skills/:id', requirePermission('skills.delete'), SkillExperienceController.deleteSkill);

// ================= EXPERIENCE =================
// Create Experience
router.post('/experience', requirePermission('skills.create'), SkillExperienceController.createExperience);
// Get All Experience
router.get('/experience', requirePermission('skills.read'), SkillExperienceController.getExperience);
// Update Experience
router.put('/experience/:id', requirePermission('skills.update'), SkillExperienceController.updateExperience);
// Delete Experience
router.delete('/experience/:id', requirePermission('skills.delete'), SkillExperienceController.deleteExperience);

export default router;