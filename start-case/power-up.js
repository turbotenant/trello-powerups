/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME, getAuthToken, showAuthorizePopup, handleAuthorization, TrelloApi */

// === DEBUG LOGGING ===
// console.log("🚀 Power-Up Start Case script loaded!");
// console.log("📍 Current URL Start Case:", window.location.href);
// console.log("🔍 TrelloPowerUp available Start Case:", typeof TrelloPowerUp);
// console.log("📅 dayjs available Start Case:", typeof dayjs);
// === END DEBUG ===

// ===== BOARD STORAGE HELPERS =====

/**
 * Gets the board's "in development" list ID (saved in settings).
 * @param {Object} t - The Trello Power-Up interface.
 * @returns {Promise<string|null>} The list ID or null.
 */
const getInDevelopmentListId = async (t) => {
  return t.get("board", "private", "inDevelopmentListId");
};

/**
 * Saves the board's "in development" list ID.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string|null} listId - The list ID to save.
 * @returns {Promise<void>}
 */
const setInDevelopmentListId = async (t, listId) => {
  await t.set("board", "private", "inDevelopmentListId", listId || null);
};

// ===== START CASE SCRIPT =====

/**
 * Resolves the list to move the card to: saved "in development" list or fallback by name.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string} boardId - The board ID.
 * @param {string} token - API token.
 * @returns {Promise<Object|null>} The list object or null.
 */
const resolveInDevelopmentList = async (t, boardId, token) => {
  const savedListId = await getInDevelopmentListId(t);
  const response = await fetch(
    `https://api.trello.com/1/boards/${boardId}/lists?key=${APP_KEY}&token=${token}`,
  );
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  const lists = await response.json();
  if (savedListId) {
    const list = lists.find((l) => l.id === savedListId);
    if (list) return list;
  }
  const byName = lists.find(
    (list) => list.name.toUpperCase() === "IN DEVELOPMENT",
  );
  return byName || null;
};

/**
 * Moves the card to the "in development" list (from settings or fallback "IN DEVELOPMENT" by name).
 * @param {Object} t - The Trello Power-Up interface.
 */
const startCaseCallback = async (t) => {
  try {
    const token = await getAuthToken(t);
    if (!token) {
      return showAuthorizePopup(t);
    }

    const context = t.getContext();
    const { board: boardId, card: cardId } = context;

    const inDevelopmentList = await resolveInDevelopmentList(t, boardId, token);

    if (!inDevelopmentList) {
      return t.alert({
        message:
          'No "in development" list. Set one in Power-Up settings (board menu → Power-Ups → Start Case → Settings), or add a list named "IN DEVELOPMENT".',
        duration: 6,
        display: "error",
      });
    }

    // 2. Get the current member's ID
    const member = await t.member("id");
    const memberId = member.id;

    // 3. Move the card and assign the member in a single API call
    const updateResponse = await fetch(
      `https://api.trello.com/1/cards/${cardId}?idList=${inDevelopmentList.id}&idMembers=${memberId}&key=${APP_KEY}&token=${token}`,
      {
        method: "PUT",
      },
    );

    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update card. Status: ${updateResponse.status}`,
      );
    }

    // 4. Get custom fields on the board
    const customFieldsResponse = await fetch(
      `https://api.trello.com/1/boards/${boardId}/customFields?key=${APP_KEY}&token=${token}`,
    );

    if (!customFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch custom fields. Status: ${customFieldsResponse.status}`,
      );
    }

    const customFields = await customFieldsResponse.json();
    const daysToReleaseField = customFields.find(
      (field) => field.name === "Days to Release",
    );

    if (!daysToReleaseField) {
      return t.alert({
        message:
          "Card moved and assigned. Note: 'Days to Release' field not found.",
        duration: 5,
        display: "warning",
      });
    }

    // 5. Get the custom field value for this card
    const cardCustomFieldsResponse = await fetch(
      `https://api.trello.com/1/cards/${cardId}/customFieldItems?key=${APP_KEY}&token=${token}`,
    );

    if (!cardCustomFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch card custom fields. Status: ${cardCustomFieldsResponse.status}`,
      );
    }

    const cardCustomFields = await cardCustomFieldsResponse.json();
    const daysToReleaseValue = cardCustomFields.find(
      (item) => item.idCustomField === daysToReleaseField.id,
    );

    if (
      !daysToReleaseValue ||
      !daysToReleaseValue.value ||
      !daysToReleaseValue.value.number
    ) {
      return t.alert({
        message:
          "Card moved and assigned. Note: 'Days to Release' value not set.",
        duration: 5,
        display: "warning",
      });
    }

    const daysToAdd = parseInt(daysToReleaseValue.value.number, 10);

    // 6. Calculate the due date using business days
    const startDate = new Date();

    const { endDate, totalDaysAdded } = addBusinessDays(startDate, daysToAdd);

    // Format the date as ISO 8601 for Trello API
    const dueDate = endDate.toISOString();

    // 7. Set the due date on the card
    const dueDateResponse = await fetch(
      `https://api.trello.com/1/cards/${cardId}?due=${encodeURIComponent(
        dueDate,
      )}&key=${APP_KEY}&token=${token}`,
      {
        method: "PUT",
      },
    );

    if (!dueDateResponse.ok) {
      throw new Error(
        `Failed to set due date. Status: ${dueDateResponse.status}`,
      );
    }

    t.alert({
      message: `Card started! Due in ${daysToAdd} business days.`,
      duration: 3,
      display: "success",
    });

    // Close the popup, which will also refresh the card view
    return t.closePopup();
  } catch (error) {
    console.error("Error in startCaseCallback:", error);
    t.alert({
      message: "An error occurred while moving the card.",
      duration: 5,
      display: "error",
    });
  }
};

// ===== POWER-UP INITIALIZATION =====

const currentPath = window.location.pathname || window.location.href;
const isSettingsContext = currentPath.includes("settings.html");

if (isSettingsContext) {
  window.addEventListener("load", async () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });
    try {
      const token = await getAuthToken(t);
      const container = document.getElementById("start-case-settings");
      if (!container) return;

      if (!token) {
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p style="margin: 0 0 15px 0;">Please authorize this Power-Up to configure settings.</p>
            <button id="auth-btn" style="background-color: #0079bf; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; font-size: 14px;">
              Authorize
            </button>
          </div>
        `;
        const authBtn = document.getElementById("auth-btn");
        if (authBtn) {
          authBtn.addEventListener("click", function () {
            handleAuthorization(t, authBtn, () => location.reload());
          });
        }
        return;
      }

      const boardId = (t.getContext() && t.getContext().board) || null;
      if (!boardId) {
        container.innerHTML =
          '<p class="settings-error">Could not load board context.</p>';
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

      const savedListId = await getInDevelopmentListId(t);
      const optionsHtml =
        '<option value="">— Use list named "IN DEVELOPMENT" —</option>' +
        lists
          .map(
            (list) =>
              `<option value="${list.id}"${list.id === savedListId ? " selected" : ""}>${escapeHtml(list.name)}</option>`,
          )
          .join("");

      container.innerHTML = `
        <div class="settings-section">
          <h3>In development list</h3>
          <p>Choose the list to move cards to when "Start Case" is used. If not set, a list named "IN DEVELOPMENT" is used.</p>
          <select id="in-development-list-select">${optionsHtml}</select>
        </div>
        <button type="button" id="save-start-case-settings-btn" class="save-btn">Save</button>
        <p class="version-info">Version: <span id="version"></span></p>
      `;

      const versionSpan = document.getElementById("version");
      if (versionSpan) {
        versionSpan.textContent = typeof VERSION !== "undefined" ? VERSION : "";
      }

      const saveBtn = document.getElementById("save-start-case-settings-btn");
      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
          const select = document.getElementById("in-development-list-select");
          const value = select ? select.value : "";
          await setInDevelopmentListId(t, value || null);
          saveBtn.textContent = "Saved!";
          setTimeout(() => {
            saveBtn.textContent = "Save";
          }, 2000);
        });
      }
    } catch (error) {
      console.error("Error during Start Case settings:", error);
      const container = document.getElementById("start-case-settings");
      if (container) {
        container.innerHTML =
          '<p class="settings-error">An unexpected error occurred.</p>';
      }
    }
  });
} else {
  TrelloPowerUp.initialize(
    {
      "on-enable": async function (t, options) {
        const token = await getAuthToken(t);
        if (!token) {
          return t.popup({
            title: "Authorize Account",
            url: "./authorize.html",
            height: 140,
          });
        }
      },
      "card-buttons": async function (t, options) {
        return [
          {
            icon: "https://cdn-icons-png.flaticon.com/512/2285/2285537.png",
            text: `Start Case v${VERSION}`,
            callback: startCaseCallback,
          },
        ];
      },
      "show-settings": function (t, options) {
        return t.popup({
          title: "Start Case Settings",
          url: "./settings.html",
          height: 320,
        });
      },
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    },
  );
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

console.log("✨ Power-Up Start Case initialization complete");
