/* global TrelloPowerUp, APP_KEY, APP_NAME, VERSION, getAuthToken, ListReport */

(function () {
  "use strict";

  var t = TrelloPowerUp.iframe({
    appKey: APP_KEY,
    appName: APP_NAME,
  });

  var listCheckboxContainer = document.getElementById("list-checkbox-container");
  var toggleAllBtn = document.getElementById("toggle-all-btn");
  var generateBtn = document.getElementById("generate-btn");
  var loadingDiv = document.getElementById("loading");
  var errorDiv = document.getElementById("error");
  var versionSpan = document.getElementById("version");
  var listSelectionPanel = document.getElementById("list-selection-panel");
  var cardJourneyPanel = document.getElementById("card-journey-panel");
  var cardScanScopePanel = document.getElementById("card-scan-scope-panel");
  var fromListSelect = document.getElementById("from-list-select");
  var toListSelect = document.getElementById("to-list-select");

  /** @type {Array<{id: string, name: string}>} */
  var boardLists = [];

  versionSpan.textContent = VERSION;

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  function updateGenerateButtonState() {
    var isCardJourney =
      document.querySelector('input[name="report-type"]:checked').value ===
      "card-journey";

    if (isCardJourney) {
      var fromId = fromListSelect && fromListSelect.value;
      var toId = toListSelect && toListSelect.value;
      generateBtn.disabled = !fromId || !toId || fromId === toId;
    } else {
      var checked = listCheckboxContainer.querySelectorAll(".list-checkbox:checked");
      generateBtn.disabled = !checked.length;
    }
  }

  async function loadLists() {
    try {
      var token = await getAuthToken(t);
      if (!token) {
        errorDiv.textContent =
          "Not authorized. Please authorize the Power-Up first.";
        errorDiv.style.display = "block";
        return;
      }

      var lists = await ListReport.api.fetchBoardLists(t, token);
      boardLists = lists;

      listCheckboxContainer.innerHTML = lists
        .map(
          function (list) {
            return (
              '<li class="list-checkbox-item">' +
              "<label>" +
              '<input type="checkbox" class="list-checkbox" data-list-id="' +
              list.id +
              '" data-list-name="' +
              escapeHtml(list.name) +
              '">' +
              "<span>" +
              escapeHtml(list.name) +
              "</span>" +
              "</label>" +
              "</li>"
            );
          },
        )
        .join("");

      var optionHtml = function (list) {
        return (
          '<option value="' +
          list.id +
          '">' +
          escapeHtml(list.name) +
          "</option>"
        );
      };

      var fromOptions =
        '<option value="">— Select list —</option>' +
        lists.map(optionHtml).join("");
      var toOptions =
        '<option value="">— Select list —</option>' +
        lists.map(optionHtml).join("");

      fromListSelect.innerHTML = fromOptions;
      toListSelect.innerHTML = toOptions;

      toggleAllBtn.style.display = "inline-block";
      toggleAllBtn.textContent = "Select All";
      updateGenerateButtonState();
    } catch (error) {
      console.error("Error loading lists:", error);
      errorDiv.textContent = "Error loading lists: " + error.message;
      errorDiv.style.display = "block";
    }
  }

  document
    .querySelectorAll('input[name="report-type"]')
    .forEach(function (radio) {
      radio.addEventListener("change", function () {
        var isCardJourney = radio.value === "card-journey";
        listSelectionPanel.classList.toggle("visible", !isCardJourney);
        cardJourneyPanel.classList.toggle("visible", isCardJourney);
        cardScanScopePanel.classList.toggle("visible", isCardJourney);
        updateGenerateButtonState();
      });
    });

  fromListSelect.addEventListener("change", updateGenerateButtonState);
  toListSelect.addEventListener("change", updateGenerateButtonState);

  toggleAllBtn.addEventListener("click", function () {
    var checkboxes = listCheckboxContainer.querySelectorAll(".list-checkbox");
    var allChecked = Array.from(checkboxes).every(function (cb) {
      return cb.checked;
    });
    checkboxes.forEach(function (cb) {
      cb.checked = !allChecked;
    });
    toggleAllBtn.textContent = allChecked ? "Select All" : "Deselect All";
    updateGenerateButtonState();
  });

  listCheckboxContainer.addEventListener("change", function () {
    updateGenerateButtonState();
  });

  generateBtn.addEventListener("click", async function () {
    var isCardJourney =
      document.querySelector('input[name="report-type"]:checked').value ===
      "card-journey";

    errorDiv.style.display = "none";
    errorDiv.textContent = "";

    if (isCardJourney) {
      var fromId = fromListSelect.value;
      var toId = toListSelect.value;
      if (!fromId || !toId) {
        errorDiv.textContent = "Please select both From and To lists.";
        errorDiv.style.display = "block";
        return;
      }
      if (fromId === toId) {
        errorDiv.textContent = "From and To lists must be different.";
        errorDiv.style.display = "block";
        return;
      }
      var fromList = boardLists.find(function (l) {
        return l.id === fromId;
      });
      var toList = boardLists.find(function (l) {
        return l.id === toId;
      });

      var scanScope = document.querySelector('input[name="card-scan-scope"]:checked').value;
      var scanScopeRadios = document.querySelectorAll('input[name="card-scan-scope"]');

      generateBtn.disabled = true;
      fromListSelect.disabled = true;
      toListSelect.disabled = true;
      scanScopeRadios.forEach(function (r) { r.disabled = true; });
      loadingDiv.style.display = "block";

      try {
        await ListReport.cardJourney.generateCardJourneyReport(t, fromList, toList, scanScope);
        setTimeout(function () {
          t.closeBoardBar();
        }, 500);
      } catch (error) {
        console.error("Error generating Card Journey report:", error);
        errorDiv.textContent =
          "Error generating report: " + error.message;
        errorDiv.style.display = "block";
        generateBtn.disabled = false;
        fromListSelect.disabled = false;
        toListSelect.disabled = false;
        scanScopeRadios.forEach(function (r) { r.disabled = false; });
        loadingDiv.style.display = "none";
      }
      return;
    }

    var checked = listCheckboxContainer.querySelectorAll(".list-checkbox:checked");
    if (!checked.length) {
      errorDiv.textContent = "Please select at least one list.";
      errorDiv.style.display = "block";
      return;
    }

    var selectedLists = Array.from(checked).map(function (cb) {
      return {
        id: cb.getAttribute("data-list-id"),
        name: cb.getAttribute("data-list-name"),
      };
    });

    generateBtn.disabled = true;
    listCheckboxContainer
      .querySelectorAll(".list-checkbox")
      .forEach(function (cb) {
        cb.disabled = true;
      });
    toggleAllBtn.disabled = true;
    loadingDiv.style.display = "block";

    try {
      await window.generateReport(t, selectedLists);
      setTimeout(function () {
        t.closeBoardBar();
      }, 500);
    } catch (error) {
      console.error("Error generating report:", error);
      errorDiv.textContent = "Error generating report: " + error.message;
      errorDiv.style.display = "block";
      generateBtn.disabled = false;
      listCheckboxContainer
        .querySelectorAll(".list-checkbox")
        .forEach(function (cb) {
          cb.disabled = false;
        });
      toggleAllBtn.disabled = false;
      loadingDiv.style.display = "none";
    }
  });

  loadLists();
})();
