# ZotDate

<img src="src/icons/logo.png" alt="ZotDate logo" width="160" />

Standardise publication dates in Zotero while keeping the detail each record contains.

ZotDate converts mixed date formats into `YYYY-MM-DD`, `YYYY-MM`, or `YYYY`. It previews changes before saving and keeps local backups for undo. A separate command can reduce dates to the year alone.

[Download ZotDate 1.0.0](dist/ZotDate_v1.0.0.xpi) · [User guide](docs/USER_GUIDE.md) · [Release notes](RELEASE_NOTES.md)

## Why ZotDate?

References imported from different databases often use different date formats. One record may contain a written month, another a numeric date, and another only a year. ZotDate provides a consistent format without inventing missing months or days. It is intended for researchers who want to review and clean publication metadata in batches.

## Features

- Standardise selected references or the current library.
- Preserve the available date precision and convert months to numbers.
- Choose day/month interpretation for ambiguous numeric dates.
- Review proposed changes and exclude individual items.
- Save original values locally before editing records.
- Undo the latest batch while protecting subsequent manual edits.
- Keep a separate year-only option when deliberately discarding month/day detail.

| Input | Standardised value |
| --- | --- |
| `12 November 2026` | `2026-11-12` |
| `November 2026` | `2026-11` |
| `2026` | `2026` |
| `31/10/2026` | `2026-10-31` |

The parser validates calendar dates and skips unsupported or uncertain values. Ambiguous numeric dates require attention to the preview's date-order controls. See the [user guide](docs/USER_GUIDE.md) for defaults and supported inputs.

## Install and use

1. Download the XPI above. If GitHub opens a file page, use its raw/download button.
2. In Zotero, open **Tools > Plugins > gear menu > Install Plugin From File**.
3. Select `ZotDate_v1.0.0.xpi`.
4. Open **Tools > ZotDate** and choose selected items or the current library.
5. Review the preview and numeric date-order settings, then apply the checked changes.

Use **Tools > ZotDate > Undo latest date change** to review a restoration.

## What changes?

ZotDate edits the publication Date field, including equivalent date fields for other item types. Access dates and Date Added are left unchanged. Date Modified updates normally when Zotero saves the item. An `Issued:` override in Extra remains unchanged and may still control citation output.

Backups are local, under `year-only-publication-dates/backups/` in the Zotero data directory. They are not included in Zotero item sync. If a backup cannot be written, conversion stops before editing dates. Conversion batches use a database transaction.

The plugin runs when invoked from its menu. It does not continuously reformat newly imported records. A year-only value cannot recover a month or day that is no longer present

## Included logo

The generated ZotDate logo is bundled with the plugin. The manifest supplies 48, 96 and 128 pixel transparent PNG icons for the Plugins manager. The full logo is included in the source. Version remains 1.0.0.
