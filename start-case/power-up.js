/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME */

// === DEBUG LOGGING ===
console.log("🚀 Power-Up script loaded!");
console.log("📍 Current URL:", window.location.href);
console.log("🔍 TrelloPowerUp available:", typeof TrelloPowerUp);
console.log("📅 dayjs available:", typeof dayjs);
// === END DEBUG ===

// ===== START CASE SCRIPT =====

/**
 * Moves the card to the "IN DEVELOPMENT" list.
 * @param {Object} t - The Trello Power-Up interface.
 */
const startCaseCallback = async (t) => {
  try {
    const token = await t.getToken();
    if (!token) {
      return t.popup({
        title: "Authorize to continue",
        url: "./authorize.html",
      });
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

    if (!updateResponse.ok) {
      throw new Error(
        `Failed to update card. Status: ${updateResponse.status}`
      );
    }

    t.alert({
      message: "Card started and assigned to you.",
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
      console.log("Power-Up enabled, checking authorization.");
      const token = await t.getToken();

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
          icon: "https://cdn.icon-icons.com/icons2/1382/PNG/512/development_94943.png",
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
