import { z } from 'zod';

export const CreateReferralSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  mobile: z.string().min(1, 'Mobile is required'),
  resumeUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  skills: z.array(z.string()).optional(),
  totalExperience: z.number().optional(),
});
