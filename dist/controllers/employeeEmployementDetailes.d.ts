import { AuthRequest } from "@/types";
export declare function createEmploymentDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmploymentDetails(req: AuthRequest, employeeId: string): Promise<{
    positionId: string;
    department: string;
    team: string;
    employeeType: string;
    workLocation: string;
    workShift: import("@prisma/client/runtime/library").JsonValue;
    workType: string;
    hybridMode: string;
    fixedDays: string[];
    totalDays: number;
    totalHours: number;
    noticePeriod: string;
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
    positionId: string;
    team: string;
    employeeType: string;
    workLocation: string;
    workShift: string | number | true | import("@prisma/client/runtime/library").JsonObject | import("@prisma/client/runtime/library").JsonArray;
    employeeJoiningDate: string;
    noticePeriod: string;
    workType: string;
    hybridMode: string;
    fixedDays: string[];
    totalDays: number;
    totalHours: number;
    employeeGrade: any;
    promotionStatus: any;
    joiningDate: any;
    trainingCompletion: any;
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
