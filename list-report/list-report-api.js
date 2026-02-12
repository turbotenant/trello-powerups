/* global APP_KEY, USE_SINGLE_CARD_FETCH */

/**
 * Trello API and board storage helpers for List Report.
 * Depends on: constants.js (APP_KEY, USE_SINGLE_CARD_FETCH).
 * Exposes ListReport.api.
 */
(function () {
  "use strict";

  const BATCH_SIZE = 20;
  const DELAY_BETWEEN_BATCHES = 300;
  const DELAY_BETWEEN_REQUESTS = 150;
  const DELAY_BETWEEN_CARDS_SINGLE = 120;

  /**
   * Gets the board's current work list ID (saved in settings).
   * @param {Object} t - The Trello Power-Up interface.
   * @returns {Promise<string|null>} The list ID or null.
   */
  const getCurrentWorkListId = async (t) => {
    return t.get("board", "private", "currentWorkListId");
  };

  /**
   * Saves the board's current work list ID.
   * @param {Object} t - The Trello Power-Up interface.
   * @param {string|null} listId - The list ID to save.
   * @returns {Promise<void>}
   */
  const setCurrentWorkListId = async (t, listId) => {
    await t.set("board", "private", "currentWorkListId", listId || null);
  };

  /**
   * Gets the board's released list ID (saved in settings).
   * @param {Object} t - The Trello Power-Up interface.
   * @returns {Promise<string|null>} The list ID or null.
   */
  const getReleasedListId = async (t) => {
    return t.get("board", "private", "releasedListId");
  };

  /**
   * Saves the board's released list ID.
   * @param {Object} t - The Trello Power-Up interface.
   * @param {string|null} listId - The list ID to save.
   * @returns {Promise<void>}
   */
  const setReleasedListId = async (t, listId) => {
    await t.set("board", "private", "releasedListId", listId || null);
  };

  /**
   * Fetches all cards from a specific list.
   * @param {string} listId - The list ID.
   * @param {string} token - API token.
   * @returns {Promise<Array>} Array of card objects.
   */
  const fetchListCards = async (listId, token) => {
    const response = await fetch(
      `https://api.trello.com/1/lists/${listId}/cards?key=${APP_KEY}&token=${token}`,
    );

    if (!response.ok) {
      console.error(`Failed to fetch cards: ${await response.text()}`);
      throw new Error(`Failed to fetch cards: ${response.status}`);
    }

    return await response.json();
  };

  /**
   * Retries a fetch request with exponential backoff on rate limit errors.
   * @param {Function} fetchFn - Function that returns a fetch promise.
   * @param {number} maxRetries - Maximum number of retries.
   * @returns {Promise<Response>} The fetch response.
   */
  const fetchWithRetry = async (fetchFn, maxRetries = 3) => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let response;
      try {
        response = await fetchFn();
      } catch (err) {
        console.error("List Report fetch error (network/rejection):", {
          message: err.message,
          name: err.name,
          cause: err.cause,
          stack: err.stack,
        });
        throw new Error(`Network error: ${err.message}`);
      }

      if (response.ok || response.status !== 429) {
        return response;
      }

      if (response.status === 429 && attempt < maxRetries) {
        let waitTime = 5000;
        const retryAfter = response.headers.get("Retry-After");
        if (retryAfter) {
          const parsed = parseInt(retryAfter, 10);
          if (!isNaN(parsed) && parsed > 0) {
            waitTime = parsed * 1000;
          }
        } else {
          waitTime = Math.pow(2, attempt) * 5000;
        }

        console.warn(
          `Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      console.error(`Failed to fetch with retry: ${await response.text()}`);
      throw new Error(`Failed to fetch: ${response.status}`);
    }
  };

  /**
   * Fetches card actions (list movements, createCard, updateCard including dueComplete).
   * @param {string} cardId - The card ID.
   * @param {string} token - API token.
   * @returns {Promise<Array>} Array of card actions.
   */
  const fetchCardActions = async (cardId, token) => {
    const response = await fetchWithRetry(() =>
      fetch(
        `https://api.trello.com/1/cards/${cardId}/actions?filter=updateCard,createCard&key=${APP_KEY}&token=${token}`,
      ),
    );

    if (!response.ok) {
      console.error(`Failed to fetch card actions: ${await response.text()}`);
      throw new Error(`Failed to fetch card actions: ${response.status}`);
    }

    return await response.json();
  };

  /**
   * Fetches custom field items for a card.
   * @param {string} cardId - The card ID.
   * @param {string} token - API token.
   * @returns {Promise<Array>} Array of custom field items.
   */
  const fetchCardCustomFields = async (cardId, token) => {
    const response = await fetchWithRetry(() =>
      fetch(
        `https://api.trello.com/1/cards/${cardId}/customFieldItems?key=${APP_KEY}&token=${token}`,
      ),
    );

    if (!response.ok) {
      console.error(`Failed to fetch custom fields: ${await response.text()}`);
      throw new Error(`Failed to fetch custom fields: ${response.status}`);
    }

    return await response.json();
  };

  /**
   * Fetches custom field definitions for a board.
   * @param {string} boardId - The board ID.
   * @param {string} token - API token.
   * @returns {Promise<Array>} Array of custom field definitions.
   */
  const fetchBoardCustomFields = async (boardId, token) => {
    const response = await fetch(
      `https://api.trello.com/1/boards/${boardId}/customFields?key=${APP_KEY}&token=${token}`,
    );

    if (!response.ok) {
      console.error(
        `Failed to fetch custom field definitions: ${await response.text()}`,
      );
      throw new Error(
        `Failed to fetch custom field definitions: ${response.status}`,
      );
    }

    return await response.json();
  };

  /**
   * Fetches member details.
   * @param {string} memberId - The member ID.
   * @param {string} token - API token.
   * @returns {Promise<Object>} Member object.
   */
  const fetchMember = async (memberId, token) => {
    const response = await fetch(
      `https://api.trello.com/1/members/${memberId}?key=${APP_KEY}&token=${token}`,
    );

    if (!response.ok) {
      console.error(`Failed to fetch member: ${await response.text()}`);
      throw new Error(`Failed to fetch member: ${response.status}`);
    }

    return await response.json();
  };

  /**
   * Fetches actions and custom fields for all cards in batches.
   * @param {Array} cards - Array of card objects.
   * @param {string} token - API token.
   * @returns {Promise<Array<{card: Object, actions: Array, cardCustomFields: Array}>>}
   */
  const fetchCardDataBatched = async (cards, token) => {
    const cardDataResults = [];

    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      const batch = cards.slice(i, i + BATCH_SIZE);
      console.log(
        `Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(cards.length / BATCH_SIZE)} (${batch.length} cards)...`,
      );

      const batchResults = [];
      for (let j = 0; j < batch.length; j++) {
        const card = batch[j];
        try {
          const [actions, cardCustomFields] = await Promise.all([
            fetchCardActions(card.id, token),
            fetchCardCustomFields(card.id, token),
          ]);
          batchResults.push({ card, actions, cardCustomFields });
        } catch (err) {
          console.error(
            `Card fetch failed: id=${card.id}, name=${card.name || "(no name)"}`,
            err,
          );
          throw new Error(
            `Card ${card.id} (${card.name || "unnamed"}): ${err.message}`,
          );
        }

        if (j < batch.length - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, DELAY_BETWEEN_REQUESTS),
          );
        }
      }

      cardDataResults.push(...batchResults);

      if (i + BATCH_SIZE < cards.length) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_BATCHES),
        );
      }
    }

    return cardDataResults;
  };

  /**
   * Fetches actions and custom fields for all cards one card at a time.
   * @param {Array} cards - Array of card objects.
   * @param {string} token - API token.
   * @returns {Promise<Array<{card: Object, actions: Array, cardCustomFields: Array}>>}
   */
  const fetchCardDataSingleCard = async (cards, token) => {
    const cardDataResults = [];
    console.log(
      `Fetching card data one card at a time (${cards.length} cards, ${DELAY_BETWEEN_CARDS_SINGLE}ms delay)...`,
    );

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const [actions, cardCustomFields] = await Promise.all([
        fetchCardActions(card.id, token),
        fetchCardCustomFields(card.id, token),
      ]);
      cardDataResults.push({ card, actions, cardCustomFields });

      if (i < cards.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_CARDS_SINGLE),
        );
      }
    }

    return cardDataResults;
  };

  window.ListReport = window.ListReport || {};
  window.ListReport.api = {
    fetchListCards,
    fetchWithRetry,
    fetchCardActions,
    fetchCardCustomFields,
    fetchBoardCustomFields,
    fetchMember,
    fetchCardDataBatched,
    fetchCardDataSingleCard,
    getCurrentWorkListId,
    setCurrentWorkListId,
    getReleasedListId,
    setReleasedListId,
  };
})();
