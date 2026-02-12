/* global ListReport, USE_SINGLE_CARD_FETCH, getAuthToken, showAuthorizePopup, dayjs */

/**
 * Aggregation, CSV generation, and report flow for List Report.
 * Depends on: list-report-helpers.js, list-report-api.js, constants.js, auth-helpers.js, dayjs.
 * Exposes ListReport.report.
 */
(function () {
  "use strict";

  const helpers = window.ListReport.helpers;
  const api = window.ListReport.api;

  const {
    getCardCompletionDate,
    getCountOfCardListEntries,
    getCustomFieldValue,
    getDaysFromCurrentWorkToReleased,
  } = helpers;

  /**
   * Increments size, daysToRelease, onTime, pastDue, total for a member in memberData.
   * @param {Object} memberData - The memberData object (mutated).
   * @param {string} memberId - The member ID key.
   * @param {string|null} sizeValue - Size value or null.
   * @param {string|null} daysToReleaseValue - Days to release value or null.
   * @param {boolean|null} isOnTime - On time flag.
   * @param {boolean|null} isPastDue - Past due flag.
   * @param {Object|null} sizeField - Size field definition or null.
   * @param {Object|null} daysToReleaseField - Days to release field definition or null.
   */
  function incrementMemberCounts(
    memberData,
    memberId,
    sizeValue,
    daysToReleaseValue,
    isOnTime,
    isPastDue,
    sizeField,
    daysToReleaseField,
  ) {
    memberData[memberId].total++;
    if (sizeValue) {
      memberData[memberId].sizes[sizeValue] =
        (memberData[memberId].sizes[sizeValue] || 0) + 1;
    } else if (sizeField) {
      memberData[memberId].sizes["No Size"] =
        (memberData[memberId].sizes["No Size"] || 0) + 1;
    }
    if (daysToReleaseValue) {
      memberData[memberId].daysToRelease[daysToReleaseValue] =
        (memberData[memberId].daysToRelease[daysToReleaseValue] || 0) + 1;
    } else if (daysToReleaseField) {
      memberData[memberId].daysToRelease["No Days to Release"] =
        (memberData[memberId].daysToRelease["No Days to Release"] || 0) + 1;
    }
    if (isOnTime) {
      memberData[memberId].onTime++;
    }
    if (isPastDue) {
      memberData[memberId].pastDue++;
    }
  }

  /**
   * Processes cards and aggregates data by member.
   * @param {Array} cards - Array of card objects.
   * @param {string} listId - The list ID.
   * @param {string} boardId - The board ID.
   * @param {string} token - API token.
   * @param {Object} [listIds] - Optional. { currentWorkListId, releasedListId, qaListId } for cycle time and QA columns.
   * @returns {Promise<Object>} Aggregated data structure.
   */
  async function aggregateCardData(
    cards,
    listId,
    boardId,
    token,
    listIds = {},
  ) {
    const { currentWorkListId, releasedListId, qaListId } = listIds;
    const hasCycleTimeColumn = Boolean(currentWorkListId && releasedListId);
    const hasQaColumn = Boolean(qaListId);
    let totalCycleTimeSum = 0;
    let totalCycleTimeCount = 0;
    let totalQaTimesSum = 0;

    const customFields = await api.fetchBoardCustomFields(boardId, token);
    const daysToReleaseField = customFields.find(
      (field) => field.name.trim().toLowerCase() === "days to release",
    );
    const sizeField = customFields.find(
      (field) => field.name.trim().toLowerCase() === "size",
    );

    const memberData = {};
    const memberNames = new Map();
    const uniqueSizes = new Set();
    const uniqueDaysToRelease = new Set();

    const cardDataResults = USE_SINGLE_CARD_FETCH
      ? await api.fetchCardDataSingleCard(cards, token)
      : await api.fetchCardDataBatched(cards, token);

    const allMemberIds = new Set();
    for (const { card } of cardDataResults) {
      (card.idMembers || []).forEach((id) => allMemberIds.add(id));
    }

    const memberPromises = Array.from(allMemberIds).map(async (memberId) => {
      try {
        const member = await api.fetchMember(memberId, token);
        return { memberId, name: member.fullName || member.username };
      } catch (error) {
        console.error(`Error fetching member ${memberId}:`, error);
        return { memberId, name: `Member ${memberId}` };
      }
    });

    const memberResults = await Promise.all(memberPromises);
    memberResults.forEach(({ memberId, name }) => {
      memberNames.set(memberId, name);
    });

    for (const { card, actions, cardCustomFields } of cardDataResults) {
      const completionDate = getCardCompletionDate(actions, card.id);
      const sizeValue = sizeField
        ? getCustomFieldValue(cardCustomFields, sizeField.id, sizeField)
        : null;
      const daysToReleaseValue = daysToReleaseField
        ? getCustomFieldValue(
            cardCustomFields,
            daysToReleaseField.id,
            daysToReleaseField,
          )
        : null;

      if (sizeValue) {
        uniqueSizes.add(sizeValue);
      } else if (sizeField) {
        uniqueSizes.add("No Size");
      }
      if (daysToReleaseValue) {
        uniqueDaysToRelease.add(daysToReleaseValue);
      } else if (daysToReleaseField) {
        uniqueDaysToRelease.add("No Days to Release");
      }

      let isOnTime = null;
      let isPastDue = null;
      if (card.due && completionDate) {
        const dueDate = new Date(card.due);
        isOnTime = completionDate <= dueDate;
        isPastDue = completionDate > dueDate;
      }

      const memberIds = card.idMembers || [];
      if (memberIds.length === 0) {
        if (!memberData["unassigned"]) {
          memberData["unassigned"] = {
            sizes: {},
            daysToRelease: {},
            onTime: 0,
            pastDue: 0,
            total: 0,
            ...(hasCycleTimeColumn && { cycleTimeSum: 0, cycleTimeCount: 0 }),
            ...(hasQaColumn && { qaTimesSum: 0 }),
          };
        }
        incrementMemberCounts(
          memberData,
          "unassigned",
          sizeValue,
          daysToReleaseValue,
          isOnTime,
          isPastDue,
          sizeField,
          daysToReleaseField,
        );
      } else {
        for (const memberId of memberIds) {
          if (!memberData[memberId]) {
            memberData[memberId] = {
              sizes: {},
              daysToRelease: {},
              onTime: 0,
              pastDue: 0,
              total: 0,
              ...(hasCycleTimeColumn && { cycleTimeSum: 0, cycleTimeCount: 0 }),
              ...(hasQaColumn && { qaTimesSum: 0 }),
            };
          }
          incrementMemberCounts(
            memberData,
            memberId,
            sizeValue,
            daysToReleaseValue,
            isOnTime,
            isPastDue,
            sizeField,
            daysToReleaseField,
          );
        }
      }

      if (hasCycleTimeColumn) {
        const cycleDays = getDaysFromCurrentWorkToReleased(
          actions,
          card.id,
          currentWorkListId,
          releasedListId,
        );

        if (cycleDays !== null) {
          const idsToUpdate =
            memberIds.length === 0 ? ["unassigned"] : memberIds;

          for (const memberId of idsToUpdate) {
            if (memberData[memberId]) {
              memberData[memberId].cycleTimeSum += cycleDays;
              memberData[memberId].cycleTimeCount += 1;
            }
          }
          totalCycleTimeSum += cycleDays;
          totalCycleTimeCount += 1;
        }
      }

      if (hasQaColumn) {
        const qaCount = getCountOfCardListEntries(actions, card.id, qaListId);
        const idsToUpdate = memberIds.length === 0 ? ["unassigned"] : memberIds;

        for (const memberId of idsToUpdate) {
          if (memberData[memberId]) {
            memberData[memberId].qaTimesSum += qaCount;
          }
        }
        totalQaTimesSum += qaCount;
      }
    }

    const memberNamesObj = {};
    memberNames.forEach((name, id) => {
      memberNamesObj[id] = name;
    });

    console.log("=== Aggregation Summary ===");
    console.log("Unique Sizes found:", Array.from(uniqueSizes));
    console.log(
      "Unique Days to Release found:",
      Array.from(uniqueDaysToRelease),
    );
    console.log("Total members:", Object.keys(memberData).length);
    console.log("Total cards processed:", cards.length);

    const sortedSizes = Array.from(uniqueSizes).sort((a, b) => {
      if (a === "No Size") return 1;
      if (b === "No Size") return -1;
      return a.localeCompare(b);
    });

    const sortedDaysToRelease = Array.from(uniqueDaysToRelease).sort((a, b) => {
      if (a === "No Days to Release") return 1;
      if (b === "No Days to Release") return -1;
      return a.localeCompare(b);
    });

    const result = {
      memberData,
      memberNames: memberNamesObj,
      uniqueSizes: sortedSizes,
      uniqueDaysToRelease: sortedDaysToRelease,
    };

    if (hasCycleTimeColumn) {
      result.hasCycleTimeColumn = true;
      result.totalCycleTimeSum = totalCycleTimeSum;
      result.totalCycleTimeCount = totalCycleTimeCount;
    }

    if (hasQaColumn) {
      result.hasQaColumn = true;
      result.totalQaTimesSum = totalQaTimesSum;
      result.totalCards = cards.length;
    }

    return result;
  }

  /**
   * Escapes a CSV field value.
   * @param {string} value - The value to escape.
   * @returns {string} Escaped CSV value.
   */
  function escapeCSV(value) {
    if (value === null || value === undefined) {
      return "";
    }
    const stringValue = String(value);
    if (
      stringValue.includes(",") ||
      stringValue.includes('"') ||
      stringValue.includes("\n")
    ) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
  }

  /**
   * Generates CSV content from aggregated data.
   * @param {Object} aggregatedData - The aggregated data structure.
   * @returns {string} CSV content.
   */
  function generateCSV(aggregatedData) {
    const {
      memberData,
      memberNames,
      uniqueSizes,
      uniqueDaysToRelease,
      hasCycleTimeColumn = false,
      totalCycleTimeSum = 0,
      totalCycleTimeCount = 0,
      hasQaColumn = false,
      totalQaTimesSum = 0,
      totalCards = 0,
    } = aggregatedData;

    const header = ["Member"];
    uniqueSizes.forEach((size) => {
      header.push(size === "No Size" ? "No Size" : `Size ${size}`);
    });
    uniqueDaysToRelease.forEach((days) => {
      header.push(
        days === "No Days to Release"
          ? "No Days to Release"
          : `Days to Release ${days}`,
      );
    });
    header.push("On Time", "Past Due", "Total Cards");
    if (hasCycleTimeColumn) {
      header.push("Avg days (current → released)");
    }
    if (hasQaColumn) {
      header.push("Avg QA times");
    }

    const rows = [header.map(escapeCSV).join(",")];

    const memberIds = Object.keys(memberData).sort((a, b) => {
      if (a === "unassigned") return 1;
      if (b === "unassigned") return -1;
      const nameA = memberNames[a] || a;
      const nameB = memberNames[b] || b;
      return nameA.localeCompare(nameB);
    });

    const totals = {
      sizes: {},
      daysToRelease: {},
      onTime: 0,
      pastDue: 0,
      total: 0,
    };
    uniqueSizes.forEach((size) => {
      totals.sizes[size] = 0;
    });
    uniqueDaysToRelease.forEach((days) => {
      totals.daysToRelease[days] = 0;
    });

    for (const memberId of memberIds) {
      const data = memberData[memberId];
      const memberName =
        memberId === "unassigned"
          ? "Unassigned"
          : memberNames[memberId] || memberId;

      const row = [escapeCSV(memberName)];
      uniqueSizes.forEach((size) => {
        const value = data.sizes[size] || 0;
        row.push(escapeCSV(value));
        totals.sizes[size] = (totals.sizes[size] || 0) + value;
      });
      uniqueDaysToRelease.forEach((days) => {
        const value = data.daysToRelease[days] || 0;
        row.push(escapeCSV(value));
        totals.daysToRelease[days] = (totals.daysToRelease[days] || 0) + value;
      });
      row.push(
        escapeCSV(data.onTime),
        escapeCSV(data.pastDue),
        escapeCSV(data.total),
      );

      if (hasCycleTimeColumn) {
        const avgValue =
          data.cycleTimeCount > 0
            ? data.cycleTimeSum / data.cycleTimeCount
            : null;

        const hasCycleTimeValue =
          avgValue >= 1
            ? Math.round(avgValue)
            : `${Math.round(avgValue * 24)}hs`;

        const cycleTimeDisplay = avgValue == null ? "" : hasCycleTimeValue;

        row.push(escapeCSV(cycleTimeDisplay));
      }

      if (hasQaColumn) {
        const avgQa = data.total > 0 ? data.qaTimesSum / data.total : null;
        const avgQaDisplay = avgQa == null ? "" : Number(avgQa.toFixed(1));
        row.push(escapeCSV(avgQaDisplay));
      }

      totals.onTime += data.onTime;
      totals.pastDue += data.pastDue;
      totals.total += data.total;
      rows.push(row.join(","));
    }

    const totalsRow = [escapeCSV("TOTALS")];
    uniqueSizes.forEach((size) => {
      totalsRow.push(escapeCSV(totals.sizes[size]));
    });
    uniqueDaysToRelease.forEach((days) => {
      totalsRow.push(escapeCSV(totals.daysToRelease[days]));
    });
    totalsRow.push(
      escapeCSV(totals.onTime),
      escapeCSV(totals.pastDue),
      escapeCSV(totals.total),
    );

    if (hasCycleTimeColumn) {
      const overallAvgValue =
        totalCycleTimeCount > 0
          ? totalCycleTimeSum / totalCycleTimeCount
          : null;

      const hasOverallValue =
        overallAvgValue >= 1
          ? Math.round(overallAvgValue)
          : `${Math.round(overallAvgValue * 24)}hs`;

      const overallCycleTimeDisplay =
        overallAvgValue == null ? "" : hasOverallValue;

      totalsRow.push(escapeCSV(overallCycleTimeDisplay));
    }

    if (hasQaColumn) {
      const overallAvgQa = totalCards > 0 ? totalQaTimesSum / totalCards : null;
      const overallAvgQaDisplay =
        overallAvgQa == null ? "" : Number(overallAvgQa.toFixed(1));
      totalsRow.push(escapeCSV(overallAvgQaDisplay));
    }

    rows.push(totalsRow.join(","));

    const csvContent = rows.join("\n");
    console.log(
      "CSV generated with TOTALS row:",
      csvContent.split("\n").slice(-2),
    );
    return csvContent;
  }

  /**
   * Triggers CSV download.
   * @param {string} csvContent - The CSV content.
   * @param {string} filename - The filename for the download.
   */
  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Main callback to generate the report.
   * @param {Object} t - The Trello Power-Up interface.
   * @param {string} listId - The selected list ID.
   * @param {string} listName - The selected list name.
   */
  async function generateReport(t, listId, listName) {
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
        message: "Fetching cards and generating report...",
        duration: 2,
        display: "info",
      });

      const cards = await api.fetchListCards(listId, token);

      if (cards.length === 0) {
        return t.alert({
          message: "The selected list has no cards.",
          duration: 5,
          display: "warning",
        });
      }

      const currentWorkListId = await api.getCurrentWorkListId(t);
      const releasedListId = await api.getReleasedListId(t);
      const qaListId = await api.getQaListId(t);
      const listIds = {
        ...(currentWorkListId && { currentWorkListId }),
        ...(releasedListId && { releasedListId }),
        ...(qaListId && { qaListId }),
      };

      const aggregatedData = await aggregateCardData(
        cards,
        listId,
        boardId,
        token,
        listIds,
      );

      const csvContent = generateCSV(aggregatedData);
      const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
      const sanitizedListName = listName
        .replace(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      const filename = `list-report-${sanitizedListName}-${timestamp}.csv`;

      downloadCSV(csvContent, filename);

      t.alert({
        message: `Report generated successfully! ${cards.length} cards processed.`,
        duration: 3,
        display: "success",
      });

      return t.closePopup();
    } catch (error) {
      console.error("[List Report] generateReport error:", {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      });
      const toastMessage =
        error.message === "Failed to fetch"
          ? "Network error (check connection or try single-card mode)."
          : `Error generating report: ${error.message}`;
      t.alert({
        message: toastMessage,
        duration: 5,
        display: "error",
      });
    }
  }

  /**
   * Callback for board button click.
   * @param {Object} t - The Trello Power-Up interface.
   */
  async function generateReportCallback(t) {
    try {
      const token = await getAuthToken(t);
      if (!token) {
        return showAuthorizePopup(t);
      }
      return t.boardBar({
        title: "Generate Board Report",
        url: "./list-selection.html",
        height: 300,
      });
    } catch (error) {
      console.error("Error in generateReportCallback:", error);
      t.alert({
        message: "An error occurred while opening the report generator.",
        duration: 5,
        display: "error",
      });
    }
  }

  window.ListReport = window.ListReport || {};
  window.ListReport.report = {
    aggregateCardData,
    generateCSV,
    generateReport,
    generateReportCallback,
    downloadCSV,
    escapeCSV,
  };
})();
