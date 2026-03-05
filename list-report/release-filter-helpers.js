/* global ListReport */

/**
 * Helpers for the Generate Release Notes feature.
 * Depends on: list-report-api.js (ListReport.api).
 * Exposes window.ReleaseFilter.helpers.
 */
(function () {
  "use strict";

  const DELAY_BETWEEN_CARDS = 120;

  /**
   * Extracts the date value from a card's custom field items for a given field ID.
   * Trello date custom fields store: { "value": { "date": "2018-03-13T16:00:00.000Z" } }
   * @param {Array} cardCustomFields - Array of custom field items from the card.
   * @param {string} customFieldId - The custom field definition ID.
   * @returns {Date|null} The date value or null if not found or not a date.
   */
  const getCustomFieldDate = (cardCustomFields, customFieldId) => {
    const fieldItem = cardCustomFields.find(
      (item) => item.idCustomField === customFieldId,
    );

    if (!fieldItem || !fieldItem.value || !fieldItem.value.date) {
      return null;
    }

    const date = new Date(fieldItem.value.date);
    return isNaN(date.getTime()) ? null : date;
  };

  /**
   * Checks if a date falls within a range (inclusive), comparing date-only (YYYY-MM-DD).
   * @param {Date} date - The date to check.
   * @param {string|null} startDateStr - Start date (YYYY-MM-DD) or null/empty for no lower bound.
   * @param {string} endDateStr - End date (YYYY-MM-DD).
   * @returns {boolean}
   */
  const isDateInRange = (date, startDateStr, endDateStr) => {
    const dateStr = date.toISOString().slice(0, 10);

    if (startDateStr && dateStr < startDateStr) {
      return false;
    }
    if (endDateStr && dateStr > endDateStr) {
      return false;
    }
    return true;
  };

  /**
   * Fetches custom fields for each card and filters by date range on the given field.
   * @param {Array} cards - Array of card objects.
   * @param {string} customFieldId - The custom field definition ID to filter on.
   * @param {string|null} startDateStr - Start date (YYYY-MM-DD) or null.
   * @param {string} endDateStr - End date (YYYY-MM-DD).
   * @param {string} token - API token.
   * @returns {Promise<Array<{card: Object, fieldDate: Date}>>} Matching cards with their field date.
   */
  const filterCardsByCustomFieldDate = async (
    cards,
    customFieldId,
    startDateStr,
    endDateStr,
    token,
  ) => {
    const results = [];

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cardCustomFields = await ListReport.api.fetchCardCustomFields(
        card.id,
        token,
      );
      const fieldDate = getCustomFieldDate(cardCustomFields, customFieldId);

      if (fieldDate && isDateInRange(fieldDate, startDateStr, endDateStr)) {
        results.push({ card, fieldDate });
      }

      if (i < cards.length - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, DELAY_BETWEEN_CARDS),
        );
      }
    }

    results.sort((a, b) => a.fieldDate - b.fieldDate);
    return results;
  };

  /**
   * Formats the release notes output text.
   * @param {Array<string>} cardNames - Array of card names.
   * @param {string|null} startDateStr - Start date (YYYY-MM-DD) or null.
   * @param {string} endDateStr - End date (YYYY-MM-DD).
   * @returns {string}
   */
  const formatReleaseNotes = (cardNames, startDateStr, endDateStr) => {
    let dateRange;
    if (startDateStr && startDateStr === endDateStr) {
      dateRange = endDateStr;
    } else if (startDateStr) {
      dateRange = "from " + startDateStr + " to " + endDateStr;
    } else {
      dateRange = "up to " + endDateStr;
    }

    const cardList = cardNames.map(function (name) {
      return "- " + name;
    }).join("\n");

    return (
      "Release date: " + dateRange + "\n" +
      "Team #: \n" +
      "Description:\n" +
      "\n" +
      cardList
    );
  };

  window.ReleaseFilter = window.ReleaseFilter || {};
  window.ReleaseFilter.helpers = {
    getCustomFieldDate,
    isDateInRange,
    filterCardsByCustomFieldDate,
    formatReleaseNotes,
  };
})();
