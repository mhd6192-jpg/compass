/**
 * The Alhayat mark — the lime tennis-ball "h", traced from the club's own
 * artwork so it stays crisp at any size on the TV. Two tones: the bright
 * lime body and the deeper olive sweep that gives the ball its shading.
 * `onLight` flips wordmark colors for light backgrounds (e.g. the printable
 * results page).
 */
const MARK_BRIGHT = "#D6DF20";
const MARK_OLIVE = "#BFD630";

export function ClubMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
      {/* arch */}
      <path
        fill={MARK_BRIGHT}
        d="M30.6 0.0L26.7 0.3L25.0 0.9L23.6 1.0L22.6 1.4L22.4 1.6L22.3 3.9L22.4 25.4L22.5 25.6L23.0 25.6L25.6 24.5L29.0 23.7L34.0 23.6L35.9 23.8L38.8 24.5L42.3 25.8L45.5 27.8L47.2 29.2L48.7 30.7L51.0 33.6L52.5 36.3L53.8 39.6L54.4 42.3L54.6 44.1L54.6 53.7L54.8 54.3L57.1 51.9L59.9 47.7L62.1 43.0L63.4 38.2L64.0 33.8L63.7 28.1L63.4 26.0L62.8 23.1L62.2 22.1L62.1 21.3L61.4 19.3L59.5 15.6L58.0 13.4L56.8 12.0L56.5 11.4L53.1 7.9L52.7 7.8L50.5 5.9L48.5 4.6L44.2 2.4L39.9 0.9L36.3 0.3Z"
      />
      {/* right leg */}
      <path
        fill={MARK_BRIGHT}
        d="M31.1 36.0L29.5 36.3L28.2 36.8L26.0 38.2L24.5 39.6L23.6 41.0L22.9 42.6L22.4 44.8L22.4 62.4L23.6 63.0L24.6 63.1L26.2 63.6L30.4 64.0L33.4 64.0L37.3 63.7L39.4 63.1L40.4 63.0L42.2 62.1L42.2 44.8L41.5 42.2L40.0 39.6L38.6 38.2L36.6 36.9L34.4 36.1Z"
      />
      {/* stem */}
      <path
        fill={MARK_BRIGHT}
        d="M9.4 9.3L7.3 11.5L5.7 13.6L4.7 15.4L4.3 15.7L2.9 18.5L1.6 21.7L0.8 24.4L0.7 25.6L0.2 27.7L0.0 34.4L0.9 40.0L1.6 42.3L2.9 45.5L4.3 48.2L6.4 51.3L9.0 54.4L9.4 54.8L9.7 54.8L9.9 54.5L9.9 45.0L9.9 13.4L9.9 9.6L9.7 9.3Z"
      />
      {/* ball shading */}
      <path
        fill={MARK_OLIVE}
        d="M39.7 1.1L39.3 1.2L39.3 1.4L40.2 1.9L40.5 2.8L41.3 3.5L42.1 5.1L42.3 5.1L42.3 5.6L42.9 5.9L43.3 7.4L44.1 8.8L44.7 10.3L44.7 11.1L45.1 11.5L45.5 13.4L45.8 15.8L46.0 16.4L46.0 17.9L46.2 19.6L46.0 20.2L46.0 22.4L45.8 23.0L45.4 26.6L45.2 27.0L44.9 27.0L44.9 27.3L47.3 29.2L50.1 32.1L52.2 35.5L53.9 39.6L54.7 43.7L54.7 54.2L54.9 54.2L57.6 51.2L59.7 48.0L61.5 44.3L61.5 43.8L62.1 42.7L63.1 39.2L63.1 38.2L63.4 37.3L63.8 34.5L63.8 29.5L63.4 26.2L62.8 23.4L62.5 23.1L61.7 20.4L59.7 16.1L57.2 12.5L53.4 8.3L51.1 6.5L50.5 6.3L50.4 5.9L49.6 5.5L49.3 5.2L48.9 5.1L48.2 4.5L45.6 3.1L45.0 3.0L42.2 1.7Z"
      />
      <path
        fill={MARK_OLIVE}
        d="M38.4 38.6L38.3 39.1L37.2 40.2L36.9 40.2L36.7 40.7L36.0 41.1L35.2 42.0L34.8 42.1L34.5 42.6L33.2 43.2L33.2 43.3L31.9 44.0L31.7 44.4L30.1 44.9L28.9 45.7L26.6 46.3L26.2 46.7L25.6 46.7L24.8 47.1L23.8 47.1L23.1 47.4L23.0 47.1L22.7 47.1L22.5 47.8L22.6 62.5L27.0 63.6L30.4 63.9L33.6 63.9L35.9 63.6L37.3 63.6L37.7 63.3L40.3 62.9L42.1 62.2L42.0 44.4L41.8 44.3L41.7 43.2L40.6 40.7L39.1 38.8Z"
      />
      <path
        fill={MARK_OLIVE}
        d="M2.4 43.1L2.3 43.5L3.0 45.4L5.0 49.2L7.0 51.9L9.2 54.4L9.7 54.8L9.7 46.5L9.5 46.3L9.1 46.5L8.0 46.2L7.7 45.9L6.2 45.5L5.0 44.7L4.3 44.6L3.7 44.1L3.1 43.9L2.6 43.2Z"
      />
    </svg>
  );
}

export default function ClubLogo({
  size = 40,
  onLight = false,
  stacked = true,
}: {
  size?: number;
  onLight?: boolean;
  stacked?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <ClubMark size={size} />
      {stacked && (
        <div className="leading-none">
          <p
            className={`font-display font-bold uppercase tracking-[0.08em] ${onLight ? "text-pine" : "text-white"}`}
            style={{ fontSize: size * 0.42 }}
          >
            Alhayat
          </p>
          <p
            className={`font-display font-semibold uppercase tracking-[0.28em] ${onLight ? "text-pine/70" : "text-gold"}`}
            style={{ fontSize: size * 0.22, marginTop: size * 0.06 }}
          >
            Tennis Center
          </p>
        </div>
      )}
    </div>
  );
}
