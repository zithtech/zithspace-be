import { AuthRequest } from "@/types";
export declare function createEmployeeHistory(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmployeeHistory(req: AuthRequest, employeeId: string): Promise<{
    id: string;
    companyName: string;
    designation: string;
    employmentType: string;
    industry: string;
    location: string;
    address: string;
    doj: Date;
    lwd: Date;
    experienceLetter: {
        url: string;
        id: string;
    };
    offerLetter: {
        url: string;
        id: string;
    };
    serviceLetter: {
        url: string;
        id: string;
    };
    relievingLetter: {
        url: string;
        id: string;
    };
    form16: {
        url: string;
        id: string;
    }[];
    payslips: {
        url: string;
        id: string;
    }[];
    contacts: {
        id: string;
        contactRole: string;
        contactName: string;
        contactNumber: string;
        contactEmail: string;
    }[];
}[]>;
export declare function getSingleExperience(req: AuthRequest, employeeId: string, experienceId: string): Promise<{
    id: string;
    companyName: string;
    designation: string;
    employmentType: string;
    industry: string;
    location: string;
    address: string;
    doj: Date;
    lwd: Date;
    experienceLetter: {
        url: string;
        id: string;
    };
    offerLetter: {
        url: string;
        id: string;
    };
    serviceLetter: {
        url: string;
        id: string;
    };
    relievingLetter: {
        url: string;
        id: string;
    };
    form16: {
        url: string;
        id: string;
    }[];
    payslips: {
        url: string;
        id: string;
    }[];
    contacts: {
        id: string;
        contactRole: string;
        contactName: string;
        contactNumber: string;
        contactEmail: string;
    }[];
}>;
export declare function updateEmployeeHistory(req: AuthRequest, employeeId: string, experienceId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteEmployeeExperience(req: AuthRequest, employeeId: string, experienceId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteAllEmployeeHistory(req: AuthRequest, employeeId: string, tx?: any): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteEmployeeDocument(req: AuthRequest, employeeId: string, documentId: string): Promise<{
    success: boolean;
    message: string;
}>;
export declare function deleteEmployeeContact(req: AuthRequest, employeeId: string, contactId: string): Promise<{
    success: boolean;
    message: string;
}>;
