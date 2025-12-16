/* global dayjs */

// --- Holiday Configuration ---

// Rules for calculating US federal holidays.
// This approach ensures holidays are correctly calculated for any year.
const HOLIDAY_RULES = {
  // Fixed date holidays (Month is 0-indexed, Day is 1-indexed)
  fixed: [
    { month: 0, day: 1, name: "New Year's Day" },
    { month: 6, day: 4, name: "Independence Day" },
    { month: 11, day: 25, name: "Christmas Day" },
    { month: 12, day: 31, name: "New Year's Eve" },
    { month: 7, day: 14, name: "TurboTenant Day" },
    // NOTE: Add any other fixed-date holidays your company observes here.
  ],
  // Floating holidays, based on the Nth day of the week in a month.
  floating: [
    { month: 0, dayOfWeek: 1, week: 3, name: "Martin Luther King, Jr. Day" }, // 3rd Monday in January
    { month: 4, dayOfWeek: 1, week: -1, name: "Memorial Day" }, // Last Monday in May
    { month: 8, dayOfWeek: 1, week: 1, name: "Labor Day" }, // 1st Monday in September
    { month: 10, dayOfWeek: 4, week: 4, name: "Thanksgiving Day" }, // 4th Thursday in November
  ],
};

/**
 * Generates a list of holiday dates for a given year based on HOLIDAY_RULES.
 * @param {number} year The year to generate holidays for.
 * @returns {string[]} An array of holiday dates in 'YYYY-MM-DD' format.
 */
const getHolidaysForYear = (year) => {
  const holidays = [];

  // Calculate fixed holidays
  HOLIDAY_RULES.fixed.forEach((rule) => {
    const holiday = dayjs(new Date(year, rule.month, rule.day)).format(
      "YYYY-MM-DD"
    );
    holidays.push(holiday);
  });

  // Calculate floating holidays
  HOLIDAY_RULES.floating.forEach((rule) => {
    let holiday;
    if (rule.week === -1) {
      // Last week of the month - find last occurrence of dayOfWeek
      let day = dayjs(new Date(year, rule.month + 1, 0)); // Last day of month
      while (day.day() !== rule.dayOfWeek) {
        day = day.subtract(1, "day");
      }
      holiday = day;
    } else {
      // Find Nth occurrence of dayOfWeek
      let day = dayjs(new Date(year, rule.month, 1));
      let count = 0;
      while (count < rule.week) {
        if (day.day() === rule.dayOfWeek) {
          count++;
          if (count < rule.week) {
            day = day.add(7, "day");
          }
        } else {
          day = day.add(1, "day");
        }
      }
      holiday = day;
    }

    holidays.push(holiday.format("YYYY-MM-DD"));
  });

  return holidays;
};

/**
 * Calculates business minutes between two dates, excluding weekends and holidays.
 * @param {Date} startDate - The start of the period.
 * @param {Date} endDate - The end of the period.
 * @returns {number} Total business minutes.
 */
const calculateBusinessMinutes = (startDate, endDate) => {
  let totalMinutes = 0;
  const holidaysByYear = {};

  let currentDate = dayjs(startDate);
  const end = dayjs(endDate);

  while (currentDate.isBefore(end)) {
    const year = currentDate.year();
    if (!holidaysByYear[year]) {
      holidaysByYear[year] = getHolidaysForYear(year);
    }
    const holidays = holidaysByYear[year];
    const formattedDate = currentDate.format("YYYY-MM-DD");
    const dayOfWeek = currentDate.day();

    // Check if it's a weekday and not a holiday
    if (dayOfWeek > 0 && dayOfWeek < 6 && !holidays.includes(formattedDate)) {
      const startOfDay = currentDate.startOf("day");
      const endOfDay = currentDate.endOf("day");

      const effectiveStart = currentDate.isSame(startDate, "day")
        ? dayjs(startDate)
        : startOfDay;
      const effectiveEnd = currentDate.isSame(endDate, "day")
        ? dayjs(endDate)
        : endOfDay;

      totalMinutes += effectiveEnd.diff(effectiveStart, "minute");
    }

    currentDate = currentDate.add(1, "day");
  }

  return totalMinutes;
};

/**
 * Checks if a given date is a business day (not a weekend or holiday).
 * @param {dayjs.Dayjs} date - The date to check.
 * @param {Object.<string, string[]>} holidaysByYear - A cache of holidays.
 * @returns {boolean} True if the date is a business day.
 */
const isBusinessDay = (date, holidaysByYear) => {
  const year = date.year();
  if (!holidaysByYear[year]) {
    holidaysByYear[year] = getHolidaysForYear(year);
  }
  const holidays = holidaysByYear[year];
  const formattedDate = date.format("YYYY-MM-DD");
  const dayOfWeek = date.day();

  return dayOfWeek > 0 && dayOfWeek < 6 && !holidays.includes(formattedDate);
};

/**
 * Adds a specified number of business days to a given start date,
 * excluding weekends and holidays.
 * @param {Date} startDate - The date to start from.
 * @param {number} daysToAdd - The number of business days to add.
 * @returns {{endDate: Date, totalDaysAdded: number}} An object containing the final business day and the total calendar days that were added.
 */
function addBusinessDays(startDate, daysToAdd) {
  const holidaysByYear = {};
  let calculatedDate = dayjs(startDate);
  let daysCounted = 0;
  let calendarDays = 0;

  while (daysCounted < daysToAdd) {
    calculatedDate = calculatedDate.add(1, "day");
    calendarDays++;
    if (isBusinessDay(calculatedDate, holidaysByYear)) {
      daysCounted++;
    }
  }

  return {
    endDate: calculatedDate.toDate(),
    totalDaysAdded: calendarDays,
  };
}
