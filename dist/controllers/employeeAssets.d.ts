import { AuthRequest } from "@/types";
import { TenantClient } from "@/db/onboardingPool";
export declare function createEmployeeAssets(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmployeeAssets(req: AuthRequest, employeeId: string): Promise<{
    id: any;
    item: any;
    brand: any;
    model: any;
    modelNumber: any;
    image: any;
    returnStatus: any;
    condition: any;
    deduction: any;
    remarks: any;
    createdAt: any;
    updatedAt: any;
}[]>;
export declare function getSingleEmployeeAsset(req: AuthRequest, employeeId: string, assetId: string): Promise<{
    id: any;
    item: any;
    brand: any;
    model: any;
    modelNumber: any;
    image: any;
    returnStatus: any;
    condition: any;
    deduction: any;
    remarks: any;
    createdAt: any;
    updatedAt: any;
}>;
export declare function getAllEmployeesAssets(req: AuthRequest): Promise<{
    id: any;
    employeeCode: any;
    firstName: any;
    lastName: any;
    assets: {
        id: any;
        item: any;
        brand: any;
        model: any;
        modelNumber: any;
        image: any;
        returnStatus: any;
        condition: any;
        deduction: any;
        remarks: any;
        createdAt: any;
    }[];
}[]>;
export declare function updateEmployeeAsset(req: AuthRequest, employeeId: string, assetId: string): Promise<{
    success: boolean;
    message: string;
    asset: {
        id: any;
        item: any;
        brand: any;
        model: any;
        modelNumber: any;
        image: any;
        returnStatus: any;
        condition: any;
        deduction: any;
        remarks: any;
    };
}>;
export declare function updateEmployeeAssets(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteEmployeeAsset(req: AuthRequest, employeeId: string, assetId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteAllEmployeeAssets(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
