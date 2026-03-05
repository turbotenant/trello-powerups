/* global ListReport, USE_SINGLE_CARD_FETCH, getAuthToken, showAuthorizePopup, dayjs */

/**
 * Card Journey report: counts how many cards each member moved from a From list to a To list.
 * Depends on: list-report-helpers.js, list-report-api.js, list-report-report.js (escapeCSV, downloadCSV), constants.js, auth-helpers.js, dayjs.
 * Exposes ListReport.cardJourney.
 */
(function () {
  "use strict";

  const api = window.ListReport.api;
  const helpers = window.ListReport.helpers;
  const listReport = window.ListReport.report;

  const { getMovesFromToList } = helpers;

  /**
   * Aggregates move counts by member (who performed the move) for cards moved from fromListId to toListId.
   * @param {string} fromListId - Source list ID.
   * @param {string} toListId - Destination list ID.
   * @param {string} boardId - Board ID.
   * @param {string} token - API token.
   * @returns {Promise<{memberData: Object, memberNames: Object}>}
   */
  async function aggregateCardJourneyData(fromListId, toListId, boardId, token) {
    const cards = await api.fetchBoardCards(boardId, token);

    if (cards.length === 0) {
      return { memberData: {}, memberNames: {} };
    }

    const cardDataResults = USE_SINGLE_CARD_FETCH
      ? await api.fetchCardDataSingleCard(cards, token)
      : await api.fetchCardDataBatched(cards, token);

    const memberData = {};

    for (const { actions } of cardDataResults) {
      const moves = getMovesFromToList(actions, fromListId, toListId);
      for (const { memberId } of moves) {
        if (!memberData[memberId]) {
          memberData[memberId] = 0;
        }
        memberData[memberId] += 1;
      }
    }

    const memberIds = Object.keys(memberData);
    const memberNames = {};

    await Promise.all(
      memberIds.map(async (memberId) => {
        if (memberId === "unassigned") {
          memberNames[memberId] = "Unassigned";
          return;
        }
        try {
          const member = await api.fetchMember(memberId, token);
          memberNames[memberId] = member.fullName || member.username || memberId;
        } catch (error) {
          console.error("Error fetching member " + memberId + ":", error);
          memberNames[memberId] = "Member " + memberId;
        }
      }),
    );

    return { memberData, memberNames };
  }

  /**
   * Generates CSV content for the Card Journey report.
   * @param {Object} aggregatedData - { memberData, memberNames }.
   * @returns {string} CSV content.
   */
  function generateCardJourneyCSV(aggregatedData) {
    const { memberData, memberNames } = aggregatedData;
    const escapeCSV = listReport.escapeCSV;

    const header = ["Member", "Cards Moved"];
    const rows = [header.map(escapeCSV).join(",")];

    const memberIds = Object.keys(memberData).sort((a, b) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      const nameA = memberNames[a] || a;
      const nameB = memberNames[b] || b;
      return nameA.localeCompare(nameB);
    });

    let totalMoves = 0;

    for (const memberId of memberIds) {
      const count = memberData[memberId];
      totalMoves += count;
      const memberName =
        memberId === "unassigned"
          ? "Unassigned"
          : memberNames[memberId] || memberId;
      rows.push([escapeCSV(memberName), escapeCSV(count)].join(","));
    }

    rows.push([escapeCSV("TOTALS"), escapeCSV(totalMoves)].join(","));

    return rows.join("\n");
  }

  /**
   * Generates and downloads the Card Journey report.
   * @param {Object} t - Trello Power-Up interface.
   * @param {{id: string, name: string}} fromList - From list.
   * @param {{id: string, name: string}} toList - To list.
   */
  async function generateCardJourneyReport(t, fromList, toList) {
    try {
      const token = await getAuthToken(t);
      if (!token) {
        return showAuthorizePopup(t);
      }

      const context = t.getContext();
      const boardId = context && context.board;
      if (!boardId) {
        throw new Error("Could not get board context");
      }

      t.alert({
        message: "Fetching card actions and generating Card Journey report...",
        duration: 2,
        display: "info",
      });

      const aggregatedData = await aggregateCardJourneyData(
        fromList.id,
        toList.id,
        boardId,
        token,
      );

      const csvContent = generateCardJourneyCSV(aggregatedData);
      const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
      const fromSlug = fromList.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const toSlug = toList.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const filename = `card-journey-${fromSlug}-to-${toSlug}-${timestamp}.csv`;

      listReport.downloadCSV(csvContent, filename);

      const totalMoves = Object.values(aggregatedData.memberData).reduce(
        (sum, count) => sum + count,
        0,
      );

      t.alert({
        message:
          totalMoves === 0
            ? "No moves found between these lists."
            : "Card Journey report generated. " + totalMoves + " moves counted.",
        duration: 3,
        display: "success",
      });

      return t.closePopup();
    } catch (error) {
      console.error("[Card Journey] generateCardJourneyReport error:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
      const toastMessage =
        error.message === "Failed to fetch"
          ? "Network error (check connection or try single-card mode)."
          : "Error generating Card Journey report: " + error.message;
      t.alert({
        message: toastMessage,
        duration: 5,
        display: "error",
      });
    }
  }

  window.ListReport = window.ListReport || {};
  window.ListReport.cardJourney = {
    aggregateCardJourneyData,
    generateCardJourneyCSV,
    generateCardJourneyReport,
  };
})();
