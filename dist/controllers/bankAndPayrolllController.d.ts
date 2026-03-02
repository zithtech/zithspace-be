import { AuthRequest } from "@/types";
export declare function encrypt(text: string): string;
export declare function decrypt(text: string): string;
export declare function createBankPayrollDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getBankPayrollDetails(req: AuthRequest, employeeId: string): Promise<{
    bankName: string;
    branchName: string;
    accountHolderName: string;
    accountNumber: string;
    accountType: string;
    ifscCode: string;
    uanNumber: string;
    pfNumber: string;
    esiNumber: string;
    taxRegime: string;
    paymentType: string;
}>;
export declare function getAllBankPayrollDetails(req: AuthRequest): Promise<{
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    bankName: string;
    branchName: string;
    accountHolderName: string;
    accountNumber: string;
    accountType: string;
    ifscCode: string;
    uanNumber: string;
    pfNumber: string;
    esiNumber: string;
    taxRegime: string;
    paymentType: string;
}[]>;
export declare function updateBankPayrollDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
    data: string;
}>;
export declare function deleteBankPayrollDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteBankDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deletePayrollDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
