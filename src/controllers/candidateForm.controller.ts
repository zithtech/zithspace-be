import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import { uploadCandidateDocumentToR2 } from "@/utils/r2Client";
import { Response } from "express";
import { randomUUID as uuidv4 } from "crypto";
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '@/utils/transactionHistory';

// ✅ CREATE Candidate
export async function submitCandidateForm(req: AuthRequest, res: Response) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant ID is required" });
    }

    const {
      personalInfo,
      currentEmployer,
      workAuth,
      availability,
      interviewAvailability,
      professionalProfiles,
      documents,
      internalNotes
    } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create CandidateDetails
      const candidate = await tx.candidateDetails.create({
        data: {
          tenantId,
          fullName: personalInfo.fullName,
          email: personalInfo.email,
          contactNo: personalInfo.contactNumber,
          addressLine1: personalInfo.addressLine1,
          addressLine2: personalInfo.addressLine2,
          city: personalInfo.city,
          state: personalInfo.state,
          zipCode: personalInfo.zipCode,
          country: personalInfo.country,
          linkedinUrl: professionalProfiles?.linkedinUrl,
          githubUrl: professionalProfiles?.githubUrl,
          portfolioUrl: professionalProfiles?.portfolioWebsite,
          internalRecruiterNotes: internalNotes
        }
      });

      const candidateId = candidate.id;

      // 2. Create Availability
      if (availability) {
        await (tx as any).candidateAvailability.create({
          data: {
            candidateId,
            availableToJoin: availability.earliestAvailable === "Immediate Joiner",
            joiningDate: availability.joiningDate ? new Date(availability.joiningDate) : null,
            noticePeriod: parseInt(availability.noticePeriod) || 0
          }
        });
      }

      // 3. Create Current Employer Contact
      if (currentEmployer) {
        await tx.currentEmployerContact.create({
          data: {
            id: uuidv4(),
            candidateId,
            reportingManagerName: currentEmployer.reportingManagerName,
            reportingManagerEmail: currentEmployer.reportingManagerEmail,
            reportingManagerPhone: currentEmployer.reportingManagerPhone,
            currentEmployerCompanyName: currentEmployer.currentEmployerCompanyName,
            currentEmployerCompanyWebsite: currentEmployer.employerCompanyWebsite
          }
        });
      }

      // 4. Create Work Authorization
      if (workAuth) {
        await tx.workAuthorization.create({
          data: {
            id: uuidv4(),
            candidateId,
            workAuthorizationType: workAuth.workAuthorizationType,
            visaValidationType: workAuth.visaValidityDate, // Reusing field as per schema vs request
            willingTransferVisa: workAuth.willingToTransferVisa === true,
            ssnNumber: (workAuth.ssnNumber ? String(workAuth.ssnNumber) : null) as any,
            passportNumber: (workAuth.passportNumber ? String(workAuth.passportNumber) : null) as any
          } as any
        });
      }

      // 5. Create Interview Availability Slots
      if (interviewAvailability && Array.isArray(interviewAvailability)) {
        for (const slot of interviewAvailability) {
          await tx.candidateInterviewAvailability.create({
            data: {
              id: uuidv4(),
              candidateId,
              interviewDate: slot.interviewDate ? new Date(slot.interviewDate) : null,
              startTime: slot.startTime ? new Date(`${slot.interviewDate} ${slot.startTime}`) : null,
              endTime: slot.endTime ? new Date(`${slot.interviewDate} ${slot.endTime}`) : null
            }
          });
        }
      }

      // 6. Handle Documents
      if (documents && typeof documents === 'object') {
        for (const [docKey, docData] of Object.entries(documents)) {
          const typedDocData = docData as { base64: string; fileName: string };
          if (typedDocData.base64 && typedDocData.base64.startsWith('data:')) {
            const documentUrl = await uploadCandidateDocumentToR2(
              typedDocData.base64,
              typedDocData.fileName,
              tenantId,
              candidateId,
              docKey
            );

            await tx.candidateDocuments.create({
              data: {
                id: uuidv4(),
                candidateId,
                documentType: docKey,
                documentUrl
              }
            });
          }
        }
      }

      return candidate;
    });

    recordTransaction({
      req: req as any,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.CANDIDATE_PIPELINE_LIST,
      action: Action.CREATE,
      actionLabel: `Candidate Form submitted for "${result.fullName}"`,
      entityType: EntityType.CANDIDATE_FORM,
      entityId: result.id,
      entityLabel: result.fullName,
      afterData: { email: result.email, contactNo: result.contactNo },
    });

    return res.status(201).json({
      success: true,
      message: "Candidate submitted successfully",
      data: result
    });

  } catch (error: any) {
    console.error("Error in submitCandidateForm:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to submit candidate form",
      error: error.message
    });
  }
}

// ✅ GET ALL Candidates
export async function getCandidates(req: AuthRequest, res: Response) {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, message: "Tenant ID is required" });
    }

    const candidates = await prisma.candidateDetails.findMany({
      where: { tenantId },
      include: {
        availability: true,
        currentEmployerContact: true,
        workAuthorizations: true,
        interviewAvailabilities: true,
        documents: true
      } as any,
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({
      success: true,
      data: candidates
    });
  } catch (error: any) {
    console.error("Error in getCandidates:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidates",
      error: error.message
    });
  }
}

// ✅ GET Single Candidate
export async function getCandidateById(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    const candidate = await prisma.candidateDetails.findFirst({
      where: { id, tenantId },
      include: {
        availability: true,
        currentEmployerContact: true,
        workAuthorizations: true,
        interviewAvailabilities: true,
        documents: true
      } as any
    });

    if (!candidate) {
      return res.status(404).json({ success: false, message: "Candidate not found" });
    }

    return res.status(200).json({
      success: true,
      data: candidate
    });
  } catch (error: any) {
    console.error("Error in getCandidateById:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch candidate",
      error: error.message
    });
  }
}

// ✅ UPDATE Candidate
export async function updateCandidate(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ success: false, message: "Tenant ID required" });

    const {
      personalInfo,
      currentEmployer,
      workAuth,
      availability,
      interviewAvailability,
      professionalProfiles,
      documents,
      internalNotes
    } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Update CandidateDetails
      const candidate = await tx.candidateDetails.update({
        where: { id },
        data: {
          fullName: personalInfo?.fullName,
          email: personalInfo?.email,
          contactNo: personalInfo?.contactNumber,
          addressLine1: personalInfo?.addressLine1,
          addressLine2: personalInfo?.addressLine2,
          city: personalInfo?.city,
          state: personalInfo?.state,
          zipCode: personalInfo?.zipCode,
          country: personalInfo?.country,
          linkedinUrl: professionalProfiles?.linkedinUrl,
          githubUrl: professionalProfiles?.githubUrl,
          portfolioUrl: professionalProfiles?.portfolioWebsite,
          internalRecruiterNotes: internalNotes
        }
      });

      // 2. Update Availability (Delete and Re-create for simplicity in related many-to-one)
      if (availability) {
        await (tx as any).candidateAvailability.deleteMany({ where: { candidateId: id } });
        await (tx as any).candidateAvailability.create({
          data: {
            candidateId: id,
            availableToJoin: availability.earliestAvailable === "Immediate Joiner",
            joiningDate: availability.joiningDate ? new Date(availability.joiningDate) : null,
            noticePeriod: parseInt(availability.noticePeriod) || 0
          }
        });
      }

      // 3. Update Current Employer
      if (currentEmployer) {
        await tx.currentEmployerContact.deleteMany({ where: { candidateId: id } });
        await tx.currentEmployerContact.create({
          data: {
            id: uuidv4(),
            candidateId: id,
            reportingManagerName: currentEmployer.reportingManagerName,
            reportingManagerEmail: currentEmployer.reportingManagerEmail,
            reportingManagerPhone: currentEmployer.reportingManagerPhone,
            currentEmployerCompanyName: currentEmployer.currentEmployerCompanyName,
            currentEmployerCompanyWebsite: currentEmployer.employerCompanyWebsite
          }
        });
      }

      // 4. Update Work Auth
      if (workAuth) {
        await tx.workAuthorization.deleteMany({ where: { candidateId: id } });
        await tx.workAuthorization.create({
          data: {
            id: uuidv4(),
            candidateId: id,
            workAuthorizationType: workAuth.workAuthorizationType,
            visaValidationType: workAuth.visaValidityDate,
            willingTransferVisa: workAuth.willingToTransferVisa === true,
            ssnNumber: (workAuth.ssnNumber ? String(workAuth.ssnNumber) : null) as any,
            passportNumber: (workAuth.passportNumber ? String(workAuth.passportNumber) : null) as any
          } as any
        });
      }

      // 5. Update Interview Availability
      if (interviewAvailability && Array.isArray(interviewAvailability)) {
        await tx.candidateInterviewAvailability.deleteMany({ where: { candidateId: id } });
        for (const slot of interviewAvailability) {
          await tx.candidateInterviewAvailability.create({
            data: {
              id: uuidv4(),
              candidateId: id,
              interviewDate: slot.interviewDate ? new Date(slot.interviewDate) : null,
              startTime: slot.startTime ? new Date(`${slot.interviewDate} ${slot.startTime}`) : null,
              endTime: slot.endTime ? new Date(`${slot.interviewDate} ${slot.endTime}`) : null
            }
          });
        }
      }

      // 6. Handle New Documents
      if (documents && typeof documents === 'object') {
        for (const [docKey, docData] of Object.entries(documents)) {
          const typedDocData = docData as { base64: string; fileName: string };
          if (typedDocData.base64 && typedDocData.base64.startsWith('data:')) {
            const documentUrl = await uploadCandidateDocumentToR2(
              typedDocData.base64,
              typedDocData.fileName,
              tenantId,
              id,
              docKey
            );

            // Delete old document of same type if it exists
            await tx.candidateDocuments.deleteMany({
              where: { candidateId: id, documentType: docKey }
            });

            await tx.candidateDocuments.create({
              data: {
                id: uuidv4(),
                candidateId: id,
                documentType: docKey,
                documentUrl
              }
            });
          }
        }
      }

      return candidate;
    });

    const before = await prisma.candidateDetails.findFirst({ where: { id, tenantId } });
    if (before) {
      const diff = diffShallow(before, result);
      if (diff.changedFields.length > 0) {
        recordTransaction({
          req: req as any,
          section: Section.HR,
          module: Module.RECRUITMENT,
          page: Page.CANDIDATE_PIPELINE_DETAIL,
          action: Action.UPDATE,
          actionLabel: `Updated Candidate Form for "${result.fullName}"`,
          entityType: EntityType.CANDIDATE_FORM,
          entityId: result.id,
          entityLabel: result.fullName,
          beforeData: diff.before,
          afterData: diff.after,
          changedFields: diff.changedFields,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Candidate updated successfully",
      data: result
    });

  } catch (error: any) {
    console.error("Error in updateCandidate:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update candidate",
      error: error.message
    });
  }
}

// ✅ DELETE Candidate
export async function deleteCandidate(req: AuthRequest, res: Response) {
  try {
    const { id } = req.params;
    const tenantId = req.tenantId;

    // Delete related records first (if not handled by cascade which Prisma doesn't do by default unless specified)
    const existing = await prisma.candidateDetails.findFirst({ where: { id, tenantId } });

    await prisma.$transaction(async (tx) => {
      await (tx as any).candidateAvailability.deleteMany({ where: { candidateId: id } });
      await tx.currentEmployerContact.deleteMany({ where: { candidateId: id } });
      await tx.workAuthorization.deleteMany({ where: { candidateId: id } });
      await tx.candidateInterviewAvailability.deleteMany({ where: { candidateId: id } });
      await tx.candidateDocuments.deleteMany({ where: { candidateId: id } });
      await tx.candidateDetails.delete({ where: { id, tenantId } });
    });

    if (existing) {
      recordTransaction({
        req: req as any,
        section: Section.HR,
        module: Module.RECRUITMENT,
        page: Page.CANDIDATE_PIPELINE_LIST,
        action: Action.DELETE,
        actionLabel: `Deleted Candidate Form for "${existing.fullName}"`,
        entityType: EntityType.CANDIDATE_FORM,
        entityId: id,
        entityLabel: existing.fullName,
        beforeData: existing,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Candidate deleted successfully"
    });
  } catch (error: any) {
    console.error("Error in deleteCandidate:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete candidate",
      error: error.message
    });
  }
}
