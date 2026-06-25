import { AuthRequest } from "@/types";
import { TenantClient } from "@/db/onboardingPool";
export declare function encrypt(text: string): string;
export declare function decrypt(text: string): string;
export declare function createPersonalDetails(req: AuthRequest, _employeeId?: string, client?: TenantClient): Promise<any>;
export declare function getPersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    firstName: any;
    lastName: any;
    gender: any;
    dob: any;
    profile_pic: any;
    bloodGroup: any;
    mobile: any;
    workEmail: any;
    personalEmail: any;
    address: {
        current: {
            c_flat: any;
            c_area: any;
            c_city: any;
            c_state: any;
            c_country: any;
            c_pincode: any;
        } | {
            c_flat?: undefined;
            c_area?: undefined;
            c_city?: undefined;
            c_state?: undefined;
            c_country?: undefined;
            c_pincode?: undefined;
        };
        permanent: {
            p_flat: any;
            p_area: any;
            p_city: any;
            p_state: any;
            p_country: any;
            p_pincode: any;
        } | {
            p_flat?: undefined;
            p_area?: undefined;
            p_city?: undefined;
            p_state?: undefined;
            p_country?: undefined;
            p_pincode?: undefined;
        };
    };
    relationship: any;
    relationName: any;
    relationMobile: any;
    aadhaar: string;
    pan: string;
    passport: string;
    employee_code: any;
    status: any;
}>;
export declare function getAllEmployees(req: AuthRequest): Promise<{
    id: any;
    firstName: any;
    lastName: any;
    name: string;
    gender: any;
    dob: any;
    profile_pic: any;
    bloodGroup: any;
    mobile: any;
    workEmail: any;
    personalEmail: any;
    departmentId: any;
    departmentName: any;
    positionTitle: any;
    address: {
        current: {
            c_flat: any;
            c_area: any;
            c_city: any;
            c_state: any;
            c_country: any;
            c_pincode: any;
        } | {
            c_flat?: undefined;
            c_area?: undefined;
            c_city?: undefined;
            c_state?: undefined;
            c_country?: undefined;
            c_pincode?: undefined;
        };
        permanent: {
            p_flat: any;
            p_area: any;
            p_city: any;
            p_state: any;
            p_country: any;
            p_pincode: any;
        } | {
            p_flat?: undefined;
            p_area?: undefined;
            p_city?: undefined;
            p_state?: undefined;
            p_country?: undefined;
            p_pincode?: undefined;
        };
    };
    relationship: any;
    relationName: any;
    relationMobile: any;
    aadhaar: string;
    pan: string;
    passport: string;
    employeeCode: any;
    employee_code: any;
    status: any;
    created_at: any;
}[]>;
export declare function getUpcomingBirthdays(req: AuthRequest): Promise<{
    id: any;
    firstName: any;
    lastName: any;
    dateOfBirth: any;
}[]>;
export declare function updatePersonalDetails(req: AuthRequest, employeeId: string, client?: TenantClient): Promise<any>;
export declare function deletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
    employee: any;
}>;
export declare function hardDeletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
