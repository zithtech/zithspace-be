import { AuthRequest } from "@/types";
export declare function encrypt(text: string): string;
export declare function decrypt(text: string): string;
export declare function createPersonalDetails(req: AuthRequest, employeeId?: string, tx?: any): Promise<any>;
export declare function getPersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    firstName: string;
    lastName: string;
    gender: string;
    dob: Date;
    profile_pic: any;
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
    aadhaar: string;
    pan: string;
    passport: string;
    employee_code: string;
    status: boolean;
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
    id: string;
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
}[]>;
export declare function updatePersonalDetails(req: AuthRequest, employeeId: string, tx?: any): Promise<any>;
export declare function deletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
    employee: {
        status: boolean;
        id: string;
        tenantId: string;
        employee_code: string;
        first_name: string;
        last_name: string;
        gender: string;
        date_of_birth: Date;
        blood_group: string | null;
        mobile: string;
        work_email: string;
        personal_email: string | null;
        profile_pic: string | null;
        created_by: string;
        updated_by: string | null;
        created_at: Date;
        updated_at: Date;
        profile_pic: string | null;
    };
}>;
export declare function hardDeletePersonalDetails(req: AuthRequest, employeeId: string): Promise<{
    success: boolean;
    message: string;
}>;
