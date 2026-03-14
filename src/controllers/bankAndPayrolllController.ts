import { prisma } from "@/config/database";
import { AuthRequest } from "@/types";
import crypto from "crypto";

const algorithm = "aes-256-cbc";
const secretKey = process.env.SECRET_KEY as string; // 32 chars

export function encrypt(text: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  return iv.toString("base64") + ":" + encrypted.toString("base64");
}

export function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    if (parts.length !== 2) {
      return text;
    }
    const iv = Buffer.from(parts.shift()!, "base64");
    const encryptedText = Buffer.from(parts.join(":"), "base64");
    const decipher = crypto.createDecipheriv(
      algorithm,
      Buffer.from(secretKey),
      iv,
    );
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error(
      "Decryption failed for text, returning original. Error:",
      error,
    );
    return text;
  }
}

// ✅ CREATE Bank & Payroll Details
export async function createBankPayrollDetails(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    const { bank } = req.body;

    // If no bank details are provided, do nothing.
    if (!bank || Object.keys(bank).length === 0) {
      return;
    }

    const encrtyptedAccountNumber = encrypt(bank.accountNumber);
    const encrtyptedIfscCode = encrypt(bank.ifscCode);

    // Verify employee exists and belongs to tenant

    await tx.employeeBankDetail.create({
      data: {
        employeeId,
        bankName: bank.bankName,
        branchName: bank.branchName,
        accountHolderName: bank.accountHolderName,
        accountNumber: encrtyptedAccountNumber,
        accountType: bank.accountType,
        ifscCode: encrtyptedIfscCode,
        createdById: employeeId,
        updatedById: employeeId,
      },
    });
    const encrtyptedUanNumber = encrypt(bank.uanNumber);
    const encrtyptedPfNumber = encrypt(bank.pfNumber);
    const encrtyptedEsiNumber = encrypt(bank.esiNumber);

    await tx.employeePayrollDetail.create({
      data: {
        employeeId,
        uanNumber: encrtyptedUanNumber,
        pfNumber: encrtyptedPfNumber,
        esiNumber: encrtyptedEsiNumber,
        taxRegime: bank.taxRegime,
        paymentType: bank.paymentType,
        createdById: employeeId,
        updatedById: employeeId,
      },
    });

    return {
      success: true,
      message: "Bank and payroll details created successfully",
    };
  } catch (error) {
    console.error("Error in createBankPayrollDetails:", error);
    throw error; // Re-throw to ensure the transaction rolls back
  }
}

// ✅ GET Bank & Payroll Details
export async function getBankPayrollDetails(
  req: AuthRequest,
  employeeId: string,
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

    const bankDetails = await prisma.employeeBankDetail.findFirst({
      where: { employeeId },
    });

    const payrollDetails = await prisma.employeePayrollDetail.findFirst({
      where: { employeeId },
    });

    return {
      bankName: bankDetails?.bankName || null,
      branchName: bankDetails?.branchName || null,
      accountHolderName: bankDetails?.accountHolderName || null,
      accountNumber: bankDetails?.accountNumber
        ? decrypt(bankDetails.accountNumber)
        : null,
      accountType: bankDetails?.accountType || null,
      ifscCode: bankDetails?.ifscCode ? decrypt(bankDetails.ifscCode) : null,
      uanNumber: payrollDetails?.uanNumber
        ? decrypt(payrollDetails.uanNumber)
        : null,
      pfNumber: payrollDetails?.pfNumber
        ? decrypt(payrollDetails.pfNumber)
        : null,
      esiNumber: payrollDetails?.esiNumber
        ? decrypt(payrollDetails.esiNumber)
        : null,
      taxRegime: payrollDetails?.taxRegime || null,
      paymentType: payrollDetails?.paymentType || null,
    };
  } catch (error) {
    console.error("Error in getBankPayrollDetails:", error);
    throw error;
  }
}

// ✅ GET All Employees Bank & Payroll Details
export async function getAllBankPayrollDetails(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const employees = await prisma.employee.findMany({
      where: {
        tenantId: req.tenantId,
        status: true,
      },
      include: {
        bankDetail: true,
        payrollDetail: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return employees.map((employee) => {
      const bankDetail = employee.bankDetail;
      const payrollDetail = employee.payrollDetail;

      return {
        id: employee.id,
        employeeCode: employee.employee_code,
        firstName: employee.first_name,
        lastName: employee.last_name,
        bankName: bankDetail?.bankName || null,
        branchName: bankDetail?.branchName || null,
        accountHolderName: bankDetail?.accountHolderName || null,
        accountNumber: bankDetail?.accountNumber
          ? decrypt(bankDetail.accountNumber)
          : null,
        accountType: bankDetail?.accountType || null,
        ifscCode: bankDetail?.ifscCode ? decrypt(bankDetail.ifscCode) : null,
        uanNumber: payrollDetail?.uanNumber
          ? decrypt(payrollDetail.uanNumber)
          : null,
        pfNumber: payrollDetail?.pfNumber
          ? decrypt(payrollDetail.pfNumber)
          : null,
        esiNumber: payrollDetail?.esiNumber
          ? decrypt(payrollDetail.esiNumber)
          : null,
        taxRegime: payrollDetail?.taxRegime || null,
        paymentType: payrollDetail?.paymentType || null,
      };
    });
  } catch (error) {
    console.error("Error in getAllBankPayrollDetails:", error);
    throw error;
  }
}

// ✅ UPDATE Bank & Payroll Details
export async function updateBankPayrollDetails(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { bank } = req.body;

    if (!bank || Object.keys(bank).length === 0) {
      throw new Error("Bank and payroll details are missing from request body");
    }

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

    const encrtyptedAccountNumber = bank.accountNumber
      ? encrypt(bank.accountNumber)
      : bank.accountNumber;
    const encrtyptedIfscCode = bank.ifscCode
      ? encrypt(bank.ifscCode)
      : bank.ifscCode;

    // ✅ Update or Create Bank Details
    const existingBankDetails = await tx.employeeBankDetail.findFirst({
      where: { employeeId },
    });

    if (existingBankDetails) {
      await tx.employeeBankDetail.update({
        where: { id: existingBankDetails.id },
        data: {
          employeeId,
          bankName: bank.bankName,
          branchName: bank.branchName,
          accountHolderName: bank.accountHolderName,
          accountNumber: encrtyptedAccountNumber,
          accountType: bank.accountType,
          ifscCode: encrtyptedIfscCode,
          updatedById: employeeId,
        },
      });
    } else {
      await tx.employeeBankDetail.create({
        data: {
          employeeId,
          bankName: bank.bankName,
          branchName: bank.branchName,
          accountHolderName: bank.accountHolderName,
          accountNumber: encrtyptedAccountNumber,
          accountType: bank.accountType,
          ifscCode: encrtyptedIfscCode,
          createdById: employeeId,
          updatedById: employeeId,
        },
      });
    }

    const encrtyptedUanNumber = bank.uanNumber
      ? encrypt(bank.uanNumber)
      : bank.uanNumber;
    const encrtyptedPfNumber = bank.pfNumber
      ? encrypt(bank.pfNumber)
      : bank.pfNumber;
    const encrtyptedEsiNumber = bank.esiNumber
      ? encrypt(bank.esiNumber)
      : bank.esiNumber;

    // ✅ Update or Create Payroll Details
    const existingPayrollDetails = await tx.employeePayrollDetail.findFirst({
      where: { employeeId },
    });

    if (existingPayrollDetails) {
      await tx.employeePayrollDetail.update({
        where: { id: existingPayrollDetails.id },
        data: {
          uanNumber: encrtyptedUanNumber,
          pfNumber: encrtyptedPfNumber,
          esiNumber: encrtyptedEsiNumber,
          taxRegime: bank.taxRegime,
          paymentType: bank.paymentType,
          updatedById: employeeId,
        },
      });
    } else {
      await tx.employeePayrollDetail.create({
        data: {
          employeeId,
          uanNumber: encrtyptedUanNumber,
          pfNumber: encrtyptedPfNumber,
          esiNumber: encrtyptedEsiNumber,
          taxRegime: bank.taxRegime,
          paymentType: bank.paymentType,
          createdById: employeeId,
          updatedById: employeeId,
        },
      });
    }

    return {
      success: true,
      message: "Bank and payroll details updated successfully",
      data: employeeId,
    };
  } catch (error) {
    console.error("Error in updateBankPayrollDetails:", error);
    throw error;
  }
}

// ✅ DELETE Bank & Payroll Details
export async function deleteBankPayrollDetails(
  req: AuthRequest,
  employeeId: string,
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

    // Delete bank details
    await prisma.employeeBankDetail.deleteMany({
      where: { employeeId },
    });

    // Delete payroll details
    await prisma.employeePayrollDetail.deleteMany({
      where: { employeeId },
    });

    return {
      success: true,
      message: "Bank and payroll details deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteBankPayrollDetails:", error);
    throw error;
  }
}

// ✅ DELETE Only Bank Details
export async function deleteBankDetails(req: AuthRequest, employeeId: string) {
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

    await prisma.employeeBankDetail.deleteMany({
      where: { employeeId },
    });

    return {
      success: true,
      message: "Bank details deleted successfully",
    };
  } catch (error) {
    console.error("Error in deleteBankDetails:", error);
    throw error;
  }
}

// ✅ DELETE Only Payroll Details
export async function deletePayrollDetails(
  req: AuthRequest,
  employeeId: string,
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

    await prisma.employeePayrollDetail.deleteMany({
      where: { employeeId },
    });

    return {
      success: true,
      message: "Payroll details deleted successfully",
    };
  } catch (error) {
    console.error("Error in deletePayrollDetails:", error);
    throw error;
  }
}
