/**
 * us_regular_session_v1 — deterministic US equity regular-session heuristic.
 *
 * Scope and honesty boundaries:
 *  - Covers NYSE/Nasdaq regular hours: Mon–Fri 09:30–16:00 America/New_York.
 *  - Includes the 10 full-day NYSE holiday closures (incl. observed dates and
 *    Good Friday via the Gregorian computus).
 *  - Does NOT model early closes (13:00 ET sessions), pre/post-market, or
 *    non-US venues. Callers must surface `heuristic: "us_regular_session_v1"`
 *    so the limitation travels with the result.
 *  - Pure functions of the wall clock — no network, fully testable.
 */

export const MARKET_HOURS_HEURISTIC_ID = "us_regular_session_v1";

/** Exchanges we treat as US regular-session venues (case-insensitive match). */
const US_VENUE_PATTERNS = [
  "nasdaq",
  "nyse",
  "new york stock exchange",
  "nyse american",
  "cboe",
  "bzx",
  "iex",
];

export function isUsEquityVenue(primaryExchange: string | null | undefined): boolean {
  if (!primaryExchange) return false;
  const v = primaryExchange.toLowerCase();
  return US_VENUE_PATTERNS.some((p) => v.includes(p));
}

export type SessionState = "open" | "closed";

interface NyParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  weekday: number; // 0=Sun..6=Sat
  minutes: number; // minutes since NY midnight
}

/** Wall-clock parts in America/New_York via Intl (no dependency). */
function newYorkParts(at: Date): NyParts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? -1,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

function toUtcMs(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  // returns day-of-month
  const first = new Date(Date.UTC(year, month - 1, 1));
  const firstWd = first.getUTCDay();
  return 1 + ((weekday - firstWd + 7) % 7) + (n - 1) * 7;
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): number {
  const last = new Date(Date.UTC(year, month, 0)); // last day of month
  const lastWd = last.getUTCDay();
  const daysInMonth = last.getUTCDate();
  return daysInMonth - ((lastWd - weekday + 7) % 7);
}

/** Gregorian computus (Anonymous Gregorian algorithm) → Easter Sunday. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Observed-date helper: Sat→Fri, Sun→Mon for fixed-date holidays. */
function observedDay(year: number, month: number, day: number): number {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (wd === 6) return day - 1; // Saturday → Friday before
  if (wd === 0) return day + 1; // Sunday → Monday after
  return day;
}

/**
 * NYSE full-day closures for `year`, as UTC ms timestamps of the *calendar
 * date* (comparison is done in NY wall-clock terms by the caller).
 */
export function nyseClosedDates(year: number): Set<string> {
  const dates = new Set<string>();
  const key = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // New Year's Day (observed). If Jan 1 falls on Saturday, NYSE observes on
  // the preceding Friday *of the previous year* — handled by checking both
  // this year's and next year's observed dates.
  const nyd = observedDay(year, 1, 1);
  dates.add(key(1, nyd));

  dates.add(key(1, nthWeekdayOfMonth(year, 1, 1, 3))); // MLK: 3rd Mon Jan
  dates.add(key(2, nthWeekdayOfMonth(year, 2, 1, 3))); // Washington's: 3rd Mon Feb

  // Good Friday = Easter Sunday − 2 days
  const e = easterSunday(year);
  const gf = new Date(Date.UTC(year, e.month - 1, e.day - 2));
  dates.add(
    `${gf.getUTCFullYear()}-${String(gf.getUTCMonth() + 1).padStart(2, "0")}-${String(
      gf.getUTCDate(),
    ).padStart(2, "0")}`,
  );

  dates.add(key(5, lastWeekdayOfMonth(year, 5, 1))); // Memorial: last Mon May
  dates.add(key(6, observedDay(year, 6, 19))); // Juneteenth
  dates.add(key(7, observedDay(year, 7, 4))); // Independence Day
  dates.add(key(9, nthWeekdayOfMonth(year, 9, 1, 1))); // Labor: 1st Mon Sep
  dates.add(key(11, nthWeekdayOfMonth(year, 11, 4, 4))); // Thanksgiving: 4th Thu Nov
  dates.add(key(12, observedDay(year, 12, 25))); // Christmas

  // New Year's Day observed on Dec 31 when Jan 1 (next year) is Saturday.
  const nextJan1 = new Date(Date.UTC(year + 1, 0, 1)).getUTCDay();
  if (nextJan1 === 6) dates.add(key(12, 31));

  return dates;
}

/**
 * Is the US equity regular session open at `at`? `at` is an absolute instant;
 * conversion to New York wall clock happens internally.
 */
export function isUsRegularSessionOpen(at: Date): boolean {
  const p = newYorkParts(at);
  if (p.weekday === 0 || p.weekday === 6) return false;
  const dateKey = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (nyseClosedDates(p.year).has(dateKey)) return false;
  return p.minutes >= 9 * 60 + 30 && p.minutes < 16 * 60;
}

/**
 * Decide the underlying-market state for an asset.
 * Only stock/etf assets with a recognized US venue get an open/closed verdict;
 * everything else returns "unknown" — MirrorGap never guesses exchange hours.
 */
export function underlyingMarketState(
  assetType: string,
  primaryExchange: string | null | undefined,
  at: Date,
): { state: "open" | "closed" | "unknown"; heuristic: string | null; detail: string } {
  if ((assetType === "stock" || assetType === "etf") && isUsEquityVenue(primaryExchange)) {
    const open = isUsRegularSessionOpen(at);
    return {
      state: open ? "open" : "closed",
      heuristic: MARKET_HOURS_HEURISTIC_ID,
      detail: open
        ? `US regular session open per ${MARKET_HOURS_HEURISTIC_ID} (${primaryExchange})`
        : `US regular session closed per ${MARKET_HOURS_HEURISTIC_ID} (${primaryExchange}); underlying price cannot be independently confirmed`,
    };
  }
  if (assetType === "stock" || assetType === "etf") {
    return {
      state: "unknown",
      heuristic: null,
      detail: primaryExchange
        ? `Exchange hours for "${primaryExchange}" are not modeled`
        : "Primary exchange unknown; market hours not modeled",
    };
  }
  // Commodities/currencies/etc: tokenized side trades continuously; we do not
  // model their underlying venues' hours.
  return {
    state: "unknown",
    heuristic: null,
    detail: `Underlying market hours not modeled for asset_type=${assetType}`,
  };
}
