"use strict";
// import { Response } from "express";
// import { prisma } from "@/config/database";
// import { AuthRequest, ApiResponse, NotFoundError, ValidationError } from "@/types";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompanyController = void 0;
const database_1 = require("@/config/database");
const types_1 = require("@/types");
class CompanyController {
    /** =========================
     * GET ALL COMPANIES
     ========================== */
    static async getCompanies(req, res) {
        const page = Number(req.query.page) || 1;
        const limit = Number(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const { search, isActive } = req.query;
        const where = {
            tenantId: req.tenantId,
        };
        if (isActive === "true")
            where.isActive = true;
        if (isActive === "false")
            where.isActive = false;
        if (search) {
            where.name = {
                contains: search,
                mode: "insensitive",
            };
        }
        const [data, total] = await Promise.all([
            database_1.prisma.company.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            database_1.prisma.company.count({ where }),
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
        });
    }
    /** =========================
     * GET COMPANY BY ID
     ========================== */
    static async getCompanyById(req, res) {
        const id = Number(req.params.id);
        if (!id)
            throw new types_1.ValidationError("Invalid company id");
        const company = await database_1.prisma.company.findFirst({
            where: {
                id,
                tenantId: req.tenantId,
            },
        });
        if (!company)
            throw new types_1.NotFoundError("Company not found");
        res.json({
            success: true,
            data: company,
        });
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
    static async createCompany(req, res) {
        const { name, email, phone, plotNo, floorNo, buildingName, street, area, city, pincode, country, cin, gst, logo, } = req.body;
        if (!name)
            throw new types_1.ValidationError("Company name is required");
        const exists = await database_1.prisma.company.findFirst({
            where: {
                tenantId: req.tenantId,
                name,
            },
        });
        if (exists) {
            throw new types_1.ValidationError("Company name already exists");
        }
        // ✅ CHECK if any active company exists
        const activeCount = await database_1.prisma.company.count({
            where: {
                tenantId: req.tenantId,
                isActive: true,
            },
        });
        const company = await database_1.prisma.company.create({
            data: {
                tenantId: req.tenantId,
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
                isActive: activeCount === 0,
                createdById: req.user.id,
            },
        });
        res.status(201).json({
            success: true,
            data: company,
            message: "Company created successfully",
        });
    }
    /** =========================
     * UPDATE COMPANY
     ========================== */
    static async updateCompany(req, res) {
        const id = Number(req.params.id);
        if (!id)
            throw new types_1.ValidationError("Invalid company id");
        const company = await database_1.prisma.company.findFirst({
            where: {
                id,
                tenantId: req.tenantId,
            },
        });
        if (!company)
            throw new types_1.NotFoundError("Company not found");
        const { name, email, phone, plotNo, floorNo, buildingName, street, area, city, pincode, country, cin, gst, logo, } = req.body;
        const updated = await database_1.prisma.company.update({
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
                updatedById: req.user.id,
            },
        });
        res.json({
            success: true,
            data: updated,
            message: "Company updated successfully",
        });
    }
    /** =========================
     * SET ACTIVE COMPANY
     ========================== */
    static async setActiveCompany(req, res) {
        const id = Number(req.params.id);
        if (!id)
            throw new types_1.ValidationError("Invalid company id");
        const company = await database_1.prisma.company.findFirst({
            where: {
                id,
                tenantId: req.tenantId,
            },
        });
        if (!company)
            throw new types_1.NotFoundError("Company not found");
        await database_1.prisma.$transaction([
            database_1.prisma.company.updateMany({
                where: { tenantId: req.tenantId },
                data: { isActive: false },
            }),
            database_1.prisma.company.update({
                where: { id },
                data: {
                    isActive: true,
                    updatedById: req.user.id,
                },
            }),
        ]);
        res.json({
            success: true,
            message: "Company set as active",
        });
    }
    /** =========================
   * DELETE COMPANY
   ========================== */
    static async deleteCompany(req, res) {
        const id = Number(req.params.id);
        if (!id)
            throw new types_1.ValidationError("Invalid company id");
        const company = await database_1.prisma.company.findFirst({
            where: {
                id,
                tenantId: req.tenantId,
            },
        });
        if (!company)
            throw new types_1.NotFoundError("Company not found");
        // ❌ Active company delete block
        if (company.isActive) {
            throw new types_1.ValidationError("Active company cannot be deleted");
        }
        await database_1.prisma.company.delete({
            where: { id },
        });
        res.json({
            success: true,
            message: "Company deleted successfully",
        });
    }
}
exports.CompanyController = CompanyController;
//# sourceMappingURL=companyController.js.map