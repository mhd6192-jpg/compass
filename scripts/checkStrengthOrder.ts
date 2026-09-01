// Putting the entry list into strength order.
//
// A mexicano draws its first round straight off the entry order — top four on
// the first court, next four on the second — and king of the court builds its
// opening ladder the same way. Organisers were guessing that order from memory
// every week.
//
// The risk in automating it is doing something surprising with the people the
// club has no record of, so most of what follows is about them.

export {};

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  const { orderByStrength, nameKeyOf } = await import("../src/lib/members");

  /** Lower is stronger: a mean finishing position as a fraction of the field. */
  const table = (pairs: [string, number][]) => new Map(pairs.map(([n, s]) => [nameKeyOf(n), s]));

  const club = table([
    ["Ana", 0.1],
    ["Ben", 0.35],
    ["Cara", 0.6],
    ["Dan", 0.9],
  ]);

  // --- the ordinary case --------------------------------------------------------
  const out = orderByStrength(["Dan", "Cara", "Ana", "Ben"], club);
  check("the strongest goes first", out.ordered[0] === "Ana", out.ordered.join(", "));
  check("...and the weakest last", out.ordered[3] === "Dan", out.ordered.join(", "));
  check("the whole list is in strength order", out.ordered.join(",") === "Ana,Ben,Cara,Dan", out.ordered.join(","));
  check("nobody is lost", out.ordered.length === 4);
  check("it reports how many it could place", out.ranked === 4 && out.unranked.length === 0, JSON.stringify(out.unranked));

  // --- people the club has never seen --------------------------------------------
  const mixed = orderByStrength(["Zara", "Dan", "Yusuf", "Ana"], club);
  check("newcomers go last", mixed.ordered.join(",") === "Ana,Dan,Zara,Yusuf", mixed.ordered.join(","));
  check("...keeping the order they were typed in", mixed.ordered[2] === "Zara" && mixed.ordered[3] === "Yusuf");
  check("...and are named, so the organiser can move them", mixed.unranked.join(",") === "Zara,Yusuf", mixed.unranked.join(","));
  check("...and counted apart from the rest", mixed.ranked === 2, `${mixed.ranked}`);

  const allNew = orderByStrength(["Zara", "Yusuf", "Wael"], club);
  check("a field of newcomers is left exactly as typed", allNew.ordered.join(",") === "Zara,Yusuf,Wael", allNew.ordered.join(","));
  check("...and says it placed nobody", allNew.ranked === 0);

  const noHistory = orderByStrength(["Dan", "Ana"], new Map());
  check("no history at all changes nothing", noHistory.ordered.join(",") === "Dan,Ana", noHistory.ordered.join(","));

  // --- pressing the button twice ---------------------------------------------------
  // An organiser who reorders, looks at it, and reorders again must not watch
  // the field move under them.
  const once = orderByStrength(["Dan", "Cara", "Ana", "Ben"], club).ordered;
  const twice = orderByStrength(once, club).ordered;
  check("reordering an ordered list is a no-op", once.join(",") === twice.join(","), twice.join(","));

  const tied = table([["Ana", 0.5], ["Ben", 0.5], ["Cara", 0.5]]);
  const tiedOnce = orderByStrength(["Cara", "Ana", "Ben"], tied).ordered;
  check("people on equal footing keep the order they were typed", tiedOnce.join(",") === "Cara,Ana,Ben", tiedOnce.join(","));
  check("...and stay put on a second press", orderByStrength(tiedOnce, tied).ordered.join(",") === tiedOnce.join(","));

  // --- matched the same way names are matched everywhere else ------------------------
  const sloppy = orderByStrength(["dan", "  ANA  "], club);
  check("case and stray spaces still find the person", sloppy.ordered.join(",") === "  ANA  ,dan", sloppy.ordered.join(","));
  check("...and what the organiser typed is what stays in the box", sloppy.ordered[0] === "  ANA  ", "the name is not rewritten");

  // --- the shapes that could break it -------------------------------------------------
  check("an empty list is fine", orderByStrength([], club).ordered.length === 0);
  const dupes = orderByStrength(["Ana", "Ana", "Dan"], club);
  check("the same name twice is kept twice", dupes.ordered.length === 3 && dupes.ordered.filter((n) => n === "Ana").length === 2, dupes.ordered.join(","));

  // A perfect record and a bottom-of-every-table record are the two ends.
  const ends = table([["Best", 0], ["Worst", 1]]);
  check("a perfect record leads", orderByStrength(["Worst", "Best"], ends).ordered[0] === "Best");

  console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exitCode = failures ? 1 : 0;
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
