"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmployeeWorkDetailController = void 0;
const database_1 = require("@/config/database");
class EmployeeWorkDetailController {
    /* ================= CREATE WORK DETAIL ================= */
    static async createWorkDetail(req, res) {
        try {
            if (!req.user?.id) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { employeeId, positionId, department, team, employeeType, workLocation, workShift, } = req.body;
            if (!employeeId ||
                !positionId ||
                !department ||
                !team ||
                !employeeType ||
                !workLocation ||
                !workShift) {
                res.status(400).json({
                    success: false,
                    error: "Missing required fields",
                });
                return;
            }
            // check employee exists
            const employee = await database_1.prisma.employee.findUnique({
                where: { id: employeeId },
            });
            if (!employee) {
                res.status(404).json({
                    success: false,
                    error: "Employee not found",
                });
                return;
            }
            const workDetail = await database_1.prisma.employeeWorkDetail.create({
                data: {
                    employee: { connect: { id: employeeId } },
                    department,
                    team,
                    employeeType,
                    workLocation,
                    workShift,
                    createdById: req.user.id,
                    position: {
                        connect: { id: positionId }
                    }
                },
            });
            res.status(201).json({
                success: true,
                data: workDetail,
                message: "Employee work detail created successfully",
            });
        }
        catch (error) {
            console.error("Error creating work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to create employee work detail",
            });
        }
    }
    /* ================= GET WORK DETAIL BY EMPLOYEE ================= */
    static async getWorkDetailByEmployee(req, res) {
        try {
            const { employeeId: inputId } = req.params;
            const tenantId = req.headers["x-tenant-id"];
            if (!tenantId) {
                res.status(400).json({ success: false, error: "Tenant ID is required" });
                return;
            }
            console.log(`[Autofill] Processing request for ID: ${inputId}`);
            // 1. Try to find the User first (as the frontend often sends User.id)
            const user = await database_1.prisma.user.findFirst({
                where: { id: inputId },
                include: {
                    position: {
                        include: {
                            department: true,
                        },
                    },
                    reportsTo: {
                        select: {
                            id: true,
                            name: true,
                            position: { select: { title: true } }
                        }
                    }
                },
            });
            let employeeId = inputId;
            let position = user?.position || null;
            let reportingManagerId = user?.reportsToId || null;
            let reportingManagerName = user?.reportsTo?.name || null;
            if (user) {
                console.log(`[Autofill] Found user: ${user.name}, linked employeeId: ${user.employeeId}`);
                if (user.employeeId) {
                    employeeId = user.employeeId;
                }
            }
            // 2. Get work details from EmployeeWorkDetail table
            const workDetail = await database_1.prisma.employeeWorkDetail.findFirst({
                where: { employeeId },
                include: {
                    position: {
                        include: {
                            department: true,
                        },
                    },
                },
            });
            // If user didn't have a position, take it from workDetails
            if (!position && workDetail?.position) {
                position = workDetail.position;
            }
            // 3. Get reporting manager from employee_project_mappings as a fallback
            if (!reportingManagerName) {
                const projectMapping = await database_1.prisma.employeeProjectMapping.findFirst({
                    where: { employeeId },
                    orderBy: { createdAt: 'desc' }
                });
                if (projectMapping?.reportingManager) {
                    reportingManagerId = projectMapping.reportingManager;
                    // Try to find the manager's name (check User first, then Employee)
                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectMapping.reportingManager);
                    if (isUuid) {
                        // Check User table first
                        const userManager = await database_1.prisma.user.findUnique({
                            where: { id: projectMapping.reportingManager },
                            select: { name: true }
                        });
                        if (userManager) {
                            reportingManagerName = userManager.name;
                        }
                        else {
                            // Fallback to Employee table
                            const empManager = await database_1.prisma.employee.findUnique({
                                where: { id: projectMapping.reportingManager },
                                select: { first_name: true, last_name: true }
                            });
                            if (empManager) {
                                reportingManagerName = `${empManager.first_name} ${empManager.last_name}`;
                            }
                        }
                    }
                    else {
                        reportingManagerName = projectMapping.reportingManager;
                    }
                }
            }
            // 4. Get Notice Period from ExitNoticePolicy
            const noticePolicy = await database_1.prisma.exitNoticePolicy.findFirst({
                where: {
                    tenantId,
                    OR: [
                        { levelType: 'Positions', levelId: position?.id || '' },
                        { levelType: 'Grades', levelId: position?.gradeId || '' }
                    ],
                }
            });
            // Construct the unified response
            res.status(200).json({
                success: true,
                data: {
                    ...(workDetail || {}),
                    employeeId: employeeId,
                    positionId: position?.id || null,
                    position: position,
                    department: position?.department || null,
                    departmentId: position?.department?.id || null,
                    reportingManagerId: reportingManagerId,
                    reportingManagerName: reportingManagerName,
                    noticePeriodDays: noticePolicy?.noticePeriodDays || 0
                },
            });
        }
        catch (error) {
            console.error("Error fetching work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee work detail",
            });
        }
    }
    /* ================= GET WORK DETAIL BY ID ================= */
    static async getWorkDetailById(req, res) {
        try {
            const { id } = req.params;
            const workDetail = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!workDetail) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            res.status(200).json({
                success: true,
                data: workDetail,
            });
        }
        catch (error) {
            console.error("Error fetching work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to fetch employee work detail",
            });
        }
    }
    /* ================= UPDATE WORK DETAIL ================= */
    static async updateWorkDetail(req, res) {
        try {
            if (!req.user?.id) {
                res
                    .status(401)
                    .json({ success: false, error: "Unauthorized" });
                return;
            }
            const { id } = req.params;
            const existing = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            const updated = await database_1.prisma.employeeWorkDetail.update({
                where: { id },
                data: {
                    positionId: req.body.positionId,
                    team: req.body.team,
                    employeeType: req.body.employeeType,
                    workLocation: req.body.workLocation,
                    workShift: req.body.workShift,
                    updatedById: req.user.id,
                },
            });
            res.status(200).json({
                success: true,
                data: updated,
                message: "Employee work detail updated successfully",
            });
        }
        catch (error) {
            console.error("Error updating work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to update employee work detail",
            });
        }
    }
    /* ================= DELETE WORK DETAIL ================= */
    static async deleteWorkDetail(req, res) {
        try {
            const { id } = req.params;
            const existing = await database_1.prisma.employeeWorkDetail.findUnique({
                where: { id },
            });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    error: "Work detail not found",
                });
                return;
            }
            await database_1.prisma.employeeWorkDetail.delete({
                where: { id },
            });
            res.status(200).json({
                success: true,
                message: "Employee work detail deleted successfully",
            });
        }
        catch (error) {
            console.error("Error deleting work detail:", error);
            res.status(500).json({
                success: false,
                error: "Failed to delete employee work detail",
            });
        }
    }
}
exports.EmployeeWorkDetailController = EmployeeWorkDetailController;
//# sourceMappingURL=employeeWorkDetailesController.js.map