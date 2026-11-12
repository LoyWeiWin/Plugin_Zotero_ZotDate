const { test } = require('node:test');
const assert = require('node:assert/strict');
const parser = require('../src/parser.js');

test('preserves available precision and makes all months numerical', () => {
  const samples = [
    ['12 November 2026', '2026-11-12'], ['November 12, 2026', '2026-11-12'],
    ['12th Nov. 2026', '2026-11-12'], ['Thu, 12 Nov 2026', '2026-11-12'],
    ['12Nov2026', '2026-11-12'], ['2026Nov12', '2026-11-12'],
    ['2026-31-10', '2026-10-31'], ['31/10/2026', '2026-10-31'],
    ['10/31/2026', '2026-10-31'], ['2026/11/12', '2026-11-12'],
    ['2026-1-2', '2026-01-02'], ['2026 1 2', '2026-01-02'],
    ['November 2026', '2026-11'], ['2026 November', '2026-11'],
    ['Nov. 2026', '2026-11'], ['2026/11', '2026-11'], ['11/2026', '2026-11'],
    ['2026-1', '2026-01'], ['2026', '2026'], [' 2026 ', '2026'],
    ['2026年11月12日', '2026-11-12'], ['2026年11月', '2026-11'], ['2026年', '2026'],
    ['２０２６／１１／１２', '2026-11-12'], ['٢٠٢٦/١١/١٢', '2026-11-12'],
    ['2026-11-12T14:30:45.1234+0530', '2026-11-12'],
    ['20261112', '2026-11-12'], ['10312026', '2026-10-31'], ['202611', '2026-11'],
    ['112026', '2026-11'], ['2024-02-29', '2024-02-29'], ['2000-02-29', '2000-02-29']
  ];
  for (const [input, expected] of samples) assert.equal(parser.standardize(input).value, expected, input);
});

test('recognises every English month name and abbreviation', () => {
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];
  for (let index = 0; index < names.length; index++) {
    const expected = '2026-' + String(index + 1).padStart(2, '0');
    assert.equal(parser.standardize(names[index] + ' 2026').value, expected);
    assert.equal(parser.standardize(names[index].slice(0, 3) + '. 2026').value, expected);
  }
  assert.equal(parser.standardize('Sept 2026').value, '2026-09');
});

test('unknown components, invalid dates, ranges and qualified dates are not invented or discarded', () => {
  const samples = ['', null, '2025-02-29', '1900-02-29', '2026-04-31', '2026-13-40',
    'April 31, 2026', '31 Foo 2026', 'Spring 2026', 'c. November 2026', '2026?',
    '2025/2026', 'November–December 2026', '12–14 November 2026', '1998/99',
    '12/11/26', '2026-00-00', '2026-11-00', '0000', '0044 BCE',
    '2026年31月10日', '2026-31-10T14:30:00Z', '2026-01-01/02'];
  for (const input of samples) assert.equal(parser.standardize(input).status, 'skipped', String(input));
});

test('ambiguous numeric orders require or obey the chosen convention', () => {
  assert.equal(parser.standardize('11/12/2026').status, 'skipped');
  assert.equal(parser.standardize('11/12/2026', { yearLast: 'dmy' }).value, '2026-12-11');
  assert.equal(parser.standardize('11/12/2026', { yearLast: 'mdy' }).value, '2026-11-12');
  assert.equal(parser.standardize('2026-11-12').value, '2026-11-12');
  assert.equal(parser.standardize('2026-11-12', { yearFirst: 'ydm' }).value, '2026-12-11');
  assert.equal(parser.standardize('2026-11-12', { yearFirst: 'skip' }).status, 'skipped');
  assert.equal(parser.standardize('12/12/2026').value, '2026-12-12');
  assert.equal(parser.standardize('2026-31-10', { yearFirst: 'skip' }).value, '2026-10-31');
  assert.equal(parser.standardize('2026-11-12T14:30:00Z', { yearFirst: 'ydm' }).value, '2026-11-12');
  assert.equal(parser.standardize('2026年11月12日', { yearFirst: 'ydm' }).value, '2026-11-12');
});

test('already formatted values retain their precision without unnecessary writes', () => {
  for (const input of ['2026', '2026-11', '2026-11-12']) {
    assert.equal(parser.standardize(input).status, 'unchanged', input);
    assert.equal(parser.standardize(input).value, input, input);
  }
});

test('date orders round-trip 5,376 known numeric format combinations', () => {
  let checked = 0;
  for (const year of [1750, 1900, 1999, 2000, 2024, 2026, 2099]) {
    for (let month = 1; month <= 12; month++) {
      for (const day of [1, 12, 17, 28]) {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const expected = `${year}-${mm}-${dd}`;
        for (const separator of ['-', '/', '.', ' ']) {
          const variants = [
            [[year, mm, dd], { yearFirst: 'ymd' }],
            [[year, dd, mm], { yearFirst: 'ydm' }],
            [[dd, mm, year], { yearLast: 'dmy' }],
            [[mm, dd, year], { yearLast: 'mdy' }]
          ];
          for (const [parts, options] of variants) {
            const input = parts.join(separator);
            assert.equal(parser.standardize(input, options).value, expected, input);
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 5376);
});
