import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import {
  TOURNAMENT_TIME_ZONES, formatTournamentTime, isValidTournamentTimeZone,
  resolvedBrowserTimeZone, resolveTournamentTimeZone, tournamentTimeParts, tournamentTimestamp, tournamentTimeZoneOptions,
} from "../src/lib/tournamentTime.js";
import { FALLBACK_TOURNAMENT_TIME_ZONES } from "../src/lib/tournamentTimeZones.js";

const event = "2026-10-24T21:15:00Z";

test("EU and NA displays preserve one instant while using each selected city's time", () => {
  const expected = [
    ["Europe/Amsterdam", "23:15", "GMT+2"], ["Europe/London", "22:15", "GMT+1"],
    ["America/New_York", "17:15", "GMT-4"], ["America/Toronto", "17:15", "GMT-4"],
    ["America/Chicago", "16:15", "GMT-5"], ["America/Denver", "15:15", "GMT-6"],
    ["America/Los_Angeles", "14:15", "GMT-7"], ["UTC", "21:15", "GMT"],
  ];
  for (const [timeZone, timeLabel, zoneLabel] of expected) {
    const parts = tournamentTimeParts(event, { timeZone });
    assert.equal(parts.timeLabel, timeLabel, timeZone);
    assert.equal(parts.zoneLabel, zoneLabel, timeZone);
    assert.equal(parts.dateLabel, "24 Oct 2026", timeZone);
    assert.equal(parts.iso, "2026-10-24T21:15:00.000Z", timeZone);
    assert.equal(parts.zoneName, timeZone);
  }
});

test("calendar parts and midnight roll into the actual local day using 00 instead of 24", () => {
  const nextDay = tournamentTimeParts("2026-10-24T22:15:00Z", { timeZone: "Europe/Amsterdam" });
  assert.equal(nextDay.dateLabel, "25 Oct 2026");
  assert.equal(nextDay.timeLabel, "00:15");
  assert.equal(nextDay.weekday, "Sun");
  assert.equal(nextDay.month, "Oct");
  assert.equal(nextDay.day, "25");
  assert.equal(nextDay.year, "2026");
  const previousDay = tournamentTimeParts("2026-10-24T01:15:00Z", { timeZone: "America/Los_Angeles" });
  assert.equal(previousDay.dateLabel, "23 Oct 2026");
  assert.equal(previousDay.timeLabel, "18:15");
  assert.equal(previousDay.weekday, "Fri");
});

test("European and US daylight-saving changes use the event date, including their different autumn weeks", () => {
  for (const [value, eu, na] of [
    [event, ["23:15", "GMT+2"], ["17:15", "GMT-4"]],
    ["2026-10-25T21:15:00Z", ["22:15", "GMT+1"], ["17:15", "GMT-4"]],
    ["2026-11-01T21:15:00Z", ["22:15", "GMT+1"], ["16:15", "GMT-5"]],
  ]) {
    for (const [timeZone, [time, zone]] of [["Europe/Amsterdam", eu], ["America/New_York", na]]) {
      const parts = tournamentTimeParts(value, { timeZone });
      assert.deepEqual([parts.timeLabel, parts.zoneLabel], [time, zone], `${value} ${timeZone}`);
    }
  }
});

test("spring transitions use independent EU and US rules and correctly label the skipped hour", () => {
  for (const [value, euOffset, naOffset] of [
    ["2026-03-07T21:15:00Z", "GMT+1", "GMT-5"],
    ["2026-03-08T21:15:00Z", "GMT+1", "GMT-4"],
    ["2026-03-29T21:15:00Z", "GMT+2", "GMT-4"],
  ]) {
    assert.equal(tournamentTimeParts(value, { timeZone: "Europe/Amsterdam" }).zoneLabel, euOffset);
    assert.equal(tournamentTimeParts(value, { timeZone: "America/New_York" }).zoneLabel, naOffset);
  }
  assert.equal(tournamentTimeParts("2026-03-29T00:30:00Z", { timeZone: "Europe/Amsterdam" }).timeLabel, "01:30");
  assert.equal(tournamentTimeParts("2026-03-29T01:30:00Z", { timeZone: "Europe/Amsterdam" }).timeLabel, "03:30");
});

test("UTC and explicit positive or negative offsets keep their instant without a second conversion", () => {
  const expected = Date.parse(event);
  for (const value of [event, "2026-10-24T23:15:00+02:00", "2026-10-24T17:15:00-04:00", "2026-10-24T17:15-0400", "2026-10-24 21:15:00Z", new Date(event), expected]) {
    assert.equal(tournamentTimestamp(value), expected, String(value));
  }
  assert.equal(formatTournamentTime("2026-10-24T23:15:00+02:00", { timeZone: "America/New_York" }), "24 Oct 2026, 17:15 GMT-4");
});

test("unknown timezone-less origins and malformed or impossible dates are not guessed", () => {
  for (const value of [undefined, null, "", "bad date", "2026-10-24", "2026-10-24T21:15", "2026-10-24 21:15:00", "2026-02-30T21:15:00Z", "2025-02-29T21:15:00Z", "2026-13-01T12:00:00Z", "2026-10-24T24:00:00Z", "2026-10-24T21:15:00+25:00", Infinity, NaN, {}, true, new Date(NaN)]) {
    assert.ok(Number.isNaN(tournamentTimestamp(value)), String(value));
    assert.equal(formatTournamentTime(value, { timeZone: "UTC" }), "To be announced");
    const parts = tournamentTimeParts(value, { timeZone: "UTC" });
    assert.equal(parts.valid, false);
    assert.equal(parts.iso, "");
    assert.equal(parts.timeLabel, "");
    assert.equal(parts.zoneName, "UTC");
  }
  assert.equal(tournamentTimeParts("2028-02-29T21:15:00Z", { timeZone: "UTC" }).dateLabel, "29 Feb 2028");
});

test("display labels are consistently 24-hour and include their event-specific UTC offset", () => {
  assert.equal(formatTournamentTime(event, { timeZone: "Europe/Amsterdam", full: true }), "Sat, 24 Oct 2026, 23:15 GMT+2");
  assert.equal(formatTournamentTime("2026-10-24T00:05:00Z", { timeZone: "UTC" }), "24 Oct 2026, 00:05 GMT");
  assert.equal(formatTournamentTime(event, { timeZone: "Asia/Kolkata" }), "25 Oct 2026, 02:45 GMT+5:30");
});

test("invalid timezone preferences safely fall back to the browser zone without guessing EU or NA", () => {
  const local = resolvedBrowserTimeZone();
  assert.equal(isValidTournamentTimeZone(local), true);
  assert.equal(resolveTournamentTimeZone("local"), local);
  assert.equal(resolveTournamentTimeZone(), local);
  for (const invalid of ["EU", "NA", "UTC+2", "Mars/Olympus", null, 123, ""]) {
    assert.equal(isValidTournamentTimeZone(invalid), false);
    assert.equal(resolveTournamentTimeZone(invalid), local);
    assert.equal(tournamentTimeParts(event, { timeZone: invalid }).valid, true);
  }
  for (const choice of TOURNAMENT_TIME_ZONES.filter(({ value }) => value !== "local")) assert.equal(isValidTournamentTimeZone(choice.value), true);
});

test("viewer timezone changes formatting but never the event or countdown timestamp", () => {
  const moduleUrl = new URL("../src/lib/tournamentTime.js", import.meta.url).href;
  const snapshots = ["UTC", "Europe/Amsterdam", "America/New_York", "America/Los_Angeles"].map(TZ => JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `import { tournamentTimestamp, tournamentTimeParts } from ${JSON.stringify(moduleUrl)}; const value=${JSON.stringify(event)}; console.log(JSON.stringify({ instant:tournamentTimestamp(value), countdown:tournamentTimestamp(value)-Date.parse('2026-10-24T20:00:00Z'), parts:tournamentTimeParts(value) }));`], { env: { ...process.env, TZ }, encoding: "utf8" })));
  for (const snapshot of snapshots) {
    assert.equal(snapshot.instant, Date.parse(event));
    assert.equal(snapshot.countdown, 75 * 60 * 1000);
  }
  assert.deepEqual(snapshots.map(({ parts }) => parts.timeLabel), ["21:15", "23:15", "17:15", "14:15"]);
});

test("the timezone picker includes the entire worldwide catalog and readable local names", () => {
  const byId = new Map(TOURNAMENT_TIME_ZONES.map(option => [option.value, option]));
  assert.equal(TOURNAMENT_TIME_ZONES[0].value, "local");
  assert.equal(TOURNAMENT_TIME_ZONES[1].value, "UTC");
  assert.ok(TOURNAMENT_TIME_ZONES.length > 350);
  assert.equal(byId.size, TOURNAMENT_TIME_ZONES.length, "each timezone appears once");
  for (const zone of Intl.supportedValuesOf("timeZone")) assert.ok(byId.has(zone), zone);
  for (const zone of ["Africa/Nairobi", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland", "America/Guatemala", "America/Costa_Rica", "America/Panama", "America/Belize", "America/El_Salvador", "America/Tegucigalpa", "America/Managua"]) {
    assert.ok(byId.has(zone), zone);
    assert.equal(byId.get(zone).label, zone.replaceAll("_", " "));
  }
  assert.ok(byId.has(resolvedBrowserTimeZone()));
});

test("older browsers retain the complete worldwide picker when enumeration is unavailable or throws", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Intl, "supportedValuesOf");
  try {
    for (const unsupported of [undefined, () => { throw new RangeError("Unsupported enumeration"); }]) {
      Object.defineProperty(Intl, "supportedValuesOf", { ...descriptor, value: unsupported });
      const options = tournamentTimeZoneOptions();
      const ids = new Set(options.map(({ value }) => value));
      assert.ok(options.length > 350);
      for (const zone of FALLBACK_TOURNAMENT_TIME_ZONES) assert.ok(ids.has(zone), zone);
      assert.ok(ids.has("UTC"));
      assert.ok(ids.has(resolvedBrowserTimeZone()));
    }
  } finally {
    Object.defineProperty(Intl, "supportedValuesOf", descriptor);
  }
});

test("a browser's valid alias is available even when absent from its canonical enumeration", () => {
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const alias = "Asia/Kolkata";
  try {
    Intl.DateTimeFormat = function (locale, options) {
      if (locale === undefined && options === undefined) return { resolvedOptions: () => ({ timeZone: alias }) };
      return new OriginalDateTimeFormat(locale, options);
    };
    const options = tournamentTimeZoneOptions();
    assert.ok(options.some(({ value }) => value === alias));
    assert.equal(options.filter(({ value }) => value === alias).length, 1);
    assert.equal(resolveTournamentTimeZone("local"), alias);
  } finally {
    Intl.DateTimeFormat = OriginalDateTimeFormat;
  }
});

test("Central America keeps each country's actual timezone rather than a North America default", () => {
  for (const date of ["2026-01-24T21:15:00Z", "2026-07-24T21:15:00Z"]) {
    for (const zone of ["America/Guatemala", "America/Costa_Rica", "America/Belize", "America/El_Salvador", "America/Tegucigalpa", "America/Managua"]) {
      const parts = tournamentTimeParts(date, { timeZone: zone });
      assert.equal(parts.timeLabel, "15:15", zone);
      assert.equal(parts.zoneLabel, "GMT-6", zone);
    }
    const panama = tournamentTimeParts(date, { timeZone: "America/Panama" });
    assert.equal(panama.timeLabel, "16:15");
    assert.equal(panama.zoneLabel, "GMT-5");
  }
});

test("worldwide offsets handle half hours, quarter hours and southern-hemisphere daylight saving", () => {
  const india = tournamentTimeParts(event, { timeZone: "Asia/Kolkata" });
  assert.deepEqual([india.dateLabel, india.timeLabel, india.zoneLabel], ["25 Oct 2026", "02:45", "GMT+5:30"]);
  const nepal = tournamentTimeParts(event, { timeZone: "Asia/Katmandu" });
  assert.deepEqual([nepal.dateLabel, nepal.timeLabel, nepal.zoneLabel], ["25 Oct 2026", "03:00", "GMT+5:45"]);
  for (const [zone, summer, winter] of [["Pacific/Auckland", "GMT+13", "GMT+12"], ["Australia/Sydney", "GMT+11", "GMT+10"]]) {
    assert.equal(tournamentTimeParts("2026-01-24T21:15:00Z", { timeZone: zone }).zoneLabel, summer);
    assert.equal(tournamentTimeParts("2026-07-24T21:15:00Z", { timeZone: zone }).zoneLabel, winter);
  }
});

test("Pacific countries on opposite sides of the date line keep their own calendar date", () => {
  const instant = "2026-10-24T09:15:00Z";
  const samoa = tournamentTimeParts(instant, { timeZone: "Pacific/Apia" });
  const hawaii = tournamentTimeParts(instant, { timeZone: "Pacific/Honolulu" });
  assert.deepEqual([samoa.dateLabel, samoa.timeLabel, samoa.zoneLabel], ["24 Oct 2026", "22:15", "GMT+13"]);
  assert.deepEqual([hawaii.dateLabel, hawaii.timeLabel, hawaii.zoneLabel], ["23 Oct 2026", "23:15", "GMT-10"]);
  assert.equal(samoa.iso, hawaii.iso);
});

test("the full catalog does not construct hundreds of formatters when an admin or page imports it", () => {
  const moduleUrl = new URL("../src/lib/tournamentTime.js", import.meta.url).href;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
    const Original = Intl.DateTimeFormat;
    let calls = 0;
    Intl.DateTimeFormat = function (...args) { calls++; return new Original(...args); };
    const helper = await import(${JSON.stringify(moduleUrl)});
    const importCalls = calls;
    for (let i = 0; i < 20; i++) helper.resolveTournamentTimeZone('Europe/Amsterdam');
    const explicitCalls = calls - importCalls;
    helper.isValidTournamentTimeZone('Mars/Olympus');
    const invalidFirst = calls;
    for (let i = 0; i < 20; i++) helper.isValidTournamentTimeZone('Mars/Olympus');
    console.log(JSON.stringify({ count:helper.TOURNAMENT_TIME_ZONES.length, importCalls, explicitCalls, invalidRepeatCalls:calls - invalidFirst }));
  `], { env: { ...process.env, TZ: "America/New_York" }, encoding: "utf8" }));
  assert.ok(result.count > 350);
  assert.ok(result.importCalls <= 4, `module import constructed ${result.importCalls} formatters`);
  assert.equal(result.explicitCalls, 0, "known supported zones reuse validation");
  assert.equal(result.invalidRepeatCalls, 0, "invalid preferences are only checked once");
});
