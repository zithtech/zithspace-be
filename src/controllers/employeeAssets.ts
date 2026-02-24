import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import { uploadEmployeeAssetToR2 } from "@/utils/r2Client";

// ✅ CREATE Employee Assets
export async function createEmployeeAssets(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    const { assets } = req.body as { assets: any[] };

    if (!assets || !Array.isArray(assets)) {
      return;
    }

    for (const asset of assets) {
      let imageUrl = asset.image; // Default to existing URL if present

      // If image is a base64 string, upload it to R2
      if (asset.image && asset.image.startsWith("data:")) {
        imageUrl = await uploadEmployeeAssetToR2(
          asset.image || null,
          asset.imageName || "asset.png",
          req.tenantId!,
          employeeId,
        );
      }

      await tx.employeeAsset.create({
        data: {
          employeeId,
          itemName: asset.item || null,
          brandName: asset.brand || null,
          modelName: asset.model || null,
          modelNumber: asset.modelNumber || null,
          uploadImage: imageUrl || null,
          createdById: employeeId || null,
          updatedById: employeeId || null,
        },
      });
    }

    return {
      success: true,
      message: "Employee assets created successfully",
    };
  } catch (error) {
    console.error("Error in createEmployeeAssets:", error);
    throw error; // Re-throw to ensure transaction rollback
  }
}

// ✅ GET Employee Assets
export async function getEmployeeAssets(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    const assets = await prisma.employeeAsset.findMany({
      where: { employeeId },
      orderBy: { createdAt: "desc" },
    });

    return assets.map((asset) => ({
      id: asset.id,
      item: asset.itemName,
      brand: asset.brandName,
      model: asset.modelName,
      modelNumber: asset.modelNumber,
      image: asset.uploadImage,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    }));
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

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    const asset = await prisma.employeeAsset.findFirst({
      where: {
        id: assetId,
        employeeId,
      },
    });

    if (!asset) {
      throw new Error("Asset not found");
    }

    return {
      id: asset.id,
      item: asset.itemName,
      brand: asset.brandName,
      model: asset.modelName,
      modelNumber: asset.modelNumber,
      image: asset.uploadImage,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
    };
  } catch (error) {
    console.error("Error in getSingleEmployeeAsset:", error);
    throw error;
  }
}

// ✅ GET All Employees Assets (for tenant)
export async function getAllEmployeesAssets(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const employees = await prisma.employee.findMany({
      where: {
        tenantId: req.tenantId,
        status: true,
      },
      include: {
        assets: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return employees.map((employee) => ({
      id: employee.id,
      employeeCode: employee.employee_code,
      firstName: employee.first_name,
      lastName: employee.last_name,
      assets: employee.assets.map((asset) => ({
        id: asset.id,
        item: asset.itemName,
        brand: asset.brandName,
        model: asset.modelName,
        modelNumber: asset.modelNumber,
        image: asset.uploadImage,
        createdAt: asset.createdAt,
      })),
    }));
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

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify asset exists
    const existingAsset = await prisma.employeeAsset.findFirst({
      where: {
        id: assetId,
        employeeId,
      },
    });

    if (!existingAsset) {
      throw new Error("Asset not found");
    }

    let imageUrl = existingAsset.uploadImage; // Keep existing image by default

    // If a new image is provided as base64, upload it to R2
    if (asset.image && asset.image.startsWith("data:")) {
      imageUrl = await uploadEmployeeAssetToR2(
        asset.image,
        asset.imageName || "asset.png",
        req.tenantId!,
        employeeId,
      );
    } else if (asset.image) {
      // If it's already a URL, use it
      imageUrl = asset.image;
    }

    const updatedAsset = await prisma.employeeAsset.update({
      where: { id: assetId },
      data: {
        itemName: asset.item,
        brandName: asset.brand,
        modelName: asset.model,
        modelNumber: asset.modelNumber,
        uploadImage: imageUrl,
        updatedById: req.user.id,
      },
    });

    return {
      success: true,
      message: "Asset updated successfully",
      asset: {
        id: updatedAsset.id,
        item: updatedAsset.itemName,
        brand: updatedAsset.brandName,
        model: updatedAsset.modelName,
        modelNumber: updatedAsset.modelNumber,
        image: updatedAsset.uploadImage,
      },
    };
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

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    for (const asset of assets) {
      if (!asset.id) {
        // If no ID, create new asset
        let imageUrl = asset.image;

        if (asset.image && asset.image.startsWith("data:")) {
          imageUrl = await uploadEmployeeAssetToR2(
            asset.image,
            asset.imageName || "asset.png",
            req.tenantId!,
            employeeId,
          );
        }

        await prisma.employeeAsset.create({
          data: {
            employeeId,
            itemName: asset.item,
            brandName: asset.brand,
            modelName: asset.model,
            modelNumber: asset.modelNumber,
            uploadImage: imageUrl,
            createdById: req.user.id,
            updatedById: req.user.id,
          },
        });
      } else {
        // If ID exists, update existing asset
        const existingAsset = await prisma.employeeAsset.findFirst({
          where: {
            id: asset.id,
            employeeId,
          },
        });

        if (!existingAsset) continue; // Skip if not found

        let imageUrl = existingAsset.uploadImage;

        if (asset.image && asset.image.startsWith("data:")) {
          imageUrl = await uploadEmployeeAssetToR2(
            asset.image,
            asset.imageName || "asset.png",
            req.tenantId!,
            employeeId,
          );
        } else if (asset.image) {
          imageUrl = asset.image;
        }

        await prisma.employeeAsset.update({
          where: { id: asset.id },
          data: {
            itemName: asset.item,
            brandName: asset.brand,
            modelName: asset.model,
            modelNumber: asset.modelNumber,
            uploadImage: imageUrl,
            updatedById: req.user.id,
          },
        });
      }
    }

    return {
      success: true,
      message: "Assets updated successfully",
    };
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

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify asset exists
    const existingAsset = await prisma.employeeAsset.findFirst({
      where: {
        id: assetId,
        employeeId,
      },
    });

    if (!existingAsset) {
      throw new Error("Asset not found");
    }

    // Delete the asset
    await prisma.employeeAsset.delete({
      where: { id: assetId },
    });

    // Note: You may want to also delete the image from R2 storage here
    // using a deleteFromR2 utility function if you have one

    return {
      success: true,
      message: "Asset deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteEmployeeAsset:", error);
    throw error;
  }
}

// ✅ DELETE All Employee Assets
export async function deleteAllEmployeeAssets(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Delete all assets for the employee
    await tx.employeeAsset.deleteMany({
      where: { employeeId },
    });

    // Note: You may want to also delete the images from R2 storage here
    // using a deleteFromR2 utility function if you have one

    return {
      success: true,
      message: "All employee assets deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteAllEmployeeAssets:", error);
    throw error;
  }
}
