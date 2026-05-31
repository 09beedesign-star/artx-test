import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";

export default function LoadingLoopPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!rootRef.current) return;

    const ctx = gsap.context(() => {
      const state = { value: 0 };
      const tl = gsap.timeline({
        repeat: -1,
        defaults: { ease: "power3.inOut" },
      });

      tl.set(".loading-sweep", { rotation: -90, transformOrigin: "50% 50%" })
        .set(".loading-core", { scale: 0.88, transformOrigin: "50% 50%" })
        .set(".loading-node", { autoAlpha: 0.35, scale: 0.8, transformOrigin: "50% 50%" })
        .to(
          state,
          {
            value: 100,
            duration: 2,
            ease: "none",
            onUpdate: () => setProgress(Math.round(state.value)),
            onRepeat: () => {
              state.value = 0;
              setProgress(0);
            },
          },
          0,
        )
        .to(".loading-sweep", { rotation: 270, duration: 2, ease: "none" }, 0)
        .to(".loading-core", { scale: 1, duration: 0.8, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0.1)
        .to(
          ".loading-node",
          {
            autoAlpha: 1,
            scale: 1.16,
            duration: 0.38,
            stagger: { each: 0.16, from: "start" },
            yoyo: true,
            repeat: 1,
            ease: "power2.out",
          },
          0.18,
        )
        .fromTo(
          ".loading-fill",
          { scaleX: 0, transformOrigin: "left center" },
          { scaleX: 1, duration: 2, ease: "none" },
          0,
        )
        .fromTo(
          ".loading-scan",
          { xPercent: -120, autoAlpha: 0.2 },
          { xPercent: 120, autoAlpha: 0.95, duration: 2, ease: "none" },
          0,
        );
    }, rootRef);

    return () => ctx.revert();
  }, []);

  return (
    <main ref={rootRef} className="min-h-screen overflow-hidden bg-[#05070d] text-white">
      <div className="relative flex min-h-screen items-center justify-center px-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(74,222,255,0.20),transparent_28%),linear-gradient(145deg,rgba(31,41,55,0.42),transparent_42%)]" />
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:64px_64px]" />

        <section className="relative flex w-full max-w-[520px] flex-col items-center gap-9">
          <div className="relative grid h-72 w-72 place-items-center">
            <div className="absolute inset-0 rounded-full border border-cyan-200/10 bg-cyan-200/[0.03] shadow-[0_0_90px_rgba(56,189,248,0.18)]" />
            <div className="loading-scan absolute h-[118%] w-8 rounded-full bg-cyan-200/20 blur-xl" />

            <svg className="relative h-full w-full -rotate-90" viewBox="0 0 240 240" aria-hidden="true">
              <circle cx="120" cy="120" r="86" fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="8" />
              <circle
                className="loading-sweep"
                cx="120"
                cy="120"
                r="86"
                fill="none"
                stroke="url(#loadingGradient)"
                strokeLinecap="round"
                strokeDasharray="148 392"
                strokeWidth="8"
              />
              <defs>
                <linearGradient id="loadingGradient" x1="0" x2="1" y1="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" />
                  <stop offset="55%" stopColor="#a7f3d0" />
                  <stop offset="100%" stopColor="#f8fafc" />
                </linearGradient>
              </defs>
            </svg>

            <div className="loading-core absolute grid h-40 w-40 place-items-center rounded-full border border-white/10 bg-slate-950/78 shadow-[inset_0_0_34px_rgba(34,211,238,0.13)] backdrop-blur-xl">
              <div className="text-center">
                <div className="font-mono text-5xl font-semibold tabular-nums tracking-normal">{progress}</div>
                <div className="mt-1 font-mono text-xs font-medium uppercase tracking-[0.26em] text-cyan-100/60">loading</div>
              </div>
            </div>

            {[0, 1, 2, 3, 4, 5].map((node) => (
              <span
                key={node}
                className="loading-node absolute h-3 w-3 rounded-full bg-cyan-200 shadow-[0_0_22px_rgba(103,232,249,0.9)]"
                style={{
                  transform: `rotate(${node * 60}deg) translateY(-132px)`,
                }}
              />
            ))}
          </div>

          <div className="w-full">
            <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.22em] text-slate-300/70">
              <span>Process loop</span>
              <span>2.00s</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-white/10 bg-white/8">
              <div className="loading-fill h-full rounded-full bg-gradient-to-r from-cyan-300 via-emerald-200 to-white shadow-[0_0_30px_rgba(45,212,191,0.55)]" />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
