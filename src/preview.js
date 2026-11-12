"use strict";
window.addEventListener("DOMContentLoaded", () => {
  const model = window.arguments[0];
  const rows = model.rows;
  const el = id => document.getElementById(id);
  const pageSize = 100;
  let page = 0;
  let applying = false;
  let completed = false;
  const undo = model.mode === "undo";
  const standard = !undo && model.format === "standard";
  el("scope").textContent = model.scope;
  if (undo) {
    el("heading").textContent = "Restore original publication dates";
    el("explanation").textContent = "Only dates that still match the last converted value can be restored. Later edits are left untouched.";
    el("target-label").textContent = "Original date";
  }
  else if (standard) {
    el("heading").textContent = "Standardise publication dates";
    el("explanation").textContent = "Keep available detail: YYYY-MM-DD, YYYY-MM or YYYY. Original dates are backed up before saving.";
    el("target-label").textContent = "Formatted date";
    el("date-options").hidden = false;
  }

  function selectedCount() { return rows.filter(row => row.status === "convert" && row.checked).length; }
  function filtered() {
    const filter = el("filter").value;
    const query = el("search").value.toLocaleLowerCase();
    return rows.filter(row => (filter === "all" || row.status === filter)
      && (!query || (row.title + " " + row.before).toLocaleLowerCase().includes(query)));
  }
  function updateCount() {
    const counts = { convert: 0, skipped: 0, unchanged: 0 };
    for (const row of rows) counts[row.status]++;
    el("counts").textContent = `${rows.length} references · ${counts.convert} ready · ${counts.unchanged} already formatted · ${counts.skipped} skipped`;
    el("apply").textContent = `${undo ? "Restore" : "Convert"} ${selectedCount()} dates`;
    el("apply").disabled = applying || completed || !selectedCount();
  }
  function render() {
    const visible = filtered();
    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
    page = Math.max(0, Math.min(page, totalPages - 1));
    const body = el("rows");
    body.replaceChildren();
    for (const row of visible.slice(page * pageSize, (page + 1) * pageSize)) {
      const tr = document.createElement("tr");
      tr.className = row.status;
      const checkboxCell = document.createElement("td");
      if (row.status === "convert") {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = row.checked;
        checkbox.disabled = applying || completed;
        checkbox.setAttribute("aria-label", "Change publication date for " + row.title);
        checkbox.addEventListener("change", () => {
          row.checked = checkbox.checked;
          row.excluded = !checkbox.checked;
          updateCount();
        });
        checkboxCell.appendChild(checkbox);
      }
      tr.appendChild(checkboxCell);
      for (const value of [row.title, row.before || "—", row.after || "—", row.reason]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    el("previous").disabled = applying || page === 0;
    el("next").disabled = applying || page >= totalPages - 1;
    el("page-label").textContent = `Page ${page + 1} of ${totalPages} · ${visible.length} items`;
    updateCount();
  }
  for (const id of ["filter", "search"]) el(id).addEventListener("input", () => { page = 0; render(); });
  for (const id of ["year-first", "year-last"]) el(id).addEventListener("change", () => {
    model.reparse({ yearFirst: el("year-first").value, yearLast: el("year-last").value });
    page = 0;
    render();
  });
  el("previous").addEventListener("click", () => { page--; render(); });
  el("next").addEventListener("click", () => { page++; render(); });
  for (const id of ["select-all", "select-none"]) {
    el(id).addEventListener("click", () => {
      for (const row of rows) {
        row.excluded = id === "select-none";
        if (row.status === "convert") row.checked = id === "select-all";
      }
      render();
    });
  }
  el("close").addEventListener("click", () => { if (!applying) window.close(); });
  window.addEventListener("keydown", event => { if (event.key === "Escape" && !applying) window.close(); });
  window.addEventListener("beforeunload", event => {
    if (applying) { event.preventDefault(); event.returnValue = "Dates are being saved."; }
  });
  window.addEventListener("unload", () => model.done());
  el("apply").addEventListener("click", async () => {
    applying = true;
    for (const id of ["select-all", "select-none", "close", "filter", "search", "year-first", "year-last"]) el(id).disabled = true;
    el("message").textContent = undo ? "Restoring dates…" : "Backing up and converting dates…";
    render();
    try {
      const result = await model.run(rows);
      completed = true;
      el("message").textContent = `${result.changed} dates ${undo ? "restored" : "converted"}.`
        + (result.skipped ? ` ${result.skipped} items changed after preview and were skipped.` : "")
        + (result.warning ? " " + result.warning : "");
      el("note").textContent = undo ? "Original dates restored." : "Undo is available in Tools → ZotDate.";
      el("close").textContent = "Close";
    }
    catch (error) {
      el("message").textContent = "The operation failed and the database transaction was rolled back. " + error.message;
      for (const id of ["select-all", "select-none", "filter", "search", "year-first", "year-last"]) el(id).disabled = false;
    }
    finally { applying = false; el("close").disabled = false; render(); }
  });
  render();
});
