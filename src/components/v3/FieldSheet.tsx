"use client";

import { useCallback, useEffect, useState } from "react";
import { useV3Store } from "@/store/useV3Store";

interface FieldPlayer {
  id: string;
  name: string;
  seed: number;
  played: number;
  withdrawn: boolean;
  replacedBy: string | null;
}

interface FieldState {
  status: string;
  format: string;
  refusals: { replace?: string | null; withdraw?: string | null; add?: string | null };
  players: FieldPlayer[];
}

/**
 * Who is playing tonight, and the three things that can be done about it.
 *
 * Folded away by default. Most evenings nobody touches it — and then somebody
 * has to leave after three rounds, and this is the difference between carrying
 * a player who is not there and finishing the night.
 *
 * It asks for the organiser PIN rather than the scoring one. This rewrites
 * fixtures that have not been played, which is the same class of thing as
 * erasing a draw, and not something the eight people holding the scoring PIN
 * should be able to do between them.
 */
export default function FieldSheet() {
  const [field, setField] = useState<FieldState | null>(null);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [joining, setJoining] = useState("");
  const [replacing, setReplacing] = useState<FieldPlayer | null>(null);
  const [standIn, setStandIn] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/field")
      .then((r) => r.json())
      .then(setField)
      .catch(() => setField(null));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function send(body: Record<string, unknown>, done: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, pin }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(out.error ?? "That did not work.");
        return;
      }
      setNote(done);
      setReplacing(null);
      setStandIn("");
      setJoining("");
      load();
      // The courts and the board are showing a draw that has just changed.
      useV3Store.getState().refresh();
    } catch {
      setError("No connection — nothing has changed. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const playing = field?.players.filter((p) => !p.withdrawn) ?? [];
  const gone = field?.players.filter((p) => p.withdrawn) ?? [];
  const canWithdraw = field ? !field.refusals.withdraw : false;
  const canAdd = field ? !field.refusals.add : false;
  const canReplace = field ? !field.refusals.replace : false;

  return (
    <section className="rounded-2xl border border-court-line bg-court-panel p-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <h2 className="font-display uppercase text-sm text-white/60">
          Who&apos;s playing{field ? <span className="text-white/30"> ({playing.length})</span> : null}
        </h2>
        <span className="text-white/30 text-xs font-display uppercase">{open ? "Hide" : "Someone arriving or leaving?"}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-4">
          {!field ? (
            <p className="text-white/35 text-sm">Loading…</p>
          ) : field.status !== "active" ? (
            <p className="text-white/35 text-sm">Nothing is running — set the field up in setup.</p>
          ) : (
            <>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Organiser PIN"
                className="w-full rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
              />

              <div className="flex flex-col gap-1.5">
                {playing.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-xl border border-court-line/70 bg-court-bg px-3 py-2">
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {p.name}
                      <span className="text-white/25 text-xs ml-2">
                        {p.played} match{p.played === 1 ? "" : "es"}
                      </span>
                    </span>
                    {canReplace && (
                      <button
                        onClick={() => {
                          setReplacing(replacing?.id === p.id ? null : p);
                          setStandIn("");
                          setError(null);
                        }}
                        disabled={busy}
                        className="rounded-lg border border-court-line px-2.5 py-1 text-[11px] font-display uppercase text-white/55 disabled:opacity-40"
                      >
                        ⇄ Swap
                      </button>
                    )}
                    {canWithdraw && (
                      <button
                        onClick={() => {
                          if (confirm(`${p.name} leaves now? The rounds not yet played are drawn again without them.`)) {
                            void send({ action: "withdraw", playerId: p.id }, `${p.name} has left. The rest of the night is redrawn.`);
                          }
                        }}
                        disabled={busy || !pin}
                        className="rounded-lg border border-live/40 px-2.5 py-1 text-[11px] font-display uppercase text-live disabled:opacity-40"
                      >
                        Leaves
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {replacing && (
                <div className="rounded-xl border border-gold/40 bg-gold/5 p-3 flex flex-col gap-2">
                  <p className="text-xs text-white/60">
                    Somebody takes <span className="text-gold">{replacing.name}</span>&apos;s place. {replacing.name} keeps
                    the matches they have already played.
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={standIn}
                      onChange={(e) => setStandIn(e.target.value)}
                      placeholder="Who is coming in"
                      className="flex-1 rounded-lg border border-court-line bg-court-bg px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() =>
                        void send(
                          { action: "replace", playerId: replacing.id, name: standIn },
                          `${standIn.trim()} takes ${replacing.name}'s place.`
                        )
                      }
                      disabled={busy || !pin || !standIn.trim()}
                      className="rounded-lg bg-gold text-court-bg font-display uppercase text-xs px-4 disabled:opacity-40"
                    >
                      Swap in
                    </button>
                  </div>
                </div>
              )}

              {canAdd ? (
                <div className="flex gap-2">
                  <input
                    value={joining}
                    onChange={(e) => setJoining(e.target.value)}
                    placeholder="Somebody arriving late"
                    className="flex-1 rounded-xl border border-court-line bg-court-bg px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => void send({ action: "add", name: joining }, `${joining.trim()} is in from the next round.`)}
                    disabled={busy || !pin || !joining.trim()}
                    className="rounded-xl border border-court-line px-4 text-xs font-display uppercase text-white/70 disabled:opacity-40"
                  >
                    + Join
                  </button>
                </div>
              ) : (
                <p className="text-white/35 text-xs">{field.refusals.add}</p>
              )}

              {canWithdraw && (
                // Worth saying before rather than after: an americano's promise
                // is that everybody partners everybody once, and that can only
                // hold across a single draw.
                <p className="text-white/25 text-[11px]">
                  Changing the field draws the rounds not yet played again, so a pairing from earlier in the night can
                  come round a second time. Everything already played stays exactly as it was.
                </p>
              )}

              {gone.length > 0 && (
                <div className="border-t border-court-line pt-3">
                  <p className="text-white/30 text-[11px] uppercase font-display tracking-wider mb-1.5">Left tonight</p>
                  {gone.map((p) => (
                    <p key={p.id} className="text-white/35 text-xs">
                      {p.name}
                      {p.replacedBy ? ` — ${p.replacedBy} took their place` : ""}
                      <span className="text-white/20"> · keeps {p.played} match{p.played === 1 ? "" : "es"}</span>
                    </p>
                  ))}
                </div>
              )}

              {error && <p className="text-sm text-live">{error}</p>}
              {note && <p className="text-sm text-gold">{note}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
