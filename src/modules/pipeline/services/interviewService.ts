// src/modules/pipeline/services/interviewService.ts
import { pipelinePool, withTenant } from '../db/pool';
import { prisma } from '../../../config/database';
import { CalendarService } from '../../../services/calendar/CalendarService';
import { MailService } from '../../../services/mail/MailService';

export interface ScheduleInterviewDto {
  candidate_id: string;
  round_id: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  mode: string;
  location_or_link?: string;
  notes?: string;
  time_zone?: string;
  interviewer_ids: string[];
  generate_meeting?: boolean;
}

export async function scheduleInterview(tenantId: string, userId: string, data: ScheduleInterviewDto) {
  return withTenant(tenantId, async (client) => {
    let locationOrLink = data.location_or_link || '';
    
    // 1. Fetch Candidate
    const { rows: candRows } = await client.query(
      `SELECT id, email, name, role FROM pipeline_candidates WHERE id = $1 AND tenant_id = $2`,
      [data.candidate_id, tenantId]
    );
    if (!candRows.length) throw new Error("Candidate not found");
    const candidate = candRows[0];
    
    const { rows: roundRows } = await client.query(
      `SELECT round_name FROM pipeline_interview_rounds WHERE id = $1 AND tenant_id = $2`,
      [data.round_id, tenantId]
    );
    const roundName = roundRows.length ? roundRows[0].round_name : 'Interview';

    // 2. Online Mode - Calendar Event
    if (data.mode === 'Online' && data.generate_meeting) {
      try {
        const integration = await prisma.calendarIntegration.findFirst({
          where: { userId: userId, tenantId: tenantId }
        });

        if (integration) {
          // EXCLUDE candidate.email from attendees to prevent provider from sending automated invite!
          const attendees: string[] = [];

          if (data.interviewer_ids.length > 0) {
            const interviewers = await prisma.user.findMany({
              where: { id: { in: data.interviewer_ids } },
              select: { workEmail: true }
            });
            attendees.push(...interviewers.map(u => u.workEmail).filter((email): email is string => Boolean(email)));
          }

          const [hours, minutes] = data.scheduled_time.split(':');
          const startTime = new Date(`${data.scheduled_date}T${hours}:${minutes}:00`);
          const endTime = new Date(startTime.getTime() + data.duration_minutes * 60000);

          const eventData = {
            title: `Interview: ${candidate.name} for ${candidate.role}`,
            description: data.notes || `Interview round for ${candidate.role} position.`,
            startTime,
            endTime,
            attendees,
            generateMeeting: true
          };

          const createdEvent = await CalendarService.createEvent(userId, tenantId, integration.provider, eventData);
          if (createdEvent && createdEvent.meetingLink) {
            locationOrLink = createdEvent.meetingLink;
          }
        }
      } catch (err: any) {
        console.error('Failed to generate calendar meeting:', err);
      }
    }

    // 3. Save Interview
    const { rows: intRows } = await client.query(
      `INSERT INTO pipeline_interviews 
       (tenant_id, candidate_id, round_id, scheduled_date, scheduled_time, duration_minutes, mode, location_or_link, notes, time_zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [tenantId, data.candidate_id, data.round_id, data.scheduled_date, data.scheduled_time, data.duration_minutes, data.mode, locationOrLink, data.notes, data.time_zone]
    );
    const interview = intRows[0];

    for (const interviewerId of data.interviewer_ids) {
      await client.query(
        `INSERT INTO pipeline_interviewers (tenant_id, interview_id, interviewer_id) VALUES ($1, $2, $3)`,
        [tenantId, interview.id, interviewerId]
      );
    }

    await client.query(
      `UPDATE pipeline_candidates SET status = 'Interviewing' WHERE id = $1 AND tenant_id = $2`,
      [data.candidate_id, tenantId]
    );

    // 4. Send Email via connected company mail
    let emailStatus = 'Pending';
    try {
      const mailAccount = await prisma.mail_accounts.findFirst({
        where: { tenant_id: tenantId, user_id: userId }
      });

      const subject = `Interview Invitation: ${roundName} for ${candidate.role}`;
      const modeText = data.mode === 'Online' 
        ? `Meeting Link: <a href="${locationOrLink}">${locationOrLink}</a>` 
        : `Location: <strong>${locationOrLink}</strong>`;
      
      const body = `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2563eb;">Interview Scheduled</h2>
          <p>Hi ${candidate.name},</p>
          <p>We are pleased to invite you to the <strong>${roundName}</strong> for the <strong>${candidate.role}</strong> position.</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Date:</strong> ${data.scheduled_date}</p>
            <p style="margin: 4px 0;"><strong>Time:</strong> ${data.scheduled_time} (${data.time_zone || 'Local Time'})</p>
            <p style="margin: 4px 0;"><strong>Duration:</strong> ${data.duration_minutes} minutes</p>
            <p style="margin: 4px 0; margin-top: 12px;">${modeText}</p>
          </div>
          <p>If you have any questions, please let us know.</p>
          <p>Best regards,<br>The Team</p>
        </div>
      `;

      if (mailAccount && candidate.email) {
        await MailService.sendMessage(userId, tenantId, mailAccount.email, {
          subject,
          from: mailAccount.email,
          to: [candidate.email],
          body
        });
        emailStatus = 'Sent';
      } else {
        emailStatus = 'Failed_NoAccount';
      }

      await client.query(
        `INSERT INTO pipeline_emails (tenant_id, candidate_id, subject, body, status, sender_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, candidate.id, subject, body, emailStatus === 'Sent' ? 'Sent' : 'Pending', userId]
      );
    } catch (err) {
      console.error('Failed to send custom interview email:', err);
      emailStatus = 'Failed_Error';
    }

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'SCHEDULE_INTERVIEW', $4)`,
      [tenantId, data.candidate_id, userId, `Scheduled ${roundName} (${data.mode}). Email Status: ${emailStatus}`]
    );

    return { ...interview, emailStatus };
  });
}

export interface EvaluateDto {
  interview_id: string;
  evaluations: {
    criteria_id: string;
    score: number;
    feedback?: string;
  }[];
}

export async function submitEvaluation(tenantId: string, userId: string, data: EvaluateDto) {
  return withTenant(tenantId, async (client) => {
    // get candidate_id
    const { rows: intRows } = await client.query(
      `SELECT candidate_id FROM pipeline_interviews WHERE id = $1 AND tenant_id = $2`,
      [data.interview_id, tenantId]
    );
    if (!intRows.length) throw new Error('Interview not found');
    const candidateId = intRows[0].candidate_id;

    for (const evalData of data.evaluations) {
      await client.query(
        `INSERT INTO pipeline_evaluations (tenant_id, interview_id, criteria_id, interviewer_id, score, feedback)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, data.interview_id, evalData.criteria_id, userId, evalData.score, evalData.feedback]
      );
    }

    await client.query(
      `UPDATE pipeline_interviews SET status = 'Completed' WHERE id = $1 AND tenant_id = $2`,
      [data.interview_id, tenantId]
    );

    await client.query(
      `INSERT INTO pipeline_activity_logs (tenant_id, candidate_id, user_id, action_type, description)
       VALUES ($1, $2, $3, 'EVALUATE', 'Submitted interview scorecard')`,
      [tenantId, candidateId, userId]
    );
  });
}

export async function listCandidateInterviews(tenantId: string, candidateId: string) {
  const { rows } = await pipelinePool.query(
    `SELECT i.*, r.round_name, r.round_type 
     FROM pipeline_interviews i 
     JOIN pipeline_interview_rounds r ON i.round_id = r.id
     WHERE i.tenant_id = $1 AND i.candidate_id = $2 ORDER BY i.scheduled_date DESC`,
    [tenantId, candidateId]
  );
  return rows;
}
