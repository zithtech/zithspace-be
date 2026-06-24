import { AuthRequest } from "@/types";
import { TenantClient } from "@/db/onboardingPool";
export declare function encrypt(text: string): string;
export declare function decrypt(text: string): string;
export declare function createBankPayrollDetails(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getBankPayrollDetails(req: AuthRequest, employeeId: string): Promise<{
    bankName: any;
    branchName: any;
    accountHolderName: any;
    accountNumber: string;
    accountType: any;
    ifscCode: string;
    uanNumber: string;
    pfNumber: string;
    esiNumber: string;
    taxRegime: any;
    paymentType: any;
}>;
export declare function getAllBankPayrollDetails(req: AuthRequest): Promise<{
    id: any;
    employeeCode: any;
    firstName: any;
    lastName: any;
    bankName: any;
    branchName: any;
    accountHolderName: any;
    accountNumber: string;
    accountType: any;
    ifscCode: string;
    uanNumber: string;
    pfNumber: string;
    esiNumber: string;
    taxRegime: any;
    paymentType: any;
}[]>;
export declare function updateBankPayrollDetails(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
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
