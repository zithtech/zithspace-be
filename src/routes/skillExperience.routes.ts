import { Router } from 'express';
import { SkillExperienceController } from '@/controllers/SkillExperience.controller';
import { authenticateToken, requireAuth } from '@/middleware/auth';
import { resolveTenant } from '@/middleware/tenantContext';

const router = Router();

// Middleware (same as lead settings)
router.use(resolveTenant);
router.use(authenticateToken);
router.use(requireAuth);

// ================= SKILLS =================

// Create Skill
router.post('/skills', SkillExperienceController.createSkill);

// Sync Skills (Bulk)
router.post('/skills/sync', SkillExperienceController.syncSkills);

// Get All Skills
router.get('/skills', SkillExperienceController.getSkills);

// Update Skill
router.put('/skills/:id', SkillExperienceController.updateSkill);

// Delete Skill
router.delete('/skills/:id', SkillExperienceController.deleteSkill);


// ================= EXPERIENCE =================

// Create Experience
router.post('/experience', SkillExperienceController.createExperience);

// Get All Experience
router.get('/experience', SkillExperienceController.getExperience);

// Update Experience
router.put('/experience/:id', SkillExperienceController.updateExperience);

// Delete Experience
router.delete('/experience/:id', SkillExperienceController.deleteExperience);

export default router;