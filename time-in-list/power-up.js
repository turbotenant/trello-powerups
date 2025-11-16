/* global TrelloPowerUp, dateFns */

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

// ===== DETECT CONTEXT =====
// Check if we're in an iframe context or main Power-Up context
if (window.location.href.includes("index.html")) {
  // IFRAME CODE - runs when index.html is loaded
  const t = TrelloPowerUp.iframe();

  const renderTimeInList = (history) => {
    const timeListElement = document.getElementById("time-list");

    // Clear previous content
    timeListElement.innerHTML = "";

    // --- DEBUGGING LINE ---
    // Let's display the number of entries in our history array.
    const debugInfo = document.createElement("p");
    debugInfo.style.color = "#888";
    debugInfo.textContent = `(Debug: ${
      history ? history.length : 0
    } history entries found)`;
    timeListElement.appendChild(debugInfo);
    // --- END DEBUGGING ---

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

  // We need to handle the rendering when the iframe (index.html) loads
  window.addEventListener("load", () => {
    console.log("iframe loaded");
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
} else {
  // MAIN POWER-UP CODE - runs when Trello loads the Power-Up
  TrelloPowerUp.initialize({
    "card-back-section": function (t, options) {
      console.log("card-back-section initialized");
      return {
        title: "Time in List Facu",
        icon: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png", // A placeholder icon
        content: {
          type: "iframe",
          url: t.signUrl("./index.html"),
          height: 200, // initial height
        },
      };
    },
  });
}
