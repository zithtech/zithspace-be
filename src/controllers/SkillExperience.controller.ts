import { Response } from 'express';
import { AuthRequest } from '@/types';
import { SkillModel } from '@/models/Skill.model';
import { ExperienceModel } from '@/models/Experience.model';
import { recordTransaction, Section, Module, Page, Action } from '@/utils/transactionHistory';

export class SkillExperienceController {

  // SKILLS
  static async getSkills(req: AuthRequest, res: Response) {
    const data = await SkillModel.findAll(req.tenantId!, req.user!.id);
    res.json({ success: true, data });
  }

  static async createSkill(req: AuthRequest, res: Response) {
    const skill = await SkillModel.create({
      ...req.body,
      tenant_id: req.tenantId,
      user_id: req.user!.id
    });
    
    if (skill) {
      recordTransaction({
        req: req as AuthRequest,
        section: Section.HOME,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.CREATE,
        actionLabel: `Added skill: ${skill.name}`,
        entityType: "skill",
        entityLabel: skill.name,
      });
    }

    res.json({ success: true, data: skill });
  }

  static async syncSkills(req: AuthRequest, res: Response) {
    try {
      const { skills, category } = req.body;
      console.log('--- Sync Skills Request ---');
      console.log('Tenant:', req.tenantId);
      console.log('User:', req.user?.id);
      console.log('Skills Count:', skills?.length);
      console.log('Platform/Category:', category);

      if (!Array.isArray(skills)) {
        return res.status(400).json({ success: false, message: 'Skills must be an array' });
      }

      const newSkills = await SkillModel.bulkSync(req.tenantId!, req.user!.id, skills, category || 'General');
      console.log('Bulk Sync Result:', newSkills.length, 'new skills added');
      
      recordTransaction({
        req: req as AuthRequest,
        section: Section.HOME,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: "sync",
        actionLabel: `Synced ${newSkills.length} skills`,
        entityType: "skill",
      });

      res.json({ 
        success: true, 
        message: `Synced ${newSkills.length} new skills`,
        data: newSkills 
      });
    } catch (error: any) {
      console.error('Skill Sync Error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error during skill sync',
        error: error.message 
      });
    }
  }

  static async updateSkill(req: AuthRequest, res: Response) {
    const skill = await SkillModel.update(
      req.params.id,
      req.tenantId!,
      req.user!.id,
      req.body
    );

    if (skill) {
      recordTransaction({
        req: req as AuthRequest,
        section: Section.HOME,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.UPDATE,
        actionLabel: `Updated skill`,
        entityType: "skill",
      });
    }

    res.json({ success: true, data: skill });
  }

  static async deleteSkill(req: AuthRequest, res: Response) {
    await SkillModel.delete(req.params.id, req.tenantId!, req.user!.id);
    
    recordTransaction({
      req: req as AuthRequest,
      section: Section.HOME,
      module: Module.MY_PROFILE,
      page: Page.MY_PROFILE,
      action: Action.DELETE,
      actionLabel: `Deleted skill`,
      entityType: "skill",
    });

    res.json({ success: true });
  }

  // EXPERIENCE
  static async getExperience(req: AuthRequest, res: Response) {
    const data = await ExperienceModel.findAll(req.tenantId!, req.user!.id);
    res.json({ success: true, data });
  }

  static async createExperience(req: AuthRequest, res: Response) {
    const exp = await ExperienceModel.create({
      ...req.body,
      tenant_id: req.tenantId,
      user_id: req.user!.id
    });

    if (exp) {
      recordTransaction({
        req: req as AuthRequest,
        section: Section.HOME,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.CREATE,
        actionLabel: `Added experience: ${exp.job_title}`,
        entityType: "experience",
        entityLabel: exp.job_title,
      });
    }

    res.json({ success: true, data: exp });
  }

  static async updateExperience(req: AuthRequest, res: Response) {
    const exp = await ExperienceModel.update(
      req.params.id,
      req.tenantId!,
      req.user!.id,
      req.body
    );

    if (exp) {
      recordTransaction({
        req: req as AuthRequest,
        section: Section.HOME,
        module: Module.MY_PROFILE,
        page: Page.MY_PROFILE,
        action: Action.UPDATE,
        actionLabel: `Updated experience`,
        entityType: "experience",
      });
    }

    res.json({ success: true, data: exp });
  }

  static async deleteExperience(req: AuthRequest, res: Response) {
    await ExperienceModel.delete(req.params.id, req.tenantId!, req.user!.id);
    
    recordTransaction({
      req: req as AuthRequest,
      section: Section.HOME,
      module: Module.MY_PROFILE,
      page: Page.MY_PROFILE,
      action: Action.DELETE,
      actionLabel: `Deleted experience`,
      entityType: "experience",
    });

    res.json({ success: true });
  }
}