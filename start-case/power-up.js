/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME */

// === DEBUG LOGGING ===
console.log("🚀 Power-Up script loaded!");
console.log("📍 Current URL:", window.location.href);
console.log("🔍 TrelloPowerUp available:", typeof TrelloPowerUp);
console.log("📅 dayjs available:", typeof dayjs);
// === END DEBUG ===

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

// ===== START CASE SCRIPT =====

/**
 * Placeholder for the start case button callback.
 * @param {Object} t - The Trello Power-Up interface.
 */
const startCaseCallback = (t) => {
  // In the next step, this will move the card, assign members, and set a due date.
  t.alert({
    message: "Start Case button clicked! (Placeholder)",
    duration: 3,
  });
  return t.closePopup();
};

// ===== POWER-UP INITIALIZATION =====

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
