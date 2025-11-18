/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME */

// === DEBUG LOGGING ===
console.log("🚀 Power-Up script loaded!");
console.log("📍 Current URL:", window.location.href);
console.log("🔍 TrelloPowerUp available:", typeof TrelloPowerUp);
console.log("📅 dayjs available:", typeof dayjs);
// === END DEBUG ===

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

    // Special case: Day after Thanksgiving
    if (rule.name === "Thanksgiving Day") {
      holidays.push(holiday.add(1, "day").format("YYYY-MM-DD"));
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
  window.addEventListener("load", () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });

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
        const startDate = dayjs(entry.enteredAt).toDate();
        const endDate =
          index < history.length - 1
            ? dayjs(history[index + 1].enteredAt).toDate()
            : now;

        const duration = calculateBusinessTime(startDate, endDate);

        html += `<div class="list-item">
                   <span class="list-name">${entry.listName}</span>
                   <span class="list-time">${duration}</span>
                 </div>`;
      });

      timeListElement.innerHTML = html;
    };

    t.getRestApi()
      .isAuthorized()
      .then(function (isAuthorized) {
        if (!isAuthorized) {
          document.getElementById("time-list").innerHTML =
            '<p>Please authorize this Power-Up to see card history.</p><button id="auth-btn-iframe">Authorize</button>';
          document
            .getElementById("auth-btn-iframe")
            .addEventListener("click", function () {
              t.getRestApi().authorize({ scope: "read" });
            });
          t.sizeTo("#content");
          return;
        }

        t.card("id").then(function (card) {
          return t
            .getRestApi()
            .get(
              "/cards/" +
                card.id +
                "/actions?filter=updateCard:idList,createCard"
            )
            .then(function (actions) {
              const history = actions
                .filter((action) => {
                  return (
                    action.type === "createCard" ||
                    (action.type === "updateCard" && action.data.listAfter)
                  );
                })
                .map((action) => {
                  const list =
                    action.type === "createCard"
                      ? action.data.list
                      : action.data.listAfter;
                  return {
                    listName: list.name,
                    enteredAt: action.date,
                  };
                })
                .reverse(); // Trello returns actions newest-first

              renderTimeInList(history);
              t.sizeTo("#content");
            });
        });
      })
      .catch(function (error) {
        console.error("Error fetching card history:", error);
        document.getElementById("time-list").innerHTML =
          "<p>Error loading history.</p>";
      });
  });
} else {
  // MAIN POWER-UP CODE - runs when Trello loads the Power-Up
  console.log("🎯 Initializing Power-Up in main context");

  TrelloPowerUp.initialize(
    {
      /*
      "on-enable": function (t, options) {
        console.log("Power-Up enabled, checking authorization.");
        return t
          .getRestApi()
          .isAuthorized()
          .then(function (isAuthorized) {
            if (isAuthorized) {
              return;
            } else {
              return t.popup({
                title: "Authorize Account",
                url: "./authorize.html",
                height: 140,
              });
            }
          });
      },
      */
      "card-back-section": function (t, options) {
        console.log("✅ card-back-section callback triggered");
        return {
          title: "Time in List Facu",
          icon: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
          content: {
            type: "iframe",
            url: t.signUrl(
              "https://turbotenant.github.io/trello-powerups/time-in-list/index.html"
            ),
            height: 200,
          },
        };
      },
      /*
      "card-badges": function (t, options) {
        return t
          .getRestApi()
          .isAuthorized()
          .then(function (isAuthorized) {
            if (!isAuthorized) {
              return []; // Don't show badge if not authorized
            }
            return t.card("id").then(function (card) {
              return t
                .getRestApi()
                .get(
                  "/cards/" +
                    card.id +
                    "/actions?filter=updateCard:idList,createCard&limit=1"
                )
                .then(function (actions) {
                  if (actions && actions.length > 0) {
                    const lastMoveDate = dayjs(actions[0].date).toDate();
                    const duration = calculateBusinessTime(
                      lastMoveDate,
                      new Date()
                    );
                    return [
                      {
                        text: `⏱️ ${duration}`,
                        color: "blue",
                      },
                    ];
                  }
                  return [];
                });
            });
          });
      },
      "card-detail-badges": function (t, options) {
        return t
          .getRestApi()
          .isAuthorized()
          .then(function (isAuthorized) {
            if (!isAuthorized) {
              return []; // Don't show badge if not authorized
            }
            return t.card("id").then(function (card) {
              return t
                .getRestApi()
                .get(
                  "/cards/" +
                    card.id +
                    "/actions?filter=updateCard:idList,createCard&limit=1"
                )
                .then(function (actions) {
                  if (actions && actions.length > 0) {
                    const lastMoveDate = dayjs(actions[0].date).toDate();
                    const duration = calculateBusinessTime(
                      lastMoveDate,
                      new Date()
                    );
                    return [
                      {
                        title: "Time in Current List",
                        text: duration,
                        color: "blue",
                      },
                    ];
                  }
                  return [];
                });
            });
          });
      },
      "board-buttons": function (t, options) {
        console.log("🔘 board-buttons callback triggered");
        return [
          {
            icon: {
              dark: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
              light: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
            },
            text: "Time Tracking",
            callback: function (t) {
              return t.popup({
                title: "Time in List",
                url: "./board-stats.html",
                height: 300,
              });
            },
          },
        ];
      },
      */
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    }
  );

  console.log("✨ Power-Up initialization complete");
}
