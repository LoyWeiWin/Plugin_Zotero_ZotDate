/* Extract an explicit year; do not infer the order of month and day. */
var YearOnlyDateParser = (() => {
  "use strict";
  const digitStarts = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6,
    0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0e50, 0x0ed0, 0x1040];

  function normalize(value) {
    return String(value ?? "").normalize("NFKC")
      .replace(/[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g, "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/\p{Nd}/gu, character => {
        const code = character.codePointAt(0);
        for (const start of digitStarts) {
          if (code >= start && code <= start + 9) return String(code - start);
        }
        return character;
      }).trim();
  }

  function possibleMonthDay(first, second, year) {
    function valid(month, day) {
      if (month < 1 || month > 12 || day < 1) return false;
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
      return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    }
    return valid(first, second) || valid(second, first);
  }

  function parse(value) {
    let text = normalize(value);
    const skip = reason => ({ status: "skipped", year: null, reason });
    if (!text) return skip("Empty publication date");
    if (/(?:\bB\.?\s*C\.?(?:\s*E\.?)?\b|公元前|紀元前|기원전)/i.test(text)) {
      return skip("BCE/BC dates need their era preserved");
    }
    if (/^\s*-\d{4}(?:\D|$)/.test(text)) return skip("Negative year");
    // Exclude the time and offset of a timestamp, which may contain four digits.
    text = text.replace(/[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?\s*$/i, "").trim();

    // Compact dates are accepted only when calendar validation gives one year.
    if (/^\d{8}$/.test(text)) {
      const candidates = new Set();
      const leading = Number(text.slice(0, 4));
      const trailing = Number(text.slice(4));
      if (leading > 0 && possibleMonthDay(Number(text.slice(4, 6)), Number(text.slice(6)), leading)) {
        candidates.add(text.slice(0, 4));
      }
      if (trailing > 0 && possibleMonthDay(Number(text.slice(0, 2)), Number(text.slice(2, 4)), trailing)) {
        candidates.add(text.slice(4));
      }
      if (candidates.size !== 1) return skip("Ambiguous or invalid compact date");
      return { status: "convert", year: [...candidates][0], reason: "Compact numeric date" };
    }

    const years = [];
    const pattern = /(^|[^\p{N}])(\d{4})(?!\p{N})/gu;
    let match;
    while ((match = pattern.exec(text))) years.push(match[2]);
    if (!years.length) return skip("No explicit four-digit year; two-digit years are not guessed");
    if (years.length !== 1) return skip("Multiple years or a date range");
    const year = years[0];
    if (year === "0000") return skip("Year 0000 is unsupported");

    // Do not silently collapse abbreviated ranges such as 1998/99 or 2020-21.
    // 2020-01 to 2020-12 remain valid year/month forms.
    if (new RegExp("^" + year + "\\s*[-/]\\s*(\\d{2})$").test(text)) {
      const suffix = Number(text.match(/(\d{2})$/)[1]);
      if (suffix < 1 || suffix > 12) return skip("Abbreviated range or invalid year/month date");
    }
    if (/\b(?:to|through|until)\s*\d{1,2}\b/i.test(text)
        || /\d{4}\s*[-/]\s*\d{2}\s*[-/]\s*\d{2}\s*[-/]\s*\d{2}\b/.test(text)) {
      return skip("Possible abbreviated date range");
    }
    const unchanged = String(value ?? "") === year;
    return { status: unchanged ? "unchanged" : "convert", year,
      reason: unchanged ? "Already a four-digit year" : "One explicit four-digit year" };
  }
  const months = new Map();
  ["january jan", "february feb", "march mar", "april apr", "may", "june jun",
    "july jul", "august aug", "september sept sep", "october oct",
    "november nov", "december dec"].forEach((names, index) => {
    for (const name of names.split(" ")) months.set(name, index + 1);
  });

  function validDate(year, month, day) {
    if (year < 1 || year > 9999) return false;
    if (month === undefined) return day === undefined;
    if (!Number.isInteger(month) || month < 1 || month > 12) return false;
    if (day === undefined) return true;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return Number.isInteger(day) && day > 0
      && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  }

  function standardize(input, options = {}) {
    let text = normalize(input);
    const skip = reason => ({ status: "skipped", year: null, value: null, reason });
    function finish(year, month, day, reason = "Available date components preserved") {
      if (!validDate(Number(year), month, day)) return skip("Invalid calendar date; left unchanged");
      const value = year + (month === undefined ? "" : "-" + String(month).padStart(2, "0"))
        + (day === undefined ? "" : "-" + String(day).padStart(2, "0"));
      const unchanged = String(input ?? "") === value;
      return { status: unchanged ? "unchanged" : "convert", year, value,
        precision: day !== undefined ? "day" : month !== undefined ? "month" : "year",
        reason: unchanged ? "Already in the requested format" : reason };
    }
    function numericPair(year, first, second, policy, location) {
      const monthFirst = validDate(Number(year), first, second);
      const dayFirst = validDate(Number(year), second, first);
      if (!monthFirst && !dayFirst) return skip("Invalid calendar date; left unchanged");
      if (monthFirst && dayFirst && first !== second) {
        if (policy !== "mdy" && policy !== "dmy") {
          return skip("Ambiguous month/day order; choose a numeric date order above");
        }
        return policy === "mdy"
          ? finish(year, first, second, location + ": month then day (chosen order)")
          : finish(year, second, first, location + ": day then month (chosen order)");
      }
      return monthFirst ? finish(year, first, second) : finish(year, second, first);
    }
    const yearFirstPolicy = options.yearFirst === "ydm" ? "dmy"
      : options.yearFirst === "skip" ? "skip" : "mdy";
    const yearLastPolicy = ["mdy", "dmy"].includes(options.yearLast) ? options.yearLast : "skip";

    // Compact forms are considered only when an explicit year of at least
    // four significant digits can be separated from valid month/day values.
    if (/^\d{6}$|^\d{8}$/.test(text)) {
      const candidates = [];
      let ambiguous = false;
      const add = result => {
        if (result.value) candidates.push(result);
        else if (result.reason.startsWith("Ambiguous")) ambiguous = true;
      };
      const firstYear = text.slice(0, 4);
      const lastYear = text.slice(-4);
      if (Number(firstYear) >= 1000) {
        if (text.length === 6) add(finish(firstYear, Number(text.slice(4))));
        else add(numericPair(firstYear, Number(text.slice(4, 6)), Number(text.slice(6)), yearFirstPolicy, "Year-first numeric date"));
      }
      if (Number(lastYear) >= 1000) {
        if (text.length === 6) add(finish(lastYear, Number(text.slice(0, 2))));
        else add(numericPair(lastYear, Number(text.slice(0, 2)), Number(text.slice(2, 4)), yearLastPolicy, "Year-last numeric date"));
      }
      const distinct = new Set(candidates.map(result => result.value));
      if (ambiguous || distinct.size > 1) return skip("Ambiguous compact date; left unchanged");
      return candidates[0] || skip("Invalid or unsupported compact date");
    }

    const preflight = parse(text);
    if (!preflight.year) return skip(preflight.reason);
    const year = preflight.year;
    if (/\b(?:circa|ca|about|before|after|spring|summer|autumn|fall|winter)\b|\bc\.|[?~<>]/i.test(text)) {
      return skip("Qualified or seasonal date cannot be represented exactly as a numeric date");
    }
    // An ISO timestamp or labelled East Asian date has an explicit Y-M-D order.
    let explicitYMD = /^\d{4}-\d{1,2}-\d{1,2}[T\s]\d{2}:/.test(text);
    text = text.replace(/[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:\s*(?:Z|[+-]\d{2}:?\d{2}))?\s*$/i, "").trim();
    if (/^\d{4}\s*[年년]/.test(text)) {
      if (!/^\d{4}\s*[年년](?:\s*\d{1,2}\s*[月월](?:\s*\d{1,2}\s*[日일])?)?\s*$/.test(text)) {
        return skip("Unsupported labelled date");
      }
      text = text.replace(/[年년月월日일]/g, " ").trim();
      explicitYMD = true;
    }
    text = text.toLowerCase().replace(/(\d)(?:st|nd|rd|th)\b/g, "$1")
      .replace(/([a-z])(\d)|(\d)([a-z])/g, (_, letter, digit, number, word) => letter ? letter + " " + digit : number + " " + word)
      .replace(/^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b[,.\s]*/, "")
      .replace(/^\[([^\[\]]+)\]$/, "$1");
    const tokens = text.split(/[\s,./-]+/).filter(Boolean);
    if (tokens.some(token => !/^(?:\d+|[a-z]+)$/.test(token))) return skip("Unsupported date text");
    if (!tokens.includes(year)) return skip("Could not locate the year as a separate date component");
    const words = tokens.filter(token => !/^\d+$/.test(token));
    const numbers = tokens.filter(token => /^\d+$/.test(token));
    if (words.length) {
      if (words.length !== 1 || !months.has(words[0])) return skip("Unknown month name or date range");
      const days = numbers.filter(token => token !== year);
      if (days.length > 1) return skip("Multiple days or a date range");
      if (days.length && days[0].length > 2) return skip("Invalid day component");
      return finish(year, months.get(words[0]), days.length ? Number(days[0]) : undefined);
    }
    if (tokens.length === 1) return finish(year);
    const yearPosition = tokens.indexOf(year);
    if (tokens.length === 2) {
      const month = tokens[yearPosition === 0 ? 1 : 0];
      if (month.length > 2) return skip("Invalid month component");
      return finish(year, Number(month));
    }
    if (tokens.length !== 3 || (yearPosition !== 0 && yearPosition !== 2)) {
      return skip("Unsupported numeric date order or date range");
    }
    const other = yearPosition === 0 ? tokens.slice(1) : tokens.slice(0, 2);
    if (other.some(token => token.length > 2)) return skip("Invalid numeric date component");
    if (explicitYMD) return finish(year, Number(other[0]), Number(other[1]));
    return numericPair(year, Number(other[0]), Number(other[1]),
      yearPosition === 0 ? yearFirstPolicy : yearLastPolicy,
      yearPosition === 0 ? "Year-first numeric date" : "Year-last numeric date");
  }

  return { parse, normalize, standardize };
})();

if (typeof module !== "undefined" && module.exports) module.exports = YearOnlyDateParser;
