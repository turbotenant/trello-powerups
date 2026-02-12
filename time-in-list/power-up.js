/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME */

// === DEBUG LOGGING ===
// console.log("🚀 Power-Up Time in List script loaded!");
// console.log("📍 Current URL Time in List:", window.location.href);
// console.log("🔍 TrelloPowerUp available Time in List:", typeof TrelloPowerUp);
// console.log("📅 dayjs available Time in List:", typeof dayjs);
// === END DEBUG ===

// ===== SHARED HELPER FUNCTIONS =====

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
        (action.type === "updateCard" && action.data.listAfter),
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
 * Gets the board's pause lists configuration (list IDs that trigger auto-pause).
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<string[]>} Array of list IDs.
 */
const getPauseListsConfig = async (t) => {
  const pauseLists = await t.get("board", "private", "pauseLists");
  return Array.isArray(pauseLists) ? pauseLists : [];
};

/**
 * Saves the board's pause lists configuration.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string[]} listIds - Array of list IDs that should trigger auto-pause.
 * @returns {Promise<void>}
 */
const setPauseListsConfig = async (t, listIds) => {
  await t.set("board", "private", "pauseLists", listIds || []);
};

/**
 * Checks if a list ID is in the pause lists configuration.
 * @param {string} listId - The list ID to check.
 * @param {string[]} pauseLists - Array of list IDs from config.
 * @returns {boolean}
 */
const isListInPauseLists = (listId, pauseLists) => {
  return Array.isArray(pauseLists) && pauseLists.includes(listId);
};

/**
 * Saves a pause or resume event to card storage.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string|null} pausedAt - ISO timestamp when paused, or null if resuming.
 * @param {string|null} resumedAt - ISO timestamp when resumed, or null if pausing.
 * @param {string} [reason='manual'] - 'manual' or 'auto' for pause reason (backward compatible).
 * @returns {Promise<void>}
 */
const savePauseEvent = async (t, pausedAt, resumedAt, reason = "manual") => {
  const pauseEvents = await getPauseEvents(t);

  if (pausedAt && !resumedAt) {
    // Creating a new pause event
    pauseEvents.push({ pausedAt, resumedAt: null, reason });
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
 * Checks if the current pause was triggered automatically (list move).
 * Backward compatibility: missing reason defaults to 'manual'.
 * @param {Array} pauseEvents - Array of pause events.
 * @returns {boolean} True if currently paused and last pause was auto.
 */
const isLastPauseAuto = (pauseEvents) => {
  if (!pauseEvents || pauseEvents.length === 0) {
    return false;
  }
  const lastEvent = pauseEvents[pauseEvents.length - 1];
  const isPaused = lastEvent && lastEvent.pausedAt && !lastEvent.resumedAt;
  const reason =
    lastEvent && lastEvent.reason != null ? lastEvent.reason : "manual";
  return isPaused && reason === "auto";
};

/**
 * Detects list changes and triggers auto pause when card enters a pause list,
 * or auto resume when card leaves a pause list (only if it was auto-paused).
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<void>}
 */
const checkAndHandleAutoPauseResume = async (t) => {
  const card = await t.card("id", "idList");
  const currentListId = card && card.idList;
  if (!currentListId) return;

  const lastListId = await t.get("card", "private", "lastListId");
  const pauseLists = await getPauseListsConfig(t);
  const pauseEvents = await getPauseEvents(t);
  const isPaused = isCardPaused(pauseEvents);
  const wasAutoPaused = isLastPauseAuto(pauseEvents);

  const listChanged = lastListId !== currentListId;
  const newListIsPauseList = isListInPauseLists(currentListId, pauseLists);
  const oldListWasPauseList = isListInPauseLists(lastListId, pauseLists);

  if (listChanged) {
    if (newListIsPauseList && !isPaused) {
      await savePauseEvent(t, new Date().toISOString(), null, "auto");
    } else if (oldListWasPauseList && wasAutoPaused) {
      await savePauseEvent(t, null, new Date().toISOString(), "manual");
    }
    await t.set("card", "private", "lastListId", currentListId);
  } else if (lastListId == null) {
    await t.set("card", "private", "lastListId", currentListId);
  }
};

/**
 * Toggles the pause/resume state of a card's timer (manual pause/resume).
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<boolean>} The new pause state (true if paused, false if resumed).
 */
const togglePauseResume = async (t) => {
  const now = new Date().toISOString();
  const pauseEvents = await getPauseEvents(t);
  const isPaused = isCardPaused(pauseEvents);

  if (isPaused) {
    // Resume the timer
    await savePauseEvent(t, null, now, "manual");
    return false; // Now active
  } else {
    // Pause the timer (manual)
    await savePauseEvent(t, now, null, "manual");
    return true; // Now paused
  }
};

// ===== PAUSE/RESUME UI CONSTANTS =====

const PAUSE_RESUME_COLORS = {
  active: "green",
  paused: "red",
};

const PAUSE_RESUME_TEXT = {
  pauseButton: "⏸️ Pause Timer",
  resumeButton: "⏯️ Resume Timer",
  pauseBadge: "⏸️ Pause",
  resumeBadge: "⏯️ Resume",
  pausedMessage: "Timer paused! ⏸️",
  resumedMessage: "Timer resumed! ⏱️",
};

/**
 * Shared callback for pause/resume button clicks.
 * Shows an alert and closes the popup to refresh.
 * @param {Object} t - The Trello Power-Up interface.
 */
const pauseResumeCallback = async (t) => {
  const nowPaused = await togglePauseResume(t);
  await t.alert({
    message: nowPaused
      ? PAUSE_RESUME_TEXT.pausedMessage
      : PAUSE_RESUME_TEXT.resumedMessage,
    duration: 3,
  });
  return t.closePopup();
};

/**
 * Calculates paused time that occurred during a specific time period.
 * @param {Array} pauseEvents - Array of pause events.
 * @param {Date} periodStart - Start of the time period.
 * @param {Date} periodEnd - End of the time period.
 * @returns {number} Paused minutes within the period.
 */
const calculatePausedMinutesInPeriod = (
  pauseEvents,
  periodStart,
  periodEnd,
) => {
  if (!pauseEvents || pauseEvents.length === 0) {
    return 0;
  }

  let pausedMinutes = 0;

  pauseEvents.forEach((event) => {
    if (event.pausedAt) {
      const pausedAt = new Date(event.pausedAt);
      const resumedAt = event.resumedAt
        ? new Date(event.resumedAt)
        : new Date();

      // Find the overlap between the pause period and the list period
      const overlapStart = pausedAt > periodStart ? pausedAt : periodStart;
      const overlapEnd = resumedAt < periodEnd ? resumedAt : periodEnd;

      // Only calculate if there's an overlap
      if (overlapStart < overlapEnd) {
        pausedMinutes += calculateBusinessMinutes(overlapStart, overlapEnd);
      }
    }
  });

  return pausedMinutes;
};

/**
 * Calculates the time spent in the current list (excluding paused time).
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<Object>} Object containing { duration, isPaused, pauseEvents }
 */
const calculateCurrentListTime = async (t) => {
  const token = await getAuthToken(t);
  console.log("🔍 Token:", token);
  if (!token) {
    return null;
  }

  const card = await t.card("id");

  let actions;
  try {
    actions = await TrelloApi.fetchCardActions(
      card.id,
      token,
      "updateCard:idList,createCard",
    );
  } catch (err) {
    console.error("❌ API request failed:", err);
    return null;
  }

  // Build complete history to find when card entered current list
  const history = buildCardHistory(actions, card.id);

  // Find the current list entry - it's the last entry in history
  // This represents the MOST RECENT entry into the current list (not a sum of all times)
  let startDate;
  if (history && history.length > 0) {
    const currentListEntry = history.at(-1); // Last entry = most recent entry
    startDate = dayjs(currentListEntry.enteredAt).toDate();
  } else {
    // No history found - extract creation timestamp from card ID
    startDate = getCardCreationDate(card.id);
  }

  // Get pause events
  const pauseEvents = await getPauseEvents(t);
  const isPaused = isCardPaused(pauseEvents);

  // Calculate total elapsed time in current list
  const now = new Date();
  const totalMinutes = calculateBusinessMinutes(startDate, now);

  // Calculate paused time that occurred during the current list period
  const pausedMinutes = calculatePausedMinutesInPeriod(
    pauseEvents,
    startDate,
    now,
  );

  // Subtract only the paused time that occurred in the current list
  const activeMinutes = Math.max(0, totalMinutes - pausedMinutes);
  const duration = formatBusinessTime(activeMinutes);

  return {
    duration,
    isPaused,
    pauseEvents,
  };
};

// ===== DETECT CONTEXT =====
// Check if we're in an iframe context or main Power-Up context
if (window.location.href.includes("settings.html")) {
  // SETTINGS PAGE CODE - runs when settings.html is loaded
  window.addEventListener("load", async () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });
    try {
      /**
       * Renders the auto-pause lists settings section (board-level config).
       * @param {Object} t - The Trello Power-Up interface.
       * @param {string} token - API token.
       */
      const renderPauseListsSettings = async (t, token) => {
        const container = document.getElementById("pause-lists-settings");
        if (!container) return;

        const versionSpan = document.getElementById("version");
        if (versionSpan) {
          versionSpan.textContent =
            typeof VERSION !== "undefined" ? VERSION : "";
        }

        const context = t.getContext();
        const boardId = context && context.board;
        if (!boardId) {
          container.innerHTML = "<p>Could not load board context.</p>";
          return;
        }

        let lists;
        try {
          lists = await TrelloApi.fetchBoardLists(boardId, token);
        } catch (err) {
          container.innerHTML =
            '<p class="settings-error">Could not load lists.</p>';
          return;
        }
        const pauseListIds = await getPauseListsConfig(t);

        let html = `
          <h3 class="pause-lists-settings-title">Auto-pause lists</h3>
          <p class="pause-lists-settings-desc">When a card is moved to one of these lists, the timer is automatically paused. Moving it to another list will resume the timer.</p>
          <ul class="pause-lists-checkbox-list">
            ${lists
              .map(
                (list) =>
                  `<li class="pause-lists-checkbox-item">
                    <label>
                      <input type="checkbox" class="pause-list-checkbox" data-list-id="${
                        list.id
                      }" ${pauseListIds.includes(list.id) ? "checked" : ""}>
                      <span>${list.name}</span>
                    </label>
                   </li>`,
              )
              .join("")}
          </ul>
          <button type="button" id="save-pause-lists-btn" class="save-pause-lists-btn">Save</button>
        `;
        container.innerHTML = html;

        const saveBtn = document.getElementById("save-pause-lists-btn");
        if (saveBtn) {
          saveBtn.addEventListener("click", async () => {
            const checkboxes = container.querySelectorAll(
              ".pause-list-checkbox:checked",
            );
            const selectedListIds = Array.from(checkboxes).map((el) =>
              el.getAttribute("data-list-id"),
            );
            await setPauseListsConfig(t, selectedListIds);
            saveBtn.textContent = "Saved!";
            setTimeout(() => {
              saveBtn.textContent = "Save";
            }, 2000);
          });
        }
      };

      const token = await getAuthToken(t);
      if (!token) {
        const container = document.getElementById("pause-lists-settings");
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p style="margin: 0 0 15px 0;">Please authorize this Power-Up to configure settings.</p>
            <button id="auth-btn" style="background-color: #0079bf; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; font-size: 14px;">
              Authorize
            </button>
          </div>
        `;

        const authBtn = document.getElementById("auth-btn");
        authBtn.addEventListener("click", function (event) {
          handleAuthorization(t, authBtn, () => {
            location.reload();
          });
        });
        t.sizeTo("#content");
        return;
      }

      await renderPauseListsSettings(t, token);
      t.sizeTo("#content");
    } catch (error) {
      console.error("❌ Error during Power-Up Settings execution:", error);
      const container = document.getElementById("pause-lists-settings");
      if (container) {
        container.innerHTML = "<p>An unexpected error occurred.</p>";
      }
    }
  });
} else if (window.location.href.includes("index.html")) {
  // IFRAME CODE - runs when index.html is loaded
  window.addEventListener("load", async () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });
    try {
      // Helper function to show authorization UI
      const showAuthUI = () => {
        // console.log("🔍 Showing authorize UI");
        const timeListElement = document.getElementById("time-list");
        timeListElement.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p style="margin: 0 0 15px 0;">Please authorize this Power-Up to read card history.</p>
            <button id="auth-btn" style="background-color: #0079bf; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; font-size: 14px;">
              Authorize
            </button>
          </div>
        `;

        const authBtn = document.getElementById("auth-btn");
        authBtn.addEventListener("click", function (event) {
          // console.log("🔘 Authorize button clicked, opening popup");
          // showAuthorizePopup(t, event);
          handleAuthorization(t, authBtn, () => {
            // console.log("🔍 Authorization successful, closing popup");
            t.closePopup();
            location.reload();
          });
        });

        t.sizeTo("#content");
      };

      const renderTimeInList = (history, pauseEvents, t) => {
        const timeListElement = document.getElementById("time-list");

        // Clear previous content
        timeListElement.innerHTML = "";

        if (!history || history.length === 0) {
          const noHistoryMsg = document.createElement("p");
          noHistoryMsg.textContent = "No movement history yet.";
          timeListElement.appendChild(noHistoryMsg);
          return;
        }

        const now = new Date();

        // First pass: calculate durations in minutes per history entry
        const listData = history.map((entry, index) => {
          const startDate = dayjs(entry.enteredAt).toDate();
          const endDate =
            index < history.length - 1
              ? dayjs(history[index + 1].enteredAt).toDate()
              : now;

          // Calculate total time in this list period
          const totalMinutes = calculateBusinessMinutes(startDate, endDate);

          // Calculate paused time that occurred during this list period
          const pausedMinutes = calculatePausedMinutesInPeriod(
            pauseEvents,
            startDate,
            endDate,
          );

          // Subtract paused time from total time
          const activeMinutes = Math.max(0, totalMinutes - pausedMinutes);

          return {
            listName: entry.listName,
            minutes: activeMinutes,
            formatted: formatBusinessTime(activeMinutes),
          };
        });

        // Aggregate by list name: total minutes and visit count
        const aggregatedData = listData.reduce((acc, item) => {
          if (!acc[item.listName]) {
            acc[item.listName] = {
              listName: item.listName,
              minutes: 0,
              count: 0,
            };
          }
          acc[item.listName].minutes += item.minutes;
          acc[item.listName].count += 1;
          return acc;
        }, {});

        const aggregatedList = Object.values(aggregatedData).map((item) => ({
          ...item,
          formatted: formatBusinessTime(item.minutes),
        }));

        // Total minutes for percentage (from aggregated data)
        const totalMinutes = aggregatedList.reduce(
          (sum, item) => sum + item.minutes,
          0,
        );

        // Second pass: render with progress bars
        // Add Pause/Resume button at the top
        const isPaused = isCardPaused(pauseEvents);
        const buttonClass = isPaused
          ? "pause-button paused"
          : "pause-button active";
        const buttonText = isPaused
          ? PAUSE_RESUME_TEXT.resumeButton
          : PAUSE_RESUME_TEXT.pauseButton;
        // Map color names to hex values for inline styles
        const buttonBgColor = isPaused ? "#eb5a46" : "#61bd4f"; // paused=red : active=green

        let html = `
          <div class="pause-button-container" style="margin-bottom: 16px; text-align: center;">
            <button id="pauseResumeBtn" class="${buttonClass}" style="padding: 8px 16px; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 14px; width: 50%; background-color: ${buttonBgColor};">
              ${buttonText}
            </button>
          </div>
        `;

        aggregatedList.forEach((item) => {
          const percentage =
            totalMinutes > 0 ? (item.minutes / totalMinutes) * 100 : 0;
          const countLabel =
            item.count === 1 ? "1 time" : `${item.count} times`;

          html += `<div class="list-item">
                     <div class="list-item-header">
                       <span class="list-name">${item.listName}</span>
                       <span class="list-time">${item.formatted} (${countLabel})</span>
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
        showAuthUI();
        return;
      }

      const card = await t.card("id");

      let actions;
      try {
        actions = await TrelloApi.fetchCardActions(
          card.id,
          token,
          "updateCard:idList,createCard",
        );
      } catch (err) {
        console.error("❌ API request failed:", err);
        await t.remove("organization", "private", "token").catch(() => {
          return t.remove("board", "private", "token");
        });
        showAuthUI();
        return;
      }

      const history = buildCardHistory(actions, card.id);

      // Fetch pause events to display paused time
      const pauseEvents = await getPauseEvents(t);

      renderTimeInList(history, pauseEvents, t);
    } catch (error) {
      console.error("❌ Error during Power-Up Time in List execution:", error);
      document.getElementById("time-list").innerHTML =
        "<p>An unexpected error occurred.</p>";
    } finally {
      t.sizeTo("#content");
    }
  });
} else {
  // MAIN POWER-UP CODE - runs when Trello loads the Power-Up
  // console.log("🎯 Initializing Power-Up Time in List in main context");

  TrelloPowerUp.initialize(
    {
      "on-enable": async function (t, options) {
        // console.log(
        //   "✅ Power-Up Time in List enabled, checking authorization."
        // );
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
        // console.log("✅ card-back-section Time in List callback triggered");
        return {
          title: "Time in List",
          icon: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
          content: {
            type: "iframe",
            url: t.signUrl(
              "https://turbotenant.github.io/trello-powerups/time-in-list/index.html",
            ),
            height: "auto",
          },
        };
      },
      "card-badges": async function (t, options) {
        try {
          await checkAndHandleAutoPauseResume(t);
          const timeInfo = await calculateCurrentListTime(t);

          if (!timeInfo) {
            return []; // Not authorized or error
          }

          const { duration, isPaused } = timeInfo;

          return [
            {
              text: isPaused ? `⏱️ ${duration} ⏸️` : `⏱️ ${duration}`,
              color: isPaused
                ? PAUSE_RESUME_COLORS.paused
                : PAUSE_RESUME_COLORS.active,
            },
          ];
        } catch (error) {
          console.error("❌ Error in card-badges Time in List:", error);
          return [];
        }
      },
      "card-buttons": async function (t, options) {
        // console.log("✅ card-buttons Time in List callback triggered");
        try {
          const pauseEvents = await getPauseEvents(t);
          const isPaused = isCardPaused(pauseEvents);

          const button = {
            icon: "https://cdn-icons-png.flaticon.com/512/2088/2088617.png",
            text: isPaused
              ? PAUSE_RESUME_TEXT.resumeButton
              : PAUSE_RESUME_TEXT.pauseButton,
            callback: pauseResumeCallback,
          };

          return [button];
        } catch (error) {
          console.error("❌ Error in card-buttons Time in List:", error);
          return [];
        }
      },
      "card-detail-badges": async function (t, options) {
        // console.log("✅ card-detail-badges Time in List callback triggered");
        try {
          const timeInfo = await calculateCurrentListTime(t);

          if (!timeInfo) {
            return []; // Not authorized or error
          }

          const { duration, isPaused } = timeInfo;

          // Return TWO badges: time + pause/resume button
          return [
            {
              title: "Time in Current List",
              text: duration,
              color: "blue",
            },
            {
              title: isPaused ? "Timer Paused" : "Timer Active",
              text: isPaused
                ? PAUSE_RESUME_TEXT.resumeBadge
                : PAUSE_RESUME_TEXT.pauseBadge,
              color: isPaused
                ? PAUSE_RESUME_COLORS.paused
                : PAUSE_RESUME_COLORS.active,
              callback: pauseResumeCallback,
            },
          ];
        } catch (error) {
          console.error("❌ Error in card-detail-badges Time in List:", error);
          return [];
        }
      },
      "show-settings": function (t, options) {
        // dummy
        return t.popup({
          title: "Time in List Settings",
          url: "./settings.html",
          height: 500,
        });
      },
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    },
  );

  // console.log("✨ Power-Up Time in List initialization complete");
}
