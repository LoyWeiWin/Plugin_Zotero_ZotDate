# ZotDate for Zotero — v1.0.0

Standardise publication dates while preserving the available precision:

| Original date | Saved date |
| --- | --- |
| `12 November 2026` | `2026-11-12` |
| `November 2026` | `2026-11` |
| `2026` | `2026` |
| `2026-31-10` | `2026-10-31` |
| `11/2026` or `2026/11` | `2026-11` |

The original **keep year only** option remains available separately. Both options have a preview, local backups, and undo.

## Install or update

1. Download `ZotDate_v1.0.0.xpi`.
2. In Zotero, open **Tools → Plugins** (called **Add-ons** in some versions).
3. Use the gear menu to **Install Plugin From File…** / **Install Add-on From File…**, and select the XPI. You can also drag the XPI into this window.
4. Open **Tools → ZotDate**.

This is the ZotDate 1.0.0 branding release of Publication Date Formatter 1.1.0. The internal add-on ID and backup format are retained. If Zotero refuses to replace an installed 1.1.0 build with 1.0.0, remove the old add-on, restart Zotero, then install ZotDate. Removing the add-on does not remove its date backups.

## Standardise dates

Choose **Standardise selected items…** or **Standardise current library…**. Review the proposed changes, uncheck any references you want to exclude, then click **Convert … dates**.

- Full date available: `YYYY-MM-DD`.
- Month and year available: `YYYY-MM`.
- Only the year available: `YYYY`.
- Months and days are zero-padded numbers.
- Missing date components are never added.

For a collection, select its references in the centre pane and use the selected-items command. A library conversion includes references across the selected personal or group library, excluding Trash, notes and attachments. Read-only libraries are skipped. The plugin runs only when you use its menu commands.

### Numeric date order

The preview has two controls:

| Control | Default | Other choices |
| --- | --- | --- |
| Year first | `YYYY-MM-DD` | `YYYY-DD-MM`, or skip ambiguous dates |
| Year last | Skip ambiguous dates | `DD-MM-YYYY`, or `MM-DD-YYYY` |

These controls resolve dates where both month/day interpretations are possible. For example, `11/12/2026` becomes `2026-12-11` with day-first input, and `2026-11-12` with month-first input. Choose the convention used by the references you intend to convert and review the preview. Items you manually uncheck stay excluded when you change these controls.

An unambiguous date such as `31/10/2026` is recognised automatically. English month names and abbreviations do not need a numeric-order choice. ISO timestamps and labelled Chinese/Korean dates have an explicit order.

The default year-first choice follows ISO order. A date such as `2026-11-12` could also have originated from a custom YYYY-DD-MM source; select that convention explicitly for those records, or choose **Skip ambiguous dates**.

## Supported inputs and limits

The standardisation option handles common numeric dates with hyphens, slashes, dots or spaces; English month names and abbreviations; English ordinal days; Unicode digits covered by the parser; labelled Chinese/Korean dates; ISO timestamps; and unambiguous compact numeric dates. Full and abbreviated English month names, including `Sep` and `Sept`, become numerical months.

It validates month lengths and leap years. Impossible dates, unknown month names, date ranges, seasons, uncertain dates, BCE/BC dates and two-digit years are skipped. Compact dates are accepted only when one interpretation is valid. Zero placeholders such as `2026-11-00` are skipped.

For example, `2024-02-29` is valid; `2025-02-29` is skipped. `2025–2026` is skipped. `2020-01` is treated as a year/month date, so a very unusual abbreviated year range in that form needs manual review.

The year-only option continues to extract a clear four-digit year from a wider range of date text. Its purpose is to discard month/day information deliberately.

## Backup and undo

The plugin edits the actual publication Date, including equivalent publication-date fields for other Zotero item types. It saves originals in the Zotero data directory:

`year-only-publication-dates/backups/`

Choose **Tools → ZotDate → Undo latest date change…** to preview and restore the latest batch. Backups from v1.0.0 are compatible. Undo leaves later manual date edits untouched. Original backup entries remain on disk after restoration.

**If you already used the earlier year-only conversion, use Undo first to restore those dates before standardising them.** A year-only value does not contain the month or day, and standardisation will not invent them.

If a backup cannot be saved, conversion stops before editing dates. Each batch runs in one database transaction. Items changed or deleted after the preview are checked again before saving.

Access dates, Date Added and other metadata are left as they are. Zotero updates Date Modified normally when an item is saved. An `Issued:` override in Extra is not changed and can still control citation output. Zotero sync treats these changes as normal metadata edits. Backups are local and are not part of Zotero item sync.

## Compatibility and privacy

- Intended for Zotero 7.0 through 10.0.x on Windows, macOS and Linux.
- Tested directly in Zotero 10.0.8 on Linux; other versions and operating systems have not been tested directly.
- No external libraries, telemetry or external processing of references.
- This standalone build has no hosted update feed. Its reserved `.invalid` update URL satisfies Zotero's manifest requirement, and its background add-on updates are disabled. Install a newer XPI manually to update it.

## Build and validate

Build with Python 3:

```sh
python3 build.py
```

Run the parser and transaction tests with Node.js 18 or newer:

```sh
node --test tests/*.test.cjs
```

There are 20 automated tests, covering 8,400 year-extraction format combinations, 5,376 full-date formatting combinations, month names, date precision, numeric order choices, leap years, invalid dates, backup failures, rollback, exclusions and undo.

`tests/live-bootstrap.js` is an integration harness for an isolated Zotero runtime. The live checks install v1.0.0, perform a year-only conversion, upgrade to the predecessor formatter build, restore the old backup, test standardisation and its controls, check selected/library scopes, and exercise undo. `LEGACY_VALIDATION.json` records the original pre-rename validation; it is historical evidence, not a live test of this branding release. The harness is not included in the installed XPI.

The XPI contains only `src/`. No Zotero runtime or sample reference library is included.


## Branding release 1.0.0

Display names, dialogs, source documentation and build filenames use ZotDate. Existing internal add-on IDs and storage keys are retained for compatibility. Functionality is unchanged. Historical validation files are prefixed LEGACY_; live Zotero/Windows validation has not been repeated for this rename.
