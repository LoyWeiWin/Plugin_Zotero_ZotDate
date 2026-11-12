const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parser = require('../src/parser.js');

function environment() {
  const files = new Map();
  const items = new Map();
  const alerts = [];
  let writes = 0;
  let writeFailure = 0;
  const libraries = new Map([[1, { editable: true, name: 'My Library' }], [2, { editable: false }]]);
  const Zotero = {
    logError() {}, getMainWindows: () => [], DataDirectory: { dir: '/test-data' },
    Libraries: { get: id => libraries.get(id) },
    ItemFields: { getFieldIDFromTypeAndBase: type => type === 1 ? 6 : false },
    Items: { getByLibraryAndKeyAsync: async (libraryID, key) => items.get(libraryID + '/' + key) },
    DB: { executeTransaction: async callback => {
      const original = new Map([...items].map(([key, item]) => [key, item.date]));
      try { await callback(); }
      catch (error) { for (const [key, date] of original) items.get(key).date = date; throw error; }
    } }
  };
  const IOUtils = {
    exists: async path => path.endsWith('/backups') ? files.size > 0 : files.has(path),
    makeDirectory: async () => {},
    writeJSON: async (path, data) => {
      writes++;
      if (writes === writeFailure) throw new Error('simulated disk failure');
      files.set(path, JSON.parse(JSON.stringify(data)));
    },
    readJSON: async path => JSON.parse(JSON.stringify(files.get(path))),
    getChildren: async () => [...files.keys()]
  };
  let counter = 0;
  const scope = vm.createContext({ Zotero, IOUtils, YearOnlyDateParser: parser,
    PathUtils: { join: (...parts) => parts.join('/') },
    Services: { uuid: { generateUUID: () => '{test-' + (++counter).toString().padStart(8, '0') + '}' },
      prompt: { alert: (...args) => alerts.push(args) } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/year-only.js'), 'utf8'), scope);
  const plugin = scope.YearOnlyDates;
  function add(key, date, extra = {}) {
    const item = { id: items.size + 1, key, libraryID: 1, itemTypeID: 1, date, deleted: false,
      isRegularItem: () => true, loadAllData: async () => {},
      getField(field) { return field === 6 ? this.date : 'Title ' + key; },
      setField(field, value) { assert.equal(field, 6); this.date = value; },
      async save() { if (this.failSave) throw new Error('simulated database failure'); }, ...extra };
    items.set(item.libraryID + '/' + key, item);
    return item;
  }
  return { plugin, files, items, add, alerts, failWrite: nth => { writeFailure = nth; } };
}

test('conversion saves originals, changes dates and supports undo from persistent backup data', async () => {
  const env = environment();
  const first = env.add('A', '2026-31-10');
  const second = env.add('B', '11/2025');
  const rows = [await env.plugin.rowFor(first), await env.plugin.rowFor(second)];
  const result = await env.plugin.applyRows(rows, { mode: 'convert' });
  assert.equal(result.changed, 2);
  assert.equal(first.date, '2026');
  assert.equal(second.date, '2025');
  const saved = [...env.files.values()][0];
  assert.equal(saved.state, 'complete');
  assert.equal(saved.entries[0].before, '2026-31-10');
  let undoModel;
  env.plugin.openPreview = (window, model) => { undoModel = model; };
  await env.plugin.previewUndo({});
  const restored = await env.plugin.applyRows(undoModel.rows, undoModel);
  assert.equal(restored.changed, 2);
  assert.equal(first.date, '2026-31-10');
  assert.equal(second.date, '11/2025');
  assert.equal([...env.files.values()][0].state, 'undone');
  assert.equal([...env.files.values()][0].entries.length, 2, 'Original backup entries are retained');
});

test('preview skips read-only libraries, notes, missing dates and ambiguous years', async () => {
  const env = environment();
  assert.equal((await env.plugin.rowFor(env.add('A', '2020/2021'))).status, 'skipped');
  assert.equal((await env.plugin.rowFor(env.add('B', '12/11/26'))).status, 'skipped');
  assert.equal((await env.plugin.rowFor(env.add('C', '2026'))).status, 'unchanged');
  assert.equal((await env.plugin.rowFor(env.add('D', ''))).status, 'skipped');
  assert.equal((await env.plugin.rowFor(env.add('E', '2026-01-01', { libraryID: 2 }))).status, 'skipped');
  assert.equal(await env.plugin.rowFor(env.add('F', '2026-01-01', { isRegularItem: () => false })), null);
});

test('a backup failure prevents every database write', async () => {
  const env = environment();
  const item = env.add('A', '2026-01-01');
  env.failWrite(1);
  await assert.rejects(env.plugin.applyRows([await env.plugin.rowFor(item)], { mode: 'convert' }), /disk failure/);
  assert.equal(item.date, '2026-01-01');
});

test('database failure rolls back the whole batch', async () => {
  const env = environment();
  const first = env.add('A', '2026-01-01');
  const second = env.add('B', '2025-01-01', { failSave: true });
  await assert.rejects(env.plugin.applyRows([await env.plugin.rowFor(first), await env.plugin.rowFor(second)], { mode: 'convert' }), /database failure/);
  assert.equal(first.date, '2026-01-01');
  assert.equal(second.date, '2025-01-01');
  assert.equal([...env.files.values()][0].state, 'failed');
});

test('backup update failure before commit also rolls back the batch', async () => {
  const env = environment();
  const item = env.add('A', '2026-01-01');
  env.failWrite(2);
  await assert.rejects(env.plugin.applyRows([await env.plugin.rowFor(item)], { mode: 'convert' }), /disk failure/);
  assert.equal(item.date, '2026-01-01');
});

test('a final status write failure does not misreport a committed conversion', async () => {
  const env = environment();
  const item = env.add('A', '2026-01-01');
  env.failWrite(3);
  const result = await env.plugin.applyRows([await env.plugin.rowFor(item)], { mode: 'convert' });
  assert.equal(item.date, '2026');
  assert.equal(result.changed, 1);
  assert.match(result.warning, /dates were saved/);
  assert.equal([...env.files.values()][0].state, 'prepared');
});

test('later edits and unchecked rows are neither converted nor included in undo', async () => {
  const env = environment();
  const first = env.add('A', '2026-01-01');
  const second = env.add('B', '2025-01-01');
  const third = env.add('C', '2024-01-01');
  const rows = [await env.plugin.rowFor(first), await env.plugin.rowFor(second), await env.plugin.rowFor(third)];
  second.date = '2023';
  rows[2].checked = false;
  const result = await env.plugin.applyRows(rows, { mode: 'convert' });
  assert.equal(result.changed, 1);
  assert.equal(result.skipped, 1);
  assert.equal(second.date, '2023');
  assert.equal(third.date, '2024-01-01');
  assert.equal([...env.files.values()][0].entries.length, 1);
  first.date = '2026-09-22';
  let undoModel;
  env.plugin.openPreview = (window, model) => { undoModel = model; };
  await env.plugin.previewUndo({});
  assert.equal(undoModel.rows[0].status, 'skipped');
});

test('partial undo preserves unchecked originals for a later attempt', async () => {
  const env = environment();
  const first = env.add('A', '2026-01-01');
  const second = env.add('B', '2025-01-01');
  await env.plugin.applyRows([await env.plugin.rowFor(first), await env.plugin.rowFor(second)], { mode: 'convert' });
  let model;
  env.plugin.openPreview = (window, next) => { model = next; };
  await env.plugin.previewUndo({});
  model.rows[1].checked = false;
  await env.plugin.applyRows(model.rows, model);
  assert.equal(first.date, '2026-01-01');
  assert.equal(second.date, '2025');
  await env.plugin.previewUndo({});
  assert.equal(model.rows.length, 1);
  await env.plugin.applyRows(model.rows, model);
  assert.equal(second.date, '2025-01-01');
  assert.equal([...env.files.values()][0].entries.length, 2);
});

test('standardisation preserves precision and uses the same durable undo mechanism', async () => {
  const env = environment();
  const first = env.add('A', '12 November 2026');
  const second = env.add('B', 'November 2025');
  const third = env.add('C', '2024');
  const rows = await Promise.all([first, second, third].map(item => env.plugin.rowFor(item, 'standard')));
  assert.equal(rows[0].after, '2026-11-12');
  assert.equal(rows[1].after, '2025-11');
  assert.equal(rows[2].status, 'unchanged');
  const result = await env.plugin.applyRows(rows, { mode: 'convert', format: 'standard' });
  assert.equal(result.changed, 2);
  assert.equal(first.date, '2026-11-12');
  assert.equal(second.date, '2025-11');
  let model;
  env.plugin.openPreview = (window, next) => { model = next; };
  await env.plugin.previewUndo({});
  await env.plugin.applyRows(model.rows, model);
  assert.equal(first.date, '12 November 2026');
  assert.equal(second.date, 'November 2025');
  assert.equal(third.date, '2024');
});

test('changing numeric interpretation preserves explicit item exclusions', async () => {
  const env = environment();
  const first = env.add('A', '12 November 2026');
  const second = env.add('B', '11/12/2026');
  const rows = await Promise.all([first, second].map(item => env.plugin.rowFor(item, 'standard')));
  rows[0].checked = false;
  rows[0].excluded = true;
  const model = { rows, mode: 'convert', format: 'standard' };
  env.plugin.openPreview({ openDialog: () => ({ closed: false }) }, model);
  model.reparse({ yearFirst: 'ymd', yearLast: 'dmy' });
  assert.equal(rows[0].checked, false);
  assert.equal(rows[1].after, '2026-12-11');
  assert.equal(rows[1].checked, true);
});
