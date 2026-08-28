export interface PointTiming {
  createdAt: Date;
  tappedAt: Date | null;
}

/**
 * Anything longer than this is not a point.
 *
 * A minute and a half between taps means a changeover, a drink, a chat, an
 * injury, or a coach who put the phone in their pocket. Including those would
 * make the "longest" figure a measure of interruptions.
 */
const MAX_PLAUSIBLE_MS = 90_000;

/** Below this it is a mis-tap or a double tap, not something worth showing. */
const MIN_INTERESTING_MS = 5_000;

/**
 * The longest gap between two consecutive points.
 *
 * An important honesty note about what this number is: it measures **tap to
 * tap**, so it covers the rally *plus* everything after it — retrieving the
 * ball, walking back, the server settling, and the coach's own reaction time
 * before pressing. It is an upper bound on the rally, not the rally itself.
 * There is no way to separate the two without asking the coach to mark when
 * each point begins, which would double the tapping and wreck the one thing
 * the console has to get right.
 *
 * Pairs are compared like with like: two device timestamps or two server
 * timestamps, never one of each. A phone with a badly set clock still produces
 * correct intervals between its own taps, but mixing the two sources across a
 * single gap would produce nonsense.
 */
export function longestPointGap(points: PointTiming[]): number | null {
  let longest = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];

    const useTapped = prev.tappedAt !== null && cur.tappedAt !== null;
    const a = useTapped ? prev.tappedAt! : prev.createdAt;
    const b = useTapped ? cur.tappedAt! : cur.createdAt;

    const gap = b.getTime() - a.getTime();
    if (gap > longest && gap <= MAX_PLAUSIBLE_MS) longest = gap;
  }

  return longest >= MIN_INTERESTING_MS ? longest : null;
}
