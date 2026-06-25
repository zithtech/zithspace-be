import { AuthRequest } from "@/types";
import { TenantClient } from "@/db/onboardingPool";
export declare function createEmploymentDetails(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmploymentDetails(req: AuthRequest, employeeId: string): Promise<{
    positionId: any;
    department: any;
    team: any;
    employeeType: any;
    workLocation: any;
    workShift: any;
    workType: any;
    hybridMode: any;
    fixedDays: any;
    totalDays: any;
    totalHours: any;
    noticePeriod: any;
    employeeJoiningDate: any;
    employeeGrade: any;
    promotionStatus: any;
    joiningDate: any;
    trainingCompletion: any;
    projects: any[];
    reportingManager: string;
}>;
export declare function getAllEmploymentDetails(req: AuthRequest): Promise<{
    id: any;
    employeeCode: any;
    firstName: any;
    lastName: any;
    positionId: any;
    team: any;
    employeeType: any;
    workLocation: any;
    workShift: any;
    employeeJoiningDate: any;
    noticePeriod: any;
    workType: any;
    hybridMode: any;
    fixedDays: any;
    totalDays: any;
    totalHours: any;
    employeeGrade: any;
    promotionStatus: any;
    joiningDate: any;
    trainingCompletion: any;
    projects: any[];
    reportingManager: any;
}[]>;
export declare function updateEmploymentDetails(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteEmploymentDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteProjectMapping(req: AuthRequest, employeeId: string, projectName: string): Promise<{
    success: boolean;
    message: string;
}>;
