import Link from "next/link";
import ClubLogo from "@/components/shared/ClubLogo";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 gap-10">
      <div className="text-center flex flex-col items-center gap-4">
        <ClubLogo size={56} />
        <div>
          <p className="font-display uppercase tracking-[0.35em] text-gold/80 text-sm mb-2">Compass Draw</p>
          <h1 className="font-display text-5xl sm:text-6xl font-bold uppercase tracking-tight">Tournament Control</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full max-w-4xl">
        <Link
          href="/scorer"
          className="group rounded-2xl border border-court-line bg-court-panel p-6 flex flex-col items-center gap-3 hover:border-gold/60 hover:bg-court-panel2 transition-colors"
        >
          <span className="text-4xl">📱</span>
          <span className="font-display uppercase tracking-wide text-lg">Scorer</span>
          <span className="text-white/50 text-sm text-center">Coaches score matches live, point by point</span>
        </Link>

        <Link
          href="/display"
          className="group rounded-2xl border border-court-line bg-court-panel p-6 flex flex-col items-center gap-3 hover:border-gold/60 hover:bg-court-panel2 transition-colors"
        >
          <span className="text-4xl">📺</span>
          <span className="font-display uppercase tracking-wide text-lg">TV Display</span>
          <span className="text-white/50 text-sm text-center">Big-screen broadcast view for the courtyard</span>
        </Link>

        <Link
          href="/control"
          className="group rounded-2xl border border-court-line bg-court-panel p-6 flex flex-col items-center gap-3 hover:border-gold/60 hover:bg-court-panel2 transition-colors"
        >
          <span className="text-4xl">🎛️</span>
          <span className="font-display uppercase tracking-wide text-lg">TV Control</span>
          <span className="text-white/50 text-sm text-center">Drive the big screen — hold or cycle scenes</span>
        </Link>

        <Link
          href="/setup"
          className="group rounded-2xl border border-court-line bg-court-panel p-6 flex flex-col items-center gap-3 hover:border-gold/60 hover:bg-court-panel2 transition-colors"
        >
          <span className="text-4xl">⚙️</span>
          <span className="font-display uppercase tracking-wide text-lg">Setup</span>
          <span className="text-white/50 text-sm text-center">Seed the 16 players and start the event</span>
        </Link>
      </div>

      <Link
        href="/v3"
        className="group w-full max-w-4xl rounded-2xl border border-gold/40 bg-gold/5 px-6 py-5 flex items-center gap-4 hover:border-gold hover:bg-gold/10 transition-colors"
      >
        <span className="text-3xl">🆕</span>
        <span className="flex-1 min-w-0">
          <span className="block font-display uppercase tracking-wide text-lg text-gold">Compass v3 — Court Screens</span>
          <span className="block text-white/50 text-sm">
            A TV per court, a coach console per court, and the awards presentation
          </span>
        </span>
        <span className="text-gold/60 text-xl">›</span>
      </Link>

      <Link href="/v2" className="text-white/35 text-xs underline underline-offset-4 hover:text-white/60 -mt-3">
        Previous version (v2)
      </Link>

      <div className="flex items-center gap-4 flex-wrap justify-center">
        <Link href="/history" className="text-white/40 text-sm underline underline-offset-4 hover:text-white/70">
          Past events
        </Link>
        <span className="text-white/20">·</span>
        <Link href="/draw" className="text-white/40 text-sm underline underline-offset-4 hover:text-white/70">
          Full draw sheet
        </Link>
        <span className="text-white/20">·</span>
        <Link href="/bracket" className="text-white/40 text-sm underline underline-offset-4 hover:text-white/70">
          View public bracket page
        </Link>
        <span className="text-white/20">·</span>
        <Link href="/results" className="text-white/40 text-sm underline underline-offset-4 hover:text-white/70">
          Printable results
        </Link>
      </div>
    </main>
  );
}
