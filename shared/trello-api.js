/* global APP_KEY */

/**
 * Shared Trello API helpers used across power-ups.
 * Depends on: APP_KEY (global, from each power-up's constants.js).
 * Exposes window.TrelloApi.
 */
(function () {
  "use strict";

  /**
   * Fetches all lists for a board.
   * @param {string} boardId - The board ID.
   * @param {string} token - API token.
   * @returns {Promise<Array>} Array of list objects.
   */
  async function fetchBoardLists(boardId, token) {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/lists?key=${APP_KEY}&token=${token}`,
    );
    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to fetch board lists: ${text}`);
      throw new Error(`Failed to fetch board lists: ${response.status}`);
    }
    return response.json();
  }

  /**
   * Fetches card actions (e.g. list movements, createCard).
   * @param {string} cardId - The card ID.
   * @param {string} token - API token.
   * @param {string} [filter] - Action filter. Default "updateCard,createCard".
   *   Use "updateCard:idList,createCard" for list movements only.
   * @returns {Promise<Array>} Array of action objects.
   */
  async function fetchCardActions(
    cardId,
    token,
    filter = "updateCard,createCard",
  ) {
    const encodedFilter = encodeURIComponent(filter);
    const response = await fetch(
      `https://api.trello.com/1/cards/${cardId}/actions?filter=${encodedFilter}&key=${APP_KEY}&token=${token}`,
    );
    if (!response.ok) {
      const text = await response.text();
      console.error(`Failed to fetch card actions: ${text}`);
      throw new Error(`Failed to fetch card actions: ${response.status}`);
    }
    return response.json();
  }

  window.TrelloApi = {
    fetchBoardLists,
    fetchCardActions,
  };
})();
