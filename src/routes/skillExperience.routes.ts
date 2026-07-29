import { Router } from 'express';
import { SkillExperienceController } from '@/controllers/SkillExperience.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';
import { requirePermission } from '@/middleware/permission';

const router = Router();

const mw = [resolveTenant, authenticateToken, requireAuth];

// ================= SKILLS =================
// Create Skill
router.post('/skills', mw, requirePermission('skills.create'), SkillExperienceController.createSkill);
// Sync Skills (Bulk)
router.post('/skills/sync', mw, requirePermission('skills.manage'), SkillExperienceController.syncSkills);
// Get All Skills
router.get('/skills', mw, requirePermission('skills.read'), SkillExperienceController.getSkills);
// Update Skill
router.put('/skills/:id', mw, requirePermission('skills.update'), SkillExperienceController.updateSkill);
// Delete Skill
router.delete('/skills/:id', mw, requirePermission('skills.delete'), SkillExperienceController.deleteSkill);

// ================= EXPERIENCE =================
// Create Experience
router.post('/experience', mw, requirePermission('skills.create'), SkillExperienceController.createExperience);
// Get All Experience
router.get('/experience', mw, requirePermission('skills.read'), SkillExperienceController.getExperience);
// Update Experience
router.put('/experience/:id', mw, requirePermission('skills.update'), SkillExperienceController.updateExperience);
// Delete Experience
router.delete('/experience/:id', mw, requirePermission('skills.delete'), SkillExperienceController.deleteExperience);

export default router;