import { Errors } from "../errors";

/**
 * Single source of truth for the timezone every report window is computed
 * in. The product decision (2026-08-24) is a platform-wide zone rather than
 * a per-shop one — every shop on this platform operates in Egypt, so there
 * is no per-tenant value to store yet. If that ever changes, this is the
 * one place to widen.
 */
export const PLATFORM_TIMEZONE = "Africa/Cairo";

export interface DateWindow {
  /** Inclusive: the first instant that counts. */
  start: Date;
  /** Exclusive: the first instant that does NOT count. */
  end: Date;
}

interface CalendarDate {
  year: number;
  month: number; // 1-indexed
  day: number;
}

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a caller-supplied date string into a calendar date (year/month/day
 * only — no time-of-day, no zone). Two paths:
 *
 * - The exact "YYYY-MM-DD" shape `formatDateYMD` on the frontend produces.
 *   Parsed by hand (not `new Date`) so leap-day/overflow values like
 *   "2026-02-30" are rejected rather than silently rolled forward the way
 *   `Date.UTC` would roll them.
 * - Anything else falls back to a generic `new Date(input)` parse, taking
 *   its UTC calendar date. This is a caveat, not a guarantee: a full
 *   timestamp's time-of-day is discarded in favour of "which day was this",
 *   which is what every known caller in this codebase actually wants, but a
 *   caller that truly needs sub-day precision should not route through this
 *   helper.
 *
 * Returns null (not a throw) on anything unparseable, so callers can turn
 * that into a 400 with their own error copy.
 */
function parseCalendarDate(input: string): CalendarDate | null {
  const exact = DATE_ONLY_RE.exec(input);
  if (exact) {
    const year = Number(exact[1]);
    const month = Number(exact[2]);
    const day = Number(exact[3]);

    // Round-trip through Date.UTC and check the components survive — this
    // is what rejects "2026-02-30" instead of letting it normalise to
    // 2026-03-02.
    const roundTripped = new Date(Date.UTC(year, month - 1, day));
    if (
      roundTripped.getUTCFullYear() !== year ||
      roundTripped.getUTCMonth() !== month - 1 ||
      roundTripped.getUTCDate() !== day
    ) {
      return null;
    }

    return { year, month, day };
  }

  const generic = new Date(input);
  if (Number.isNaN(generic.getTime())) return null;

  return {
    year: generic.getUTCFullYear(),
    month: generic.getUTCMonth() + 1,
    day: generic.getUTCDate(),
  };
}

function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  // Date.UTC normalises out-of-range components (day 32 rolls into the next
  // month, etc), so this is a safe way to do calendar arithmetic without a
  // library.
  const rolled = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: rolled.getUTCFullYear(),
    month: rolled.getUTCMonth() + 1,
    day: rolled.getUTCDate(),
  };
}

/**
 * The UTC offset (in ms, east-positive) in force for `timeZone` at the
 * instant `date`. Built on `Intl.DateTimeFormat` — Node ships the IANA tz
 * database, so this is DST-correct with no external dependency: format the
 * instant in the target zone, reinterpret those wall-clock components as if
 * they were UTC, and the difference from the real UTC instant is the
 * offset.
 */
export function getPlatformTimeZoneOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLATFORM_TIMEZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const wallClockAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return wallClockAsUtc - date.getTime();
}

/**
 * The UTC instant that is 00:00:00.000 local time in PLATFORM_TIMEZONE on
 * the given calendar date. Two-pass fixed point: which offset applies (DST
 * or not) depends on the very instant we're solving for, so the first pass
 * guesses using the offset at UTC midnight and the second re-solves using
 * the offset actually in force at that corrected instant. Two passes
 * converges for every real IANA zone — none shifts its own offset within
 * the width of one iteration's correction near a transition.
 */
function startOfCairoDay(date: CalendarDate): Date {
  let utcMs = Date.UTC(date.year, date.month - 1, date.day);
  for (let i = 0; i < 2; i++) {
    const offsetMs = getPlatformTimeZoneOffsetMs(new Date(utcMs));
    utcMs = Date.UTC(date.year, date.month - 1, date.day) - offsetMs;
  }
  return new Date(utcMs);
}

/**
 * Turns two raw query-string dates into a half-open report window:
 * [start-of-day(startDate), start-of-day(endDate + 1 day)) — both boundaries
 * computed as PLATFORM_TIMEZONE midnight, not UTC midnight.
 *
 * The end is deliberately the *next* day's local midnight rather than
 * "23:59:59.999 on endDate": that snap-to-end-of-day trick still leaves the
 * window short by whatever the UTC offset is (2-3 hours here), it just
 * makes the gap small enough to stop being obviously wrong. Making the
 * boundary itself the next local midnight removes the gap rather than
 * shrinking it.
 *
 * Returns null when either argument is absent — "no window requested" is a
 * distinct case from "an invalid window was requested", and callers use
 * this to mean "match anything" rather than accidentally matching nothing.
 * `new Date(undefined)` producing an Invalid Date that a `$match` silently
 * matches nothing against is exactly the failure mode this guards.
 *
 * Throws Errors.BadRequestError when a date is present but unparseable —
 * the honest response to "this string doesn't make sense as a date",
 * rather than letting it become a Mongoose CastError (find) or a silent
 * empty result (aggregation `$match` does no schema casting at all).
 */
export function parsePlatformDateWindow(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): DateWindow | null {
  if (!startDate || !endDate) return null;

  const startDay = parseCalendarDate(startDate);
  const endDay = parseCalendarDate(endDate);

  if (!startDay || !endDay) {
    throw new Errors.BadRequestError({
      en: "startDate and endDate must be valid dates",
      ar: "يجب أن يكون تاريخ البداية وتاريخ النهاية تاريخين صالحين",
    });
  }

  return {
    start: startOfCairoDay(startDay),
    end: startOfCairoDay(addCalendarDays(endDay, 1)),
  };
}

/**
 * Same window computation as `parsePlatformDateWindow`, for the one caller
 * (`SalesComparison`) whose controller has already turned the query strings
 * into `Date` objects before the service sees them. The incoming Date's UTC
 * calendar date is taken as the intended day — correct as long as it was
 * produced by parsing a bare "YYYY-MM-DD" string, which `new
 * Date("YYYY-MM-DD")` always resolves to UTC midnight for, so the UTC
 * calendar date it carries is exactly the calendar date that was typed. A
 * Date that carries a genuine time-of-day is not what a report "window"
 * means here; a caller with one should go through the original strings and
 * `parsePlatformDateWindow` instead.
 */
export function platformDayWindowFromDates(start: Date, end: Date): DateWindow {
  const startDay: CalendarDate = {
    year: start.getUTCFullYear(),
    month: start.getUTCMonth() + 1,
    day: start.getUTCDate(),
  };
  const endDay: CalendarDate = {
    year: end.getUTCFullYear(),
    month: end.getUTCMonth() + 1,
    day: end.getUTCDate(),
  };

  return {
    start: startOfCairoDay(startDay),
    end: startOfCairoDay(addCalendarDays(endDay, 1)),
  };
}
