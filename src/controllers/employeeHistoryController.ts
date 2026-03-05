import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import { uploadEmployeeDocumentToR2 } from "@/utils/r2Client";

// ✅ CREATE Employee History
export async function createEmployeeHistory(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    const { history } = req.body;

    // Ensure history is an array before iterating
    if (!Array.isArray(history)) {
      return; // Or throw an error if history is mandatory but malformed
    }

    for (const h of history) {
      const exp = await tx.employeeExperience.create({
        data: {
          employeeId,
          companyName: h.companyName || null,
          designation: h.designation || null,
          employmentType: h.employmentType || null,
          industry: h.industry || null,
          location: h.location || null,
          companyAddress: h.address || null,
          joiningDate: new Date(h.doj) || null,
          lastWorkingDate: new Date(h.lwd) || null,
          createdById: employeeId || null,
          updatedById: employeeId || null,
        },
      });

      // Handle Single Documents
      const singleDocFields = [
        "experienceLetter",
        "offerLetter",
        "serviceLetter",
        "relievingLetter",
      ];

      for (const docType of singleDocFields) {
        const fileData = (h as any)[docType];
        if (fileData) {
          let url = null;
          if (fileData.base64) {
            url = await uploadEmployeeDocumentToR2(
              fileData.base64,
              fileData.fileName,
              req.tenantId!,
              employeeId,
              docType,
            );
          } else if (fileData.url) {
            url = fileData.url;
          }

          if (url) {
            await tx.employeeDocument.create({
              data: {
                employeeId,
                documentType: docType,
                documentUrl: url,
                createdById: employeeId,
                updatedById: employeeId,
              },
            });
          }
        }
      }

      // Handle Array Documents (Form 16, Payslips)
      const listDocFields = ["form16", "payslips"];

      for (const docType of listDocFields) {
        const files = (h as any)[docType];
        if (Array.isArray(files)) {
          for (const fileData of files) {
            if (fileData) {
              let url = null;
              if (fileData.base64) {
                url = await uploadEmployeeDocumentToR2(
                  fileData.base64,
                  fileData.fileName,
                  req.tenantId!,
                  employeeId,
                  docType,
                );
              } else if (fileData.url) {
                url = fileData.url;
              }

              if (url) {
                await tx.employeeDocument.create({
                  data: {
                    employeeId,
                    documentType: docType,
                    documentUrl: url,
                    createdById: employeeId,
                    updatedById: employeeId,
                  },
                });
              }
            }
          }
        }
      }

      if (Array.isArray(h.contacts)) {
        for (const c of h.contacts) {
          await tx.employeeContact.create({
            data: {
              employeeId,
              contactPersonType: c.contactRole || null,
              name: c.contactName || null,
              mobile: c.contactNumber,
              email: c.contactEmail || null, // SAFE FIX
              createdById: employeeId || null,
              updatedById: employeeId || null,
            },
          });
        }
      }
    }

    return { success: true, message: "Employee history created successfully" };
  } catch (error) {
    console.error("Error in createEmployeeHistory:", error);
    throw error; // Re-throw to ensure transaction rollback
  }
}

// ✅ GET Employee History
export async function getEmployeeHistory(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    const experiences = await prisma.employeeExperience.findMany({
      where: { employeeId },
      orderBy: { joiningDate: "desc" },
    });

    const history = await Promise.all(
      experiences.map(async (exp) => {
        // Fetch documents related to this experience
        const documents = await prisma.employeeDocument.findMany({
          where: {
            employeeId,
          },
        });

        // Fetch contacts related to this employee
        const contacts = await prisma.employeeContact.findMany({
          where: { employeeId },
        });

        // Group single documents
        const experienceLetter = documents.find(
          (d) => d.documentType === "experienceLetter",
        );
        const offerLetter = documents.find(
          (d) => d.documentType === "offerLetter",
        );
        const serviceLetter = documents.find(
          (d) => d.documentType === "serviceLetter",
        );
        const relievingLetter = documents.find(
          (d) => d.documentType === "relievingLetter",
        );

        // Group array documents
        const form16 = documents
          .filter((d) => d.documentType === "form16")
          .map((d) => ({ url: d.documentUrl, id: d.id }));

        const payslips = documents
          .filter((d) => d.documentType === "payslips")
          .map((d) => ({ url: d.documentUrl, id: d.id }));

        return {
          id: exp.id,
          companyName: exp.companyName,
          designation: exp.designation,
          employmentType: exp.employmentType,
          industry: exp.industry,
          location: exp.location,
          address: exp.companyAddress,
          doj: exp.joiningDate,
          lwd: exp.lastWorkingDate,
          experienceLetter: experienceLetter
            ? { url: experienceLetter.documentUrl, id: experienceLetter.id }
            : null,
          offerLetter: offerLetter
            ? { url: offerLetter.documentUrl, id: offerLetter.id }
            : null,
          serviceLetter: serviceLetter
            ? { url: serviceLetter.documentUrl, id: serviceLetter.id }
            : null,
          relievingLetter: relievingLetter
            ? { url: relievingLetter.documentUrl, id: relievingLetter.id }
            : null,
          form16,
          payslips,
          contacts: contacts.map((c) => ({
            id: c.id,
            contactRole: c.contactPersonType,
            contactName: c.name,
            contactNumber: c.mobile,
            contactEmail: c.email,
          })),
        };
      }),
    );

    return history;
  } catch (error) {
    console.error("Error in getEmployeeHistory:", error);
    throw error;
  }
}

// ✅ GET Single Experience Record
export async function getSingleExperience(
  req: AuthRequest,
  employeeId: string,
  experienceId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const experience = await prisma.employeeExperience.findFirst({
      where: {
        id: experienceId,
        employeeId,
      },
    });

    if (!experience) {
      throw new Error("Experience record not found");
    }

    // Fetch related documents
    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId },
    });

    // Fetch related contacts
    const contacts = await prisma.employeeContact.findMany({
      where: { employeeId },
    });

    const experienceLetter = documents.find(
      (d) => d.documentType === "experienceLetter",
    );
    const offerLetter = documents.find((d) => d.documentType === "offerLetter");
    const serviceLetter = documents.find(
      (d) => d.documentType === "serviceLetter",
    );
    const relievingLetter = documents.find(
      (d) => d.documentType === "relievingLetter",
    );
    const form16 = documents
      .filter((d) => d.documentType === "form16")
      .map((d) => ({ url: d.documentUrl, id: d.id }));
    const payslips = documents
      .filter((d) => d.documentType === "payslips")
      .map((d) => ({ url: d.documentUrl, id: d.id }));

    return {
      id: experience.id,
      companyName: experience.companyName,
      designation: experience.designation,
      employmentType: experience.employmentType,
      industry: experience.industry,
      location: experience.location,
      address: experience.companyAddress,
      doj: experience.joiningDate,
      lwd: experience.lastWorkingDate,
      experienceLetter: experienceLetter
        ? { url: experienceLetter.documentUrl, id: experienceLetter.id }
        : null,
      offerLetter: offerLetter
        ? { url: offerLetter.documentUrl, id: offerLetter.id }
        : null,
      serviceLetter: serviceLetter
        ? { url: serviceLetter.documentUrl, id: serviceLetter.id }
        : null,
      relievingLetter: relievingLetter
        ? { url: relievingLetter.documentUrl, id: relievingLetter.id }
        : null,
      form16,
      payslips,
      contacts: contacts.map((c) => ({
        id: c.id,
        contactRole: c.contactPersonType,
        contactName: c.name,
        contactNumber: c.mobile,
        contactEmail: c.email,
      })),
    };
  } catch (error) {
    console.error("Error in getSingleExperience:", error);
    throw error;
  }
}

// ✅ UPDATE Employee History
export async function updateEmployeeHistory(
  req: AuthRequest,
  employeeId: string,
  experienceId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { history } = req.body;

    if (!history) {
      throw new Error("History data is missing from the request body");
    }

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify experience exists
    const existingExperience = await prisma.employeeExperience.findFirst({
      where: {
        id: experienceId,
        employeeId,
      },
    });

    if (!existingExperience) {
      throw new Error("Experience record not found");
    }

    // Update experience record
    await prisma.employeeExperience.update({
      where: { id: experienceId },
      data: {
        companyName: history.companyName,
        designation: history.designation,
        employmentType: history.employmentType,
        industry: history.industry,
        location: history.location,
        companyAddress: history.address,
        joiningDate: new Date(history.doj),
        lastWorkingDate: new Date(history.lwd),
        updatedById: employeeId,
      },
    });

    // Handle Single Documents - Update if provided
    const singleDocFields = [
      "experienceLetter",
      "offerLetter",
      "serviceLetter",
      "relievingLetter",
    ];

    for (const docType of singleDocFields) {
      const fileData = (history as any)[docType];

      if (fileData && fileData.base64) {
        // Delete existing document of this type
        await prisma.employeeDocument.deleteMany({
          where: {
            employeeId,
            documentType: docType,
          },
        });

        // Upload and create new document
        const url = await uploadEmployeeDocumentToR2(
          fileData.base64,
          fileData.fileName,
          req.tenantId!,
          employeeId,
          docType,
        );

        await prisma.employeeDocument.create({
          data: {
            employeeId,
            documentType: docType,
            documentUrl: url,
            createdById: employeeId,
            updatedById: employeeId,
          },
        });
      }
    }

    // Handle Array Documents (Form 16, Payslips) - Add new ones
    const listDocFields = ["form16", "payslips"];

    for (const docType of listDocFields) {
      const files = (history as any)[docType];
      if (Array.isArray(files)) {
        for (const fileData of files) {
          if (fileData && fileData.base64) {
            const url = await uploadEmployeeDocumentToR2(
              fileData.base64,
              fileData.fileName,
              req.tenantId!,
              employeeId,
              docType,
            );

            await prisma.employeeDocument.create({
              data: {
                employeeId,
                documentType: docType,
                documentUrl: url,
                createdById: employeeId,
                updatedById: employeeId,
              },
            });
          }
        }
      }
    }

    // Update contacts - Delete old and create new
    if (history.contacts && Array.isArray(history.contacts)) {
      await prisma.employeeContact.deleteMany({
        where: { employeeId },
      });

      for (const c of history.contacts) {
        await prisma.employeeContact.create({
          data: {
            employeeId,
            contactPersonType: c.contactRole,
            name: c.contactName,
            mobile: c.contactNumber,
            email: c.contactEmail,
            createdById: employeeId,
            updatedById: employeeId,
          },
        });
      }
    }

    return {
      success: true,
      message: "Employee history updated successfully",
    };
  } catch (error) {
    console.error("Error in updateEmployeeHistory:", error);
    throw error;
  }
}

// ✅ DELETE Single Experience Record
export async function deleteEmployeeExperience(
  req: AuthRequest,
  employeeId: string,
  experienceId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify experience exists
    const existingExperience = await prisma.employeeExperience.findFirst({
      where: {
        id: experienceId,
        employeeId,
      },
    });

    if (!existingExperience) {
      throw new Error("Experience record not found");
    }

    // Delete the experience record
    await prisma.employeeExperience.delete({
      where: { id: experienceId },
    });

    return {
      success: true,
      message: "Experience record deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteEmployeeExperience:", error);
    throw error;
  }
}

// ✅ DELETE All Employee History
export async function deleteAllEmployeeHistory(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Delete all experiences
    await tx.employeeExperience.deleteMany({
      where: { employeeId },
    });

    // Delete all documents
    await tx.employeeDocument.deleteMany({
      where: { employeeId },
    });

    // Delete all contacts
    await tx.employeeContact.deleteMany({
      where: { employeeId },
    });

    return {
      success: true,
      message: "All employee history deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteAllEmployeeHistory:", error);
    throw error;
  }
}

// ✅ DELETE Single Document
export async function deleteEmployeeDocument(
  req: AuthRequest,
  employeeId: string,
  documentId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify document exists
    const document = await prisma.employeeDocument.findFirst({
      where: {
        id: documentId,
        employeeId,
      },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Delete the document
    await prisma.employeeDocument.delete({
      where: { id: documentId },
    });

    // Note: You may want to also delete the file from R2 storage here
    // using a deleteFromR2 utility function if you have one

    return {
      success: true,
      message: "Document deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteEmployeeDocument:", error);
    throw error;
  }
}

// ✅ DELETE Single Contact
export async function deleteEmployeeContact(
  req: AuthRequest,
  employeeId: string,
  contactId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Verify contact exists
    const contact = await prisma.employeeContact.findFirst({
      where: {
        id: contactId,
        employeeId,
      },
    });

    if (!contact) {
      throw new Error("Contact not found");
    }

    // Delete the contact
    await prisma.employeeContact.delete({
      where: { id: contactId },
    });

    return {
      success: true,
      message: "Contact deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteEmployeeContact:", error);
    throw error;
  }
}
