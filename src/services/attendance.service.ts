import axios from "axios";
import { AttendanceResponse } from "@/types/salary";

export const AttendanceService = {
  async getMyAttendanceSummary(
    token: string,
    month: number,
    year: number
  ): Promise<AttendanceResponse | null> {
    try {
      const res = await axios.get(
        `${process.env.API_BASE_URL}/api/attendance/my-summary`,
        {
          params: { month, year },
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return res.data?.attendance ?? null;
    } catch (err) {
      console.error("Attendance fetch failed", err);
      return null;
    }
  },
};
