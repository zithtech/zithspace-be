import { Router } from 'express';
import { AuthRequest } from '@/types';
import { resolveTenant, requireTenant } from '@/middleware/tenantContext';

const router = Router();

// Apply tenant resolution only (no authentication required)
router.use(resolveTenant);
router.use(requireTenant);

/**
 * AI Generation Endpoint
 * Supports proposal generation and job summarization
 */
router.post('/', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant context required' });
    }

    const { type, text, job, settings, templateType } = req.body;

    console.log('AI Generation Request:', { type, tenantId });

    let result = '';

    switch (type) {
      case 'summary':
        result = generateSummary(text);
        break;
      
      case 'proposal':
        result = generateProposal(job, settings, templateType);
        break;
      
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Invalid generation type. Supported types: summary, proposal' 
        });
    }

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error('AI Generation Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'AI generation failed'
    });
  }
});

/**
 * Generate job summary
 */
function generateSummary(text: string): string {
  // Simple summarization logic - can be enhanced with actual AI
  const sentences = text.split('.').filter(s => s.trim().length > 0);
  const keyPoints = sentences.slice(0, 3).map(s => s.trim()).join('. ');
  
  return `This role involves ${keyPoints.toLowerCase()}. The position offers opportunities for growth and development in a dynamic environment.`;
}

/**
 * Generate proposal based on job details
 */
function generateProposal(job: any, settings: any, templateType: string): string {
  const freelancerName = settings?.freelancerName || 'Professional Developer';
  const skills = settings?.skills || 'development';
  
  const templates = {
    detailed: generateDetailedProposal(job, freelancerName, skills),
    concise: generateConciseProposal(job, freelancerName, skills),
    casual: generateCasualProposal(job, freelancerName, skills)
  };

  return templates[templateType] || templates.detailed;
}

function generateDetailedProposal(job: any, freelancerName: string, skills: string): string {
  return `Dear Hiring Manager,

I am ${freelancerName}, an experienced ${skills} professional with expertise in ${job.skills?.join(', ') || 'relevant technologies'}. 

After reviewing your job posting for "${job.title}", I am confident that my skills and experience align perfectly with your requirements. 

Key qualifications:
- Extensive experience in ${skills} and related technologies
- Strong understanding of ${job.experienceLevel || 'professional'} development practices
- Proven track record delivering high-quality solutions

I am particularly interested in this ${job.jobType || 'project'} because it matches my expertise and career goals. My proposed approach will ensure timely delivery while maintaining the highest quality standards.

I would welcome the opportunity to discuss how I can contribute to your project's success.

Best regards,
${freelancerName}`;
}

function generateConciseProposal(job: any, freelancerName: string, skills: string): string {
  return `Hello! I'm ${freelancerName}, an experienced ${skills} professional. 

Your "${job.title}" project caught my attention as it aligns perfectly with my expertise in ${job.skills?.slice(0, 3)?.join(', ') || 'relevant areas'}.

I can deliver this ${job.jobType || 'project'} efficiently with high quality. Let's discuss how I can help you achieve your goals.

Best,
${freelancerName}`;
}

function generateCasualProposal(job: any, freelancerName: string, skills: string): string {
  return `Hi there! 

I saw your posting for "${job.title}" and it looks like a great fit! I'm ${freelancerName} and I've been doing ${skills} work for a while.

My skills in ${job.skills?.slice(0, 2)?.join(' & ') || 'the relevant areas'} seem to match what you're looking for. I'm excited about this ${job.jobType || 'opportunity'} and would love to chat more.

Cheers,
${freelancerName}`;
}

export default router;
