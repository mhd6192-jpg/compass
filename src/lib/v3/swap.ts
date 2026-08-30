import { participantIds, type MatchDTO } from "../types";

/**
 * Swapping the match a court is about to play.
 *
 * Someone is always late, or has just come off a three-setter and wants ten
 * minutes. The coach needs to pull a different match forward without going to
 * find the organiser — but only to a match that can actually be played right
 * now, or they will send two teams to two courts at once.
 *
 * The eligibility rule here deliberately mirrors the conflict check in
 * `manualAssignCourt`, so the list a coach sees is exactly the set of moves the
 * server will accept. Anything looser and they get an error after choosing.
 */

/** A match can be moved aside only while it is genuinely un-started. */
export function canSwapOut(match: MatchDTO | null | undefined): boolean {
  if (!match) return false;
  if (match.status === "completed") return false;
  // One point in and it is somebody's match — finish it or retire it, don't
  // quietly swap it off the court.
  return match.state.totalPoints === 0;
}

/** Where a candidate is sitting now, for the coach to read before choosing. */
export function candidateLocation(match: MatchDTO): string | null {
  if (match.courtId == null) return null;
  return match.courtSlot === "current" ? `On court ${match.courtId}` : `Queued on court ${match.courtId}`;
}

/**
 * Matches that could take `outgoing`'s place on court right now.
 *
 * Excluded: the match itself, anything finished or already part-scored, any
 * match whose players aren't decided yet (a bracket slot still waiting on a
 * result), and any match where a team is already committed to a different
 * court. Moving `outgoing` frees its own players, so it never blocks a
 * candidate — and neither does the candidate's own current slot, since it is
 * the thing being moved.
 */
export function eligibleReplacements(matches: MatchDTO[], outgoing: MatchDTO): MatchDTO[] {
  const teamIds = (m: MatchDTO) => participantIds(m);

  return matches.filter((cand) => {
    if (cand.id === outgoing.id) return false;
    if (cand.status === "completed" || cand.status === "in_progress") return false;
    if (!cand.player1 || !cand.player2) return false; // the draw hasn't decided who plays this yet
    if (cand.state.totalPoints > 0) return false; // part-scored somewhere — don't move it
    // An americano round that has not been let out yet is not a legal
    // substitute: pulling one forward would jump the rotation.
    if (cand.status === "pending") return false;

    const wanted = teamIds(cand);
    const clash = matches.some((m) => {
      if (m.status === "completed") return false;
      if (m.courtId == null) return false;
      if (m.id === cand.id || m.id === outgoing.id) return false; // both are moving
      return teamIds(m).some((pid) => wanted.includes(pid));
    });
    return !clash;
  });
}
