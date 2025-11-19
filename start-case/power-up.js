/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME */

// === DEBUG LOGGING ===
console.log("🚀 Power-Up Start Case script loaded!");
console.log("📍 Current URL Start Case:", window.location.href);
console.log("🔍 TrelloPowerUp available Start Case:", typeof TrelloPowerUp);
console.log("📅 dayjs available Start Case:", typeof dayjs);
// === END DEBUG ===

// ===== START CASE SCRIPT =====

/**
 * Moves the card to the "IN DEVELOPMENT" list.
 * @param {Object} t - The Trello Power-Up interface.
 */
const startCaseCallback = async (t) => {
  try {
    const token = await getAuthToken(t);
    if (!token) {
      return showAuthorizePopup(t);
    }

    // Get the board and card context
    const context = t.getContext();
    const { board: boardId, card: cardId } = context;

    // 1. Find the "IN DEVELOPMENT" list on the board
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${APP_KEY}&token=${token}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const lists = await response.json();
    const inDevelopmentList = lists.find(
      (list) => list.name.toUpperCase() === "IN DEVELOPMENT"
    );

    if (!inDevelopmentList) {
      return t.alert({
        message: 'List "IN DEVELOPMENT" not found on this board.',
        duration: 5,
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
      }
    );
    console.log(updateResponse);
    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update card. Status: ${updateResponse.status}`
      );
    }

    // 4. Get custom fields on the board
    const customFieldsResponse = await fetch(
      `https://api.trello.com/1/boards/${boardId}/customFields?key=${APP_KEY}&token=${token}`
    );

    if (!customFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch custom fields. Status: ${customFieldsResponse.status}`
      );
    }

    const customFields = await customFieldsResponse.json();
    const daysToReleaseField = customFields.find(
      (field) => field.name === "Days to Release"
    );

    if (!daysToReleaseField) {
      console.warn("Custom field 'Days to Release' not found on this board.");
      return t.alert({
        message:
          "Card moved and assigned. Note: 'Days to Release' field not found.",
        duration: 5,
        display: "warning",
      });
    }

    // 5. Get the custom field value for this card
    const cardCustomFieldsResponse = await fetch(
      `https://api.trello.com/1/cards/${cardId}/customFieldItems?key=${APP_KEY}&token=${token}`
    );

    if (!cardCustomFieldsResponse.ok) {
      throw new Error(
        `Failed to fetch card custom fields. Status: ${cardCustomFieldsResponse.status}`
      );
    }

    const cardCustomFields = await cardCustomFieldsResponse.json();
    const daysToReleaseValue = cardCustomFields.find(
      (item) => item.idCustomField === daysToReleaseField.id
    );

    if (
      !daysToReleaseValue ||
      !daysToReleaseValue.value ||
      !daysToReleaseValue.value.number
    ) {
      console.warn("'Days to Release' value not set on this card.");
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
    console.log("Start date:", startDate);
    console.log("Days to add:", daysToAdd);

    const { endDate, totalDaysAdded } = addBusinessDays(startDate, daysToAdd);

    console.log("End date:", endDate);
    console.log("Total calendar days added:", totalDaysAdded);

    // Format the date as ISO 8601 for Trello API
    const dueDate = endDate.toISOString();

    // 7. Set the due date on the card
    const dueDateResponse = await fetch(
      `https://api.trello.com/1/cards/${cardId}?due=${encodeURIComponent(
        dueDate
      )}&key=${APP_KEY}&token=${token}`,
      {
        method: "PUT",
      }
    );

    if (!dueDateResponse.ok) {
      throw new Error(
        `Failed to set due date. Status: ${dueDateResponse.status}`
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

TrelloPowerUp.initialize(
  {
    "on-enable": async function (t, options) {
      console.log("✅ Power-Up Start Case enabled, checking authorization.");
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
      console.log("✅ card-buttons Start Case callback triggered");
      return [
        {
          icon: "https://cdn-icons-png.flaticon.com/512/2285/2285537.png",
          text: "Start Case",
          callback: startCaseCallback,
        },
      ];
    },
  },
  {
    appKey: APP_KEY,
    appName: APP_NAME,
  }
);
