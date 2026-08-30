// The format registry, checked for the mistakes that adding a format actually
// causes: a rule declared in one place and not another, a validator that
// disagrees with the generator it guards, or a default round count that
// schedules repeats before anyone has touched it.
// Run: npx tsx scripts/checkFormats.ts
import {
  FORMAT_FAMILIES,
  FORMAT_IDS,
  describeField,
  formatSpec,
  formatsInFamily,
  validateField,
  defaultRoundsFor,
  type TournamentFormat,
} from "../src/lib/bracket/formats";
import { isRotatingPartners, isDerivedRounds, isTeamScored, isGroupRanked, isTwoGroupEntry } from "../src/lib/types";
import { generateAmericano } from "../src/lib/bracket/americano";
import { generateTeamAmericano, teamScheduleQuality } from "../src/lib/bracket/teamAmericano";
import { generateMixicano, mixicanoScheduleQuality } from "../src/lib/bracket/mixicano";
import { generateMixedTeamAmericano, mixedTeamScheduleQuality } from "../src/lib/bracket/mixedTeamAmericano";

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

// --- the registry is complete and coherent ----------------------------------
check("every format has a title and a blurb", FORMAT_IDS.every((id) => formatSpec(id).title && formatSpec(id).blurb));
check("every format is in a known family", FORMAT_IDS.every((id) => FORMAT_FAMILIES.some((f) => f.key === formatSpec(id).family)));
check(
  "every family lists at least one format",
  FORMAT_FAMILIES.every((f) => formatsInFamily(f.key).length > 0),
  FORMAT_FAMILIES.map((f) => `${f.key}:${formatsInFamily(f.key).length}`).join(" ")
);
check(
  "the families cover the whole registry exactly once",
  FORMAT_FAMILIES.flatMap((f) => formatsInFamily(f.key)).length === FORMAT_IDS.length
);
check("every format validates its field", FORMAT_IDS.every((id) => typeof formatSpec(id).validateField === "function"));

// --- the predicates agree with the registry ---------------------------------
for (const id of FORMAT_IDS) {
  const spec = formatSpec(id);
  const pairs: Array<[string, boolean, boolean]> = [
    ["rotatingPartners", !!spec.rotatingPartners, isRotatingPartners(id)],
    ["derivedRounds", !!spec.derivedRounds, isDerivedRounds(id)],
    ["teamScored", !!spec.teamScored, isTeamScored(id)],
    ["groupRanked", !!spec.groupRanked, isGroupRanked(id)],
    ["twoGroupEntry", !!spec.twoGroupEntry, isTwoGroupEntry(id)],
  ];
  const bad = pairs.filter(([, a, b]) => a !== b).map(([n]) => n);
  check(`${id}: predicates match the registry`, bad.length === 0, bad.join(","));
}

// --- structural invariants a new format must not break ----------------------
for (const id of FORMAT_IDS) {
  const spec = formatSpec(id);
  if (spec.rotatingPartners) {
    check(`${id}: a rotating format schedules rounds`, typeof spec.defaultRounds === "function");
  } else {
    check(`${id}: a bracket format does not schedule rounds`, spec.defaultRounds === undefined);
  }
  if (spec.teamScored || spec.groupRanked) {
    check(`${id}: scoring by side or by group means a two-group entry`, !!spec.twoGroupEntry);
  }
}

// --- validators actually guard their generators ------------------------------
// A field the registry accepts must be one the format can really schedule, and
// a field it rejects must be one that would have thrown.
const gens: Partial<Record<TournamentFormat, (n: number) => unknown>> = {
  americano: (n) => generateAmericano(n, 3),
  "team-americano": (n) => generateTeamAmericano(n, 2),
  mixicano: (n) => generateMixicano(n, 2),
  "mixed-team-americano": (n) => generateMixedTeamAmericano(n, 2),
};
for (const [id, gen] of Object.entries(gens) as Array<[TournamentFormat, (n: number) => unknown]>) {
  let mismatch = "";
  for (let n = 1; n <= 33; n++) {
    const accepted = validateField(id, n) === null;
    let works = true;
    try {
      gen(n);
    } catch {
      works = false;
    }
    if (accepted !== works) mismatch ||= `n=${n}: registry ${accepted ? "accepts" : "rejects"}, generator ${works ? "works" : "throws"}`;
  }
  check(`${id}: the validator agrees with the generator at every size`, mismatch === "", mismatch);
}

// --- the bug that keeps happening: defaults that schedule repeats ------------
// A default round count must never exceed what the format can do cleanly.
const repeatChecks: Array<[TournamentFormat, (n: number, r: number) => number]> = [
  ["americano", (n, r) => {
    const s = generateAmericano(n, r);
    const seen = new Set<string>();
    let rep = 0;
    for (const m of s.matches) for (const t of [m.team1, m.team2]) {
      const k = [...t].sort((a, b) => a - b).join("-");
      if (seen.has(k)) rep++;
      seen.add(k);
    }
    return rep;
  }],
  ["team-americano", (n, r) => teamScheduleQuality(generateTeamAmericano(n, r), n).repeatedPartnerships],
  ["mixicano", (n, r) => mixicanoScheduleQuality(generateMixicano(n, r), n).repeatedPartnerships],
  ["mixed-team-americano", (n, r) => mixedTeamScheduleQuality(generateMixedTeamAmericano(n, r), n).repeatedPartnerships],
];
for (const [id, countRepeats] of repeatChecks) {
  let bad = "";
  for (let n = 4; n <= 32; n++) {
    if (validateField(id, n) !== null) continue;
    const rounds = defaultRoundsFor(id, n);
    const repeats = countRepeats(n, rounds);
    if (repeats > 0) bad ||= `n=${n}: ${rounds} rounds gives ${repeats} repeated partnerships`;
  }
  check(`${id}: the default round count never schedules a repeated partner`, bad === "", bad);
}

// --- the display labels exist where they are needed --------------------------
// Every rotating format shows a standings subtitle and a "who is leading" card;
// a missing one silently falls back to the americano's wording, which reads as
// a bug rather than a default.
{
  const missingSubtitle = FORMAT_IDS.filter((id) => formatSpec(id).rotatingPartners && !formatSpec(id).standingsSubtitle);
  const missingEyebrow = FORMAT_IDS.filter((id) => formatSpec(id).rotatingPartners && !formatSpec(id).leaderEyebrow);
  check("every rotating format has a standings subtitle", missingSubtitle.length === 0, missingSubtitle.join(","));
  check("every rotating format has a leader eyebrow", missingEyebrow.length === 0, missingEyebrow.join(","));

  const subtitles = FORMAT_IDS.map((id) => formatSpec(id).standingsSubtitle).filter(Boolean);
  check("no two formats share a standings subtitle", new Set(subtitles).size === subtitles.length);
}

// --- every legal field is described, not just validated ----------------------
{
  let bad = "";
  for (const id of FORMAT_IDS) {
    if (!formatSpec(id).rotatingPartners) continue;
    for (let n = 4; n <= 32; n++) {
      if (validateField(id, n) !== null) continue;
      const d = describeField(id, n);
      if (!d.ok || !d.message) bad ||= `${id} at n=${n}`;
    }
  }
  check("every field the registry accepts is also described", bad === "", bad);
}

// --- the messages are usable -------------------------------------------------
{
  let bad = "";
  for (const id of FORMAT_IDS) {
    const msg = validateField(id, 3); // too small for everything
    if (!msg) {
      if (id !== "round-robin") bad ||= `${id} accepts a field of 3`;
      continue;
    }
    if (!/\d/.test(msg)) bad ||= `${id}: message names no number`;
    if (!msg.includes("got 3")) bad ||= `${id}: message does not say what was given`;
  }
  check("rejection messages say the limit and what was given", bad === "", bad);
}

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
