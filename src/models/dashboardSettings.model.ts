import pool from "../config/dbpool";

export interface DashboardSettings {
  id: string;
  tenantId: string;
  visibleCards: {
    heroSection: boolean;
    quickActions: boolean;
    attendanceStats: boolean;
    myTicketsProgress: boolean;
    recentTickets: boolean;
    freelancerStats: boolean;
    recentLeads: boolean;
    recentInvoices: boolean;
    calendar: boolean;
    upcomingBirthdays: boolean;
    dailyAttendanceCard: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

export const DEFAULT_VISIBLE_CARDS = {
  heroSection: true,
  quickActions: true,
  attendanceStats: true,
  myTicketsProgress: true,
  recentTickets: true,
  freelancerStats: true,
  recentLeads: true,
  recentInvoices: true,
  calendar: true,
  upcomingBirthdays: true,
  dailyAttendanceCard: true,
};

function mapRowToDashboardSettings(row: any): DashboardSettings {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    visibleCards: row.visible_cards || DEFAULT_VISIBLE_CARDS,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getDashboardSettingsByTenantId(tenantId: string): Promise<DashboardSettings> {
  const query = `
    SELECT * FROM dashboard_settings
    WHERE tenant_id = $1
    LIMIT 1
  `;
  const result = await pool.query(query, [tenantId]);
  
  if (result.rows.length === 0) {
    // Return default settings if not configured
    return {
      id: "",
      tenantId,
      visibleCards: DEFAULT_VISIBLE_CARDS,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  return mapRowToDashboardSettings(result.rows[0]);
}

export async function upsertDashboardSettings(tenantId: string, visibleCards: any): Promise<DashboardSettings> {
  // Ensure we only store valid keys and default any missing ones
  const sanitizedVisibleCards = { ...DEFAULT_VISIBLE_CARDS, ...visibleCards };

  const query = `
    INSERT INTO dashboard_settings (tenant_id, visible_cards)
    VALUES ($1, $2)
    ON CONFLICT (tenant_id)
    DO UPDATE SET visible_cards = $2, updated_at = CURRENT_TIMESTAMP
    RETURNING *
  `;
  
  const result = await pool.query(query, [tenantId, JSON.stringify(sanitizedVisibleCards)]);
  return mapRowToDashboardSettings(result.rows[0]);
}
