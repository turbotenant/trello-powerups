/* global TrelloPowerUp, dayjs, APP_KEY, APP_NAME, ICON_URL, VERSION, USE_SINGLE_CARD_FETCH */

//  === DEBUG LOGGING ===
// console.log("🚀 Power-Up List Report script loaded!");
// console.log("📍 Current URL List Report:", window.location.href);
// console.log("🔍 TrelloPowerUp available List Report:", typeof TrelloPowerUp);
// console.log("🔍 List Report Version:", VERSION);
// === END DEBUG ===

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
 * Gets when a card entered a specific list by analyzing card actions.
 * @param {Array} actions - Array of Trello actions for the card.
 * @param {string} cardId - The card ID.
 * @param {string} targetListId - The ID of the list we're looking for.
 * @returns {Date|null} The date when the card entered the target list, or null if never entered.
 */
const getCardListEntryDate = (actions, cardId, targetListId) => {
  // Filter actions to only list movements
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
    .reverse(); // Trello returns actions newest-first, reverse to get chronological order

  // Find the most recent entry into the target list
  for (let i = listMovements.length - 1; i >= 0; i--) {
    if (listMovements[i].listId === targetListId) {
      return listMovements[i].enteredAt;
    }
  }

  // If no movement found but card exists, check if it was created in the target list
  if (listMovements.length > 0) {
    const firstMovement = listMovements[0];
    if (firstMovement.listId === targetListId) {
      return firstMovement.enteredAt;
    }
  }

  // If still not found, use card creation date as fallback
  return getCardCreationDate(cardId);
};

/**
 * Gets when a card was marked as complete (dueComplete set to true).
 * @param {Array} actions - Array of Trello actions for the card.
 * @param {string} cardId - The card ID (unused, kept for signature consistency).
 * @returns {Date|null} The date when the card was marked complete, or null if never completed.
 */
const getCardCompletionDate = (actions, cardId) => {
  // Trello returns actions newest-first; find the most recent completion
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

    // If successful or not a rate limit error, return immediately
    if (response.ok || response.status !== 429) {
      return response;
    }

    // If rate limited and we have retries left, wait and retry
    if (response.status === 429 && attempt < maxRetries) {
      let waitTime = 5000; // Default 5 seconds

      // Try to get Retry-After header
      const retryAfter = response.headers.get("Retry-After");
      if (retryAfter) {
        const parsed = parseInt(retryAfter, 10);
        if (!isNaN(parsed) && parsed > 0) {
          waitTime = parsed * 1000;
        }
      } else {
        // Exponential backoff: 5s, 10s, 20s
        waitTime = Math.pow(2, attempt) * 5000;
      }

      console.warn(
        `Rate limited (429). Waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`,
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      continue;
    }

    console.error(`Failed to fetch with retry: ${await response.text()}`);
    // If no retries left or other error, throw
    throw new Error(`Failed to fetch: ${response.status}`);
  }
};

/**
 * Fetches card actions (list movements, createCard, and updateCard including dueComplete).
 * Used for list entry date and for completion date (when card was marked complete).
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
  // Fetch custom field items with full value details
  const response = await fetchWithRetry(() =>
    fetch(
      `https://api.trello.com/1/cards/${cardId}/customFieldItems?key=${APP_KEY}&token=${token}`,
    ),
  );

  if (!response.ok) {
    console.error(`Failed to fetch custom fields: ${await response.text()}`);
    throw new Error(`Failed to fetch custom fields: ${response.status}`);
  }

  const items = await response.json();

  // For items with idValue but null value, try to get the option details
  // Note: Trello API should return value.option for dropdowns, but if not,
  // we'll handle it in getCustomFieldValue using the field definition
  return items;
};

/**
 * Fetches custom field definitions for a board.
 * @param {string} boardId - The board ID.
 * @param {string} token - API token.
 * @returns {Promise<Array>} Array of custom field definitions.
 */
const fetchBoardCustomFields = async (boardId, token) => {
  // Fetch custom fields - the API should include options for dropdown fields
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

  // Handle different custom field types
  // Number field
  if (
    fieldItem.value &&
    fieldItem.value.number !== undefined &&
    fieldItem.value.number !== null
  ) {
    return String(fieldItem.value.number);
  }

  // Text field
  if (
    fieldItem.value &&
    fieldItem.value.text !== undefined &&
    fieldItem.value.text !== null
  ) {
    return fieldItem.value.text;
  }

  // Option/dropdown field - handle different structures
  if (fieldItem.value && fieldItem.value.option) {
    const option = fieldItem.value.option;
    // Try different possible structures
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
      // Look up option by ID in field definition
      const optionDef = fieldDefinition.options.find(
        (opt) => opt.id === option.id,
      );
      if (optionDef) {
        return optionDef.value.text || optionDef.value.name || optionDef.value;
      }
    }
    return option.id || null;
  }

  // Special case: value is null but idValue exists (dropdown field with value set)
  // This happens when Trello returns the field item but value needs to be resolved
  if (
    !fieldItem.value &&
    fieldItem.idValue &&
    fieldDefinition &&
    fieldDefinition.options
  ) {
    // Look up the option by idValue in the field definition
    const optionDef = fieldDefinition.options.find(
      (opt) => opt.id === fieldItem.idValue,
    );
    if (optionDef) {
      return optionDef.value.text || optionDef.value.name || optionDef.value;
    }
  }

  // Check if value itself is a string/number (fallback)
  if (
    fieldItem.value &&
    (typeof fieldItem.value === "string" || typeof fieldItem.value === "number")
  ) {
    return String(fieldItem.value);
  }

  return null;
};

/** Delay constants for batched fetch (used only when USE_SINGLE_CARD_FETCH is false). */
const BATCH_SIZE = 20;
const DELAY_BETWEEN_BATCHES = 300;
const DELAY_BETWEEN_REQUESTS = 150;
const DELAY_BETWEEN_CARDS_SINGLE = 120;

/**
 * Fetches actions and custom fields for all cards in batches.
 * @param {Array} cards - Array of card objects.
 * @param {string} token - API token.
 * @returns {Promise<Array<{card: Object, actions: Array, cardCustomFields: Array}>>}
 */
const fetchCardDataBatched = async (cards, token) => {
  const cardDataResults = [];
  // console.log("Fetching card data in batches...", {
  //   BATCH_SIZE,
  //   DELAY_BETWEEN_BATCHES,
  //   DELAY_BETWEEN_REQUESTS,
  // });

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

/**
 * Processes cards and aggregates data by member.
 * On Time / Past Due: Based on when the card was marked complete (dueComplete) vs due date;
 * cards with a due date but not yet completed are excluded from those counts.
 * @param {Array} cards - Array of card objects.
 * @param {string} listId - The list ID.
 * @param {string} boardId - The board ID.
 * @param {string} token - API token.
 * @returns {Promise<Object>} Aggregated data structure.
 */
const aggregateCardData = async (cards, listId, boardId, token) => {
  // Fetch custom field definitions
  const customFields = await fetchBoardCustomFields(boardId, token);

  // Log available custom fields for debugging
  // console.log(
  //   "Available custom fields:",
  //   customFields.map((f) => f.name),
  // );

  // Find custom fields (case-insensitive, trim whitespace)
  const daysToReleaseField = customFields.find(
    (field) => field.name.trim().toLowerCase() === "days to release",
  );
  const sizeField = customFields.find(
    (field) => field.name.trim().toLowerCase() === "size",
  );

  // Log found fields for debugging
  // if (sizeField) {
  //   console.log("Found Size field:", sizeField.name, sizeField.id);
  // } else {
  //   console.warn(
  //     "Size field not found. Available fields:",
  //     customFields.map((f) => f.name),
  //   );
  // }

  // if (daysToReleaseField) {
  //   console.log(
  //     "Found Days to Release field:",
  //     daysToReleaseField.name,
  //     daysToReleaseField.id,
  //   );
  // } else {
  //   console.log(
  //     "Days to Release field not found (this is OK if not used on this board)",
  //   );
  // }

  // Initialize member data structure
  const memberData = {};
  const memberNames = new Map(); // Use Map for faster lookups
  const uniqueSizes = new Set();
  const uniqueDaysToRelease = new Set();

  // STEP 1: Fetch all card data (single-card or batched based on flag)
  // console.log(
  //   `Fetching data for ${cards.length} cards (mode: ${USE_SINGLE_CARD_FETCH ? "single-card" : "batched"})...`,
  // );
  const cardDataResults = USE_SINGLE_CARD_FETCH
    ? await fetchCardDataSingleCard(cards, token)
    : await fetchCardDataBatched(cards, token);

  // console.log("All card data fetched, processing...");

  // STEP 2: Collect all unique member IDs first
  const allMemberIds = new Set();
  for (const { card } of cardDataResults) {
    const memberIds = card.idMembers || [];
    memberIds.forEach((id) => allMemberIds.add(id));
  }

  // STEP 3: Fetch all members in parallel
  // console.log(`Fetching ${allMemberIds.size} members in parallel...`);
  const memberPromises = Array.from(allMemberIds).map(async (memberId) => {
    try {
      const member = await fetchMember(memberId, token);
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
  // console.log("All members fetched, aggregating data...");

  // STEP 4: Process all cards (now all data is in memory)
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

    // Debug logging for first few cards with Size field
    const cardIndex = cardDataResults.findIndex((r) => r.card.id === card.id);
    if (cardIndex < 3 && sizeField) {
      const sizeFieldItem = cardCustomFields.find(
        (item) => item.idCustomField === sizeField.id,
      );
      // console.log(
      //   `Card ${cardIndex + 1} - Size field item:`,
      //   JSON.stringify(sizeFieldItem, null, 2),
      // );
      // console.log(`Card ${cardIndex + 1} - Size value extracted:`, sizeValue);
      // if (sizeFieldItem && sizeFieldItem.value) {
      //   console.log(
      //     `Card ${cardIndex + 1} - Raw value structure:`,
      //     JSON.stringify(sizeFieldItem.value, null, 2),
      //   );
      // }
    }

    // Track unique values (including "No Size" and "No Days to Release")
    if (sizeValue) {
      uniqueSizes.add(sizeValue);
      // console.log(`Card "${card.name}" has Size value:`, sizeValue);
    } else if (sizeField) {
      // Always track "No Size" if Size field exists on board
      uniqueSizes.add("No Size");
    }
    if (daysToReleaseValue) {
      uniqueDaysToRelease.add(daysToReleaseValue);
    } else if (daysToReleaseField) {
      // Always track "No Days to Release" if Days to Release field exists on board
      uniqueDaysToRelease.add("No Days to Release");
    }

    // Determine on-time status based on when card was marked complete vs due date
    let isOnTime = null;
    let isPastDue = null;
    if (card.due && completionDate) {
      const dueDate = new Date(card.due);
      isOnTime = completionDate <= dueDate;
      isPastDue = completionDate > dueDate;
    }
    // Cards with due date but not yet completed are excluded from on-time/past-due counts

    // Process members (cards can have multiple members)
    const memberIds = card.idMembers || [];
    if (memberIds.length === 0) {
      // Handle unassigned cards
      if (!memberData["unassigned"]) {
        memberData["unassigned"] = {
          sizes: {},
          daysToRelease: {},
          onTime: 0,
          pastDue: 0,
          total: 0,
        };
      }

      memberData["unassigned"].total++;
      if (sizeValue) {
        memberData["unassigned"].sizes[sizeValue] =
          (memberData["unassigned"].sizes[sizeValue] || 0) + 1;
      } else if (sizeField) {
        // Track cards without Size value
        memberData["unassigned"].sizes["No Size"] =
          (memberData["unassigned"].sizes["No Size"] || 0) + 1;
      }
      if (daysToReleaseValue) {
        memberData["unassigned"].daysToRelease[daysToReleaseValue] =
          (memberData["unassigned"].daysToRelease[daysToReleaseValue] || 0) + 1;
      } else if (daysToReleaseField) {
        // Track cards without Days to Release value
        memberData["unassigned"].daysToRelease["No Days to Release"] =
          (memberData["unassigned"].daysToRelease["No Days to Release"] || 0) +
          1;
      }
      if (isOnTime) {
        memberData["unassigned"].onTime++;
      }
      if (isPastDue) {
        memberData["unassigned"].pastDue++;
      }
    } else {
      // Process each member assigned to the card
      for (const memberId of memberIds) {
        if (!memberData[memberId]) {
          memberData[memberId] = {
            sizes: {},
            daysToRelease: {},
            onTime: 0,
            pastDue: 0,
            total: 0,
          };
        }

        memberData[memberId].total++;
        if (sizeValue) {
          memberData[memberId].sizes[sizeValue] =
            (memberData[memberId].sizes[sizeValue] || 0) + 1;
        } else if (sizeField) {
          // Track cards without Size value
          memberData[memberId].sizes["No Size"] =
            (memberData[memberId].sizes["No Size"] || 0) + 1;
        }
        if (daysToReleaseValue) {
          memberData[memberId].daysToRelease[daysToReleaseValue] =
            (memberData[memberId].daysToRelease[daysToReleaseValue] || 0) + 1;
        } else if (daysToReleaseField) {
          // Track cards without Days to Release value
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
    }
  }

  // Convert Map to object for compatibility
  const memberNamesObj = {};
  memberNames.forEach((name, id) => {
    memberNamesObj[id] = name;
  });

  // Summary logging
  console.log("=== Aggregation Summary ===");
  console.log("Unique Sizes found:", Array.from(uniqueSizes));
  console.log("Unique Days to Release found:", Array.from(uniqueDaysToRelease));
  console.log("Total members:", Object.keys(memberData).length);
  console.log("Total cards processed:", cards.length);

  // Sort unique values, putting "No Size" and "No Days to Release" at the end
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

  return {
    memberData,
    memberNames: memberNamesObj,
    uniqueSizes: sortedSizes,
    uniqueDaysToRelease: sortedDaysToRelease,
  };
};

/**
 * Escapes a CSV field value.
 * @param {string} value - The value to escape.
 * @returns {string} Escaped CSV value.
 */
const escapeCSV = (value) => {
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
};

/**
 * Generates CSV content from aggregated data.
 * @param {Object} aggregatedData - The aggregated data structure.
 * @returns {string} CSV content.
 */
const generateCSV = (aggregatedData) => {
  const { memberData, memberNames, uniqueSizes, uniqueDaysToRelease } =
    aggregatedData;

  // Build header row
  const header = ["Member"];

  // Add size columns
  uniqueSizes.forEach((size) => {
    // Use consistent naming - "No Size" stays as is, others get "Size " prefix
    const columnName = size === "No Size" ? "No Size" : `Size ${size}`;
    header.push(columnName);
  });

  // Add days to release columns
  uniqueDaysToRelease.forEach((days) => {
    // Use consistent naming - "No Days to Release" stays as is, others get "Days to Release " prefix
    const columnName =
      days === "No Days to Release"
        ? "No Days to Release"
        : `Days to Release ${days}`;
    header.push(columnName);
  });

  // Add fixed columns (On Time / Past Due = completion date vs due date; incomplete cards excluded)
  header.push("On Time", "Past Due", "Total Cards");

  // Build CSV rows
  const rows = [header.map(escapeCSV).join(",")];

  // Sort member IDs: unassigned last, others alphabetically by name
  const memberIds = Object.keys(memberData).sort((a, b) => {
    if (a === "unassigned") return 1;
    if (b === "unassigned") return -1;
    const nameA = memberNames[a] || a;
    const nameB = memberNames[b] || b;
    return nameA.localeCompare(nameB);
  });

  // Initialize totals object
  const totals = {
    sizes: {},
    daysToRelease: {},
    onTime: 0,
    pastDue: 0,
    total: 0,
  };

  // Initialize totals for all size columns (including "No Size")
  uniqueSizes.forEach((size) => {
    totals.sizes[size] = 0;
  });

  // Initialize totals for all days to release columns (including "No Days to Release")
  uniqueDaysToRelease.forEach((days) => {
    totals.daysToRelease[days] = 0;
  });

  // Generate row for each member
  for (const memberId of memberIds) {
    const data = memberData[memberId];
    const memberName =
      memberId === "unassigned"
        ? "Unassigned"
        : memberNames[memberId] || memberId;

    const row = [escapeCSV(memberName)];

    // Add size counts
    uniqueSizes.forEach((size) => {
      const value = data.sizes[size] || 0;
      row.push(escapeCSV(value));
      totals.sizes[size] = (totals.sizes[size] || 0) + value;
    });

    // Add days to release counts
    uniqueDaysToRelease.forEach((days) => {
      const value = data.daysToRelease[days] || 0;
      row.push(escapeCSV(value));
      totals.daysToRelease[days] = (totals.daysToRelease[days] || 0) + value;
    });

    // Add fixed columns
    row.push(
      escapeCSV(data.onTime),
      escapeCSV(data.pastDue),
      escapeCSV(data.total),
    );

    // Accumulate totals for fixed columns
    totals.onTime += data.onTime;
    totals.pastDue += data.pastDue;
    totals.total += data.total;

    rows.push(row.join(","));
  }

  // Add TOTALS row
  const totalsRow = [escapeCSV("TOTALS")];

  // Add size totals
  uniqueSizes.forEach((size) => {
    totalsRow.push(escapeCSV(totals.sizes[size]));
  });

  // Add days to release totals
  uniqueDaysToRelease.forEach((days) => {
    totalsRow.push(escapeCSV(totals.daysToRelease[days]));
  });

  // Add fixed column totals
  totalsRow.push(
    escapeCSV(totals.onTime),
    escapeCSV(totals.pastDue),
    escapeCSV(totals.total),
  );

  rows.push(totalsRow.join(","));

  const csvContent = rows.join("\n");
  console.log(
    "CSV generated with TOTALS row:",
    csvContent.split("\n").slice(-2),
  ); // Log last 2 rows for debugging
  return csvContent;
};

/**
 * Triggers CSV download.
 * @param {string} csvContent - The CSV content.
 * @param {string} filename - The filename for the download.
 */
const downloadCSV = (csvContent, filename) => {
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
};

/**
 * Main callback to generate the report.
 * @param {Object} t - The Trello Power-Up interface.
 * @param {string} listId - The selected list ID.
 * @param {string} listName - The selected list name.
 */
const generateReport = async (t, listId, listName) => {
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

    // Show loading message
    t.alert({
      message: "Fetching cards and generating report...",
      duration: 2,
      display: "info",
    });

    // Fetch cards from the list
    const cards = await fetchListCards(listId, token);

    if (cards.length === 0) {
      return t.alert({
        message: "The selected list has no cards.",
        duration: 5,
        display: "warning",
      });
    }

    // Aggregate data
    const aggregatedData = await aggregateCardData(
      cards,
      listId,
      boardId,
      token,
    );

    // Generate CSV
    const csvContent = generateCSV(aggregatedData);

    // Generate filename
    const timestamp = dayjs().format("YYYY-MM-DD_HH-mm-ss");
    const sanitizedListName = listName
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const filename = `list-report-${sanitizedListName}-${timestamp}.csv`;

    // Download CSV
    downloadCSV(csvContent, filename);

    t.alert({
      message: `Report generated successfully! ${cards.length} cards processed.`,
      duration: 3,
      display: "success",
    });

    // Close popup if open
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
};

/**
 * Callback for board button click.
 * @param {Object} t - The Trello Power-Up interface.
 */
const generateReportCallback = async (t) => {
  try {
    const token = await getAuthToken(t);
    if (!token) {
      return showAuthorizePopup(t);
    }

    // Show list selection popup
    return t.popup({
      title: "Generate List Report",
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
};

// Make generateReport available globally for popup context
if (typeof window !== "undefined") {
  window.generateReport = generateReport;
}

// Only initialize Power-Up in main context, not in popup contexts (list-selection.html, authorize.html)
const currentPath = window.location.pathname || window.location.href;
const isPopupContext =
  currentPath.includes("list-selection.html") ||
  currentPath.includes("authorize.html");

if (!isPopupContext) {
  // ===== POWER-UP INITIALIZATION =====
  TrelloPowerUp.initialize(
    {
      "on-enable": async function (t, options) {
        const token = await getAuthToken(t);

        if (!token) {
          return t.popup({
            title: "Authorize Account",
            url: "./authorize.html",
            height: 140,
          });
        }
      },
      "board-buttons": async function (t, options) {
        return [
          {
            // Same colored icon for both themes so it appears in color in the header
            icon: { dark: ICON_URL, light: ICON_URL },
            text: "Generate List Report",
            callback: generateReportCallback,
          },
        ];
      },
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    },
  );

  // console.log("✨ Power-Up List Report initialization complete");
}
