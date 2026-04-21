import pool from "../config/dbpool";

export interface ProjectOverviewData {
  project: {
    id: string;
    name: string;
    status: string;
    startDate: Date;
    endDate: Date | null;
    description: string | null;
    progress: number;
    projectHead: string;
    teamCount: number;
    code: string | null;
  };
  ticketSummary: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  sprintSummary: {
    total: number;
    completed: number;
    inProgress: number;
    notStarted: number;
  };
  timeStats: {
    totalHours: number;
    daysWorked: number;
  };
  sprints: Array<{
    id: string;
    name: string;
    description: string | null;
    startDate: Date | null;
    endDate: Date | null;
    status: string;
    progress: number;
    ticketCount: number;
    completedCount: number;
  }>;
  team: Array<{
    id: string;
    name: string;
    contribution: number;
    done: number;
    active: number;
    todo: number;
    totalHours: number;
  }>;
  activities: Array<{
    id: string;
    action: string;
    userName: string;
    ticketNumber: string;
    ticketTitle: string;
    timestamp: Date;
  }>;
  insights: string[];
}

export class ProjectOverviewModel {
  static async getOverviewData(projectId: string, tenantId: string): Promise<ProjectOverviewData> {
    const client = await pool.connect();
    try {
      // 1. Project Basic Info
      const projectRes = await client.query(
        `SELECT p.id, p.name, p.status, p.start_date, p.end_date, p.code, p.description, 
                u.name as project_head,
                (SELECT count(*) FROM project_members pm WHERE pm.project_id = p.id) as team_count
         FROM projects p
         LEFT JOIN users u ON p.project_manager_id = u.id
         WHERE p.id = $1 AND p.tenant_id = $2`,
        [projectId, tenantId]
      );
      if (projectRes.rows.length === 0) throw new Error("Project not found");
      const projectRow = projectRes.rows[0];

      // 2. Ticket Summary
      const ticketStatsRes = await client.query(
        `SELECT status, count(*) as count FROM tickets WHERE project_id = $1 AND tenant_id = $2 AND is_deleted = false GROUP BY status`,
        [projectId, tenantId]
      );
      const ticketSummary = { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
      ticketStatsRes.rows.forEach(row => {
        const count = parseInt(row.count);
        const status = row.status?.toLowerCase() || '';
        ticketSummary.total += count;
        if (['completed', 'done', 'live', 'live (deployed)'].includes(status)) ticketSummary.completed += count;
        else if (['in_progress', 'in_testing', 'started', 'active'].includes(status)) ticketSummary.inProgress += count;
        else ticketSummary.notStarted += count;
      });

      // 3. Sprint Summary
      const sprintStatsRes = await client.query(
        `SELECT status, count(*) as count FROM release_plans WHERE project_id = $1 AND tenant_id = $2 AND type = 'sprint_plan' GROUP BY status`,
        [projectId, tenantId]
      );
      const sprintSummary = { total: 0, completed: 0, inProgress: 0, notStarted: 0 };
      sprintStatsRes.rows.forEach(row => {
        const count = parseInt(row.count);
        const status = row.status.toLowerCase();
        sprintSummary.total += count;
        if (status === 'completed' || status === 'done') sprintSummary.completed += count;
        else if (status === 'active' || status === 'in_progress') sprintSummary.inProgress += count;
        else sprintSummary.notStarted += count;
      });

      // 4. Time Stats
      const timeStatsRes = await client.query(
        `SELECT SUM(duration) as total_seconds FROM time_tracking_entries WHERE project_id = $1 AND tenant_id = $2`,
        [projectId, tenantId]
      );
      const totalSeconds = parseInt(timeStatsRes.rows[0].total_seconds || "0");
      const totalHours = parseFloat((totalSeconds / 3600).toFixed(1));
      const daysWorked = parseFloat((totalHours / 6).toFixed(1));

      // 5. Sprints List with Progress
      const sprintsRes = await client.query(
        `SELECT 
            rp.id, rp.version as name, rp.description, rp.start_date, rp.end_date, rp.status,
            (SELECT count(*) FROM tickets t WHERE t.release_plan_id = rp.id AND t.is_deleted = false) as ticket_count,
            (SELECT count(*) FROM tickets t WHERE t.release_plan_id = rp.id AND LOWER(t.status) IN ('completed', 'done', 'live', 'live (deployed)') AND t.is_deleted = false) as completed_count
         FROM release_plans rp
         WHERE rp.project_id = $1 AND rp.tenant_id = $2 AND rp.type = 'sprint_plan'
         ORDER BY rp.start_date ASC`,
        [projectId, tenantId]
      );
      const sprints = sprintsRes.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        startDate: row.start_date,
        endDate: row.end_date,
        status: row.status.toLowerCase(),
        ticketCount: parseInt(row.ticket_count),
        completedCount: parseInt(row.completed_count),
        progress: row.ticket_count > 0 ? Math.round((row.completed_count / row.ticket_count) * 100) : 0
      }));

      // 6. Team Progress
      const teamRes = await client.query(
        `SELECT 
            u.id, u.name,
            (SELECT count(*) FROM tickets t WHERE t.assignee_id = u.id AND t.project_id = $1 AND LOWER(t.status) IN ('completed', 'done', 'live', 'live (deployed)') AND t.is_deleted = false) as done_count,
            (SELECT count(*) FROM tickets t WHERE t.assignee_id = u.id AND t.project_id = $1 AND LOWER(t.status) IN ('in_progress', 'in_testing', 'started', 'active') AND t.is_deleted = false) as active_count,
            (SELECT count(*) FROM tickets t WHERE t.assignee_id = u.id AND t.project_id = $1 AND LOWER(t.status) IN ('not_started', 'todo', 'backlog') AND t.is_deleted = false) as todo_count,
            (SELECT SUM(duration) FROM time_tracking_entries tte WHERE tte.user_id = u.id AND tte.project_id = $1) as total_seconds
         FROM project_members pm
         JOIN users u ON pm.user_id = u.id
         WHERE pm.project_id = $1`,
        [projectId]
      );

      const team = teamRes.rows.map(row => {
        const done = parseInt(row.done_count);
        const active = parseInt(row.active_count);
        const todo = parseInt(row.todo_count);
        const assigned = done + active + todo;

        return {
          id: row.id,
          name: row.name,
          done,
          active,
          todo,
          assigned,
          totalHours: Math.round((parseInt(row.total_seconds || "0") / 3600) * 10) / 10,
          contribution: assigned > 0 ? Math.round((done / assigned) * 100) : 0
        };
      });

      // 7. Recent Activities
      const activitiesRes = await client.query(
        `SELECT scl.id, scl.action, scl.performed_at as timestamp, u.name as user_name, t.ticket_number, t.title as ticket_title
         FROM sprint_completion_logs scl
         JOIN users u ON scl.performed_by_id = u.id
         JOIN tickets t ON scl.ticket_id = t.id
         WHERE scl.project_id = $1 AND scl.tenant_id = $2
         ORDER BY scl.performed_at DESC LIMIT 10`,
        [projectId, tenantId]
      );
      const activities = activitiesRes.rows.map(row => ({
        id: row.id,
        action: row.action,
        userName: row.user_name,
        ticketNumber: row.ticket_number,
        ticketTitle: row.ticket_title,
        timestamp: row.timestamp
      }));

      // 8. Generate Insights (Rule-based)
      const insights: string[] = [];
      if (ticketSummary.notStarted > (ticketSummary.total * 0.5)) {
        insights.push(`${ticketSummary.notStarted} tickets remain unstarted across the project.`);
      }
      sprints.forEach(s => {
        if (s.status === 'active' && s.endDate && new Date(s.endDate) < new Date() && s.progress < 100) {
          insights.push(`${s.name} is behind schedule - consider redistributing tickets.`);
        }
      });
      team.forEach(m => {
        if (m.todo > 10) {
          insights.push(`${m.name} has ${m.todo} unstarted tickets - potential workload imbalance.`);
        }
      });

      const projectProgress = ticketSummary.total > 0 ? Math.round((ticketSummary.completed / ticketSummary.total) * 100) : 0;

      return {
        project: {
          id: projectRow.id,
          code: projectRow.code,
          name: projectRow.name,
          description: projectRow.description,
          startDate: projectRow.start_date,
          endDate: projectRow.end_date,
          status: projectRow.status,
          progress: projectProgress,
          projectHead: projectRow.project_head || 'Not Assigned',
          teamCount: parseInt(projectRow.team_count || "0")
        },
        ticketSummary,
        sprintSummary,
        timeStats: {
          totalHours,
          daysWorked
        },
        sprints,
        team,
        activities,
        insights
      };

    } finally {
      client.release();
    }
  }

  static async update(id: string, tenantId: string, data: any): Promise<any> {
    const fields: string[] = [];
    const values: any[] = [id, tenantId];
    let idx = 3;

    if (data.name) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.description) { fields.push(`description = $${idx++}`); values.push(data.description); }
    if (data.status) { fields.push(`status = $${idx++}`); values.push(data.status); }

    if (fields.length === 0) return null;

    const query = `UPDATE projects SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`;
    const res = await pool.query(query, values);
    return res.rows[0];
  }

  static async delete(id: string, tenantId: string): Promise<boolean> {
    const res = await pool.query(`DELETE FROM projects WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
    return (res.rowCount ?? 0) > 0;
  }
}
