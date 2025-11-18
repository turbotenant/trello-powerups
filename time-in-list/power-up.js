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

// ===== SHARED HELPER FUNCTIONS =====

function showAuthorizePopup(t) {
  return t.popup({
    title: "Authorize to continue",
    url: "./authorize.html",
  });
}

/**
 * Gets the authorization token from the Trello API.
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<string|null>} The token or null if not authorized.
 */
const getAuthToken = async (t) => {
  const api = await t.getRestApi();
  return await api.getToken();
};

/**
 * Extracts the creation timestamp from a Trello card ID.
 * Trello IDs are MongoDB ObjectIDs where the first 8 hex characters encode the Unix timestamp.
 * @param {string} cardId - The Trello card ID.
 * @returns {Date} The creation date of the card.
 */
const getCardCreationDate = (cardId) => {
  const timestamp = parseInt(cardId.substring(0, 8), 16);
  return new Date(timestamp * 1000);
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
 * Formats business minutes into a human-readable duration string.
 * @param {number} totalMinutes - Total minutes to format.
 * @returns {string} Formatted duration (e.g., "2d 5h 30m").
 */
const formatBusinessTime = (totalMinutes) => {
  if (totalMinutes < 1) {
    return "Less than a minute";
  }

  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  // Format based on duration length for better readability
  // Months (30+ days)
  if (days >= 30) {
    const months = Math.floor(days / 30);
    return months === 1 ? "1 month" : `${months} months`;
  }

  // Weeks (7+ days)
  if (days >= 7) {
    const weeks = Math.floor(days / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }

  // Days
  if (days > 0) {
    if (hours === 0 && minutes === 0) {
      return days === 1 ? "1 day" : `${days} days`;
    }
    // Show days + hours for partial days
    let result = days === 1 ? "1 day" : `${days} days`;
    if (hours > 0) result += ` ${hours}h`;
    return result;
  }

  // Hours
  if (hours > 0) {
    if (minutes === 0) {
      return hours === 1 ? "1 hour" : `${hours} hours`;
    }
    return `${hours}h ${minutes}m`;
  }

  // Minutes only
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
};

/**
 * Calculates the working time between two dates, excluding weekends and holidays.
 * @param {Date} startDate - The start of the period.
 * @param {Date} endDate - The end of the period.
 * @returns {string} A formatted string representing the duration (e.g., "2d 5h 30m").
 */
const calculateBusinessTime = (startDate, endDate) => {
  const totalMinutes = calculateBusinessMinutes(startDate, endDate);
  return formatBusinessTime(totalMinutes);
};

/**
 * Builds card movement history from Trello actions.
 * Handles both regular cards and copied cards (which lack createCard actions).
 * @param {Array} actions - Array of Trello actions.
 * @param {string} cardId - The card ID.
 * @returns {Array} History array with listName and enteredAt properties.
 */
const buildCardHistory = (actions, cardId) => {
  const history = actions
    .filter(
      (action) =>
        action.type === "createCard" ||
        (action.type === "updateCard" && action.data.listAfter)
    )
    .map((action) => ({
      listName:
        action.type === "createCard"
          ? action.data.list.name
          : action.data.listAfter.name,
      enteredAt: action.date,
    }))
    .reverse(); // Trello returns actions newest-first

  // If no createCard action exists (copied cards), add initial entry using card ID timestamp
  if (history.length > 0 && actions.length > 0) {
    const firstAction = actions[actions.length - 1]; // Oldest action

    // Check if the first action is NOT a createCard
    if (firstAction.type === "updateCard" && firstAction.data.listBefore) {
      // Card was moved, so it existed before - extract creation time from card ID
      const creationDate = getCardCreationDate(cardId);

      // Add the initial list entry at the beginning
      history.unshift({
        listName: firstAction.data.listBefore.name,
        enteredAt: creationDate.toISOString(),
      });
    }
  }

  return history;
};

/**
 * Gets pause events from card storage.
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<Array>} Array of pause events with pausedAt and resumedAt timestamps.
 */
const getPauseEvents = async (t) => {
  const pauseEvents = await t.get("card", "private", "pauseEvents");
  return pauseEvents || [];
};

/**
 * Saves a pause or resume event to card storage.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string|null} pausedAt - ISO timestamp when paused, or null if resuming.
 * @param {string|null} resumedAt - ISO timestamp when resumed, or null if pausing.
 * @returns {Promise<void>}
 */
const savePauseEvent = async (t, pausedAt, resumedAt) => {
  const pauseEvents = await getPauseEvents(t);

  if (pausedAt && !resumedAt) {
    // Creating a new pause event
    pauseEvents.push({ pausedAt, resumedAt: null });
  } else if (resumedAt && pauseEvents.length > 0) {
    // Resuming - update the last pause event
    const lastEvent = pauseEvents[pauseEvents.length - 1];
    if (lastEvent && !lastEvent.resumedAt) {
      lastEvent.resumedAt = resumedAt;
    }
  }

  await t.set("card", "private", "pauseEvents", pauseEvents);
};

/**
 * Calculates the total paused time in minutes from pause events.
 * @param {Array} pauseEvents - Array of pause events.
 * @returns {number} Total paused minutes.
 */
const calculateTotalPausedMinutes = (pauseEvents) => {
  if (!pauseEvents || pauseEvents.length === 0) {
    return 0;
  }

  let totalPausedMinutes = 0;
  const now = new Date();

  pauseEvents.forEach((event) => {
    if (event.pausedAt) {
      const pausedAt = new Date(event.pausedAt);
      const resumedAt = event.resumedAt ? new Date(event.resumedAt) : now;

      // Calculate the paused duration using business time calculation
      totalPausedMinutes += calculateBusinessMinutes(pausedAt, resumedAt);
    }
  });

  return totalPausedMinutes;
};

/**
 * Checks if a card is currently paused.
 * @param {Array} pauseEvents - Array of pause events.
 * @returns {boolean} True if currently paused.
 */
const isCardPaused = (pauseEvents) => {
  if (!pauseEvents || pauseEvents.length === 0) {
    return false;
  }

  const lastEvent = pauseEvents[pauseEvents.length - 1];
  return lastEvent && lastEvent.pausedAt && !lastEvent.resumedAt;
};

/**
 * Toggles the pause/resume state of a card's timer.
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<boolean>} The new pause state (true if paused, false if resumed).
 */
const togglePauseResume = async (t) => {
  const now = new Date().toISOString();
  const pauseEvents = await getPauseEvents(t);
  const isPaused = isCardPaused(pauseEvents);

  if (isPaused) {
    // Resume the timer
    await savePauseEvent(t, null, now);
    return false; // Now active
  } else {
    // Pause the timer
    await savePauseEvent(t, now, null);
    return true; // Now paused
  }
};

// ===== DETECT CONTEXT =====
// Check if we're in an iframe context or main Power-Up context
if (window.location.href.includes("index.html")) {
  // IFRAME CODE - runs when index.html is loaded
  window.addEventListener("load", async () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });
    try {
      const renderTimeInList = (history, pauseEvents, t) => {
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
          const noHistoryMsg = document.createElement("p");
          noHistoryMsg.textContent = "No movement history yet.";
          timeListElement.appendChild(noHistoryMsg);
          return;
        }

        const now = new Date();

        // First pass: calculate durations in minutes for percentage calculation
        const listData = history.map((entry, index) => {
          const startDate = dayjs(entry.enteredAt).toDate();
          const endDate =
            index < history.length - 1
              ? dayjs(history[index + 1].enteredAt).toDate()
              : now;

          const minutes = calculateBusinessMinutes(startDate, endDate);

          return {
            listName: entry.listName,
            minutes: minutes,
            formatted: formatBusinessTime(minutes),
          };
        });

        // Calculate total minutes for percentage
        const totalMinutes = listData.reduce(
          (sum, item) => sum + item.minutes,
          0
        );

        // Second pass: render with progress bars
        // Add Pause/Resume button at the top
        const isPaused = isCardPaused(pauseEvents);
        const buttonClass = isPaused
          ? "pause-button paused"
          : "pause-button active";
        const buttonText = isPaused ? "⏯️ Resume Timer" : "⏸️ Pause Timer";
        const buttonBgColor = isPaused ? "#61bd4f" : "#eb5a46";

        let html = `
          <div class="pause-button-container" style="margin-bottom: 16px; text-align: center;">
            <button id="pauseResumeBtn" class="${buttonClass}" style="padding: 8px 16px; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; width: 100%; background-color: ${buttonBgColor};">
              ${buttonText}
            </button>
          </div>
        `;

        listData.forEach((item) => {
          const percentage =
            totalMinutes > 0 ? (item.minutes / totalMinutes) * 100 : 0;

          html += `<div class="list-item">
                     <div class="list-item-header">
                       <span class="list-name">${item.listName}</span>
                       <span class="list-time">${item.formatted}</span>
                     </div>
                     <div class="progress-bar">
                       <div class="progress-fill" style="width: ${percentage}%"></div>
                     </div>
                   </div>`;
        });

        // Add paused time summary if there are pause events
        if (pauseEvents && pauseEvents.length > 0) {
          const pausedMinutes = calculateTotalPausedMinutes(pauseEvents);
          const pausedTime = formatBusinessTime(pausedMinutes);
          html += `<div class="paused-time-summary">
                     <strong>⏸️ Total paused time:</strong> ${pausedTime}
                   </div>`;
        }

        timeListElement.innerHTML = html;

        // Attach event listener to pause/resume button
        const pauseResumeBtn = document.getElementById("pauseResumeBtn");
        if (pauseResumeBtn) {
          pauseResumeBtn.addEventListener("click", async function () {
            const nowPaused = await togglePauseResume(t);
            // Reload the entire section to update times
            location.reload();
          });
        }
      };

      const token = await getAuthToken(t);
      if (!token) {
        return [
          {
            text: "Authorize",
            callback: showAuthorizePopup,
          },
        ];
      }

      // We have a token, now get the card and fetch actions
      const card = await t.card("id");

      const response = await fetch(
        `https://api.trello.com/1/cards/${card.id}/actions?filter=updateCard:idList,createCard&key=${APP_KEY}&token=${token}`
      );
      const actions = await response.json();

      const history = buildCardHistory(actions, card.id);

      // Fetch pause events to display paused time
      const pauseEvents = await getPauseEvents(t);

      renderTimeInList(history, pauseEvents, t);
    } catch (error) {
      console.error("Error during Power-Up execution:", error);
      document.getElementById("time-list").innerHTML =
        "<p>An unexpected error occurred.</p>";
    } finally {
      t.sizeTo("#content");
    }
  });
} else {
  // MAIN POWER-UP CODE - runs when Trello loads the Power-Up
  console.log("🎯 Initializing Power-Up in main context");

  TrelloPowerUp.initialize(
    {
      "on-enable": async function (t, options) {
        console.log("Power-Up enabled, checking authorization.");
        const token = await getAuthToken(t);

        if (!token) {
          return t.popup({
            title: "Authorize Account",
            url: "./authorize.html",
            height: 140,
          });
        }
      },
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
      "card-badges": async function (t, options) {
        console.log("✅ card-badges callback triggered");
        try {
          const token = await getAuthToken(t);

          if (!token) {
            return []; // Don't show badge if not authorized
          }

          const card = await t.card("id");

          const response = await fetch(
            `https://api.trello.com/1/cards/${card.id}/actions?filter=updateCard:idList,createCard&key=${APP_KEY}&token=${token}&limit=1`
          );
          const actions = await response.json();

          let startDate;

          if (actions && actions.length > 0) {
            // Card has movement history - use the last action date
            startDate = dayjs(actions[0].date).toDate();
          } else {
            // No actions found - extract creation timestamp from card ID
            startDate = getCardCreationDate(card.id);
          }

          // Get pause events and calculate paused time
          const pauseEvents = await getPauseEvents(t);
          const isPaused = isCardPaused(pauseEvents);
          const pausedMinutes = calculateTotalPausedMinutes(pauseEvents);

          // Calculate total elapsed time
          const totalMinutes = calculateBusinessMinutes(startDate, new Date());

          // Subtract paused time from total time
          const activeMinutes = Math.max(0, totalMinutes - pausedMinutes);
          const duration = formatBusinessTime(activeMinutes);

          return [
            {
              text: isPaused ? `⏱️ ${duration} ⏸️` : `⏱️ ${duration}`,
              color: isPaused ? "red" : "blue",
            },
          ];
        } catch (error) {
          console.error("Error in card-badges:", error);
          return [];
        }
      },
      "card-buttons": async function (t, options) {
        console.log("✅ card-buttons callback triggered");
        try {
          const pauseEvents = await getPauseEvents(t);
          const isPaused = isCardPaused(pauseEvents);
          console.log("Pause status:", isPaused, "Events:", pauseEvents);

          const button = {
            icon: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
            text: isPaused ? "⏯️ Resume Timer" : "⏸️ Pause Timer",
            callback: async function (t) {
              console.log("Button clicked!");
              const nowPaused = await togglePauseResume(t);

              await t.alert({
                message: nowPaused ? "Timer paused! ⏸️" : "Timer resumed! ⏱️",
                duration: 3,
              });

              // Refresh the card to update badges
              return t.closePopup();
            },
          };

          console.log("Returning button:", button);
          return [button];
        } catch (error) {
          console.error("Error in card-buttons:", error);
          return [];
        }
      },
      // "card-detail-badges": function (t, options) {
      //   return t
      //     .getRestApi()
      //     .isAuthorized()
      //     .then(function (isAuthorized) {
      //       if (!isAuthorized) {
      //         return []; // Don't show badge if not authorized
      //       }
      //       return t.card("id").then(function (card) {
      //         return t
      //           .getRestApi()
      //           .get(
      //             "/cards/" +
      //               card.id +
      //               "/actions?filter=updateCard:idList,createCard&limit=1"
      //           )
      //           .then(function (actions) {
      //             if (actions && actions.length > 0) {
      //               const lastMoveDate = dayjs(actions[0].date).toDate();
      //               const duration = calculateBusinessTime(
      //                 lastMoveDate,
      //                 new Date()
      //               );
      //               return [
      //                 {
      //                   title: "Time in Current List",
      //                   text: duration,
      //                   color: "blue",
      //                 },
      //               ];
      //             }
      //             return [];
      //           });
      //       });
      //     });
      // },
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    }
  );

  console.log("✨ Power-Up initialization complete");
}
