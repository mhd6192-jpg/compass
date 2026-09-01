// The message a result is sent out as.
//
// It ends up pasted into WhatsApp and read on a phone, which rules out most of
// what makes a table readable on a screen: no alignment, no box drawing, no
// abbreviations that need the app to decode. So the checks are mostly about it
// surviving that trip and still saying who won.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

const ROW = (name: string, pointsFor: number, won: number, lost: number) => ({
  name,
  pointsFor,
  won,
  lost,
  played: won + lost,
});

async function main() {
  const { eventSummaryText } = await import("../src/lib/exportEvent");

  const americano = {
    label: "Tuesday americano",
    formatName: "Americano (rotating partners)",
    scoring: "First to 16",
    tallyUnit: "pts",
    entrants: 8,
    matches: 12,
    endedAt: "2026-08-11T19:30:00.000Z",
    standings: [
      ROW("Ana", 96, 5, 1),
      ROW("Ben", 88, 4, 2),
      ROW("Cara", 81, 4, 2),
      ROW("Dan", 74, 3, 3),
      ROW("Eve", 70, 2, 4),
    ],
    players: null,
  };

  const text = eventSummaryText(americano);
  console.log("\n--- what gets pasted ---\n" + text + "\n------------------------\n");

  // --- it has to say what it is ------------------------------------------------
  check("the event is named first", text.startsWith("🎾 Tuesday americano"), text.split("\n")[0]);
  check("the format is stated", text.includes("Americano (rotating partners)"));
  check("...and the scoring rules with it", text.includes("First to 16"));
  check("...and how many played", text.includes("8 entrants"));
  check("the date is spelled out, not a number", /\d{1,2} August 2026/.test(text), text.split("\n")[2]);
  check("...with the day of the week, which is how a club names its nights", /Tuesday|Wednesday|Monday|Thursday|Friday|Saturday|Sunday/.test(text.split("\n")[2]), text.split("\n")[2]);

  // --- the part people actually read -------------------------------------------
  check("the winner is first", text.indexOf("Ana") < text.indexOf("Ben"));
  check("the top three get medals", text.includes("🥇 Ana") && text.includes("🥈 Ben") && text.includes("🥉 Cara"), "");
  check("...and everyone else a number", text.includes("4. Dan") && text.includes("5. Eve"));
  check("every score is there", ["96", "88", "81", "74", "70"].every((n) => text.includes(n)));
  check("the unit is named, so points are not read as games", text.includes("96 pts"));
  check("a record is shown beside it", text.includes("(5W 1L)"), "");
  check("everybody appears exactly once", americano.standings.every((r) => text.split(r.name).length === 2));

  // --- and where it came from ----------------------------------------------------
  check("it signs off with the club", text.trimEnd().endsWith("Alhayat Tennis Center"), text.trimEnd().split("\n").pop());
  check("...and the match count", text.includes("12 matches"));
  check("a different club can be named", eventSummaryText(americano, "Riverside LTC").includes("Riverside LTC"));

  // --- pasting into a chat -------------------------------------------------------
  // Anything that needs a monospace font to line up arrives as a mess, because
  // the one thing a chat app is guaranteed to do is reflow the text.
  check("no tab characters", !text.includes("\t"));
  check("no box drawing or table rules", !/[│┃─━┌┐└┘├┤|]/.test(text));
  check("no run of spaces pretending to be a column", !/ {3}/.test(text));
  check("no blank line at the end to swallow", text === text.trimEnd());
  check("never two blank lines in a row", !text.includes("\n\n\n"));
  check("short enough to read on a phone", text.length < 1200, `${text.length} characters`);

  // --- a team format keeps both tables ---------------------------------------------
  const team = {
    ...americano,
    label: "Club match",
    formatName: "Team americano (two sides)",
    entrants: 8,
    standings: [ROW("Team A", 210, 7, 5), ROW("Team B", 198, 5, 7)],
    players: [ROW("Ana", 60, 4, 2), ROW("Ben", 55, 3, 3)],
  };
  const teamText = eventSummaryText(team);
  check("a team event leads with the team table", teamText.indexOf("TEAMS") < teamText.indexOf("PLAYERS"), "");
  check("...naming the sides", teamText.includes("🥇 Team A") && teamText.includes("🥈 Team B"));
  check("...and keeps the individual scorers", teamText.includes("Ana") && teamText.includes("Ben"));
  check("...still with no double blank line", !teamText.includes("\n\n\n"));

  // --- the awkward shapes ----------------------------------------------------------
  const single = { ...americano, entrants: 1, matches: 1, standings: [ROW("Ana", 16, 1, 0)], players: null };
  const singleText = eventSummaryText(single);
  check("one entrant is an entrant, not entrants", singleText.includes("1 entrant") && !singleText.includes("1 entrants"), "");
  check("one match is a match, not matches", singleText.includes("1 match ·"), singleText.trimEnd().split("\n").pop());

  const unplayed = { ...americano, standings: [ROW("Ana", 0, 0, 0)], players: null };
  check("somebody who played nothing shows no record", !eventSummaryText(unplayed).includes("(0W 0L)"), "");

  const games = { ...americano, tallyUnit: "gms" };
  check("a sets-and-games event counts games", eventSummaryText(games).includes("96 gms"));

  const noDate = { ...americano, endedAt: "not a date" };
  check("an unreadable date is left out rather than printed as gibberish", !/Invalid/.test(eventSummaryText(noDate)), "");

  // A long field still has to be one message rather than something that gets
  // truncated halfway down the standings.
  const big = {
    ...americano,
    entrants: 24,
    standings: Array.from({ length: 24 }, (_, i) => ROW(`Player ${i + 1}`, 100 - i, 6 - (i % 6), i % 6)),
    players: null,
  };
  const bigText = eventSummaryText(big);
  check("a field of 24 all fit in one message", bigText.split("\n").filter((l) => /Player /.test(l)).length === 24, `${bigText.length} characters`);
  check("...and the last of them is still there", bigText.includes("24. Player 24"), "");

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
