import { AuthRequest } from "@/types";
import { uploadEmployeeDocumentToR2 } from "@/utils/r2Client";
import { withTenant, TenantClient } from "@/db/onboardingPool";

/**
 * Run `fn` against the supplied tenant-scoped client when the orchestrator is
 * driving a shared transaction, otherwise open a standalone tenant transaction.
 * Mirrors the old `tx: any = prisma` default — a no-client call used to run on
 * the default (non-transactional) Prisma client.
 */
async function withClient<T>(
  req: AuthRequest,
  client: TenantClient | undefined,
  fn: (db: TenantClient) => Promise<T>,
): Promise<T> {
  if (client) return fn(client);
  return withTenant(req.tenantId as string, fn);
}

// ✅ CREATE Employee History
export async function createEmployeeHistory(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    const { history } = req.body;

    // Ensure history is an array before iterating
    if (!Array.isArray(history)) {
      return; // Or throw an error if history is mandatory but malformed
    }

    return await withClient(req, client, async (db) => {
      for (const h of history) {
        const expRes = await db.query(
          `INSERT INTO employee_experience
             (employee_id, company_name, designation, employment_type, industry,
              location, company_address, joining_date, last_working_date,
              created_by_id, updated_by_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING id`,
          [
            employeeId,
            h.companyName || null,
            h.designation || null,
            h.employmentType || null,
            h.industry || null,
            h.location || null,
            h.address || null,
            h.doj ? new Date(h.doj) : null,
            h.lwd ? new Date(h.lwd) : null,
            employeeId || null,
            employeeId || null,
          ],
        );
        const experienceId = expRes.rows[0]?.id ?? null;

        // Upload a base64 file (or accept an existing url), then record the doc
        // against THIS experience row. `fileData` = { base64?, url?, fileName? }.
        const recordDoc = async (docType: string, fileData: any) => {
          if (!fileData) return;
          let url: string | null = null;
          if (fileData.base64) {
            url = await uploadEmployeeDocumentToR2(
              fileData.base64,
              fileData.fileName || `${docType}`,
              req.tenantId!,
              employeeId,
              docType,
            );
          } else if (fileData.url) {
            url = fileData.url;
          }
          if (!url) return;
          await db.query(
            `INSERT INTO employee_documents
               (employee_id, experience_id, document_type, document_url, created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5, $5)`,
            [employeeId, experienceId, docType, url, employeeId],
          );
        };

        // Legacy fixed single-doc fields
        for (const docType of ["experienceLetter", "offerLetter", "serviceLetter", "relievingLetter"]) {
          await recordDoc(docType, (h as any)[docType]);
        }

        // Legacy fixed array-doc fields (Form 16, Payslips)
        for (const docType of ["form16", "payslips"]) {
          const files = (h as any)[docType];
          if (Array.isArray(files)) {
            for (const f of files) await recordDoc(docType, f);
          }
        }

        // Dynamic, tenant-configured / custom documents from the public form:
        //   documents: [{ documentType, files: [{ base64|url, fileName }] }]
        if (Array.isArray(h.documents)) {
          for (const doc of h.documents) {
            const docType = String(doc?.documentType || doc?.type || doc?.name || "Document");
            const files = Array.isArray(doc?.files) ? doc.files : doc?.file ? [doc.file] : [];
            for (const f of files) await recordDoc(docType, f);
          }
        }

        if (Array.isArray(h.contacts)) {
          for (const c of h.contacts) {
            await db.query(
              `INSERT INTO employee_contacts
                 (employee_id, contact_person_type, name, mobile, email,
                  created_by_id, updated_by_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [
                employeeId,
                c.contactRole || null,
                c.contactName || null,
                c.contactNumber,
                c.contactEmail || null, // SAFE FIX
                employeeId || null,
                employeeId || null,
              ],
            );
          }
        }
      }

      return {
        success: true,
        message: "Employee history created successfully",
      };
    });
  } catch (error) {
    console.error("Error in createEmployeeHistory:", error);
    throw error; // Re-throw to ensure transaction rollback
  }
}

// ✅ GET Employee History
export async function getEmployeeHistory(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      const experiencesRes = await db.query(
        `SELECT * FROM employee_experience
          WHERE employee_id = $1
          ORDER BY joining_date DESC`,
        [employeeId],
      );
      const experiences = experiencesRes.rows;

      const history = await Promise.all(
        experiences.map(async (exp: any) => {
          // Fetch documents linked to THIS experience. Legacy rows with a NULL
          // experience_id (created before per-history linking) are still shown.
          const documentsRes = await db.query(
            `SELECT * FROM employee_documents
              WHERE employee_id = $1 AND (experience_id = $2 OR experience_id IS NULL)`,
            [employeeId, exp.id],
          );
          const documents = documentsRes.rows;

          // Fetch contacts related to this employee
          const contactsRes = await db.query(
            `SELECT * FROM employee_contacts WHERE employee_id = $1`,
            [employeeId],
          );
          const contacts = contactsRes.rows;

          // Group single documents
          const experienceLetter = documents.find(
            (d: any) => d.document_type === "experienceLetter",
          );
          const offerLetter = documents.find(
            (d: any) => d.document_type === "offerLetter",
          );
          const serviceLetter = documents.find(
            (d: any) => d.document_type === "serviceLetter",
          );
          const relievingLetter = documents.find(
            (d: any) => d.document_type === "relievingLetter",
          );

          // Group array documents
          const form16 = documents
            .filter((d: any) => d.document_type === "form16")
            .map((d: any) => ({ url: d.document_url, id: d.id }));

          const payslips = documents
            .filter((d: any) => d.document_type === "payslips")
            .map((d: any) => ({ url: d.document_url, id: d.id }));

          // Generic, type-grouped list — covers tenant-configured / custom doc
          // types so the detail view can render every uploaded document.
          const grouped: Record<string, { url: string; id: string }[]> = {};
          for (const d of documents as any[]) {
            (grouped[d.document_type] ||= []).push({ url: d.document_url, id: d.id });
          }
          const documentsList = Object.entries(grouped).map(([documentType, files]) => ({
            documentType,
            files,
          }));

          return {
            id: exp.id,
            companyName: exp.company_name,
            designation: exp.designation,
            employmentType: exp.employment_type,
            industry: exp.industry,
            location: exp.location,
            address: exp.company_address,
            doj: exp.joining_date,
            lwd: exp.last_working_date,
            experienceLetter: experienceLetter
              ? { url: experienceLetter.document_url, id: experienceLetter.id }
              : null,
            offerLetter: offerLetter
              ? { url: offerLetter.document_url, id: offerLetter.id }
              : null,
            serviceLetter: serviceLetter
              ? { url: serviceLetter.document_url, id: serviceLetter.id }
              : null,
            relievingLetter: relievingLetter
              ? { url: relievingLetter.document_url, id: relievingLetter.id }
              : null,
            form16,
            payslips,
            documents: documentsList,
            contacts: contacts.map((c: any) => ({
              id: c.id,
              contactRole: c.contact_person_type,
              contactName: c.name,
              contactNumber: c.mobile,
              contactEmail: c.email,
            })),
          };
        }),
      );

      return history;
    });
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

    return await withTenant(req.tenantId, async (db) => {
      const experienceRes = await db.query(
        `SELECT * FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [experienceId, employeeId],
      );
      const experience = experienceRes.rows[0];

      if (!experience) {
        throw new Error("Experience record not found");
      }

      // Fetch related documents
      const documentsRes = await db.query(
        `SELECT * FROM employee_documents WHERE employee_id = $1`,
        [employeeId],
      );
      const documents = documentsRes.rows;

      // Fetch related contacts
      const contactsRes = await db.query(
        `SELECT * FROM employee_contacts WHERE employee_id = $1`,
        [employeeId],
      );
      const contacts = contactsRes.rows;

      const experienceLetter = documents.find(
        (d: any) => d.document_type === "experienceLetter",
      );
      const offerLetter = documents.find(
        (d: any) => d.document_type === "offerLetter",
      );
      const serviceLetter = documents.find(
        (d: any) => d.document_type === "serviceLetter",
      );
      const relievingLetter = documents.find(
        (d: any) => d.document_type === "relievingLetter",
      );
      const form16 = documents
        .filter((d: any) => d.document_type === "form16")
        .map((d: any) => ({ url: d.document_url, id: d.id }));
      const payslips = documents
        .filter((d: any) => d.document_type === "payslips")
        .map((d: any) => ({ url: d.document_url, id: d.id }));

      return {
        id: experience.id,
        companyName: experience.company_name,
        designation: experience.designation,
        employmentType: experience.employment_type,
        industry: experience.industry,
        location: experience.location,
        address: experience.company_address,
        doj: experience.joining_date,
        lwd: experience.last_working_date,
        experienceLetter: experienceLetter
          ? { url: experienceLetter.document_url, id: experienceLetter.id }
          : null,
        offerLetter: offerLetter
          ? { url: offerLetter.document_url, id: offerLetter.id }
          : null,
        serviceLetter: serviceLetter
          ? { url: serviceLetter.document_url, id: serviceLetter.id }
          : null,
        relievingLetter: relievingLetter
          ? { url: relievingLetter.document_url, id: relievingLetter.id }
          : null,
        form16,
        payslips,
        contacts: contacts.map((c: any) => ({
          id: c.id,
          contactRole: c.contact_person_type,
          contactName: c.name,
          contactNumber: c.mobile,
          contactEmail: c.email,
        })),
      };
    });
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

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify experience exists
      const existingRes = await db.query(
        `SELECT id FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [experienceId, employeeId],
      );

      if (!existingRes.rows[0]) {
        throw new Error("Experience record not found");
      }

      // Update experience record
      await db.query(
        `UPDATE employee_experience
            SET company_name = $1,
                designation = $2,
                employment_type = $3,
                industry = $4,
                location = $5,
                company_address = $6,
                joining_date = $7,
                last_working_date = $8,
                updated_by_id = $9,
                updated_at = now()
          WHERE id = $10`,
        [
          history.companyName,
          history.designation,
          history.employmentType,
          history.industry,
          history.location,
          history.address,
          history.doj ? new Date(history.doj) : null,
          history.lwd ? new Date(history.lwd) : null,
          employeeId,
          experienceId,
        ],
      );

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
          await db.query(
            `DELETE FROM employee_documents
              WHERE employee_id = $1 AND document_type = $2`,
            [employeeId, docType],
          );

          // Upload and create new document
          const url = await uploadEmployeeDocumentToR2(
            fileData.base64,
            fileData.fileName,
            req.tenantId!,
            employeeId,
            docType,
          );

          await db.query(
            `INSERT INTO employee_documents
               (employee_id, document_type, document_url, created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5)`,
            [employeeId, docType, url, employeeId, employeeId],
          );
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

              await db.query(
                `INSERT INTO employee_documents
                   (employee_id, document_type, document_url, created_by_id, updated_by_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                [employeeId, docType, url, employeeId, employeeId],
              );
            }
          }
        }
      }

      // Update contacts - Delete old and create new
      if (history.contacts && Array.isArray(history.contacts)) {
        await db.query(
          `DELETE FROM employee_contacts WHERE employee_id = $1`,
          [employeeId],
        );

        for (const c of history.contacts) {
          await db.query(
            `INSERT INTO employee_contacts
               (employee_id, contact_person_type, name, mobile, email,
                created_by_id, updated_by_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              employeeId,
              c.contactRole,
              c.contactName,
              c.contactNumber,
              c.contactEmail,
              employeeId,
              employeeId,
            ],
          );
        }
      }

      return {
        success: true,
        message: "Employee history updated successfully",
      };
    });
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

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify experience exists
      const existingRes = await db.query(
        `SELECT id FROM employee_experience
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [experienceId, employeeId],
      );

      if (!existingRes.rows[0]) {
        throw new Error("Experience record not found");
      }

      // Delete the experience record
      await db.query(`DELETE FROM employee_experience WHERE id = $1`, [
        experienceId,
      ]);

      return {
        success: true,
        message: "Experience record deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteEmployeeExperience:", error);
    throw error;
  }
}

// ✅ DELETE All Employee History
export async function deleteAllEmployeeHistory(
  req: AuthRequest,
  employeeId: string,
  client?: TenantClient,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    return await withClient(req, client, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Delete all experiences
      await db.query(`DELETE FROM employee_experience WHERE employee_id = $1`, [
        employeeId,
      ]);

      // Delete all documents
      await db.query(`DELETE FROM employee_documents WHERE employee_id = $1`, [
        employeeId,
      ]);

      // Delete all contacts
      await db.query(`DELETE FROM employee_contacts WHERE employee_id = $1`, [
        employeeId,
      ]);

      return {
        success: true,
        message: "All employee history deleted successfully",
      };
    });
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

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify document exists
      const documentRes = await db.query(
        `SELECT id FROM employee_documents
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [documentId, employeeId],
      );

      if (!documentRes.rows[0]) {
        throw new Error("Document not found");
      }

      // Delete the document
      await db.query(`DELETE FROM employee_documents WHERE id = $1`, [
        documentId,
      ]);

      // Note: You may want to also delete the file from R2 storage here
      // using a deleteFromR2 utility function if you have one

      return {
        success: true,
        message: "Document deleted successfully",
      };
    });
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

    return await withTenant(req.tenantId, async (db) => {
      // Verify employee exists and belongs to tenant
      const employeeRes = await db.query(
        `SELECT id FROM employees WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [employeeId, req.tenantId],
      );

      if (!employeeRes.rows[0]) {
        throw new Error("Employee not found");
      }

      // Verify contact exists
      const contactRes = await db.query(
        `SELECT id FROM employee_contacts
          WHERE id = $1 AND employee_id = $2
          LIMIT 1`,
        [contactId, employeeId],
      );

      if (!contactRes.rows[0]) {
        throw new Error("Contact not found");
      }

      // Delete the contact
      await db.query(`DELETE FROM employee_contacts WHERE id = $1`, [contactId]);

      return {
        success: true,
        message: "Contact deleted successfully",
      };
    });
  } catch (error) {
    console.error("Error in deleteEmployeeContact:", error);
    throw error;
  }
}
