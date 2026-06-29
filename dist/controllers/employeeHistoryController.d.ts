import { AuthRequest } from "@/types";
import { TenantClient } from "@/db/onboardingPool";
export declare function createEmployeeHistory(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
    success: boolean;
    message: string;
}>;
export declare function getEmployeeHistory(req: AuthRequest, employeeId: string): Promise<{
    id: any;
    companyName: any;
    designation: any;
    employmentType: any;
    industry: any;
    location: any;
    address: any;
    doj: any;
    lwd: any;
    experienceLetter: {
        url: any;
        id: any;
    };
    offerLetter: {
        url: any;
        id: any;
    };
    serviceLetter: {
        url: any;
        id: any;
    };
    relievingLetter: {
        url: any;
        id: any;
    };
    form16: {
        url: any;
        id: any;
    }[];
    payslips: {
        url: any;
        id: any;
    }[];
    documents: {
        documentType: string;
        files: {
            url: string;
            id: string;
        }[];
    }[];
    contacts: {
        id: any;
        contactRole: any;
        contactName: any;
        contactNumber: any;
        contactEmail: any;
    }[];
}[]>;
export declare function getSingleExperience(req: AuthRequest, employeeId: string, experienceId: string): Promise<{
    id: any;
    companyName: any;
    designation: any;
    employmentType: any;
    industry: any;
    location: any;
    address: any;
    doj: any;
    lwd: any;
    experienceLetter: {
        url: any;
        id: any;
    };
    offerLetter: {
        url: any;
        id: any;
    };
    serviceLetter: {
        url: any;
        id: any;
    };
    relievingLetter: {
        url: any;
        id: any;
    };
    form16: {
        url: any;
        id: any;
    }[];
    payslips: {
        url: any;
        id: any;
    }[];
    contacts: {
        id: any;
        contactRole: any;
        contactName: any;
        contactNumber: any;
        contactEmail: any;
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
export declare function deleteAllEmployeeHistory(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<{
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
