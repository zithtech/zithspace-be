// // controllers/managerReimbursementController.ts
// import { Response } from "express";
// import { prisma } from "@/config/database";
// import {
//   AuthRequest,
//   ApiResponse,
//   NotFoundError,
//   ValidationError,
// } from "@/types";

// export class ManagerReimbursementController {

 

//   /* =====================================================
//      APPROVE REIMBURSEMENT - Manager approves
//   ===================================================== */
//   static async approveReimbursement(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId) {
//         res.status(401).json({
//           success: false,
//           error: "Authentication required"
//         });
//         return;
//       }

//       const { approverId, reimbursementId } = req.params;
//       const managerId = req.user.id;
//       const tenantId = req.tenantId;

//       console.log("✅ Approving:", { approverId, reimbursementId, managerId });

//       // Check if approver record exists and belongs to this manager
//       const approverRecord = await prisma.reimbursementPolicyApprover.findFirst({
//         where: {
//           id: approverId,
//           approverId: managerId,
//           reimbursementId: reimbursementId,
//           status: 'PENDING',
//           reimbursement: {
//             tenantId: tenantId
//           }
//         },
//         include: {
//           reimbursement: {
//             include: {
//               approvers: true
//             }
//           },
//           rule: true
//         }
//       });

//       if (!approverRecord) {
//         throw new NotFoundError("Approver record not found or already processed");
//       }

//       // Start transaction
//       const result = await prisma.$transaction(async (tx) => {
        
//         // 1. Update this approver record - REMOVED comments
//         const updatedApprover = await tx.reimbursementPolicyApprover.update({
//           where: { id: approverId },
//           data: {
//             status: 'APPROVED',
//             updatedById: managerId,
//             updatedAt: new Date()
//           }
//         });

//         // 2. Check all approvers at current level
//         const currentLevelApprovers = await tx.reimbursementPolicyApprover.findMany({
//           where: {
//             reimbursementId: reimbursementId,
//             level: approverRecord.level
//           }
//         });

//         const allApprovedAtCurrentLevel = currentLevelApprovers.every(
//           a => a.status === 'APPROVED'
//         );

//         let nextLevel = approverRecord.level;
//         let reimbursementStatus = 'SUBMITTED';
//         let message = 'Approved';

//         if (allApprovedAtCurrentLevel) {
//           // Check for next level
//           const nextLevelApprovers = await tx.reimbursementPolicyApprover.findMany({
//             where: {
//               reimbursementId: reimbursementId,
//               level: approverRecord.level + 1
//             }
//           });

//           if (nextLevelApprovers.length > 0) {
//             nextLevel = approverRecord.level + 1;
//             message = 'Approved, moved to next level';
//           } else {
//             reimbursementStatus = 'APPROVED';
//             message = 'Reimbursement fully approved';
//           }
//         }

//         // 3. Update reimbursement
//         const updatedReimbursement = await tx.reimbursement.update({
//           where: { id: reimbursementId },
//           data: {
//             status: reimbursementStatus,
//             currentApprovalLevel: nextLevel,
//             updatedAt: new Date()
//           }
//         });

//         return {
//           approver: updatedApprover,
//           reimbursement: updatedReimbursement,
//           message
//         };
//       });

//       res.status(200).json({
//         success: true,
//         message: result.message,
//         data: result
//       });

//     } catch (error: any) {
//       console.error("❌ Error in approveReimbursement:", error);
//       res.status(error instanceof NotFoundError ? 404 : 500).json({
//         success: false,
//         error: error.message || "Failed to approve"
//       });
//     }
//   }


//   /* =====================================================
//      REJECT REIMBURSEMENT - Manager rejects
//   ===================================================== */
//   static async rejectReimbursement(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId) {
//         res.status(401).json({
//           success: false,
//           error: "Authentication required"
//         });
//         return;
//       }

//       const { approverId, reimbursementId } = req.params;
//       const managerId = req.user.id;
//       const tenantId = req.tenantId;

//       // No rejection reason needed as per your schema

//       console.log("❌ Rejecting:", { approverId, reimbursementId, managerId });

//       // Check if approver record exists
//       const approverRecord = await prisma.reimbursementPolicyApprover.findFirst({
//         where: {
//           id: approverId,
//           approverId: managerId,
//           reimbursementId: reimbursementId,
//           status: 'PENDING',
//           reimbursement: {
//             tenantId: tenantId
//           }
//         }
//       });

//       if (!approverRecord) {
//         throw new NotFoundError("Approver record not found or already processed");
//       }

//       // Start transaction
//       const result = await prisma.$transaction(async (tx) => {
        
//         // 1. Update this approver record - REMOVED comments and rejectionReason
//         const updatedApprover = await tx.reimbursementPolicyApprover.update({
//           where: { id: approverId },
//           data: {
//             status: 'REJECTED',
//             updatedById: managerId,
//             updatedAt: new Date()
//           }
//         });

//         // 2. Update all other pending approvers to 'NOT_REQUIRED'
//         await tx.reimbursementPolicyApprover.updateMany({
//           where: {
//             reimbursementId: reimbursementId,
//             status: 'PENDING',
//             id: { not: approverId }
//           },
//           data: {
//             status: 'NOT_REQUIRED',
//             updatedById: managerId,
//             updatedAt: new Date()
//           }
//         });

//         // 3. Update reimbursement status to REJECTED
//         const updatedReimbursement = await tx.reimbursement.update({
//           where: { id: reimbursementId },
//           data: {
//             status: 'REJECTED',
//             updatedAt: new Date()
//           }
//         });

//         return {
//           approver: updatedApprover,
//           reimbursement: updatedReimbursement
//         };
//       });

//       res.status(200).json({
//         success: true,
//         message: "Reimbursement rejected successfully",
//         data: result
//       });

//     } catch (error: any) {
//       console.error("❌ Error in rejectReimbursement:", error);
//       res.status(error instanceof NotFoundError || error instanceof ValidationError ? 400 : 500).json({
//         success: false,
//         error: error.message || "Failed to reject"
//       });
//     }
//   }


//   /* =====================================================
//      GET APPROVAL HISTORY - For a specific reimbursement
//   ===================================================== */
//   static async getApprovalHistory(req: AuthRequest, res: Response): Promise<void> {
//     try {
//       if (!req.user || !req.tenantId) {
//         res.status(401).json({
//           success: false,
//           error: "Authentication required"
//         });
//         return;
//       }

//       const { reimbursementId } = req.params;
//       const tenantId = req.tenantId;

//       // Get all approvers for this reimbursement
//       const approvers = await prisma.reimbursementPolicyApprover.findMany({
//         where: {
//           reimbursementId: reimbursementId,
//           reimbursement: {
//             tenantId: tenantId
//           }
//         },
//         orderBy: {
//           level: 'asc'
//         }
//       });

//       res.status(200).json({
//         success: true,
//         data: approvers
//       });

//     } catch (error: any) {
//       console.error("❌ Error in getApprovalHistory:", error);
//       res.status(500).json({
//         success: false,
//         error: error.message || "Failed to fetch approval history"
//       });
//     }
//   }
// }

// export default ManagerReimbursementController;