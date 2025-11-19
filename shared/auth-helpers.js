/* global TrelloPowerUp */

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
