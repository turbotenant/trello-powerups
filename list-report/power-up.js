/* global TrelloPowerUp, APP_KEY, APP_NAME, ICON_URL, VERSION, getAuthToken, handleAuthorization, ListReport */

/**
 * List Report Power-Up entry and settings.
 * Depends on: constants.js, auth-helpers.js, list-report-helpers.js, list-report-api.js, list-report-report.js.
 */

const currentPath = window.location.pathname || window.location.href;
const isPopupContext =
  currentPath.includes("list-selection.html") ||
  currentPath.includes("authorize.html");

if (currentPath.includes("settings.html")) {
  window.addEventListener("load", async () => {
    const t = TrelloPowerUp.iframe({
      appKey: APP_KEY,
      appName: APP_NAME,
    });
    try {
      const renderListReportSettings = async (t, token) => {
        const container = document.getElementById("list-report-settings");
        if (!container) return;

        const context = t.getContext();
        const boardId = context && context.board;
        if (!boardId) {
          container.innerHTML =
            '<p class="settings-error">Could not load board context.</p>';
          return;
        }

        let lists;
        try {
          lists = await TrelloApi.fetchBoardLists(boardId, token);
        } catch (err) {
          container.innerHTML =
            '<p class="settings-error">Could not load lists.</p>';
          return;
        }
        const currentWorkListId = await ListReport.api.getCurrentWorkListId(t);
        const releasedListId = await ListReport.api.getReleasedListId(t);

        const optionsHtml = (selectedId) =>
          '<option value="">— None —</option>' +
          lists
            .map(
              (list) =>
                `<option value="${list.id}"${list.id === selectedId ? " selected" : ""}>${list.name}</option>`,
            )
            .join("");

        container.innerHTML = `
          <div class="settings-section">
            <h3>Current work list</h3>
            <p>Choose the list that represents work currently in progress.</p>
            <select id="current-work-list-select">${optionsHtml(currentWorkListId)}</select>
          </div>
          <div class="settings-section">
            <h3>Released list</h3>
            <p>Choose the list that represents released/done work.</p>
            <select id="released-list-select">${optionsHtml(releasedListId)}</select>
          </div>
          <button type="button" id="save-list-report-settings-btn" class="save-btn">Save</button>
        `;

        const saveBtn = document.getElementById(
          "save-list-report-settings-btn",
        );
        if (saveBtn) {
          saveBtn.addEventListener("click", async () => {
            const currentWorkSelect = document.getElementById(
              "current-work-list-select",
            );
            const releasedSelect = document.getElementById(
              "released-list-select",
            );
            const selectedCurrentWork = currentWorkSelect
              ? currentWorkSelect.value
              : "";
            const selectedReleased = releasedSelect ? releasedSelect.value : "";
            await ListReport.api.setCurrentWorkListId(
              t,
              selectedCurrentWork || null,
            );
            await ListReport.api.setReleasedListId(
              t,
              selectedReleased || null,
            );
            saveBtn.textContent = "Saved!";
            setTimeout(() => {
              saveBtn.textContent = "Save";
            }, 2000);
          });
        }
      };

      const token = await getAuthToken(t);

      const versionSpan = document.getElementById("version");
      if (versionSpan) {
        versionSpan.textContent = typeof VERSION !== "undefined" ? VERSION : "";
      }

      if (!token) {
        const container = document.getElementById("list-report-settings");
        container.innerHTML = `
          <div style="text-align: center; padding: 20px;">
            <p style="margin: 0 0 15px 0;">Please authorize this Power-Up to configure settings.</p>
            <button id="auth-btn" style="background-color: #0079bf; color: white; border: none; padding: 10px 20px; border-radius: 3px; cursor: pointer; font-size: 14px;">
              Authorize
            </button>
          </div>
        `;

        const authBtn = document.getElementById("auth-btn");
        if (authBtn) {
          authBtn.addEventListener("click", function () {
            handleAuthorization(t, authBtn, () => {
              location.reload();
            });
          });
        }

        t.sizeTo("#content");
        return;
      }

      await renderListReportSettings(t, token);
      t.sizeTo("#content");
    } catch (error) {
      console.error("Error during List Report Settings execution:", error);
      const container = document.getElementById("list-report-settings");
      if (container) {
        container.innerHTML =
          '<p class="settings-error">An unexpected error occurred.</p>';
      }
    }
  });
} else if (!isPopupContext) {
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
            icon: { dark: ICON_URL, light: ICON_URL },
            text: "Generate List Report",
            callback: ListReport.report.generateReportCallback,
          },
        ];
      },
      "show-settings": function (t, options) {
        return t.popup({
          title: "List Report Settings",
          url: "./settings.html",
          height: 400,
        });
      },
    },
    {
      appKey: APP_KEY,
      appName: APP_NAME,
    },
  );
}

if (typeof window !== "undefined" && window.ListReport && window.ListReport.report) {
  window.generateReport = ListReport.report.generateReport;
}
