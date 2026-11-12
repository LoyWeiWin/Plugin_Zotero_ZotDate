var YearOnlyDates = {
  version: "1.0.0",
  menuID: "loy-year-only-publication-dates-menu",
  dialog: null,
  busy: false,

  addWindow(window) {
    const doc = window.document;
    if (doc.getElementById(this.menuID)) return;
    const tools = doc.getElementById("menu_ToolsPopup");
    if (!tools) return;
    const menu = doc.createXULElement("menu");
    menu.id = this.menuID;
    menu.setAttribute("label", "ZotDate");
    const popup = doc.createXULElement("menupopup");
    const commands = [
      ["Standardise selected items…", () => this.preview(window, "selected", "standard")],
      ["Standardise current library…", () => this.preview(window, "library", "standard")],
      [null],
      ["Keep year only for selected items…", () => this.preview(window, "selected", "year")],
      ["Keep year only for current library…", () => this.preview(window, "library", "year")],
      [null],
      ["Undo latest date change…", () => this.previewUndo(window)]
    ];
    for (const [label, callback] of commands) {
      const element = doc.createXULElement(label ? "menuitem" : "menuseparator");
      if (label) {
        element.setAttribute("label", label);
        element.addEventListener("command", () => this.guard(window, callback));
      }
      popup.appendChild(element);
    }
    menu.appendChild(popup);
    tools.appendChild(menu);
  },

  removeWindow(window) {
    window.document.getElementById(this.menuID)?.remove();
    if (this.dialog && !this.dialog.closed && this.dialog.opener === window) this.dialog.close();
  },

  shutdown() {
    if (this.dialog && !this.dialog.closed) this.dialog.close();
    this.dialog = null;
    for (const window of Zotero.getMainWindows()) this.removeWindow(window);
  },

  async guard(window, operation) {
    if (this.dialog && !this.dialog.closed) {
      this.dialog.focus();
      return;
    }
    if (this.busy) return;
    this.busy = true;
    try { await operation(); }
    catch (error) {
      Zotero.logError(error);
      Services.prompt.alert(window, "ZotDate", "No conversion was completed.\n\n" + error.message);
    }
    finally { this.busy = false; }
  },

  dateField(item) {
    return Zotero.ItemFields.getFieldIDFromTypeAndBase(item.itemTypeID, "date");
  },

  editable(item) {
    return !!Zotero.Libraries.get(item.libraryID)?.editable;
  },

  async rowFor(item, format = "year", options = {}) {
    if (!item.isRegularItem() || item.deleted) return null;
    await item.loadAllData();
    const field = this.dateField(item);
    if (!field) return null;
    const before = String(item.getField(field) || "");
    const parsed = format === "standard" ? YearOnlyDateParser.standardize(before, options) : YearOnlyDateParser.parse(before);
    const row = {
      id: item.id, key: item.key, libraryID: item.libraryID, field,
      title: item.getField("title", false, true) || "Untitled item",
      before, after: parsed.value || parsed.year || "", status: parsed.status,
      reason: parsed.reason, checked: parsed.status === "convert", editable: this.editable(item), excluded: false
    };
    if (!this.editable(item)) {
      row.status = "skipped";
      row.reason = "Library is read-only";
      row.checked = false;
    }
    return row;
  },

  async preview(window, scope, format = "year") {
    const pane = window.ZoteroPane;
    const libraryID = pane.getSelectedLibraryID();
    const library = Zotero.Libraries.get(libraryID);
    if (!library) throw new Error("Choose a personal or group library first.");
    const items = scope === "selected"
      ? pane.getSelectedItems()
      : await Zotero.Items.getAll(libraryID, true, false);
    if (!items.length) {
      Services.prompt.alert(window, "ZotDate", "Select the reference items you want to convert first.");
      return;
    }
    const rows = [];
    for (const item of items) {
      const row = await this.rowFor(item, format);
      if (row) rows.push(row);
    }
    this.openPreview(window, { rows, mode: "convert", format,
      scope: scope === "selected" ? "Selected items" : "Library: " + library.name });
  },

  backupDirectory() {
    return PathUtils.join(Zotero.DataDirectory.dir, "year-only-publication-dates", "backups");
  },

  async writeBackup(path, data) {
    await IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp" });
  },

  async createBackup(rows) {
    const directory = this.backupDirectory();
    await IOUtils.makeDirectory(directory, { createAncestors: true, ignoreExisting: true });
    const createdAt = new Date().toISOString();
    const name = createdAt.replace(/[:.]/g, "-") + "-" + Services.uuid.generateUUID().toString().slice(1, 9) + ".json";
    const path = PathUtils.join(directory, name);
    const data = {
      format: "year-only-publication-dates", formatVersion: 1, pluginVersion: this.version,
      createdAt, state: "prepared",
      entries: rows.map(row => ({ libraryID: row.libraryID, key: row.key,
        field: row.field, title: row.title, before: row.before, after: row.after }))
    };
    await this.writeBackup(path, data);
    return { path, data };
  },

  async previewUndo(window) {
    const directory = this.backupDirectory();
    if (!await IOUtils.exists(directory)) {
      Services.prompt.alert(window, "ZotDate", "There are no conversions to undo.");
      return;
    }
    const paths = (await IOUtils.getChildren(directory)).filter(path => path.endsWith(".json")).sort().reverse();
    let backup;
    for (const path of paths) {
      let data;
      try { data = await IOUtils.readJSON(path); }
      catch (error) { Zotero.logError(error); continue; }
      if (data.format === "year-only-publication-dates" && data.formatVersion === 1
          && ["prepared", "complete"].includes(data.state) && Array.isArray(data.entries)
          && data.entries.length) {
        backup = { path, data };
        break;
      }
    }
    if (!backup) {
      Services.prompt.alert(window, "ZotDate", "There are no remaining conversions to undo.");
      return;
    }
    const rows = [];
    for (const entry of backup.data.entries) {
      if ((backup.data.restoredKeys || []).includes(entry.libraryID + "/" + entry.key)) continue;
      const item = await Zotero.Items.getByLibraryAndKeyAsync(entry.libraryID, entry.key);
      let reason = "Item no longer exists";
      let before = "";
      if (item && !item.deleted && item.isRegularItem()) {
        await item.loadAllData();
        before = String(item.getField(entry.field) || "");
        if (!this.editable(item)) reason = "Library is read-only";
        else if (this.dateField(item) !== entry.field) reason = "Item type/date field has changed";
        else if (before === entry.after) reason = "Restore original publication date";
        else reason = before === entry.before ? "Already restored" : "Date changed since conversion; left untouched";
      }
      const canRestore = reason === "Restore original publication date";
      rows.push({ id: item?.id, libraryID: entry.libraryID, key: entry.key, field: entry.field,
        title: entry.title, before, after: entry.before,
        status: canRestore ? "convert" : "skipped", checked: canRestore, reason });
    }
    this.openPreview(window, { rows, mode: "undo", backup,
      scope: "Conversion from " + new Date(backup.data.createdAt).toLocaleString() });
  },

  openPreview(window, model) {
    model.run = rows => this.applyRows(rows, model);
    model.reparse = options => {
      for (const row of model.rows) {
        if (row.editable === false) continue;
        const result = YearOnlyDateParser.standardize(row.before, options);
        row.after = result.value || "";
        row.status = result.status;
        row.reason = result.reason;
        row.checked = result.status === "convert" && !row.excluded;
      }
    };
    model.done = () => { this.dialog = null; };
    this.dialog = window.openDialog(
      "chrome://year-only-publication-dates/content/preview.xhtml", "",
      "chrome,centerscreen,resizable,dialog=no,width=1000,height=680", model
    );
  },

  async applyRows(rows, model) {
    if (this.busy) throw new Error("Another date operation is running.");
    this.busy = true;
    let backup;
    let committed = false;
    try {
      const selected = rows.filter(row => row.status === "convert" && row.checked);
      if (!selected.length) return { changed: 0, skipped: 0, warning: "" };
      // The durable backup must succeed before any database fields are modified.
      if (model.mode === "convert") backup = await this.createBackup(selected);
      let changed = 0;
      let skipped = 0;
      const restoredKeys = [];
      await Zotero.DB.executeTransaction(async () => {
        for (const row of selected) {
          const item = await Zotero.Items.getByLibraryAndKeyAsync(row.libraryID, row.key);
          if (item) await item.loadAllData();
          if (!item || !item.isRegularItem() || item.deleted || !this.editable(item)
              || this.dateField(item) !== row.field
              || String(item.getField(row.field) || "") !== row.before) {
            skipped++;
            continue;
          }
          item.setField(row.field, row.after);
          await item.save();
          changed++;
          restoredKeys.push(row.libraryID + "/" + row.key);
        }
        if (backup) {
          // Persist exactly the entries touched by this transaction before it
          // commits; stale preview rows must never become undo candidates.
          const affected = new Set(restoredKeys);
          backup.data.entries = backup.data.entries.filter(entry => affected.has(entry.libraryID + "/" + entry.key));
          await this.writeBackup(backup.path, backup.data);
        }
      });
      committed = true;
      let warning = "";
      try {
        if (backup) {
          backup.data.state = "complete";
          backup.data.changed = changed;
          backup.data.skipped = skipped;
          await this.writeBackup(backup.path, backup.data);
        }
        else if (model.mode === "undo") {
          // Keep unchecked or edited dates available for a later undo attempt.
          const restored = new Set([...(model.backup.data.restoredKeys || []), ...restoredKeys]);
          model.backup.data.restoredKeys = [...restored];
          const remaining = model.backup.data.entries.filter(entry => !restored.has(entry.libraryID + "/" + entry.key));
          model.backup.data.state = remaining.length ? "complete" : "undone";
          model.backup.data.lastUndoAt = new Date().toISOString();
          await this.writeBackup(model.backup.path, model.backup.data);
        }
      }
      catch (error) {
        Zotero.logError(error);
        warning = "The dates were saved, but the backup status could not be updated. The original backup is still available.";
      }
      return { changed, skipped, warning };
    }
    catch (error) {
      if (backup && !committed) {
        try { backup.data.state = "failed"; await this.writeBackup(backup.path, backup.data); }
        catch (backupError) { Zotero.logError(backupError); }
      }
      Zotero.logError(error);
      throw error;
    }
    finally { this.busy = false; }
  }
};
