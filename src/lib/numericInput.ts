/**
 * The rules behind a "preset chips plus a Custom box" number field.
 *
 * Pulled out of the setup form because the form got them wrong for a long time
 * and the mistake was invisible: the box was bound to the CLAMPED model value
 * rather than to what the organiser was typing, so
 *
 *   - typing a digit below the minimum clamped on the keystroke — typing "18"
 *     into the race target gave "1", clamped to 4, and the box then read "4"
 *     with no way to carry on;
 *   - typing a number that happened to be a preset blanked the box mid-word,
 *     because the derived value went back to "";
 *   - the box could not be cleared at all, since parseInt("") is NaN, the
 *     update was skipped, and the old number snapped straight back in.
 *
 * None of that is visible to a type-checker or to a screen-reading test, and
 * all of it is a one-line pure function. So the rules live here, where they can
 * be checked, and the component is left holding only the draft string.
 *
 * The contract, in one sentence: WHILE TYPING a value is committed only once it
 * is already legal; ON BLUR whatever is there is clamped into range, and
 * nonsense leaves the committed value alone.
 */

/** Digits only, and short enough that a slip cannot become an enormous number. */
export function sanitizeNumericText(raw: string, maxDigits = 3): string {
  return raw.replace(/[^0-9]/g, "").slice(0, maxDigits);
}

/**
 * What to commit as the organiser types, or null to leave the value alone.
 *
 * Half-typed numbers are NOT committed. That is the whole point: "1" on the way
 * to "18" is out of range, and clamping it there is what made the field
 * unusable.
 */
export function commitWhileTyping(text: string, min: number, max: number): number | null {
  const n = parseInt(text, 10);
  if (!Number.isInteger(n)) return null;
  return n >= min && n <= max ? n : null;
}

/**
 * What to commit when the field is left, or null to keep the current value.
 *
 * This is where clamping belongs — once, visibly, after the organiser has
 * finished typing, rather than on every keystroke.
 */
export function commitOnBlur(text: string, min: number, max: number): number | null {
  const n = parseInt(text, 10);
  if (!Number.isInteger(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/**
 * What the box shows: the organiser's draft while they are editing, otherwise
 * the committed value — and nothing at all when a preset chip already says it.
 */
export function boxText(draft: string | null, value: number, presets: readonly number[]): string {
  if (draft !== null) return draft;
  return presets.includes(value) ? "" : String(value);
}

/**
 * A seed box that refuses rubbish instead of inventing a number from it.
 *
 * The compass seed inputs ran `Math.max(1, Math.min(16, parseInt(value) || 0))`,
 * which turns every unparseable keystroke into seed 1 — the single most
 * consequential value on the form. A letter typed into the wrong box, a stray
 * space, a pasted name, or a deliberate "0" meaning "not seeded" all made that
 * entrant the top seed, either silently rebuilding the bracket around them or
 * colliding with the real top seed and failing on Start with a message naming a
 * seed nobody typed.
 *
 * Returns the new seed, "" for unseeded, or null meaning "not a number, leave
 * the box as it was".
 */
export function parseSeedInput(raw: string, max = 16): number | "" | null {
  const text = raw.trim();
  if (text === "") return "";
  const n = parseInt(text, 10);
  if (!Number.isInteger(n)) return null;
  // 0 means what the API already means by it: unseeded.
  if (n <= 0) return "";
  return Math.min(max, n);
}
