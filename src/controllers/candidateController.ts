import { Response } from "express";
import { prisma } from "@/config/database";
import { AuthRequest, ApiResponse } from "@/types";
import { uploadCandidateDocumentToR2 } from "@/utils/r2Client";
import {
  recordTransaction,
  Section,
  Module,
  Page,
  Action,
  EntityType,
  diffShallow,
} from '@/utils/transactionHistory';

export const createCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const createdById = req.user?.id;

    if (!tenantId || !createdById) {
      res.status(401).json({ success: false, error: "Unauthorized or missing tenant context." } as ApiResponse);
      return;
    }

    const {
      fullName, email, phoneNumber, country, state, city, timezone,
      linkedinUrl, githubUrl, portfolioUrl, preferredContactMethod,
      currentRole, yearsOfExperience, primarySkills, secondarySkills, professionalSummary,
      workAuthorizationType, visaValidityDate, willingToTransferVisa,
      preferredEmploymentType, expectedRate, rateUnit, willingToRelocate, preferredWorkMode,
      earliestAvailable, joiningDate, noticePeriod,
      statusConfig, actionConfig, skillRate,
      internalNotes, candidateTags,
      workExperience = [],
      skillsMatrix = [],
      education = [],
      interviewSlots = [],
      resume,
      passport,
      drivingLicense,
      visaDocument,
      identityProof,
      certifications,
      isActive
    } = req.body;

    const candidate = await prisma.candidate.create({
      data: {
        tenantId,
        createdById,
        fullName,
        email,
        phoneNumber,
        country,
        state,
        city,
        timezone,
        linkedinUrl,
        githubUrl,
        portfolioUrl,
        preferredContactMethod,
        currentRole,
        yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : null,
        primarySkills,
        secondarySkills,
        professionalSummary,
        workAuthorizationType,
        visaValidityDate: visaValidityDate ? new Date(visaValidityDate) : null,
        willingToTransferVisa: Boolean(willingToTransferVisa),
        preferredEmploymentType,
        expectedRate: expectedRate ? Number(expectedRate) : null,
        rateUnit,
        willingToRelocate,
        preferredWorkMode,
        earliestAvailable,
        statusConfig,
        actionConfig,
        skillRate,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        noticePeriod: noticePeriod ? Number(noticePeriod) : null,
        internalNotes,
        candidateTags,
        isActive: isActive ?? true,
        // Nested Create for Relationships
        workExperiences: {
          create: workExperience.map((exp: any) => ({
            companyName: exp.companyName,
            companyWebsite: exp.companyWebsite,
            jobTitle: exp.jobTitle,
            startDate: new Date(exp.startDate),
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            location: exp.location,
            employmentType: exp.employmentType,
            workMode: exp.workMode,
            skillsUsed: exp.skillsUsed || [],
            responsibilities: exp.responsibilities,
            createdById
          }))
        },
        skills: {
          create: skillsMatrix.map((skill: any) => ({
            skillName: skill.skillName || [],
            yearsOfExperience: Number(skill.yearsOfExperience),
            lastUsedYear: new Date(skill.lastUsedYear),
            createdById
          }))
        },
        educations: {
          create: education.map((edu: any) => ({
            degreeName: edu.degreeName,
            specialization: edu.specialization,
            university: edu.university,
            location: edu.location,
            startDate: new Date(edu.startDate),
            endDate: edu.endDate ? new Date(edu.endDate) : null,
            createdById
          }))
        },
        interviewSlots: {
          create: interviewSlots.map((slot: any) => ({
            interviewDate: new Date(slot.interviewDate),
            startTime: slot.startTime,
            endTime: slot.endTime,
            timezone: slot.timezone,
            createdById
          }))
        }
      },
      include: {
        workExperiences: true,
        skills: true,
        educations: true,
        interviewSlots: true
      }
    });

    // Upload documents to R2 and update candidate record
    const updateData: any = {};

    const uploadIfPresent = async (doc: any, docType: string) => {
      if (doc?.base64 && doc?.fileName) {
        return await uploadCandidateDocumentToR2(
          doc.base64,
          doc.fileName,
          tenantId,
          candidate.id,
          docType
        );
      }
      return null;
    };

    const resumeUrl = await uploadIfPresent(resume, "resume");
    if (resumeUrl) updateData.resumeUrl = resumeUrl;

    const passportUrl = await uploadIfPresent(passport, "passport");
    if (passportUrl) updateData.passportUrl = passportUrl;

    const drivingLicenseUrl = await uploadIfPresent(drivingLicense, "drivingLicense");
    if (drivingLicenseUrl) updateData.drivingLicenseUrl = drivingLicenseUrl;

    const visaDocumentUrl = await uploadIfPresent(visaDocument, "visaDocument");
    if (visaDocumentUrl) updateData.visaDocumentUrl = visaDocumentUrl;

    const identityProofUrl = await uploadIfPresent(identityProof, "identityProof");
    if (identityProofUrl) updateData.identityProofUrl = identityProofUrl;

    if (certifications && Array.isArray(certifications) && certifications.length > 0) {
      const certificationUrls = [];
      for (let i = 0; i < certifications.length; i++) {
        const cert = certifications[i];
        if (cert.base64 && cert.fileName) {
          const url = await uploadCandidateDocumentToR2(cert.base64, cert.fileName, tenantId, candidate.id, `certification_${i}`);
          certificationUrls.push(url);
        }
      }
      if (certificationUrls.length > 0) updateData.certificationsUrls = certificationUrls;
    }

    let finalCandidate = candidate;
    if (Object.keys(updateData).length > 0) {
      finalCandidate = await prisma.candidate.update({
        where: { id: candidate.id, tenantId },
        data: updateData,
        include: { workExperiences: true, skills: true, educations: true, interviewSlots: true }
      });
    }

    recordTransaction({
      req: req as any,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.CANDIDATE_PIPELINE_LIST,
      action: Action.CREATE,
      actionLabel: `Candidate Profile created for "${finalCandidate.fullName}"`,
      entityType: EntityType.CANDIDATE,
      entityId: finalCandidate.id,
      entityLabel: finalCandidate.fullName,
      afterData: { email: finalCandidate.email, phoneNumber: finalCandidate.phoneNumber },
    });

    res.status(201).json({ success: true, data: finalCandidate } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
};

export const getCandidates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;

    const candidates = await prisma.candidate.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: candidates } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
};

export const getCandidateById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    const candidate = await prisma.candidate.findFirst({
      where: { id, tenantId },
      include: {
        workExperiences: true,
        skills: true,
        educations: true,
        interviewSlots: true
      }
    });

    if (!candidate) {
      res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
      return;
    }

    res.status(200).json({ success: true, data: candidate } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
};

export const updateCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const updatedById = req.user?.id;
    const { id } = req.params;

    if (!tenantId || !updatedById) {
      res.status(401).json({ success: false, error: "Unauthorized or missing tenant context." } as ApiResponse);
      return;
    }

    const {
      fullName, email, phoneNumber, country, state, city, timezone,
      linkedinUrl, githubUrl, portfolioUrl, preferredContactMethod,
      currentRole, yearsOfExperience, primarySkills, secondarySkills, professionalSummary,
      workAuthorizationType, visaValidityDate, willingToTransferVisa,
      preferredEmploymentType, expectedRate, rateUnit, willingToRelocate, preferredWorkMode,
      earliestAvailable, joiningDate, noticePeriod,
      statusConfig, actionConfig, skillRate,
      internalNotes, candidateTags,
      workExperience = [],
      skillsMatrix = [],
      education = [],
      interviewSlots = [],
      resume,
      passport,
      drivingLicense,
      visaDocument,
      identityProof,
      certifications,
      isActive
    } = req.body;

    // Verify ownership before updating
    const existing = await prisma.candidate.findFirst({ where: { id, tenantId } });
    if (!existing) {
      res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
      return;
    }

    // Update candidate and nested relations
    const updatedCandidate = await prisma.candidate.update({
      where: { id },
      data: {
        fullName, email, phoneNumber, country, state, city, timezone,
        linkedinUrl, githubUrl, portfolioUrl, preferredContactMethod,
        currentRole,
        yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : null,
        primarySkills, secondarySkills, professionalSummary,
        workAuthorizationType,
        visaValidityDate: visaValidityDate ? new Date(visaValidityDate) : null,
        willingToTransferVisa: Boolean(willingToTransferVisa),
        preferredEmploymentType,
        expectedRate: expectedRate ? Number(expectedRate) : null,
        rateUnit, willingToRelocate, preferredWorkMode,
        earliestAvailable,
        statusConfig,
        actionConfig,
        skillRate,
        joiningDate: joiningDate ? new Date(joiningDate) : null,
        noticePeriod: noticePeriod ? Number(noticePeriod) : null,
        internalNotes, candidateTags,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
        updatedById,
        workExperiences: {
          deleteMany: {},
          create: workExperience.map((exp: any) => ({
            companyName: exp.companyName,
            companyWebsite: exp.companyWebsite,
            jobTitle: exp.jobTitle,
            startDate: new Date(exp.startDate),
            endDate: exp.endDate ? new Date(exp.endDate) : null,
            location: exp.location,
            employmentType: exp.employmentType,
            workMode: exp.workMode,
            skillsUsed: exp.skillsUsed || [],
            responsibilities: exp.responsibilities,
            createdById: updatedById
          }))
        },
        skills: {
          deleteMany: {},
          create: skillsMatrix.map((skill: any) => ({
            skillName: skill.skillName || [],
            yearsOfExperience: Number(skill.yearsOfExperience),
            lastUsedYear: new Date(skill.lastUsedYear),
            createdById: updatedById
          }))
        },
        educations: {
          deleteMany: {},
          create: education.map((edu: any) => ({
            degreeName: edu.degreeName,
            specialization: edu.specialization,
            university: edu.university,
            location: edu.location,
            startDate: new Date(edu.startDate),
            endDate: edu.endDate ? new Date(edu.endDate) : null,
            createdById: updatedById
          }))
        },
        interviewSlots: {
          deleteMany: {},
          create: interviewSlots.map((slot: any) => ({
            interviewDate: new Date(slot.interviewDate),
            startTime: slot.startTime,
            endTime: slot.endTime,
            timezone: slot.timezone,
            createdById: updatedById
          }))
        }
      }
    });

    // Upload documents to R2 and update candidate record
    const updateData: any = {};

    const uploadIfPresent = async (doc: any, docType: string) => {
      if (doc?.base64 && doc?.fileName) {
        return await uploadCandidateDocumentToR2(
          doc.base64,
          doc.fileName,
          tenantId,
          id, // use candidate id from params
          docType
        );
      }
      return null;
    };

    const resumeUrl = await uploadIfPresent(resume, "resume");
    if (resumeUrl) updateData.resumeUrl = resumeUrl;

    const passportUrl = await uploadIfPresent(passport, "passport");
    if (passportUrl) updateData.passportUrl = passportUrl;

    const drivingLicenseUrl = await uploadIfPresent(drivingLicense, "drivingLicense");
    if (drivingLicenseUrl) updateData.drivingLicenseUrl = drivingLicenseUrl;

    const visaDocumentUrl = await uploadIfPresent(visaDocument, "visaDocument");
    if (visaDocumentUrl) updateData.visaDocumentUrl = visaDocumentUrl;

    const identityProofUrl = await uploadIfPresent(identityProof, "identityProof");
    if (identityProofUrl) updateData.identityProofUrl = identityProofUrl;

    if (certifications && Array.isArray(certifications) && certifications.length > 0) {
      const certificationUrls = [];
      for (let i = 0; i < certifications.length; i++) {
        const cert = certifications[i];
        if (cert.base64 && cert.fileName) {
          const url = await uploadCandidateDocumentToR2(cert.base64, cert.fileName, tenantId, id, `certification_${i}`);
          certificationUrls.push(url);
        }
      }
      if (certificationUrls.length > 0) updateData.certificationsUrls = certificationUrls;
    }

    let finalCandidate = updatedCandidate;
    if (Object.keys(updateData).length > 0) {
      finalCandidate = await prisma.candidate.update({
        where: { id },
        data: updateData,
        include: { workExperiences: true, skills: true, educations: true, interviewSlots: true }
      });
    }

    if (existing) {
      const diff = diffShallow(existing, finalCandidate);
      if (diff.changedFields.length > 0) {
        recordTransaction({
          req: req as any,
          section: Section.HR,
          module: Module.RECRUITMENT,
          page: Page.CANDIDATE_PIPELINE_DETAIL,
          action: Action.UPDATE,
          actionLabel: `Updated Candidate Profile for "${finalCandidate.fullName}"`,
          entityType: EntityType.CANDIDATE,
          entityId: finalCandidate.id,
          entityLabel: finalCandidate.fullName,
          beforeData: diff.before,
          afterData: diff.after,
          changedFields: diff.changedFields,
        });
      }
    }

    res.status(200).json({ success: true, data: finalCandidate } as ApiResponse);
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ success: false, error: "Candidate not found" } as ApiResponse);
      return;
    }
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
};

export const deleteCandidate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const tenantId = req.tenantId || req.user?.tenantId;
    const { id } = req.params;

    if (!tenantId) {
      res.status(401).json({
        success: false,
        error: "Unauthorized tenant"
      });
      return;
    }

    // delete only candidate belonging to tenant
    const deleted = await prisma.candidate.deleteMany({
      where: {
        id,
        tenantId
      }
    });


    if (deleted.count === 0) {
      res.status(404).json({
        success: false,
        error: "Candidate not found"
      });
      return;
    }

    // We don't have the existing record's name here easily without a pre-fetch, 
    // but we can log the deletion event with the ID.
    recordTransaction({
      req: req as any,
      section: Section.HR,
      module: Module.RECRUITMENT,
      page: Page.CANDIDATE_PIPELINE_LIST,
      action: Action.DELETE,
      actionLabel: `Deleted Candidate Profile`,
      entityType: EntityType.CANDIDATE,
      entityId: id,
    });

    res.status(200).json({
      success: true,
      message: "Candidate deleted successfully"
    });

  } catch (error: any) {
    console.error("Delete candidate error:", error);

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};