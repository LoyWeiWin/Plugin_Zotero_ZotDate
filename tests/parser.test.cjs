const { test } = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../src/parser.js');

test('extracts the same year from different numeric, written and Unicode dates', () => {
  const examples = [
    ['2026-11-12', '2026'], ['2026-31-10', '2026'], ['11/2026', '2026'],
    ['2026/11', '2026'], ['12/11/2026', '2026'], ['11/12/2026', '2026'],
    ['2026.11.12', '2026'], ['12.11.2026', '2026'], ['2026 11 12', '2026'],
    ['November 12, 2026', '2026'], ['12 Nov 2026', '2026'], ['Nov. 2026', '2026'],
    ['Autumn 2026', '2026'], ['c. 1985', '1985'], ['[2026]', '2026'],
    ['2026年11月12日', '2026'], ['２０２６／１１／１２', '2026'],
    ['٢٠٢٦/١١/١٢', '2026'], ['۲۰۲۶/۱۱/۱۲', '2026'], ['२०२६/११/१२', '2026'],
    ['\u200e2026–11–12\u200f', '2026'], [' 2026 ', '2026'],
    ['2026-11-12T14:30:45Z', '2026'], ['2026-11-12T14:30:45.1234+0530', '2026'],
    ['2026-11-12 14:30:00-0500', '2026'],
    ['20261112', '2026'], ['20263110', '2026'], ['12112026', '2026'],
    ['11122026', '2026'], ['20240229', '2024'], ['0012', '0012']
  ];
  for (const [input, year] of examples) {
    assert.equal(parser.parse(input).year, year, input);
  }
});

test('does not guess missing years, two-digit years, date ranges or eras', () => {
  const examples = ['', null, undefined, 'n.d.', 'in press', '12/11/26', '11/26',
    'November 12', '2025–2026', '2026/2026', '2026, revised 2027', '1998/99',
    '2020-21', '0000', '-0044', '0044 BCE', '0044 B.C.', '公元前0044年',
    '123456', '1234567890', '20230229', '01022003', '2020 to 21', '2020-01-01/02'];
  for (const input of examples) assert.equal(parser.parse(input).status, 'skipped', String(input));
});

test('already normalized years need no write', () => {
  assert.deepEqual(parser.parse('2026'), {
    status: 'unchanged', year: '2026', reason: 'Already a four-digit year'
  });
});

test('month/day order and separators cannot change an explicit year', () => {
  let checked = 0;
  for (const year of [1750, 1900, 1999, 2000, 2024, 2026, 2099]) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 8, 12, 17, 28]) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        for (const separator of ['-', '/', '.', ' ', '–']) {
          for (const parts of [[year, mm, dd], [year, dd, mm], [mm, dd, year], [dd, mm, year]]) {
            const value = parts.join(separator);
            assert.equal(parser.parse(value).year, String(year), value);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 8400);
});
