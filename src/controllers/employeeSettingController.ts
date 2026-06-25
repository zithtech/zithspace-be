import { withTenant } from "@/db/onboardingPool";
import { AuthRequest } from "@/types";

// Helper to map DB fields to API response format
const mapResponse = (settings: any) => {
  if (!settings) return null;
  return {
    ...settings,
    employeeCodePrefix: settings.employee_prefix, // Map DB 'employee_prefix' to frontend 'employeeCodePrefix'
  };
};

// ✅ CREATE Employee Settings
export const createEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    const { employeeCodePrefix } = req.body;

    return await withTenant(req.tenantId, async (db) => {
      // Check if already exists for tenant
      const existingRes = await db.query(
        `SELECT * FROM employee_settings WHERE tenant_id = $1 LIMIT 1`,
        [req.tenantId],
      );
      const existing = existingRes.rows[0];

      if (existing) {
        return res.status(400).json({
          message: "Employee settings already exist for this tenant",
        });
      }
      console.log("Creating Employee Settings with prefix:", employeeCodePrefix);

      const insertRes = await db.query(
        `INSERT INTO employee_settings (tenant_id, employee_prefix)
         VALUES ($1, $2)
         RETURNING *`,
        [req.tenantId, employeeCodePrefix || "EMP"],
      );
      const settings = insertRes.rows[0];

      return res.status(201).json({
        success: true,
        message: "Employee settings created successfully",
        data: mapResponse(settings),
      });
    });
  } catch (error) {
    console.error("Create Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ GET Employee Settings (Single per tenant)
export const getEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    return await withTenant(req.tenantId, async (db) => {
      const settingsRes = await db.query(
        `SELECT * FROM employee_settings WHERE tenant_id = $1 LIMIT 1`,
        [req.tenantId],
      );
      let settings = settingsRes.rows[0];

      if (!settings) {
        // If settings don't exist, create default "EMP" record
        // This ensures there is always one record and we don't need explicit create logic in frontend
        const insertRes = await db.query(
          `INSERT INTO employee_settings (tenant_id, employee_prefix)
           VALUES ($1, $2)
           RETURNING *`,
          [req.tenantId, "EMP"],
        );
        settings = insertRes.rows[0];
      }

      // Standardized response format
      return res.status(200).json({
        success: true,
        data: mapResponse(settings),
      });
    });
  } catch (error) {
    console.error("Get Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ UPDATE Employee Settings
export const updateEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    const { employeeCodePrefix } = req.body;

    return await withTenant(req.tenantId, async (db) => {
      const existingRes = await db.query(
        `SELECT * FROM employee_settings WHERE tenant_id = $1 LIMIT 1`,
        [req.tenantId],
      );
      const existing = existingRes.rows[0];

      if (!existing) {
        return res.status(404).json({
          message: "Employee settings not found",
        });
      }

      const updateRes = await db.query(
        `UPDATE employee_settings
            SET employee_prefix = $1, updated_at = now()
          WHERE id = $2
        RETURNING *`,
        [employeeCodePrefix || "EMP", existing.id],
      );
      const updated = updateRes.rows[0];

      return res.status(200).json({
        success: true,
        message: "Employee settings updated successfully",
        data: mapResponse(updated),
      });
    });
  } catch (error) {
    console.error("Update Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ DELETE Employee Settings
export const deleteEmployeeSettings = async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.id || !req.tenantId)
      return res.status(401).json({ message: "Unauthorized" });

    return await withTenant(req.tenantId, async (db) => {
      const existingRes = await db.query(
        `SELECT * FROM employee_settings WHERE tenant_id = $1 LIMIT 1`,
        [req.tenantId],
      );
      const existing = existingRes.rows[0];

      if (!existing) {
        return res.status(404).json({
          message: "Employee settings not found",
        });
      }

      await db.query(`DELETE FROM employee_settings WHERE id = $1`, [
        existing.id,
      ]);

      return res.status(200).json({
        success: true,
        message: "Employee settings deleted successfully",
      });
    });
  } catch (error) {
    console.error("Delete Employee Settings Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
