import axios from "axios";

export interface FixedHoliday {
  date: string;
  name: string;
}

export const HolidayService = {
  async getFixedHolidays(token: string): Promise<FixedHoliday[]> {
    try {
      const res = await axios.get(
        `${process.env.API_BASE_URL}/api/fixed-holidays`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      return res.data?.data ?? [];
    } catch (err) {
      console.error("Holiday fetch failed", err);
      return [];
    }
  },
};
