import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";



class ReimbursementRequestController {

    // ==============================
    // CREATE (DRAFT)
    // ==============================
    createRequest = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const tenantId = req.tenantId!;
            const userId = req.user!.id;

            const {
                requestNumber,
                categoryId,
                departmentId,
                totalAmount,
                currency,
                remarks,
            } = req.body;

            if (!requestNumber || !categoryId || !totalAmount || !currency) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }

            const request = await prisma.reimbursementRequest.create({
                data: {
                    tenantId,
                    requestNumber,
                    categoryId,
                    departmentId,
                    totalAmount,
                    currency,
                    status: "draft",
                    remarks,
                    createdBy: userId,
                    updatedBy: userId,
                },
            });

            res.status(201).json({
                success: true,
                message: "Reimbursement request created",
                data: request,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    };

    // ==============================
    // GET ALL (TENANT)
    // ==============================
    getRequests = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const tenantId = req.tenantId!;

            const requests = await prisma.reimbursementRequest.findMany({
                where: { tenantId },
                orderBy: { createdAt: "desc" },
            });

            res.status(200).json({
                success: true,
                data: requests,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    };

    // ==============================
    // GET BY ID
    // ==============================
    getRequestById = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const tenantId = req.tenantId!;
            const { id } = req.params;

            const request = await prisma.reimbursementRequest.findFirst({
                where: { id, tenantId },
            });

            if (!request) {
                res.status(404).json({
                    success: false,
                    error: "Reimbursement request not found",
                });
                return;
            }

            res.status(200).json({
                success: true,
                data: request,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    };

    // ==============================
    // UPDATE (DRAFT ONLY)
    // ==============================
    updateRequest = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const tenantId = req.tenantId!;
            const userId = req.user!.id;
            const { id } = req.params;

            const existing = await prisma.reimbursementRequest.findFirst({
                where: { id, tenantId },
            });

            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Request not found",
                });
                return;
            }

            if (existing.status !== "draft") {
                res.status(400).json({
                    success: false,
                    error: "Only draft requests can be updated",
                });
                return;
            }

            const {
                categoryId,
                departmentId,
                totalAmount,
                currency,
                remarks,
            } = req.body;

            const updated = await prisma.reimbursementRequest.updateMany({
                where: { id, tenantId },
                data: {
                    categoryId,
                    departmentId,
                    totalAmount,
                    currency,
                    remarks,
                    updatedBy: userId,
                },
            });

            res.status(200).json({
                success: true,
                message: "Reimbursement request updated",
                data: updated,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    };

    // ==============================
    // SUBMIT
    // ==============================
    submitRequest = async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const tenantId = req.tenantId!;
            const userId = req.user!.id;
            const { id } = req.params;

            const existing = await prisma.reimbursementRequest.findFirst({
                where: { id, tenantId },
            });

            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Request not found",
                });
                return;
            }

            if (existing.status !== "draft") {
                res.status(400).json({
                    success: false,
                    error: "Only draft requests can be submitted",
                });
                return;
            }

            const updated = await prisma.reimbursementRequest.update({
                where: { id },   // id is PRIMARY KEY
                data: {
                    status: "submitted",
                    submittedAt: new Date(),
                    updatedBy: userId,
                },
            });


            res.status(200).json({
                success: true,
                message: "Reimbursement request submitted",
                data: updated,
            });
        } catch (error: any) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    };
}

export default new ReimbursementRequestController();
