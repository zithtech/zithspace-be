import { prisma } from "@/config/database";

import { AuthRequest } from "@/types";
import { uploadEmployeeAssetToR2, deleteFileFromR2 } from "@/utils/r2Client";

export async function createPersonalDetails(
  req: AuthRequest,
  employeeId?: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const { personal } = req.body;

    if (!personal) {
      throw new Error("Personal details are missing from the request body");
    }

    // ✅ Create employee (without profile pic first)
    const employee = await tx.employee.create({
      data: {
        tenantId: req.tenantId,
        employee_code: `EMP-${Date.now()}`,
        first_name: personal.firstName,
        last_name: personal.lastName,
        gender: personal.gender,
        date_of_birth: new Date(personal.dob),

        blood_group: personal.bloodGroup,
        mobile: personal.mobile,
        work_email: personal.workEmail,
        personal_email: personal.personalEmail,
        status: true,
        created_by: req.user.id,
      },
    });

    // ✅ Handle profile image upload to R2
    if (personal.profilePic) {
      let profilePicUrl: string;
      if (personal.profilePic.startsWith("http")) {
        profilePicUrl = personal.profilePic;
      } else {
        profilePicUrl = await uploadEmployeeAssetToR2({
          base64: personal.profilePic,
          fileName: "profile.png", // A default name for profile pictures
          tenantId: req.tenantId!,
          employeeId: employee.id,
          folder: "profile-pictures",
        });
      }
      // Now update the employee with the URL
      await tx.employee.update({
        where: { id: employee.id },
        data: { profile_pic: profilePicUrl },
      });
    }

    // ✅ Create addresses
    let currentAddr = personal.address?.current;
    let permAddr = personal.address?.permanent;

    // Fallback for flat structure if nested address is missing
    if (!currentAddr && !permAddr) {
      currentAddr = {
        c_flat: personal.c_flat,
        c_area: personal.c_area,
        c_city: personal.c_city,
        c_state: personal.c_state,
        c_country: personal.c_country,
        c_pincode: personal.c_pincode,
      };
      permAddr = {
        p_flat: personal.p_flat,
        p_area: personal.p_area,
        p_city: personal.p_city,
        p_state: personal.p_state,
        p_country: personal.p_country,
        p_pincode: personal.p_pincode,
      };
    }

    currentAddr = currentAddr || {};
    permAddr = permAddr || {};

    await tx.employeeAddress.createMany({
      data: [
        {
          employeeId: employee.id,
          tenantId: req.tenantId,
          addressType: "CURRENT",
          doorNo: currentAddr.c_flat,
          area: currentAddr.c_area,
          city: currentAddr.c_city,
          state: currentAddr.c_state,
          country: currentAddr.c_country,
          pincode: currentAddr.c_pincode,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
        {
          employeeId: employee.id,
          tenantId: req.tenantId,
          addressType: "PERMANENT",
          doorNo: permAddr.p_flat,
          area: permAddr.p_area,
          city: permAddr.p_city,
          state: permAddr.p_state,
          country: permAddr.p_country,
          pincode: permAddr.p_pincode,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
      ],
    });

    // ✅ Create emergency contact
    if (
      personal.relationship &&
      personal.relationName &&
      personal.relationMobile
    ) {
      await tx.employeeEmergencyContact.create({
        data: {
          employeeId: employee.id,
          relationship: personal.relationship,
          name: personal.relationName,
          mobile: personal.relationMobile,
          createdById: req.user.id,
        },
      });
    }

    // ✅ Create identity
    if (personal.aadhaar || personal.pan) {
      await tx.employeeIdentity.create({
        data: {
          employeeId: employee.id,
          aadhaarNumber: personal.aadhaar || "",
          panNumber: personal.pan || "",
          passportNumber: personal.passport || null,
          createdById: req.user.id,
        },
      });
    }

    return employee;
  } catch (error: any) {
    console.error("Error in createPersonalDetails:", error);
    throw new Error(`Failed to create personal details: ${error.message}`);
  }
}

// ✅ GET Personal Details
export async function getPersonalDetails(req: AuthRequest, employeeId: string) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const employee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
      include: {
        addresses: true,
        emergencyContacts: true,
        employeeIdentity: true,
      },
    });

    if (!employee) {
      throw new Error("Employee not found");
    }

    // Transform data to match the input format
    const currentAddress = employee.addresses.find(
      (addr) => addr.addressType === "CURRENT",
    );
    const permanentAddress = employee.addresses.find(
      (addr) => addr.addressType === "PERMANENT",
    );
    const emergencyContact = employee.emergencyContacts[0];
    const identity = Array.isArray(employee.employeeIdentity)
      ? employee.employeeIdentity[0]
      : employee.employeeIdentity;

    return {
      firstName: employee.first_name,
      lastName: employee.last_name,
      gender: employee.gender,
      dob: employee.date_of_birth,
      profile_pic: (employee as any).profile_pic,
      bloodGroup: employee.blood_group,
      mobile: employee.mobile,
      workEmail: employee.work_email,
      personalEmail: employee.personal_email,
      address: {
        current: currentAddress
          ? {
              c_flat: currentAddress.doorNo,
              c_area: currentAddress.area,
              c_city: currentAddress.city,
              c_state: currentAddress.state,
              c_country: currentAddress.country,
              c_pincode: currentAddress.pincode,
            }
          : {},
        permanent: permanentAddress
          ? {
              p_flat: permanentAddress.doorNo,
              p_area: permanentAddress.area,
              p_city: permanentAddress.city,
              p_state: permanentAddress.state,
              p_country: permanentAddress.country,
              p_pincode: permanentAddress.pincode,
            }
          : {},
      },
      relationship: emergencyContact?.relationship || null,
      relationName: emergencyContact?.name || null,
      relationMobile: emergencyContact?.mobile || null,
      aadhaar: identity?.aadhaarNumber || null,
      pan: identity?.panNumber || null,
      passport: identity?.passportNumber || null,
      employee_code: employee.employee_code,
      status: employee.status,
    };
  } catch (error: any) {
    console.error("Error in getPersonalDetails:", error);
    throw new Error(`Failed to fetch personal details: ${error.message}`);
  }
}

// ✅ GET All Employees (List)
export async function getAllEmployees(req: AuthRequest) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    const employees = await prisma.employee.findMany({
      where: {
        tenantId: req.tenantId,
        status: true,
      },
      include: {
        addresses: true,
        emergencyContacts: true,
        employeeIdentity: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });

    return employees.map((employee: any) => {
      const currentAddress = employee.addresses.find(
        (addr) => addr.addressType === "CURRENT",
      );
      const permanentAddress = employee.addresses.find(
        (addr) => addr.addressType === "PERMANENT",
      );
      const emergencyContact = employee.emergencyContacts[0];
      const identity = Array.isArray(employee.employeeIdentity)
        ? employee.employeeIdentity[0]
        : employee.employeeIdentity;

      return {
        id: employee.id,
        firstName: employee.first_name,
        lastName: employee.last_name,
        gender: employee.gender,
        dob: employee.date_of_birth,
        profile_pic: employee.profile_pic,
        bloodGroup: employee.blood_group,
        mobile: employee.mobile,
        workEmail: employee.work_email,
        personalEmail: employee.personal_email,
        address: {
          current: currentAddress
            ? {
                c_flat: currentAddress.doorNo,
                c_area: currentAddress.area,
                c_city: currentAddress.city,
                c_state: currentAddress.state,
                c_country: currentAddress.country,
                c_pincode: currentAddress.pincode,
              }
            : {},
          permanent: permanentAddress
            ? {
                p_flat: permanentAddress.doorNo,
                p_area: permanentAddress.area,
                p_city: permanentAddress.city,
                p_state: permanentAddress.state,
                p_country: permanentAddress.country,
                p_pincode: permanentAddress.pincode,
              }
            : {},
        },
        relationship: emergencyContact?.relationship || null,
        relationName: emergencyContact?.name || null,
        relationMobile: emergencyContact?.mobile || null,
        aadhaar: identity?.aadhaarNumber || null,
        pan: identity?.panNumber || null,
        passport: identity?.passportNumber || null,
        employee_code: employee.employee_code,
        status: employee.status,
        created_at: employee.created_at,
      };
    });
  } catch (error: any) {
    console.error("Error in getAllEmployees:", error);
    throw new Error(`Failed to fetch employees: ${error.message}`);
  }
}

// ✅ UPDATE Personal Details
export async function updatePersonalDetails(
  req: AuthRequest,
  employeeId: string,
  tx: any = prisma,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // ✅ Validate employeeId to prevent Prisma error
    if (!employeeId || employeeId === "undefined" || employeeId === "null") {
      throw new Error(
        "Invalid Employee ID provided for update (in createEmployeeDetailes)",
      );
    }

    const { personal } = req.body;

    if (!personal) {
      throw new Error("Personal details are missing from the request body");
    }

    // Verify employee exists and belongs to tenant
    const existingEmployee = await tx.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!existingEmployee) {
      throw new Error("Employee not found");
    }

    // ✅ Update employee basic info

    const updateData: any = {
      updated_by: req.user.id,
    };

    if (personal?.firstName) updateData.first_name = personal.firstName;

    if (personal?.lastName) updateData.last_name = personal.lastName;

    if (personal?.gender) updateData.gender = personal.gender;

    if (personal?.bloodGroup) updateData.blood_group = personal.bloodGroup;

    if (personal?.mobile) updateData.mobile = personal.mobile;

    if (personal?.workEmail) updateData.work_email = personal.workEmail;

    if (personal?.personalEmail)
      updateData.personal_email = personal.personalEmail;

    if (personal?.dob) {
      const parsedDate = new Date(personal.dob);
      if (!isNaN(parsedDate.getTime())) {
        updateData.date_of_birth = parsedDate;
      }
    }

    // ✅ Handle profile image upload
    if (
      personal.profilePic &&
      personal.profilePic !== existingEmployee.profile_pic
    ) {
      let newProfilePicUrl: string | null = null;
      // If it's a new base64 string, upload it
      if (personal.profilePic.startsWith("data:")) {
        newProfilePicUrl = await uploadEmployeeAssetToR2({
          base64: personal.profilePic,
          fileName: "profile.png",
          tenantId: req.tenantId!,
          employeeId: employeeId,
          folder: "profile-pictures",
        });
      } else if (personal.profilePic.startsWith("http")) {
        // If it's a new URL, use it
        newProfilePicUrl = personal.profilePic;
      }

      if (newProfilePicUrl) {
        updateData.profile_pic = newProfilePicUrl;
      }
    }

    const employee = await tx.employee.update({
      where: { id: employeeId },
      data: updateData,
    });

    // ✅ Update addresses
    let currentAddr = personal.address?.current;
    let permAddr = personal.address?.permanent;

    // Fallback for flat structure if nested address is missing
    if (!currentAddr && !permAddr) {
      currentAddr = {
        c_flat: personal.c_flat,
        c_area: personal.c_area,
        c_city: personal.c_city,
        c_state: personal.c_state,
        c_country: personal.c_country,
        c_pincode: personal.c_pincode,
      };
      permAddr = {
        p_flat: personal.p_flat,
        p_area: personal.p_area,
        p_city: personal.p_city,
        p_state: personal.p_state,
        p_country: personal.p_country,
        p_pincode: personal.p_pincode,
      };
    }

    currentAddr = currentAddr || {};
    permAddr = permAddr || {};

    // Delete existing addresses and create new ones
    await tx.employeeAddress.deleteMany({
      where: { employeeId: employeeId },
    });

    await tx.employeeAddress.createMany({
      data: [
        {
          employeeId: employee.id,
          tenantId: req.tenantId,
          addressType: "CURRENT",
          doorNo: currentAddr.c_flat,
          area: currentAddr.c_area,
          city: currentAddr.c_city,
          state: currentAddr.c_state,
          country: currentAddr.c_country,
          pincode: currentAddr.c_pincode,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
        {
          employeeId: employee.id,
          tenantId: req.tenantId,
          addressType: "PERMANENT",
          doorNo: permAddr.p_flat,
          area: permAddr.p_area,
          city: permAddr.p_city,
          state: permAddr.p_state,
          country: permAddr.p_country,
          pincode: permAddr.p_pincode,
          createdById: req.user.id,
          updatedById: req.user.id,
        },
      ],
    });

    // ✅ Update emergency contact
    await tx.employeeEmergencyContact.deleteMany({
      where: { employeeId: employeeId },
    });

    if (
      personal.relationship &&
      personal.relationName &&
      personal.relationMobile
    ) {
      await tx.employeeEmergencyContact.create({
        data: {
          employeeId: employee.id,
          relationship: personal.relationship,
          name: personal.relationName,
          mobile: personal.relationMobile,
          createdById: req.user.id,
        },
      });
    }

    // ✅ Update identity
    const existingIdentity = await tx.employeeIdentity.findFirst({
      where: { employeeId: employeeId },
    });

    if (existingIdentity) {
      await tx.employeeIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          aadhaarNumber: personal.aadhaar || "",
          panNumber: personal.pan || "",
          passportNumber: personal.passport || null,
          updatedById: req.user.id,
        },
      });
    } else if (personal.aadhaar || personal.pan) {
      await tx.employeeIdentity.create({
        data: {
          employeeId: employee.id,
          aadhaarNumber: personal.aadhaar || "",
          panNumber: personal.pan || "",
          passportNumber: personal.passport || null,
          createdById: req.user.id,
        },
      });
    }

    return employee;
  } catch (error: any) {
    console.error("Error in updatePersonalDetails:", error);
    throw new Error(`Failed to update personal details: ${error.message}`);
  }
}

// ✅ DELETE Personal Details (Soft delete by setting status to false)
export async function deletePersonalDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!existingEmployee) {
      throw new Error("Employee not found");
    }

    // Soft delete by setting status to false
    const employee = await prisma.employee.update({
      where: { id: employeeId },
      data: {
        status: false,
        updated_by: req.user.id,
      },
    });

    return {
      success: true,
      message: "Employee deleted successfully",
      employee,
    };
  } catch (error: any) {
    console.error("Error in deletePersonalDetails:", error);
    throw new Error(`Failed to delete employee: ${error.message}`);
  }
}

// ✅ HARD DELETE Personal Details (Permanently remove from database)
export async function hardDeletePersonalDetails(
  req: AuthRequest,
  employeeId: string,
) {
  try {
    if (!req.user?.id || !req.tenantId) throw new Error("Unauthorized");

    // Verify employee exists and belongs to tenant
    const existingEmployee = await prisma.employee.findFirst({
      where: {
        id: employeeId,
        tenantId: req.tenantId,
      },
    });

    if (!existingEmployee) {
      throw new Error("Employee not found");
    }

    // Delete related records first (due to foreign key constraints)
    await prisma.employeeAddress.deleteMany({
      where: { employeeId: employeeId },
    });

    await prisma.employeeEmergencyContact.deleteMany({
      where: { employeeId: employeeId },
    });

    await prisma.employeeIdentity.deleteMany({
      where: { employeeId: employeeId },
    });

    // Finally delete the employee
    await prisma.employee.delete({
      where: { id: employeeId },
    });

    return { success: true, message: "Employee permanently deleted" };
  } catch (error: any) {
    console.error("Error in hardDeletePersonalDetails:", error);
    throw new Error(`Failed to permanently delete employee: ${error.message}`);
  }
}
