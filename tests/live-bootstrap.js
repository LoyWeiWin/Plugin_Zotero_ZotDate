// Isolated Zotero integration harness; never included in the installed XPI.
async function waitForLive(callback, description) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const result = callback();
    if (result) return result;
    await Zotero.Promise.delay(100);
  }
  throw new Error("Timed out: " + description);
}

function livePreviewWindow() {
  const windows = Services.wm.getEnumerator(null);
  while (windows.hasMoreElements()) {
    const window = windows.getNext();
    if (window.document.documentURI.includes("year-only-publication-dates/content/preview.xhtml") && !window.closed) return window;
  }
  return null;
}

async function invokeLiveMenu(index) {
  const popup = Zotero.getMainWindow().document.getElementById("loy-year-only-publication-dates-menu").firstChild;
  popup.children[index].doCommand();
  const preview = await waitForLive(livePreviewWindow, "preview window");
  await waitForLive(() => preview.document.getElementById("counts")?.textContent, "preview rendered");
  return preview;
}

// Run against the actual v1.0.0 XPI before upgrading it to v1.0.0.
async function runLegacyConversion() {
  const main = await waitForLive(() => Zotero.getMainWindow(), "main window");
  await waitForLive(() => main.document.getElementById("loy-year-only-publication-dates-menu"), "legacy plugin menu");
  await waitForLive(() => main.ZoteroPane.itemsView, "main item list loaded");
  await main.ZoteroPane.collectionsView.selectLibrary(Zotero.Libraries.userLibraryID);
  await main.ZoteroPane.onCollectionSelected();
  await waitForLive(() => main.ZoteroPane.itemsView.collectionTreeRows.length, "library view selected");
  const legacy = new Zotero.Item("journalArticle");
  legacy.libraryID = Zotero.Libraries.userLibraryID;
  legacy.setField("title", "Legacy year-only conversion to undo after upgrade");
  legacy.setField("date", "November 12, 2026");
  await legacy.saveTx();
  await main.ZoteroPane.itemsView.waitForLoad();
  await main.ZoteroPane.itemsView.selectItems([legacy.id]);
  const preview = await invokeLiveMenu(0);
  preview.document.getElementById("apply").click();
  await waitForLive(() => preview.document.getElementById("message").textContent.includes("1 dates converted"), "legacy conversion");
  if (legacy.getField("date") !== "2026") throw new Error("Legacy conversion failed");
  preview.close();
  Services.prefs.setStringPref("yearOnlyTest.legacyKey", legacy.key);
  await Zotero.Promise.delay(100);
}

async function runLiveTests() {
  const { IOUtils, PathUtils } = Zotero.getMainWindow();
  const report = { version: Zotero.version, pluginVersion: "1.0.0", checks: [] };
  const reportPath = Services.prefs.getStringPref("yearOnlyTest.reportPath");
  function check(condition, description) {
    if (!condition) throw new Error(description);
    report.checks.push(description);
  }
  try {
    const main = Zotero.getMainWindow();
    const menu = await waitForLive(() => main.document.getElementById("loy-year-only-publication-dates-menu"), "updated plugin menu");
    check(menu.getAttribute("label") === "ZotDate", "Installing v1.0.0 replaces v1.0.0 and updates its Tools menu");
    const legacy = await Zotero.Items.getByLibraryAndKeyAsync(Zotero.Libraries.userLibraryID, Services.prefs.getStringPref("yearOnlyTest.legacyKey"));
    const legacyUndo = await invokeLiveMenu(6);
    check(legacyUndo.arguments[0].rows[0].after === "November 12, 2026", "v1.0.0 backups remain readable after upgrading");
    legacyUndo.document.getElementById("apply").click();
    await waitForLive(() => legacyUndo.document.getElementById("message").textContent.includes("1 dates restored"), "legacy backup undo");
    check(legacy.getField("date") === "November 12, 2026", "New version restores a date removed by the previous version");
    legacyUndo.close();
    legacy.setField("date", "2026");
    await legacy.saveTx();

    const examples = ["12 November 2026", "November 2025", "2024", "2026-31-10", "11/12/2026", "2025/2026", "2026-02-30", "2024-02-29", "09/2023", "2026/11/12"];
    const expected = ["2026-11-12", "2025-11", "2024", "2026-10-31", "2026-12-11", "2025/2026", "2026-02-30", "2024-02-29", "2023-09", "2026-11-12"];
    const created = [];
    for (let index = 0; index < examples.length; index++) {
      const item = new Zotero.Item("journalArticle");
      item.libraryID = Zotero.Libraries.userLibraryID;
      item.setField("title", "Date formatter integration example " + index);
      item.setField("date", examples[index]);
      item.setField("accessDate", "2026-11-12 00:00:00");
      item.setField("extra", "Keep this information");
      await item.saveTx();
      created.push(item);
    }
    const preview = await invokeLiveMenu(1);
    const model = preview.arguments[0];
    check(model.rows.filter(row => created.some(item => item.key === row.key)).length === examples.length, "Library preview reads every reference");
    check(!preview.document.getElementById("date-options").hidden, "Standardisation preview exposes numeric date order controls");
    const lastOrder = preview.document.getElementById("year-last");
    lastOrder.value = "dmy";
    lastOrder.dispatchEvent(new preview.Event("change", { bubbles: true }));
    check(model.rows.find(row => row.key === created[4].key).after === "2026-12-11", "Day-first dropdown resolves an ambiguous year-last date");
    const firstOrder = preview.document.getElementById("year-first");
    firstOrder.value = "ydm";
    firstOrder.dispatchEvent(new preview.Event("change", { bubbles: true }));
    check(model.rows.find(row => row.key === created[9].key).after === "2026-12-11", "Year-first dropdown supports YYYY-DD-MM");
    firstOrder.value = "ymd";
    firstOrder.dispatchEvent(new preview.Event("change", { bubbles: true }));
    check(preview.document.getElementById("apply").textContent === "Convert 6 dates", "Preview recalculates the exact batch after changing numeric conventions");
    check(preview.document.querySelector("footer").getBoundingClientRect().bottom <= preview.innerHeight + 1, "Preview actions fit inside the window");
    check(preview.document.querySelector(".table-wrap").clientHeight >= 120, "Preview retains a readable table area");
    preview.document.getElementById("apply").click();
    await waitForLive(() => preview.document.getElementById("message").textContent.includes("6 dates converted"), "standardisation");
    for (let index = 0; index < created.length; index++) {
      check(created[index].getField("date") === expected[index], "Correct saved precision for " + examples[index]);
      check(created[index].getField("extra") === "Keep this information", "Extra preserved for item " + index);
      check(created[index].getField("accessDate") === "2026-11-12 00:00:00", "Access date preserved for item " + index);
    }
    const backupDir = PathUtils.join(Zotero.DataDirectory.dir, "year-only-publication-dates", "backups");
    const backups = (await IOUtils.getChildren(backupDir)).filter(path => path.endsWith(".json")).sort();
    const backup = await IOUtils.readJSON(backups.at(-1));
    check(backup.state === "complete" && backup.entries.length === 6, "Standardisation stores a durable backup of every changed date");
    preview.close();
    created[0].setField("date", "2026-09-22");
    await created[0].saveTx();
    const undo = await invokeLiveMenu(6);
    check(undo.arguments[0].rows.filter(row => row.status === "convert").length === 5, "Undo excludes a date manually edited after standardisation");
    undo.document.getElementById("apply").click();
    await waitForLive(() => undo.document.getElementById("message").textContent.includes("5 dates restored"), "undo standardisation");
    check(created[0].getField("date") === "2026-09-22", "Undo preserves the later manual edit");
    for (const index of [1, 3, 4, 8, 9]) check(created[index].getField("date") === examples[index], "Undo restores original text for item " + index);
    undo.close();
    await main.ZoteroPane.itemsView.selectItems([created[1].id, created[8].id]);
    const selected = await invokeLiveMenu(0);
    check(selected.arguments[0].rows.length === 2, "Standardise selected items limits scope to the actual selection");
    selected.close();
    const years = await invokeLiveMenu(3);
    check(years.arguments[0].rows.every(row => /^\d{4}$/.test(row.after)), "Year-only mode remains available separately");
    years.document.getElementById("apply").click();
    await waitForLive(() => years.document.getElementById("message").textContent.includes("2 dates converted"), "retained year-only feature");
    check(created[1].getField("date") === "2025" && created[8].getField("date") === "2023", "Original year-only command still saves YYYY");
    years.close();
    report.ok = true;
  }
  catch (error) { report.ok = false; report.error = error.message; report.stack = error.stack; Zotero.logError(error); }
  finally {
    await IOUtils.writeJSON(reportPath, report);
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
  }
}
