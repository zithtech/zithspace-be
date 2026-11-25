import pool from "../config/dbpool";
import { randomUUID } from "crypto";

export interface TimeTrackingProject {
  id: string;
  name: string;
  code: string | null;
}

export interface TimeTrackingTicket {
  id: string;
  title: string;
  ticketNumber: string;
  estimateHours: number | null;
}

export interface TimeTrackingUser {
  id: string;
  name: string;
  workEmail: string;
  avatarUrl: string | null;
}

export interface TimeTrackingLog {
  id: string;
  tenantId: string;
  timeTrackingId: string;
  action: string;
  createdAt: Date;
}

export interface TimeTrackingEntry {
  id: string;
  tenantId: string;
  userId: string;
  projectId: string | null;
  ticketId: string | null;
  meetingType: string | null;
  description: string | null;
  billable: boolean;
  billingRate: number | null;
  startTime: Date;
  endTime: Date | null;
  duration: number | null;
  status: string;
  pauseSource: string | null;
  pausedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  project?: TimeTrackingProject | null;
  ticket?: TimeTrackingTicket | null;
  user?: TimeTrackingUser | null;
  logs?: TimeTrackingLog[];
}

export interface CreateManualEntryData {
  tenantId: string;
  userId: string;
  projectId?: string | null;
  ticketId?: string | null;
  meetingType?: string | null;
  description?: string | null;
  billable?: boolean;
  billingRate?: number | null;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface StartTimerData {
  tenantId: string;
  userId: string;
  projectId?: string | null;
  ticketId?: string | null;
  meetingType?: string | null;
  description?: string | null;
  billable?: boolean;
  billingRate?: number | null;
}

export interface UpdateTimeTrackingData {
  projectId?: string | null;
  ticketId?: string | null;
  meetingType?: string | null;
  description?: string | null;
  billable?: boolean;
  billingRate?: number | null;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  status?: string;
  logId?: string;
}

export interface GetTimeTrackingFilters {
  tenantId: string;
  userId?: string;
  userIds?: string[];
  ticketId?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

function mapRowToEntry(row: any, logs: TimeTrackingLog[] = []): TimeTrackingEntry {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    projectId: row.project_id || null,
    ticketId: row.ticket_id || null,
    meetingType: row.meeting_type || null,
    description: row.description || null,
    billable: Boolean(row.billable),
    billingRate: row.billing_rate !== null && row.billing_rate !== undefined ? parseFloat(row.billing_rate) : null,
    startTime: row.start_time instanceof Date ? row.start_time : new Date(row.start_time),
    endTime: row.end_time ? (row.end_time instanceof Date ? row.end_time : new Date(row.end_time)) : null,
    duration: row.duration !== null && row.duration !== undefined ? parseInt(row.duration, 10) : null,
    status: row.status,
    pauseSource: row.pause_source || null,
    pausedAt: row.paused_at ? (row.paused_at instanceof Date ? row.paused_at : new Date(row.paused_at)) : null,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
    project: row.project_id ? {
      id: row.project_id,
      name: row.project_name,
      code: row.project_code || null,
    } : null,
    ticket: row.ticket_id ? {
      id: row.ticket_id,
      title: row.ticket_title,
      ticketNumber: row.ticket_number,
      estimateHours: row.ticket_estimate_hours !== null && row.ticket_estimate_hours !== undefined ? parseFloat(row.ticket_estimate_hours) : null,
    } : null,
    user: row.user_id ? {
      id: row.user_id,
      name: row.user_name,
      workEmail: row.user_work_email,
      avatarUrl: row.user_avatar_url || null,
    } : null,
    logs,
  };
}

function mapRowToLog(row: any): TimeTrackingLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    timeTrackingId: row.time_tracking_id,
    action: row.action,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

const SELECT_ENTRY_WITH_RELATIONS = `
  SELECT 
    t.id,
    t.tenant_id,
    t.user_id,
    t.project_id,
    t.ticket_id,
    t.meeting_type,
    t.description,
    t.billable,
    t.billing_rate,
    t.start_time,
    t.end_time,
    t.duration,
    t.status,
    t.pause_source,
    t.paused_at,
    t.created_at,
    t.updated_at,
    p.name AS project_name,
    p.code AS project_code,
    tk.title AS ticket_title,
    tk.ticket_number AS ticket_number,
    tk.estimate_hours AS ticket_estimate_hours,
    u.name AS user_name,
    u.work_email AS user_work_email,
    u.avatar_url AS user_avatar_url
  FROM time_tracking_entries t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN tickets tk ON tk.id = t.ticket_id
  LEFT JOIN users u ON u.id = t.user_id
`;

async function fetchLogsForEntries(entryIds: string[]): Promise<Record<string, TimeTrackingLog[]>> {
  if (entryIds.length === 0) return {};
  const query = `
    SELECT id, tenant_id, time_tracking_id, action, created_at
    FROM time_tracking_logs
    WHERE time_tracking_id = ANY($1)
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query, [entryIds]);
  const map: Record<string, TimeTrackingLog[]> = {};
  for (const row of result.rows) {
    const log = mapRowToLog(row);
    if (!map[log.timeTrackingId]) {
      map[log.timeTrackingId] = [];
    }
    map[log.timeTrackingId].push(log);
  }
  return map;
}

export async function getTimeTrackingEntries(
  filters: GetTimeTrackingFilters
): Promise<{ entries: TimeTrackingEntry[]; total?: number }> {
  const whereClauses: string[] = ["t.tenant_id = $1"];
  const values: any[] = [filters.tenantId];
  let paramIdx = 2;

  if (filters.userId) {
    whereClauses.push(`t.user_id = $${paramIdx++}`);
    values.push(filters.userId);
  } else if (filters.userIds && filters.userIds.length > 0) {
    whereClauses.push(`t.user_id = ANY($${paramIdx++})`);
    values.push(filters.userIds);
  }

  if (filters.ticketId) {
    whereClauses.push(`t.ticket_id = $${paramIdx++}`);
    values.push(filters.ticketId);
  }

  if (filters.projectId) {
    whereClauses.push(`t.project_id = $${paramIdx++}`);
    values.push(filters.projectId);
  }

  if (filters.startDate) {
    whereClauses.push(`t.start_time >= $${paramIdx++}`);
    values.push(new Date(filters.startDate));
  }

  if (filters.endDate) {
    whereClauses.push(`t.start_time <= $${paramIdx++}`);
    values.push(new Date(filters.endDate));
  }

  const whereStr = whereClauses.join(" AND ");

  let total: number | undefined;
  const limit = filters.limit || 0;
  const page = filters.page || 1;

  if (limit > 0) {
    const countQuery = `SELECT COUNT(*) FROM time_tracking_entries t WHERE ${whereStr}`;
    const countRes = await pool.query(countQuery, values);
    total = parseInt(countRes.rows[0].count, 10);
  }

  let dataQuery = `
    ${SELECT_ENTRY_WITH_RELATIONS}
    WHERE ${whereStr}
    ORDER BY t.start_time DESC
  `;

  if (limit > 0) {
    const offset = (page - 1) * limit;
    dataQuery += ` LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    values.push(limit, offset);
  }

  const result = await pool.query(dataQuery, values);
  const entryIds = result.rows.map((r) => r.id);
  const logsMap = await fetchLogsForEntries(entryIds);

  const entries = result.rows.map((row) => mapRowToEntry(row, logsMap[row.id] || []));
  return { entries, total };
}

export async function getTimeTrackingEntryById(
  id: string,
  tenantId: string
): Promise<TimeTrackingEntry | null> {
  const query = `
    ${SELECT_ENTRY_WITH_RELATIONS}
    WHERE t.id = $1 AND t.tenant_id = $2
    LIMIT 1
  `;
  const result = await pool.query(query, [id, tenantId]);
  if (result.rows.length === 0) return null;
  const logsMap = await fetchLogsForEntries([id]);
  return mapRowToEntry(result.rows[0], logsMap[id] || []);
}

export async function createManualTimeEntry(data: CreateManualEntryData): Promise<TimeTrackingEntry> {
  const entryId = randomUUID();
  const logStartId = randomUUID();
  const logStopId = randomUUID();

  const insertEntryQuery = `
    INSERT INTO time_tracking_entries (
      id, tenant_id, user_id, project_id, ticket_id, meeting_type, description,
      billable, billing_rate, start_time, end_time, duration, status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'MANUAL_UPDATED', NOW(), NOW()
    )
  `;

  const entryValues = [
    entryId,
    data.tenantId,
    data.userId,
    data.projectId || null,
    data.ticketId || null,
    data.meetingType || null,
    data.description || null,
    data.billable ?? false,
    data.billingRate ?? null,
    data.startTime,
    data.endTime,
    data.duration,
  ];

  await pool.query(insertEntryQuery, entryValues);

  const insertLogsQuery = `
    INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at)
    VALUES 
      ($1, $2, $3, 'STARTED', $4),
      ($5, $2, $3, 'STOPPED', $6)
  `;

  await pool.query(insertLogsQuery, [
    logStartId,
    data.tenantId,
    entryId,
    data.startTime,
    logStopId,
    data.endTime,
  ]);

  const entry = await getTimeTrackingEntryById(entryId, data.tenantId);
  if (!entry) throw new Error("Failed to load created manual time tracking entry");
  return entry;
}

export async function startTimerEntry(data: StartTimerData): Promise<TimeTrackingEntry> {
  const entryId = randomUUID();
  const logId = randomUUID();
  const now = new Date();

  const insertEntryQuery = `
    INSERT INTO time_tracking_entries (
      id, tenant_id, user_id, project_id, ticket_id, meeting_type, description,
      billable, billing_rate, start_time, duration, status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 'RUNNING', NOW(), NOW()
    )
  `;

  const entryValues = [
    entryId,
    data.tenantId,
    data.userId,
    data.projectId || null,
    data.ticketId || null,
    data.meetingType || null,
    data.description || null,
    data.billable ?? false,
    data.billingRate ?? null,
    now,
  ];

  await pool.query(insertEntryQuery, entryValues);

  const insertLogQuery = `
    INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at)
    VALUES ($1, $2, $3, 'STARTED', $4)
  `;

  await pool.query(insertLogQuery, [logId, data.tenantId, entryId, now]);

  const entry = await getTimeTrackingEntryById(entryId, data.tenantId);
  if (!entry) throw new Error("Failed to load started time tracking entry");
  return entry;
}

export async function pauseTimerEntry(id: string, tenantId: string): Promise<TimeTrackingEntry> {
  const entry = await getTimeTrackingEntryById(id, tenantId);
  if (!entry || entry.status !== "RUNNING") {
    throw new Error("Timer is not RUNNING.");
  }

  const pauseTime = new Date();

  const lastLogRes = await pool.query(
    `SELECT created_at FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [id]
  );
  const lastActiveTime = lastLogRes.rows.length > 0 ? new Date(lastLogRes.rows[0].created_at) : entry.startTime;
  const additionalDuration = Math.floor((pauseTime.getTime() - lastActiveTime.getTime()) / 1000);
  const totalDuration = (entry.duration || 0) + additionalDuration;

  await pool.query(
    `UPDATE time_tracking_entries 
     SET status = 'PAUSED', duration = $1, pause_source = 'manual', paused_at = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [totalDuration, pauseTime, id, tenantId]
  );

  const logId = randomUUID();
  await pool.query(
    `INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at)
     VALUES ($1, $2, $3, 'PAUSED', $4)`,
    [logId, tenantId, id, pauseTime]
  );

  const updated = await getTimeTrackingEntryById(id, tenantId);
  if (!updated) throw new Error("Failed to reload paused entry");
  return updated;
}

export async function resumeTimerEntry(id: string, tenantId: string): Promise<TimeTrackingEntry> {
  const entry = await getTimeTrackingEntryById(id, tenantId);
  if (!entry || entry.status !== "PAUSED") {
    throw new Error("Timer is not PAUSED.");
  }

  const now = new Date();
  await pool.query(
    `UPDATE time_tracking_entries 
     SET status = 'RUNNING', pause_source = NULL, paused_at = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );

  const logId = randomUUID();
  await pool.query(
    `INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at)
     VALUES ($1, $2, $3, 'RESUMED', $4)`,
    [logId, tenantId, id, now]
  );

  const updated = await getTimeTrackingEntryById(id, tenantId);
  if (!updated) throw new Error("Failed to reload resumed entry");
  return updated;
}

export async function stopTimerEntry(id: string, tenantId: string): Promise<TimeTrackingEntry> {
  const entry = await getTimeTrackingEntryById(id, tenantId);
  if (!entry || entry.status === "STOPPED") {
    throw new Error("No active timer found with this ID.");
  }

  const endTime = new Date();
  let additionalDuration = 0;

  if (entry.status === "RUNNING") {
    const lastLogRes = await pool.query(
      `SELECT created_at FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    const lastActiveTime = lastLogRes.rows.length > 0 ? new Date(lastLogRes.rows[0].created_at) : entry.startTime;
    additionalDuration = Math.floor((endTime.getTime() - lastActiveTime.getTime()) / 1000);
  }

  const totalDuration = (entry.duration || 0) + additionalDuration;

  await pool.query(
    `UPDATE time_tracking_entries 
     SET status = 'STOPPED', end_time = $1, duration = $2, updated_at = NOW()
     WHERE id = $3 AND tenant_id = $4`,
    [endTime, totalDuration, id, tenantId]
  );

  const logId = randomUUID();
  await pool.query(
    `INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at)
     VALUES ($1, $2, $3, 'STOPPED', $4)`,
    [logId, tenantId, id, endTime]
  );

  const updated = await getTimeTrackingEntryById(id, tenantId);
  if (!updated) throw new Error("Failed to reload stopped entry");
  return updated;
}

export async function updateTimeTrackingEntry(
  id: string,
  tenantId: string,
  data: UpdateTimeTrackingData
): Promise<TimeTrackingEntry> {
  const entry = await getTimeTrackingEntryById(id, tenantId);
  if (!entry) throw new Error("Entry not found");

  let newStartTime = data.startTime ? new Date(data.startTime) : undefined;
  let newEndTime = data.endTime ? new Date(data.endTime) : undefined;
  if (newStartTime && isNaN(newStartTime.getTime())) newStartTime = undefined;
  if (newEndTime && isNaN(newEndTime.getTime())) newEndTime = undefined;

  if (newEndTime) {
    if (data.logId) {
      await pool.query(
        `UPDATE time_tracking_logs SET created_at = $1 WHERE id = $2 AND time_tracking_id = $3`,
        [newEndTime, data.logId, id]
      );
    } else {
      await pool.query(
        `DELETE FROM time_tracking_logs WHERE time_tracking_id = $1 AND created_at > $2`,
        [id, newEndTime]
      );

      const lastLogRes = await pool.query(
        `SELECT action FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      );
      if (lastLogRes.rows.length > 0 && (lastLogRes.rows[0].action === "STARTED" || lastLogRes.rows[0].action === "RESUMED")) {
        const logId = randomUUID();
        await pool.query(
          `INSERT INTO time_tracking_logs (id, tenant_id, time_tracking_id, action, created_at) VALUES ($1, $2, $3, 'STOPPED', $4)`,
          [logId, tenantId, id, newEndTime]
        );
      }
    }
  }

  if (newStartTime) {
    const earliestLogRes = await pool.query(
      `SELECT id FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [id]
    );
    if (earliestLogRes.rows.length > 0) {
      await pool.query(
        `UPDATE time_tracking_logs SET created_at = $1 WHERE id = $2`,
        [newStartTime, earliestLogRes.rows[0].id]
      );
    }
  }

  const allLogsRes = await pool.query(
    `SELECT action, created_at FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at ASC`,
    [id]
  );
  let totalDuration = 0;
  let currentStart: Date | null = null;
  for (const log of allLogsRes.rows) {
    const act = log.action;
    const createdAt = new Date(log.created_at);
    if (act === "STARTED" || act === "RESUMED") {
      currentStart = createdAt;
    } else if ((act === "PAUSED" || act === "STOPPED") && currentStart) {
      totalDuration += Math.floor((createdAt.getTime() - currentStart.getTime()) / 1000);
      currentStart = null;
    }
  }

  let shouldUpdateOverallEndTime = !!newEndTime;
  if (data.logId && newEndTime) {
    const latestLogRes = await pool.query(
      `SELECT id FROM time_tracking_logs WHERE time_tracking_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id]
    );
    if (latestLogRes.rows.length > 0 && latestLogRes.rows[0].id !== data.logId) {
      shouldUpdateOverallEndTime = false;
    }
  }

  const setClauses: string[] = ["updated_at = NOW()"];
  const values: any[] = [id, tenantId];
  let paramIdx = 3;

  if (data.projectId !== undefined) {
    setClauses.push(`project_id = $${paramIdx++}`);
    values.push(data.projectId || null);
  }
  if (data.ticketId !== undefined) {
    setClauses.push(`ticket_id = $${paramIdx++}`);
    values.push(data.ticketId || null);
  }
  if (data.meetingType !== undefined) {
    setClauses.push(`meeting_type = $${paramIdx++}`);
    values.push(data.meetingType || null);
  }
  if (data.description !== undefined) {
    setClauses.push(`description = $${paramIdx++}`);
    values.push(data.description);
  }
  if (data.billable !== undefined) {
    setClauses.push(`billable = $${paramIdx++}`);
    values.push(data.billable);
  }
  if (data.billingRate !== undefined) {
    setClauses.push(`billing_rate = $${paramIdx++}`);
    values.push(data.billingRate);
  }
  if (newStartTime) {
    setClauses.push(`start_time = $${paramIdx++}`);
    values.push(newStartTime);
  }
  if (shouldUpdateOverallEndTime && newEndTime) {
    setClauses.push(`end_time = $${paramIdx++}`);
    values.push(newEndTime);
    setClauses.push(`status = 'MANUAL_UPDATED'`);
  }
  setClauses.push(`duration = $${paramIdx++}`);
  values.push(totalDuration);

  const updateSql = `
    UPDATE time_tracking_entries
    SET ${setClauses.join(", ")}
    WHERE id = $1 AND tenant_id = $2
  `;
  await pool.query(updateSql, values);

  const updated = await getTimeTrackingEntryById(id, tenantId);
  if (!updated) throw new Error("Failed to reload updated entry");
  return updated;
}

export async function deleteTimeTrackingEntry(
  id: string,
  tenantId: string
): Promise<TimeTrackingEntry | null> {
  const entry = await getTimeTrackingEntryById(id, tenantId);
  if (!entry) return null;

  await pool.query(`DELETE FROM time_tracking_logs WHERE time_tracking_id = $1`, [id]);
  await pool.query(`DELETE FROM time_tracking_entries WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return entry;
}
