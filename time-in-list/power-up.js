/* global TrelloPowerUp, dateFns */

// --- Holiday Configuration ---
// dummy
// Rules for calculating US federal holidays.
// This approach ensures holidays are correctly calculated for any year.
const HOLIDAY_RULES = {
  // Fixed date holidays (Month is 0-indexed, Day is 1-indexed)
  fixed: [
    { month: 0, day: 1, name: "New Year's Day" },
    { month: 6, day: 4, name: "Independence Day" },
    { month: 11, day: 25, name: "Christmas Day" },
    { month: 12, day: 31, name: "New Year's Eve" },
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
    const holiday = dateFns.format(
      new Date(year, rule.month, rule.day),
      "yyyy-MM-dd"
    );
    holidays.push(holiday);
  });

  // Calculate floating holidays
  HOLIDAY_RULES.floating.forEach((rule) => {
    let holiday;
    if (rule.week === -1) {
      // Last week of the month
      const lastDayOfMonth = dateFns.endOfMonth(new Date(year, rule.month));
      holiday = dateFns.previousDay(lastDayOfMonth, rule.dayOfWeek);
    } else {
      const firstDayOfMonth = new Date(year, rule.month, 1);
      let day = dateFns.startOfMonth(firstDayOfMonth);
      let weekCount = 0;
      while (weekCount < rule.week) {
        day = dateFns.nextDay(day, rule.dayOfWeek);
        weekCount++;
      }
      holiday = day;
    }

    holidays.push(dateFns.format(holiday, "yyyy-MM-dd"));

    // Special case: Day after Thanksgiving
    if (rule.name === "Thanksgiving Day") {
      const dayAfter = dateFns.addDays(holiday, 1);
      holidays.push(dateFns.format(dayAfter, "yyyy-MM-dd"));
    }
  });

  return holidays;
};

/**
 * Calculates the working time between two dates, excluding weekends and holidays.
 * @param {Date} startDate The start of the period.
 * @param {Date} endDate The end of the period.
 * @returns {string} A formatted string representing the duration (e.g., "2d 5h 30m").
 */
const calculateBusinessTime = (startDate, endDate) => {
  let totalMinutes = 0;
  const holidaysByYear = {};

  let currentDate = new Date(startDate);

  while (currentDate < endDate) {
    const year = currentDate.getFullYear();
    if (!holidaysByYear[year]) {
      holidaysByYear[year] = getHolidaysForYear(year);
    }
    const holidays = holidaysByYear[year];
    const formattedDate = dateFns.format(currentDate, "yyyy-MM-dd");
    const dayOfWeek = currentDate.getDay();

    // Check if it's a weekday and not a holiday
    if (dayOfWeek > 0 && dayOfWeek < 6 && !holidays.includes(formattedDate)) {
      const startOfDay = dateFns.startOfDay(currentDate);
      const endOfDay = dateFns.endOfDay(currentDate);

      const effectiveStart = dateFns.isSameDay(currentDate, startDate)
        ? startDate
        : startOfDay;
      const effectiveEnd = dateFns.isSameDay(currentDate, endDate)
        ? endDate
        : endOfDay;

      totalMinutes += dateFns.differenceInMinutes(effectiveEnd, effectiveStart);
    }

    currentDate = dateFns.addDays(currentDate, 1);
  }

  if (totalMinutes < 1) {
    return "Less than a minute";
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  let result = "";
  if (days > 0) result += `${days}d `;
  if (hours > 0) result += `${hours}h `;
  if (minutes > 0) result += `${minutes}m`;

  return result.trim();
};

const t = TrelloPowerUp.iframe();

// Function to calculate time (will be implemented later)
const renderTimeInList = (history) => {
  const timeListElement = document.getElementById("time-list");
  if (!history || history.length === 0) {
    timeListElement.innerHTML = "<p>No movement history yet.</p>";
    return;
  }

  const now = new Date();
  let html = "";

  history.forEach((entry, index) => {
    const startDate = dateFns.parseISO(entry.enteredAt);
    const endDate =
      index < history.length - 1
        ? dateFns.parseISO(history[index + 1].enteredAt)
        : now;

    const duration = calculateBusinessTime(startDate, endDate);

    html += `<div class="list-item">
               <span class="list-name">${entry.listName}</span>
               <span class="list-time">${duration}</span>
             </div>`;
  });

  timeListElement.innerHTML = html;
};

TrelloPowerUp.initialize({
  "card-back-section": function (t, options) {
    return {
      title: "Time in List",
      icon: "https://cdn.glitch.com/2442c68d-7b6d-4b69-9d13-fe175de664c4%2Ficon.svg", // A placeholder icon
      content: {
        type: "iframe",
        url: t.signUrl("./index.html"),
        height: 200, // initial height
      },
    };
  },
});

// We need to handle the rendering when the iframe (index.html) loads
window.addEventListener("load", () => {
  t.card("id", "idList")
    .then((card) => {
      return t.list("name").then((list) => {
        return { card, list };
      });
    })
    .then(({ card, list }) => {
      return t
        .get(card.id, "private", "timeInListHistory", [])
        .then((history) => {
          const lastEntry =
            history.length > 0 ? history[history.length - 1] : null;

          if (!lastEntry || lastEntry.listId !== card.idList) {
            // Card is in a new list, or this is the first time we're seeing it.
            const newHistory = [
              ...history,
              {
                listId: card.idList,
                listName: list.name,
                enteredAt: new Date().toISOString(),
              },
            ];
            // Save the updated history and then render it.
            return t
              .set(card.id, "private", "timeInListHistory", newHistory)
              .then(() => newHistory);
          } else {
            // Card has not moved since last view.
            return history;
          }
        });
    })
    .then((history) => {
      renderTimeInList(history);
      // We also need to resize the iframe to fit the content
      t.sizeTo("#content");
    });
});
