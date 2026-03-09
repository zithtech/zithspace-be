import { AuthRequest } from "@/types";
export declare function createEmployeeAssets(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmployeeAssets(req: AuthRequest, employeeId: string): Promise<{
    id: string;
    item: string;
    brand: string;
    model: string;
    modelNumber: string;
    image: string;
    createdAt: Date;
    updatedAt: Date;
}[]>;
export declare function getSingleEmployeeAsset(req: AuthRequest, employeeId: string, assetId: string): Promise<{
    id: string;
    item: string;
    brand: string;
    model: string;
    modelNumber: string;
    image: string;
    createdAt: Date;
    updatedAt: Date;
}>;
export declare function getAllEmployeesAssets(req: AuthRequest): Promise<{
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    assets: {
        id: string;
        item: string;
        brand: string;
        model: string;
        modelNumber: string;
        image: string;
        createdAt: Date;
    }[];
}[]>;
export declare function updateEmployeeAsset(req: AuthRequest, employeeId: string, assetId: string): Promise<{
    success: boolean;
    message: string;
    asset: {
        id: string;
        item: string;
        brand: string;
        model: string;
        modelNumber: string;
        image: string;
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
export declare function deleteAllEmployeeAssets(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
