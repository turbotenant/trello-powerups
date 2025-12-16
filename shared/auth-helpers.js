/* global TrelloPowerUp */

function showAuthorizePopup(t, event) {
  console.log("🔍 Showing authorize popup");
  const popupOptions = {
    title: "Authorize to continue",
    url: "./authorize.html",
  };

  // Only add mouseEvent if provided (needed when called from iframe context)
  if (event) {
    popupOptions.mouseEvent = event;
  }

  return t.popup(popupOptions);
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
 * Handles the authorization flow.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {HTMLButtonElement} authBtn - The authorize button element.
 * @param {Function} onSuccess - Callback function to execute after successful authorization.
 */
const handleAuthorization = (t, authBtn, onSuccess) => {
  // console.log("🔐 Starting authorization flow...");
  authBtn.textContent = "Authorizing...";
  authBtn.disabled = true;

  t.getRestApi()
    .authorize({ scope: "read,write", expiration: "never" })
    .then(function (token) {
      // console.log("✅ Authorization successful, token received");
      // Store the token at organization level, with fallback to board level
      return t
        .set("organization", "private", "token", token)
        .catch(function (err) {
          console.error(
            "⚠️ Failed to store at org level, trying board level",
            err
          );
          // If organization storage fails, fall back to board level
          return t.set("board", "private", "token", token);
        });
    })
    .then(function () {
      // console.log("✅ Token stored successfully");
      authBtn.textContent = "Authorized!";
      setTimeout(function () {
        if (onSuccess) {
          onSuccess();
        }
      }, 500);
    })
    .catch(function (error) {
      console.error("❌ Authorization failed:", error);
      authBtn.textContent = "Authorization Failed - Try Again";
      authBtn.disabled = false;
    });
};
