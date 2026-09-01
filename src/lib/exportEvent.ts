/**
 * Getting a result out of the building.
 *
 * Everything the app knows lives on a screen in the venue. A club circulates
 * its results — a message to the group chat that evening, a sheet on the
 * noticeboard the next morning — and until now the only way to do either was to
 * photograph a television.
 *
 * This is the message. It is plain text on purpose: it has to survive being
 * pasted into WhatsApp, which strips anything cleverer, and be readable on a
 * phone held one-handed. So no table alignment, no box drawing, and no
 * abbreviations that need the app to decode.
 *
 * Standings only, never the match list. A full americano is twenty-eight
 * results and nobody reads that in a group chat; the people who want it print
 * the page instead.
 */

export interface ExportRow {
  name: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
}

export interface ExportableEvent {
  label: string;
  formatName: string;
  scoring: string;
  /** "pts" or "gms" — what the numbers are counting. */
  tallyUnit: string;
  entrants: number;
  matches: number;
  endedAt: string;
  /** The table that decided it: teams for a team format, otherwise people. */
  standings: ExportRow[];
  /** The individual scorers, kept beside the team table where there is one. */
  players: ExportRow[] | null;
}

const MEDAL: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/**
 * One line per person.
 *
 * The top three get a medal instead of a number, which is what makes the
 * message readable at a glance in a chat full of other messages. Everyone else
 * is numbered, padded so the names line up as far as a proportional font
 * allows.
 */
function line(row: ExportRow, place: number, unit: string): string {
  const rank = MEDAL[place] ?? `${place}.`;
  const record = row.played > 0 ? ` (${row.won}W ${row.lost}L)` : "";
  return `${rank} ${row.name} — ${row.pointsFor} ${unit}${record}`;
}

function table(rows: ExportRow[], unit: string): string[] {
  return rows.map((r, i) => line(r, i + 1, unit));
}

/**
 * The whole message, ready to paste.
 *
 * `club` is appended as a sign-off so a forwarded message still says where it
 * came from — these get passed on well beyond the people who were there.
 */
export function eventSummaryText(event: ExportableEvent, club = "Alhayat Tennis Center"): string {
  const parts: string[] = [];

  parts.push(`🎾 ${event.label}`);
  const played = when(event.endedAt);
  parts.push(
    [event.formatName, event.scoring, `${event.entrants} ${event.entrants === 1 ? "entrant" : "entrants"}`]
      .filter(Boolean)
      .join(" · ")
  );
  if (played) parts.push(played);
  parts.push("");

  if (event.players) {
    // A team format is decided by the team table, so that goes first and the
    // individual scorers follow — the same order the screens showed on the night.
    parts.push("TEAMS");
    parts.push(...table(event.standings, event.tallyUnit));
    parts.push("");
    parts.push("PLAYERS");
    parts.push(...table(event.players, event.tallyUnit));
  } else {
    parts.push(...table(event.standings, event.tallyUnit));
  }

  parts.push("");
  parts.push(`${event.matches} ${event.matches === 1 ? "match" : "matches"} · ${club}`);

  return parts.join("\n");
}
