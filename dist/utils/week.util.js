// import dayjs from "dayjs";
// import utc from "dayjs/plugin/utc";
// import timezone from "dayjs/plugin/timezone";
// dayjs.extend(utc);
// dayjs.extend(timezone);
// const IST = "Asia/Kolkata";
// /**
//  * ALWAYS returns Sunday → Saturday
//  * Stored correctly in UTC DB
//  */
// export function getSundayToSaturdayWeek(date: string | Date) {
//   const d = dayjs.tz(date, IST);
//   const weekStart = d.day(0).startOf("day").utc().toDate(); // Sunday IST → UTC
//   const weekEnd = d.day(6).endOf("day").utc().toDate();     // Saturday IST → UTC
//   return { weekStart, weekEnd };
// }
//# sourceMappingURL=week.util.js.map