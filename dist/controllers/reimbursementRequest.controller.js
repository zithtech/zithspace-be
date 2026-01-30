"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@/config/database");
const client_1 = require("@prisma/client");
class ReimbursementRequestController {
    // ==============================
    // CREATE REIMBURSEMENT REQUEST
    // ==============================
    async createRequest(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { requestNumber, categoryId, departmentId, totalAmount, currency, remarks, } = req.body;
            if (!requestNumber || !categoryId || !totalAmount || !currency) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            const request = await database_1.prisma.reimbursementRequest.create({
                data: {
                    tenantId,
                    requestNumber,
                    categoryId,
                    departmentId,
                    totalAmount,
                    currency,
                    status: client_1.ReimbursementStatus.draft,
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
        }
        catch (error) {
            console.error("Create reimbursement request error:", error);
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    // ==============================
    // GET ALL REQUESTS
    // ==============================
    async getRequests(req, res) {
        try {
            const tenantId = req.tenantId;
            const requests = await database_1.prisma.reimbursementRequest.findMany({
                where: { tenantId },
                orderBy: { createdAt: "desc" },
            });
            res.status(200).json({
                success: true,
                data: requests,
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    // ==============================
    // GET REQUEST BY ID
    // ==============================
    async getRequestById(req, res) {
        try {
            const tenantId = req.tenantId;
            const { id } = req.params;
            const request = await database_1.prisma.reimbursementRequest.findFirst({
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    // ==============================
    // SUBMIT REQUEST
    // ==============================
    async submitRequest(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursementRequest.findFirst({
                where: { id, tenantId },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Request not found",
                });
                return;
            }
            const updated = await database_1.prisma.reimbursementRequest.update({
                where: { id },
                data: {
                    status: client_1.ReimbursementStatus.submitted,
                    submittedAt: new Date(),
                    updatedBy: userId,
                },
            });
            res.status(200).json({
                success: true,
                message: "Reimbursement request submitted",
                data: updated,
            });
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
    // ==============================
    // UPDATE REQUEST (DRAFT ONLY)
    // ==============================
    async updateRequest(req, res) {
        try {
            const tenantId = req.tenantId;
            const userId = req.user.id;
            const { id } = req.params;
            const existing = await database_1.prisma.reimbursementRequest.findFirst({
                where: { id, tenantId },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Request not found",
                });
                return;
            }
            if (existing.status !== client_1.ReimbursementStatus.draft) {
                res.status(400).json({
                    success: false,
                    error: "Only draft requests can be updated",
                });
                return;
            }
            const { categoryId, departmentId, totalAmount, currency, remarks, } = req.body;
            const updated = await database_1.prisma.reimbursementRequest.update({
                where: { id },
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
        }
        catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
            });
        }
    }
}
exports.default = new ReimbursementRequestController();
//# sourceMappingURL=reimbursementRequest.controller.js.map