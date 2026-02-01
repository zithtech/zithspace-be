"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeEmergencyContactController = void 0;
const database_1 = require("@/config/database");
class EmployeeEmergencyContactController {
    /* ---------------- CREATE EMERGENCY CONTACT ---------------- */
    static async createContact(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { employeeId, relationship, name, mobile } = req.body;
            if (!employeeId || !relationship || !name || !mobile) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            const contact = await database_1.prisma.employeeEmergencyContact.create({
                data: {
                    employeeId,
                    relationship,
                    name,
                    mobile,
                    createdById: userId,
                    updatedById: userId,
                },
            });
            res.status(201).json({
                success: true,
                data: contact,
                message: "Emergency contact created successfully",
            });
        }
        catch (error) {
            console.error("Error creating contact:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create emergency contact",
            });
        }
    }
    /* ---------------- GET CONTACTS BY EMPLOYEE ---------------- */
    static async getContactsByEmployee(req, res) {
        try {
            const { employeeId } = req.params;
            if (!employeeId) {
                res.status(400).json({
                    success: false,
                    error: "employeeId is required",
                });
                return;
            }
            const contacts = await database_1.prisma.employeeEmergencyContact.findMany({
                where: { employeeId },
                orderBy: { createdAt: "desc" },
            });
            res.status(200).json({
                success: true,
                data: contacts,
            });
        }
        catch (error) {
            console.error("Error fetching contacts:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch emergency contacts",
            });
        }
    }
    /* ---------------- GET CONTACT BY ID ---------------- */
    static async getContactById(req, res) {
        try {
            const { id } = req.params;
            const contact = await database_1.prisma.employeeEmergencyContact.findUnique({
                where: { id },
            });
            if (!contact) {
                res.status(404).json({
                    success: false,
                    error: "Emergency contact not found",
                });
                return;
            }
            res.status(200).json({ success: true, data: contact });
        }
        catch (error) {
            console.error("Error fetching contact:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch emergency contact",
            });
        }
    }
    /* ---------------- UPDATE CONTACT ---------------- */
    static async updateContact(req, res) {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const existing = await database_1.prisma.employeeEmergencyContact.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Emergency contact not found",
                });
                return;
            }
            const updated = await database_1.prisma.employeeEmergencyContact.update({
                where: { id },
                data: {
                    ...req.body,
                    updatedById: userId,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Emergency contact updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating contact:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update emergency contact",
            });
        }
    }
    /* ---------------- DELETE CONTACT ---------------- */
    static async deleteContact(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.employeeEmergencyContact.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Emergency contact not found",
                });
                return;
            }
            await database_1.prisma.employeeEmergencyContact.delete({ where: { id } });
            res.status(200).json({
                success: true,
                message: "Emergency contact deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting contact:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete emergency contact",
            });
        }
    }
}
exports.EmployeeEmergencyContactController = EmployeeEmergencyContactController;
//# sourceMappingURL=employeeEmergencyContact.js.map