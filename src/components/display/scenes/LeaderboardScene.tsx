import { MatchDTO } from "@/lib/types";
import { BRACKET_STYLE } from "@/lib/bracketStyle";
import { formatDuration, getCrownedChampions, getFastestMatch } from "@/lib/tournamentStats";
import ProgressBar from "@/components/display/ProgressBar";

export default function LeaderboardScene({ matches, progress }: { matches: MatchDTO[]; progress: { completed: number; total: number } }) {
  const champions = getCrownedChampions(matches);
  const fastest = getFastestMatch(matches);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-4xl mx-auto w-full">
      <div className="w-full max-w-sm">
        <p className="text-center text-white/30 font-display uppercase tracking-widest text-xs mb-2">Tournament Progress</p>
        <ProgressBar completed={progress.completed} total={progress.total} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 w-full">
        {champions.map((c) => {
          const style = BRACKET_STYLE[c.bracket];
          return (
            <div key={c.bracket} className={`rounded-xl border p-3 ${style.border} ${style.bg}`}>
              <p className={`font-display uppercase font-bold text-xs mb-1 ${style.text}`}>{c.label}</p>
              {c.championName ? (
                <p className="text-gold font-display font-bold text-sm truncate">🏆 {c.championName}</p>
              ) : (
                <p className="text-white/25 text-xs">Undecided</p>
              )}
            </div>
          );
        })}
      </div>

      {fastest && (
        <div className="rounded-2xl border border-gold/40 bg-gold/5 px-6 py-4 text-center">
          <p className="text-gold font-display uppercase tracking-widest text-xs mb-1">⚡ Fastest Match of the Day</p>
          <p className="font-display text-xl font-bold">
            {fastest.winnerName} <span className="text-white/40">def.</span> {fastest.loserName}
          </p>
          <p className="text-white/40 text-sm mt-1">{formatDuration(fastest.durationMs)} on court</p>
        </div>
      )}
    </div>
  );
}
