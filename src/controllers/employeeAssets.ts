import { AuthRequest } from "@/types";
import { uploadEmployeeAssetToR2 } from "@/utils/r2Client";
import { withTenant, TenantClient } from "@/db/onboardingPool";

/**
 * Run `fn` against the supplied tenant-scoped client when the orchestrator is
 * driving a shared transaction, otherwise open a standalone tenant transaction.
 * Mirrors the old `tx: any = prisma` default — a no-client call used to run on
 * the default (non-transactional) Prisma client.
 */
async function withClient<T>(
  req: AuthRequest,
  client: TenantClient | undefined,
  fn: (db: TenantClient) => Promise<T>,
): Promise<T> {
  if (client) return fn(client);
  return withTenant(req.tenantId as string, fn);
}

// ✅ CREATE Employee Assets
export async function createEmployeeAssets(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    const { assets } = req.body as { assets: any[] };

    if (!assets || !Array.isArray(assets)) {
      return;
    }

    return await withClient(req, client, async (db) => {
      for (const asset of assets) {
        let imageUrl = asset.image; // Default to existing URL if present

        // If image is a base64 string, upload it to R2
        if (asset.image && asset.image.startsWith("data:")) {
          imageUrl = await uploadEmployeeAssetToR2({
            base64: asset.image,
            fileName: asset.imageName || "asset.png",
            tenantId: req.tenantId!,
            employeeId,
          });
        }

        await db.query(
          `INSERT INTO employee_assets
             (id, employee_id, item_name, brand_name, model_name, model_number,
              upload_image, return_status, condition, deduction, remarks,
              created_by_id, updated_by_id, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
          [
            employeeId,
            asset.item || null,
            asset.brand || null,
            asset.model || null,
            asset.modelNumber || null,
            imageUrl || null,
            asset.returnStatus || "Pending",
            asset.condition || "Good",
            asset.deduction !== undefined ? Number(asset.deduction) : null,
            asset.remarks || null,
            employeeId || null,
            employeeId || null,
          ],
        );
      }

      return {
        success: true,
        message: "Employee assets created successfully",
      };
    });
  } catch (error) {
    console.error("Error in createEmployeeAssets:", error);
    throw error; // Re-throw to ensure transaction rollback
  }
}

// ✅ GET Employee Assets
export async function getEmployeeAssets(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      const assetsRes = await db.query(
        `SELECT * FROM employee_assets
          WHERE employee_id = $1
          ORDER BY created_at DESC`,
        [employeeId],
      );

      return assetsRes.rows.map((asset: any) => ({
        id: asset.id,
        item: asset.item_name,
        brand: asset.brand_name,
        model: asset.model_name,
        modelNumber: asset.model_number,
        image: asset.upload_image,
        returnStatus: asset.return_status,
        condition: asset.condition,
        deduction: asset.deduction,
        remarks: asset.remarks,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      }));
    });
  } catch (error) {
    console.error("Error in getEmployeeAssets:", error);
    throw error;
  }
}

// ✅ GET Single Employee Asset
export async function getSingleEmployeeAsset(
  req: AuthRequest,
  employeeId: string,
  assetId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      const assetRes = await db.query(
        `SELECT * FROM employee_assets
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [assetId, employeeId],
      );
      const asset = assetRes.rows[0];

      if (!asset) {
        throw new Error("Asset not found");
      }

      return {
        id: asset.id,
        item: asset.item_name,
        brand: asset.brand_name,
        model: asset.model_name,
        modelNumber: asset.model_number,
        image: asset.upload_image,
        returnStatus: asset.return_status,
        condition: asset.condition,
        deduction: asset.deduction,
        remarks: asset.remarks,
        createdAt: asset.created_at,
        updatedAt: asset.updated_at,
      };
    });
  } catch (error) {
    console.error("Error in getSingleEmployeeAsset:", error);
    throw error;
  }
}

// ✅ GET All Employees Assets (for tenant)
export async function getAllEmployeesAssets(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      const employeesRes = await db.query(
        `SELECT * FROM employees
          WHERE tenant_id = $1 AND status = true
          ORDER BY created_at DESC`,
        [req.tenantId],
      );
      const employees = employeesRes.rows;

      if (employees.length === 0) return [];

      const employeeIds = employees.map((e: any) => e.id);

      const assetsRes = await db.query(
        `SELECT * FROM employee_assets
          WHERE employee_id = ANY($1::uuid[])
          ORDER BY created_at DESC`,
        [employeeIds],
      );

      // Index assets by employee_id, preserving created_at DESC order.
      const assetsByEmp = new Map<string, any[]>();
      for (const a of assetsRes.rows) {
        const list = assetsByEmp.get(a.employee_id) || [];
        list.push(a);
        assetsByEmp.set(a.employee_id, list);
      }

      return employees.map((employee: any) => ({
        id: employee.id,
        employeeCode: employee.employee_code,
        firstName: employee.first_name,
        lastName: employee.last_name,
        assets: (assetsByEmp.get(employee.id) || []).map((asset: any) => ({
          id: asset.id,
          item: asset.item_name,
          brand: asset.brand_name,
          model: asset.model_name,
          modelNumber: asset.model_number,
          image: asset.upload_image,
          returnStatus: asset.return_status,
          condition: asset.condition,
          deduction: asset.deduction,
          remarks: asset.remarks,
          createdAt: asset.created_at,
        })),
      }));
    });
  } catch (error) {
    console.error("Error in getAllEmployeesAssets:", error);
    throw error;
  }
}

// ✅ UPDATE Employee Asset
export async function updateEmployeeAsset(
  req: AuthRequest,
  employeeId: string,
  assetId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { asset } = req.body;

    if (!asset) {
      throw new Error("Asset data is missing from request body");
    }

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify asset exists
      const existingRes = await db.query(
        `SELECT * FROM employee_assets
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [assetId, employeeId],
      );
      const existingAsset = existingRes.rows[0];

      if (!existingAsset) {
        throw new Error("Asset not found");
      }

      let imageUrl = existingAsset.upload_image; // Keep existing image by default

      // If a new image is provided as base64, upload it to R2
      if (asset.image && asset.image.startsWith("data:")) {
        imageUrl = await uploadEmployeeAssetToR2({
          base64: asset.image,
          fileName: asset.imageName || "asset.png",
          tenantId: req.tenantId!,
          employeeId,
        });
      } else if (asset.image) {
        // If it's already a URL, use it
        imageUrl = asset.image;
      }

      const updateRes = await db.query(
        `UPDATE employee_assets
            SET item_name = $1,
                brand_name = $2,
                model_name = $3,
                model_number = $4,
                upload_image = $5,
                return_status = $6,
                condition = $7,
                deduction = $8,
                remarks = $9,
                updated_by_id = $10,
                updated_at = now()
          WHERE id = $11
        RETURNING *`,
        [
          asset.item,
          asset.brand,
          asset.model,
          asset.modelNumber,
          imageUrl,
          asset.returnStatus,
          asset.condition,
          asset.deduction !== undefined
            ? Number(asset.deduction)
            : existingAsset.deduction,
          asset.remarks,
          req.user!.id,
          assetId,
        ],
      );
      const updatedAsset = updateRes.rows[0];

      return {
        success: true,
        message: "Asset updated successfully",
        asset: {
          id: updatedAsset.id,
          item: updatedAsset.item_name,
          brand: updatedAsset.brand_name,
          model: updatedAsset.model_name,
          modelNumber: updatedAsset.model_number,
          image: updatedAsset.upload_image,
          returnStatus: updatedAsset.return_status,
          condition: updatedAsset.condition,
          deduction: updatedAsset.deduction,
          remarks: updatedAsset.remarks,
        },
      };
    });
  } catch (error) {
    console.error("Error in updateEmployeeAsset:", error);
    throw error;
  }
}

// ✅ UPDATE Multiple Employee Assets
export async function updateEmployeeAssets(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { assets } = req.body as { assets: any[] };

    if (!assets || !Array.isArray(assets)) {
      throw new Error("Assets data is missing or invalid");
    }

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      for (const asset of assets) {
        if (!asset.id) {
          // If no ID, create new asset
          let imageUrl = asset.image;

          if (asset.image && asset.image.startsWith("data:")) {
            imageUrl = await uploadEmployeeAssetToR2({
              base64: asset.image,
              fileName: asset.imageName || "asset.png",
              tenantId: req.tenantId!,
              employeeId,
            });
          }

          await db.query(
            `INSERT INTO employee_assets
               (id, employee_id, item_name, brand_name, model_name, model_number,
                upload_image, return_status, condition, deduction, remarks,
                created_by_id, updated_by_id, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
            [
              employeeId,
              asset.item,
              asset.brand,
              asset.model,
              asset.modelNumber,
              imageUrl,
              asset.returnStatus || "Pending",
              asset.condition || "Good",
              asset.deduction !== undefined ? Number(asset.deduction) : null,
              asset.remarks || null,
              req.user!.id,
              req.user!.id,
            ],
          );
        } else {
          // If ID exists, update existing asset
          const existingRes = await db.query(
            `SELECT * FROM employee_assets
              WHERE id = $1 AND employee_id = $2
              LIMIT 1`,
            [asset.id, employeeId],
          );
          const existingAsset = existingRes.rows[0];

          if (!existingAsset) continue; // Skip if not found

          let imageUrl = existingAsset.upload_image;

          if (asset.image && asset.image.startsWith("data:")) {
            imageUrl = await uploadEmployeeAssetToR2({
              base64: asset.image,
              fileName: asset.imageName || "asset.png",
              tenantId: req.tenantId!,
              employeeId,
            });
          } else if (asset.image) {
            imageUrl = asset.image;
          }

          await db.query(
            `UPDATE employee_assets
                SET item_name = $1,
                    brand_name = $2,
                    model_name = $3,
                    model_number = $4,
                    upload_image = $5,
                    return_status = $6,
                    condition = $7,
                    deduction = $8,
                    remarks = $9,
                    updated_by_id = $10,
                    updated_at = now()
              WHERE id = $11`,
            [
              asset.item,
              asset.brand,
              asset.model,
              asset.modelNumber,
              imageUrl,
              asset.returnStatus,
              asset.condition,
              asset.deduction !== undefined
                ? Number(asset.deduction)
                : existingAsset.deduction,
              asset.remarks,
              req.user!.id,
              asset.id,
            ],
          );
        }
      }

      return {
        success: true,
        message: "Assets updated successfully",
      };
    });
  } catch (error) {
    console.error("Error in updateEmployeeAssets:", error);
    throw error;
  }
}

// ✅ DELETE Single Employee Asset
export async function deleteEmployeeAsset(
  req: AuthRequest,
  employeeId: string,
  assetId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify asset exists
      const existingRes = await db.query(
        `SELECT id FROM employee_assets
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [assetId, employeeId],
      );

      if (!existingRes.rows[0]) {
        throw new Error("Asset not found");
      }

      // Delete the asset
      await db.query(`DELETE FROM employee_assets WHERE id = $1`, [assetId]);

      // Note: You may want to also delete the image from R2 storage here
      // using a deleteFromR2 utility function if you have one

      return {
        success: true,
        message: "Asset deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteEmployeeAsset:", error);
    throw error;
  }
}

// ✅ DELETE All Employee Assets
export async function deleteAllEmployeeAssets(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withClient(req, client, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Delete all assets for the employee
      await db.query(`DELETE FROM employee_assets WHERE employee_id = $1`, [
        employeeId,
      ]);

      // Note: You may want to also delete the images from R2 storage here
      // using a deleteFromR2 utility function if you have one

      return {
        success: true,
        message: "All employee assets deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteAllEmployeeAssets:", error);
    throw error;
  }
}
