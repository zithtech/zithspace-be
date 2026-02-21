import { AuthRequest } from "@/types";
export declare function createPersonalDetails(req: AuthRequest, employeeId?: string, tx?: any): Promise<any>;
export declare function getPersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    firstName: string;
    lastName: string;
    gender: string;
    dob: Date;
    bloodGroup: string;
    mobile: string;
    workEmail: string;
    personalEmail: string;
    address: {
        current: {
            c_flat: string;
            c_area: string;
            c_city: string;
            c_state: string;
            c_country: string;
            c_pincode: string;
        } | {
            c_flat?: undefined;
            c_area?: undefined;
            c_city?: undefined;
            c_state?: undefined;
            c_country?: undefined;
            c_pincode?: undefined;
        };
        permanent: {
            p_flat: string;
            p_area: string;
            p_city: string;
            p_state: string;
            p_country: string;
            p_pincode: string;
        } | {
            p_flat?: undefined;
            p_area?: undefined;
            p_city?: undefined;
            p_state?: undefined;
            p_country?: undefined;
            p_pincode?: undefined;
        };
    };
    relationship: string;
    relationName: string;
    relationMobile: string;
    aadhaar: any;
    pan: any;
    passport: any;
    employee_code: string;
    status: boolean;
}>;
export declare function getAllEmployees(req: AuthRequest): Promise<{
    id: string;
    firstName: string;
    lastName: string;
    gender: string;
    dob: Date;
    bloodGroup: string;
    mobile: string;
    workEmail: string;
    personalEmail: string;
    address: {
        current: {
            c_flat: string;
            c_area: string;
            c_city: string;
            c_state: string;
            c_country: string;
            c_pincode: string;
        } | {
            c_flat?: undefined;
            c_area?: undefined;
            c_city?: undefined;
            c_state?: undefined;
            c_country?: undefined;
            c_pincode?: undefined;
        };
        permanent: {
            p_flat: string;
            p_area: string;
            p_city: string;
            p_state: string;
            p_country: string;
            p_pincode: string;
        } | {
            p_flat?: undefined;
            p_area?: undefined;
            p_city?: undefined;
            p_state?: undefined;
            p_country?: undefined;
            p_pincode?: undefined;
        };
    };
    relationship: string;
    relationName: string;
    relationMobile: string;
    aadhaar: any;
    pan: any;
    passport: any;
    employee_code: string;
    status: boolean;
    created_at: Date;
}[]>;
export declare function updatePersonalDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<any>;
export declare function deletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
    employee: {
        tenantId: string;
        status: boolean;
        id: string;
        mobile: string;
        employee_code: string;
        first_name: string;
        last_name: string;
        gender: string;
        date_of_birth: Date;
        blood_group: string | null;
        work_email: string;
        personal_email: string | null;
        created_by: string;
        updated_by: string | null;
        created_at: Date;
        updated_at: Date;
    };
}>;
export declare function hardDeletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
