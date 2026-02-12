/* global ListReport */

/**
 * Card/date and custom field helpers for List Report.
 * Exposes ListReport.helpers.
 */
(function () {
  "use strict";

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
   * Returns list movements for a card in chronological order (oldest first).
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID (used for createCard fallback if needed).
   * @returns {Array<{listId: string, enteredAt: Date}>} Movements with listId and enteredAt.
   */
  const getListMovementsChronological = (actions, cardId) => {
    const listMovements = actions
      .filter(
        (action) =>
          action.type === "createCard" ||
          (action.type === "updateCard" && action.data.listAfter),
      )
      .map((action) => ({
        listId:
          action.type === "createCard"
            ? action.data.list.id
            : action.data.listAfter.id,
        enteredAt: new Date(action.date),
      }))
      .reverse(); // Trello returns newest-first; reverse for chronological order
    return listMovements;
  };

  /**
   * Gets when a card entered a specific list by analyzing card actions.
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID.
   * @param {string} targetListId - The ID of the list we're looking for.
   * @returns {Date|null} The date when the card entered the target list, or null if never entered.
   */
  const getCardListEntryDate = (actions, cardId, targetListId) => {
    const listMovements = getListMovementsChronological(actions, cardId);

    for (let i = listMovements.length - 1; i >= 0; i--) {
      if (listMovements[i].listId === targetListId) {
        return listMovements[i].enteredAt;
      }
    }

    if (listMovements.length > 0) {
      const firstMovement = listMovements[0];
      if (firstMovement.listId === targetListId) {
        return firstMovement.enteredAt;
      }
    }

    return getCardCreationDate(cardId);
  };

  /**
   * Gets the first time a card entered a list (chronologically).
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID.
   * @param {string} listId - The list ID.
   * @returns {Date|null} The date of first entry into the list, or null if never entered.
   */
  const getFirstCardListEntryDate = (actions, cardId, listId) => {
    const movements = getListMovementsChronological(actions, cardId);
    const firstEntry = movements.find((m) => m.listId === listId);
    return firstEntry ? firstEntry.enteredAt : null;
  };

  /**
   * Gets the most recent time a card entered a list before a given date.
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID.
   * @param {string} listId - The list ID.
   * @param {Date} beforeDate - Only consider entries strictly before this date.
   * @returns {Date|null} The latest enteredAt before beforeDate, or null if none.
   */
  const getCardListEntryDateBefore = (actions, cardId, listId, beforeDate) => {
    const movements = getListMovementsChronological(actions, cardId);
    const matching = movements.filter(
      (m) => m.listId === listId && m.enteredAt < beforeDate,
    );
    if (matching.length === 0) return null;
    return matching[matching.length - 1].enteredAt;
  };

  /**
   * Gets the number of days from when the card entered the current work list
   * (most recent entry before release) to when it first entered the released list.
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID.
   * @param {string} currentWorkListId - The list ID for "current work".
   * @param {string} releasedListId - The list ID for "released".
   * @returns {number|null} Days (rounded to nearest integer), or null if cycle cannot be computed.
   */
  const getDaysFromCurrentWorkToReleased = (
    actions,
    cardId,
    currentWorkListId,
    releasedListId,
  ) => {
    const releasedAt = getFirstCardListEntryDate(
      actions,
      cardId,
      releasedListId,
    );
    if (!releasedAt) return null;

    const currentWorkAt = getCardListEntryDateBefore(
      actions,
      cardId,
      currentWorkListId,
      releasedAt,
    );
    if (!currentWorkAt) return null;

    const diffMs = releasedAt - currentWorkAt;
    const days = diffMs / (24 * 60 * 60 * 1000);
    return Math.round(days);
  };

  /**
   * Gets when a card was marked as complete (dueComplete set to true).
   * @param {Array} actions - Array of Trello actions for the card.
   * @param {string} cardId - The card ID (unused, kept for signature consistency).
   * @returns {Date|null} The date when the card was marked complete, or null if never completed.
   */
  const getCardCompletionDate = (actions, cardId) => {
    const completionAction = actions.find(
      (action) =>
        action.type === "updateCard" &&
        action.data &&
        action.data.card &&
        action.data.card.dueComplete === true &&
        (action.data.old == null || action.data.old.dueComplete !== true),
    );

    if (!completionAction || !completionAction.date) {
      return null;
    }

    return new Date(completionAction.date);
  };

  /**
   * Extracts custom field value from card custom fields.
   * @param {Array} cardCustomFields - Array of custom field items from the card.
   * @param {string} customFieldId - The custom field ID to find.
   * @param {Object} fieldDefinition - Optional custom field definition to resolve option values.
   * @returns {string|null} The custom field value or null if not found.
   */
  const getCustomFieldValue = (
    cardCustomFields,
    customFieldId,
    fieldDefinition = null,
  ) => {
    const fieldItem = cardCustomFields.find(
      (item) => item.idCustomField === customFieldId,
    );

    if (!fieldItem) {
      return null;
    }

    if (
      fieldItem.value &&
      fieldItem.value.number !== undefined &&
      fieldItem.value.number !== null
    ) {
      return String(fieldItem.value.number);
    }

    if (
      fieldItem.value &&
      fieldItem.value.text !== undefined &&
      fieldItem.value.text !== null
    ) {
      return fieldItem.value.text;
    }

    if (fieldItem.value && fieldItem.value.option) {
      const option = fieldItem.value.option;
      if (option.value) {
        return option.value.text || option.value.name || option.value;
      }
      if (option.text) {
        return option.text;
      }
      if (option.name) {
        return option.name;
      }
      if (option.id && fieldDefinition && fieldDefinition.options) {
        const optionDef = fieldDefinition.options.find(
          (opt) => opt.id === option.id,
        );
        if (optionDef) {
          return optionDef.value.text || optionDef.value.name || optionDef.value;
        }
      }
      return option.id || null;
    }

    if (
      !fieldItem.value &&
      fieldItem.idValue &&
      fieldDefinition &&
      fieldDefinition.options
    ) {
      const optionDef = fieldDefinition.options.find(
        (opt) => opt.id === fieldItem.idValue,
      );
      if (optionDef) {
        return optionDef.value.text || optionDef.value.name || optionDef.value;
      }
    }

    if (
      fieldItem.value &&
      (typeof fieldItem.value === "string" ||
        typeof fieldItem.value === "number")
    ) {
      return String(fieldItem.value);
    }

    return null;
  };

  window.ListReport = window.ListReport || {};
  window.ListReport.helpers = {
    getCardCreationDate,
    getListMovementsChronological,
    getFirstCardListEntryDate,
    getCardListEntryDateBefore,
    getDaysFromCurrentWorkToReleased,
    getCardListEntryDate,
    getCardCompletionDate,
    getCustomFieldValue,
  };
})();
