"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddressController = void 0;
const database_1 = require("@/config/database");
class AddressController {
    /* ---------------- CREATE ADDRESS ---------------- */
    static async createAddress(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { employeeId, addressType, doorNo, area, city, state, pincode, country, } = req.body;
            if (!employeeId || !addressType) {
                res.status(400).json({
                    success: false,
                    error: "employeeId and addressType are required",
                });
                return;
            }
            const address = await database_1.prisma.address.create({
                data: {
                    employeeId,
                    addressType,
                    doorNo,
                    area,
                    city,
                    state,
                    pincode,
                    country,
                    createdById: userId,
                    updatedById: userId,
                },
            });
            res.status(201).json({
                success: true,
                data: address,
                message: "Address created successfully",
            });
        }
        catch (error) {
            console.error("Error creating address:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create address",
            });
        }
    }
    /* ---------------- GET ADDRESSES BY EMPLOYEE ---------------- */
    static async getAddressesByEmployee(req, res) {
        try {
            const { employeeId } = req.params;
            const addresses = await database_1.prisma.address.findMany({
                where: { employeeId },
                orderBy: { createdAt: "desc" },
            });
            res.status(200).json({
                success: true,
                data: addresses,
            });
        }
        catch (error) {
            console.error("Error fetching addresses:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch addresses",
            });
        }
    }
    /* ---------------- UPDATE ADDRESS ---------------- */
    static async updateAddress(req, res) {
        try {
            const userId = req.user?.id;
            const { id } = req.params;
            const existing = await database_1.prisma.address.findUnique({ where: { id } });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Address not found",
                });
                return;
            }
            const updated = await database_1.prisma.address.update({
                where: { id },
                data: {
                    ...req.body,
                    updatedById: userId,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Address updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating address:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update address",
            });
        }
    }
    /* ---------------- DELETE ADDRESS ---------------- */
    static async deleteAddress(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.address.findUnique({ where: { id } });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Address not found",
                });
                return;
            }
            await database_1.prisma.address.delete({ where: { id } });
            res.status(200).json({
                success: true,
                message: "Address deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting address:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete address",
            });
        }
    }
}
exports.AddressController = AddressController;
//# sourceMappingURL=employee_address_controller.js.map