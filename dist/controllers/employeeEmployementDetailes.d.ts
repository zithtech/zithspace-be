import { AuthRequest } from "@/types";
export declare function createEmploymentDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmploymentDetails(req: AuthRequest, employeeId: string): Promise<{
    department: string;
    team: string;
    employeeType: string;
    workLocation: string;
    workShift: string;
    workType: string;
    hybridMode: string;
    fixedDays: string[];
    totalDays: number;
    totalHours: number;
    employeeJoiningDate: string;
    employeeGrade: string;
    promotionStatus: string;
    joiningDate: Date;
    trainingCompletion: Date;
    projects: string[];
    reportingManager: string;
}>;
export declare function getAllEmploymentDetails(req: AuthRequest): Promise<{
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    department: string;
    team: string;
    employeeType: string;
    workLocation: string;
    workShift: string;
    employeeJoiningDate: string;
    employeeGrade: string;
    promotionStatus: string;
    joiningDate: Date;
    trainingCompletion: Date;
    projects: string[];
    reportingManager: string;
}[]>;
export declare function updateEmploymentDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<{
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
