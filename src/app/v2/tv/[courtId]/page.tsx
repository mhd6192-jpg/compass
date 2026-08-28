"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import V2Gate from "@/components/v2/V2Gate";
import Scoreboard from "@/components/v2/Scoreboard";
import WinnerScreen from "@/components/v2/WinnerScreen";
import CourtIdleScreen from "@/components/v2/CourtIdleScreen";
import WaitingScreen from "@/components/v2/WaitingScreen";
import FinalStandingsScreen from "@/components/v2/FinalStandingsScreen";
import CeremonyScreen from "@/components/v2/CeremonyScreen";
import ClubLogo from "@/components/shared/ClubLogo";
import { useV2Store } from "@/store/useV2Store";
import { emptyCourtStage, nextOnCourt, resolveCourtScreen } from "@/lib/v2/stage";

function TvContent({ courtId }: { courtId: number }) {
  const snapshot = useV2Store((s) => s.snapshot)!;
  const court = snapshot.courts.find((c) => c.id === courtId);
  const courtLabel = court?.label ?? `Court ${courtId}`;

  if (snapshot.tournament.status === "setup") {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 text-center px-8">
        <ClubLogo size={64} />
        <h1 className="font-display uppercase text-2xl sm:text-4xl">Waiting for the draw to be seeded</h1>
        <p className="text-white/40">
          {courtLabel} · this screen wakes up as soon as the tournament starts
        </p>
      </div>
    );
  }

  if (!court) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-5 text-center px-8">
        <h1 className="font-display uppercase text-2xl">Court {courtId} is not in this tournament</h1>
        <p className="text-white/50">Courts in play: {snapshot.courts.map((c) => c.id).join(", ") || "none"}</p>
        <Link href="/v2" className="text-gold underline underline-offset-4 font-display uppercase">
          Back to v2 hub
        </Link>
      </div>
    );
  }

  const stage = snapshot.v2.courts.find((c) => c.courtId === courtId) ?? emptyCourtStage(courtId);
  const allPlayed = snapshot.progress.total > 0 && snapshot.progress.completed === snapshot.progress.total;
  const view = resolveCourtScreen({
    courtId,
    stage,
    matches: snapshot.matches,
    allPlayed,
    ceremony: snapshot.v2.ceremony,
  });

  switch (view.screen) {
    case "ceremony":
      return <CeremonyScreen ceremony={snapshot.v2.ceremony} />;

    case "live":
      return (
        <Scoreboard
          courtLabel={courtLabel}
          match={view.match!}
          nextMatch={nextOnCourt(snapshot.matches, courtId)}
          bestOfSets={snapshot.tournament.bestOfSets}
          tiebreakMode={snapshot.tournament.tiebreakMode}
        />
      );

    case "winner":
      return (
        <WinnerScreen
          courtLabel={courtLabel}
          match={view.match!}
          winnerName={view.winnerName ?? ""}
          loserName={view.loserName ?? ""}
        />
      );

    case "waiting":
      return <WaitingScreen courtLabel={courtLabel} />;

    case "final":
      return <FinalStandingsScreen courtLabel={courtLabel} matches={snapshot.matches} format={snapshot.tournament.format} />;

    default:
      return (
        <CourtIdleScreen
          courtLabel={courtLabel}
          upcoming={view.upcoming}
          onDeck={view.onDeck}
          matches={snapshot.matches}
          format={snapshot.tournament.format}
          progress={snapshot.progress}
        />
      );
  }
}

/**
 * One TV per court. Court 3's screen is only ever about court 3 — except during
 * the awards, when every screen in the venue joins the same presentation.
 */
export default function CourtTvPage() {
  const params = useParams<{ courtId: string }>();
  const courtId = Number(params.courtId);

  if (!Number.isInteger(courtId)) {
    return (
      <div className="h-screen flex items-center justify-center text-white/50">
        Bad court in the URL — try <span className="text-gold ml-1">/v2/tv/2</span>
      </div>
    );
  }

  return (
    <V2Gate>
      <TvContent courtId={courtId} />
    </V2Gate>
  );
}
