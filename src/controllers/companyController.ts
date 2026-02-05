import { Response } from "express";
import { prisma } from "@/config/database";
import {
  AuthRequest,
  ApiResponse,
  NotFoundError,
  ValidationError,
} from "@/types";

export class CompanyController {
  /** =========================
   * GET ALL COMPANIES
   ========================== */
  static async getCompanies(req: AuthRequest, res: Response) {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { search, isActive } = req.query;

    const where: any = {
      tenantId: req.tenantId,
    };

    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;

    if (search) {
      where.name = {
        contains: search as string,
        mode: "insensitive",
      };
    }

    const [data, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.company.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      pagination: {
        current: page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    } as ApiResponse);
  }

  /** =========================
   * GET COMPANY BY ID
   ========================== */
  static async getCompanyById(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid company id");

    const company = await prisma.company.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!company) throw new NotFoundError("Company not found");

    res.json({
      success: true,
      data: company,
    } as ApiResponse);
  }

  /** =========================
   * CREATE COMPANY
   ========================== */
  // static async createCompany(req: AuthRequest, res: Response) {
  //   const {
  //     name,
  //     email,
  //     phone,
  //     plotNo,
  //     floorNo,
  //     buildingName,
  //     street,
  //     area,
  //     city,
  //     pincode,
  //     country,
  //     cin,
  //     gst,
  //     logo,
  //   } = req.body;

  //   if (!name) throw new ValidationError("Company name is required");

  //   const exists = await prisma.company.findFirst({
  //     where: {
  //       tenantId: req.tenantId,
  //       name,
  //     },
  //   });

  //   if (exists) {
  //     throw new ValidationError("Company name already exists");
  //   }

  //   const company = await prisma.company.create({
  //     data: {
  //       tenantId: req.tenantId!,
  //       name,
  //       email,
  //       phone,
  //       plotNo,
  //       floorNo,
  //       buildingName,
  //       street,
  //       area,
  //       city,
  //       pincode,
  //       country,
  //       cin,
  //       gst,
  //       logo,
  //       createdById: req.user!.id,
  //     },
  //   });

  //   res.status(201).json({
  //     success: true,
  //     data: company,
  //     message: "Company created successfully",
  //   } as ApiResponse);
  // }


  static async createCompany(req: AuthRequest, res: Response) {
  const {
    name,
    email,
    phone,
    plotNo,
    floorNo,
    buildingName,
    street,
    area,
    city,
    pincode,
    country,
    cin,
    gst,
    logo,
  } = req.body;

  if (!name) throw new ValidationError("Company name is required");

  const exists = await prisma.company.findFirst({
    where: {
      tenantId: req.tenantId,
      name,
    },
  });

  if (exists) {
    throw new ValidationError("Company name already exists");
  }

  // ✅ CHECK if any active company exists
  const activeCount = await prisma.company.count({
    where: {
      tenantId: req.tenantId,
      isActive: true,
    },
  });

  const company = await prisma.company.create({
    data: {
      tenantId: req.tenantId!,
      name,
      email,
      phone,
      plotNo,
      floorNo,
      buildingName,
      street,
      area,
      city,
      pincode,
      country,
      cin,
      gst,
      logo,
      // 🔥 MAGIC LINE
      isActive: false,
      createdById: req.user!.id,
    },
  });

  res.status(201).json({
    success: true,
    data: company,
    message: "Company created successfully",
  } as ApiResponse);
}

  /** =========================
   * UPDATE COMPANY
   ========================== */
  static async updateCompany(req: AuthRequest, res: Response) {
    const id = Number(req.params.id);
    if (!id) throw new ValidationError("Invalid company id");

    const company = await prisma.company.findFirst({
      where: {
        id,
        tenantId: req.tenantId,
      },
    });

    if (!company) throw new NotFoundError("Company not found");

    const {
      name,
      email,
      phone,
      plotNo,
      floorNo,
      buildingName,
      street,
      area,
      city,
      pincode,
      country,
      cin,
      gst,
      logo,
    } = req.body;

    const updated = await prisma.company.update({
      where: { id },
      data: {
        name,
        email,
        phone,
        plotNo,
        floorNo,
        buildingName,
        street,
        area,
        city,
        pincode,
        country,
        cin,
        gst,
        logo,
        updatedById: req.user!.id,
      },
    });

    res.json({
      success: true,
      data: updated,
      message: "Company updated successfully",
    } as ApiResponse);
  }

  /** =========================
   * SET ACTIVE COMPANY
   ========================== */
  /** =========================
 * SET / UNSET COMPANY ACTIVE
 ========================== */
static async setActiveCompany(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  if (!id) throw new ValidationError("Invalid company id");

  const company = await prisma.company.findFirst({
    where: {
      id,
      tenantId: req.tenantId,
    },
  });

  if (!company) throw new NotFoundError("Company not found");

  const updated = await prisma.company.update({
    where: { id },
    data: {
      isActive: !company.isActive, // 🔥 flip state
      updatedById: req.user!.id,
    },
  });

  res.json({
    success: true,
    data: updated,
    message: updated.isActive
      ? "Company set as active"
      : "Company set as inactive",
  } as ApiResponse);
}



  /** =========================
 * DELETE COMPANY
 ========================== */
static async deleteCompany(req: AuthRequest, res: Response) {
  const id = Number(req.params.id);
  if (!id) throw new ValidationError("Invalid company id");

  const company = await prisma.company.findFirst({
    where: {
      id,
      tenantId: req.tenantId,
    },
  });

  if (!company) throw new NotFoundError("Company not found");

  // ❌ Active company delete block
  if (company.isActive) {
    throw new ValidationError("Active company cannot be deleted");
  }

  await prisma.company.delete({
    where: { id },
  });

  res.json({
    success: true,
    message: "Company deleted successfully",
  } as ApiResponse);
}

}
