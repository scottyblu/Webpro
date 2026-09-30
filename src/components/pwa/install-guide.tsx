"use client";

import { useEffect, useState } from "react";
import { cn } from "@/components/ui/cn";
import { CopyButton } from "@/components/ui/copy-button";
import s from "./install-guide.module.css";

type Platform = "iphone" | "android";

interface Step {
  title: string;
  text: React.ReactNode;
  picture: React.ReactNode;
}

/* eslint-disable @next/next/no-img-element -- tiny drawings using the club's own icon route */
function Phone({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.phone} aria-hidden>
      <div className={s.screen}>{children}</div>
    </div>
  );
}

function Page({ top = false }: { top?: boolean }) {
  return (
    <div className={cn(s.page, top && s.pageTop)}>
      <i />
      <i />
      <i />
      <i style={{ width: "70%" }} />
    </div>
  );
}

function HomeScreen({ round }: { round?: boolean }) {
  return (
    <div className={s.home}>
      {Array.from({ length: 12 }, (_, i) =>
        i === (round ? 6 : 5) ? (
          <span key={i} className={cn(s.me, s.ring, s.box, round && s.round)}>
            <img src="/club-logo/icon192" alt="" />
          </span>
        ) : (
          <span key={i} />
        ),
      )}
    </div>
  );
}

function steps(host: string): Record<Platform, Step[]> {
  const open = (browser: string) => ({
    title: `Open ${browser}`,
    text: (
      <>
        Type <b>{host}</b> in the address bar at the top and go to the page.
      </>
    ),
  });
  const last = (where: string): Step => ({
    title: "Open it from the new icon",
    text: (
      <>
        Find the <b>Breakfast Club</b> icon on your home screen{where}, tap it, and <b>sign in once</b>. From now on, always
        open the club from this icon.
      </>
    ),
    picture: null,
  });

  return {
    iphone: [
      {
        ...open("Safari"),
        picture: (
          <Phone>
            <div className={cn(s.bar, s.ring, s.box)}>{host}</div>
            <Page />
          </Phone>
        ),
      },
      {
        title: "Tap the Share button",
        text: (
          <>
            It&apos;s the <b>square with an arrow pointing up</b>, at the bottom of the screen. Don&apos;t see it? Tap{" "}
            <b>⋯</b> (three dots) at the bottom first, then <b>Share</b>.
          </>
        ),
        picture: (
          <Phone>
            <div className={s.bar}>{host}</div>
            <Page />
            <div className={s.toolbar}>
              <span>
                <svg width="8" height="8" viewBox="0 0 10 10">
                  <path d="M7 1 3 5l4 4" stroke="currentColor" fill="none" strokeWidth="1.4" />
                </svg>
              </span>
              <span className={s.ring}>
                <svg width="10" height="11" viewBox="0 0 10 12">
                  <path d="M5 1v7M2.5 3.3 5 1l2.5 2.3" stroke="#e8650a" fill="none" strokeWidth="1.3" />
                  <path d="M2 5.5H1v5.5h8V5.5H8" stroke="#e8650a" fill="none" strokeWidth="1.2" />
                </svg>
              </span>
              <span>
                <svg width="10" height="8" viewBox="0 0 12 10">
                  <path d="M1 1h4c1 0 1 1 1 1v7c0-1-1-1-1-1H1zM11 1H7C6 1 6 2 6 2v7c0-1 1-1 1-1h4z" stroke="currentColor" fill="none" />
                </svg>
              </span>
              <span>
                <svg width="9" height="9" viewBox="0 0 10 10">
                  <rect x="1" y="1" width="6" height="6" stroke="currentColor" fill="none" />
                  <rect x="3" y="3" width="6" height="6" stroke="currentColor" fill="#fbfaf8" />
                </svg>
              </span>
            </div>
          </Phone>
        ),
      },
      {
        title: "Tap “Add to Home Screen”",
        text: (
          <>
            Scroll down the list that pops up until you see <b>Add to Home Screen</b> (a square with a +).
          </>
        ),
        picture: (
          <Phone>
            <Page top />
            <div className={s.sheet}>
              <div className={s.row}>Copy <span>⧉</span></div>
              <div className={s.row}>Add to Reading List <span>∞</span></div>
              <div className={s.row}>Add Bookmark <span>▭</span></div>
              <div className={cn(s.row, s.hl)}>Add to Home Screen <span>⊞</span></div>
              <div className={s.row}>Find on Page <span>⌕</span></div>
            </div>
          </Phone>
        ),
      },
      {
        title: "Tap “Add”",
        text: (
          <>
            It&apos;s in the <b>top-right corner</b>. If you see an <b>“Open as Web App”</b> switch, leave it turned on.
          </>
        ),
        picture: (
          <Phone>
            <div className={s.topActions}>
              <span>Cancel</span>
              <span className={cn(s.ring, s.box, s.accentText)}>Add</span>
            </div>
            <div className={cn(s.dialog, s.dialogHigh)}>
              <div className={s.appRow}>
                <img src="/club-logo/apple180" alt="" />
                Breakfast Club
              </div>
              <div className={s.muted}>{host}</div>
            </div>
          </Phone>
        ),
      },
      { ...last(""), picture: <Phone><HomeScreen /></Phone> },
    ],
    android: [
      {
        ...open("Chrome"),
        picture: (
          <Phone>
            <div className={cn(s.bar, s.barShort, s.ring, s.box)}>{host}</div>
            <Page />
          </Phone>
        ),
      },
      {
        title: "Tap the ⋮ menu",
        text: (
          <>
            It&apos;s the <b>three dots</b> in the <b>top-right corner</b>, next to the address bar.
          </>
        ),
        picture: (
          <Phone>
            <div className={cn(s.bar, s.barShort)}>{host}</div>
            <span className={cn(s.dots, s.ring)}>
              <svg width="3" height="11" viewBox="0 0 3 11">
                <circle cx="1.5" cy="1.5" r="1.3" fill="#e8650a" />
                <circle cx="1.5" cy="5.5" r="1.3" fill="#e8650a" />
                <circle cx="1.5" cy="9.5" r="1.3" fill="#e8650a" />
              </svg>
            </span>
            <Page />
          </Phone>
        ),
      },
      {
        title: "Tap “Add to Home screen”",
        text: (
          <>
            On some phones it says <b>“Install app”</b> instead. Either one works.
          </>
        ),
        picture: (
          <Phone>
            <div className={cn(s.bar, s.barShort)}>{host}</div>
            <Page />
            <div className={s.menu}>
              <div className={s.row}>New tab</div>
              <div className={s.row}>History</div>
              <div className={s.row}>Bookmarks</div>
              <div className={cn(s.row, s.hl)}>Add to Home screen</div>
              <div className={s.row}>Share…</div>
              <div className={s.row}>Settings</div>
            </div>
          </Phone>
        ),
      },
      {
        title: "Tap “Install” or “Add”",
        text: (
          <>
            Confirm in the box that pops up. If it asks where to put it, choose <b>Add automatically</b>.
          </>
        ),
        picture: (
          <Phone>
            <Page top />
            <div className={s.dialog}>
              <div className={s.appRow}>
                <img src="/club-logo/icon192" alt="" style={{ borderRadius: "50%" }} />
                Install app?
              </div>
              <div className={s.muted}>
                Breakfast Club
                <br />
                {host}
              </div>
              <div className={s.buttons}>
                <span>Cancel</span>
                <span className={cn(s.ring, s.box, s.accentText)}>Install</span>
              </div>
            </div>
          </Phone>
        ),
      },
      { ...last(" (or in your app list)"), picture: <Phone><HomeScreen round /></Phone> },
    ],
  };
}
/* eslint-enable @next/next/no-img-element */

/** Step-by-step pictures for adding the app to an iPhone or Android home screen. */
export function InstallGuide({ siteHost }: { siteHost: string }) {
  const [platform, setPlatform] = useState<Platform>("iphone");
  const [host, setHost] = useState(siteHost);

  useEffect(() => {
    setHost(window.location.host);
    const hash = window.location.hash.replace("#", "");
    if (hash === "android" || hash === "iphone") setPlatform(hash);
    else if (/android/i.test(navigator.userAgent)) setPlatform("android");
  }, []);

  const list = steps(host)[platform];

  return (
    <div className={cn(s.root, "space-y-5")}>
      <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">The app&apos;s address</p>
          <p className="select-all break-all text-lg font-bold text-stone-900">{host}</p>
        </div>
        <CopyButton text={`https://${host}`} />
      </div>

      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-stone-200 bg-white p-1.5" role="tablist" aria-label="Choose your phone">
        {(["iphone", "android"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={platform === p}
            onClick={() => setPlatform(p)}
            className={cn(
              "rounded-lg px-3 py-2.5 text-base font-semibold transition-colors",
              platform === p ? "bg-stone-900 text-white" : "text-stone-700 hover:bg-stone-100",
            )}
          >
            {p === "iphone" ? "iPhone" : "Android"}
          </button>
        ))}
      </div>

      <p className="text-sm text-stone-500">
        {platform === "iphone" ? (
          <>
            Use <b className="text-stone-800">Safari</b>, the iPhone&apos;s built-in browser (blue compass icon).
          </>
        ) : (
          <>
            Use <b className="text-stone-800">Chrome</b> (the red, yellow and green circle icon).
          </>
        )}
      </p>

      <ol className="grid gap-4" role="tabpanel">
        {list.map((step, i) => (
          <li key={step.title} className="flex items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm max-[380px]:flex-col">
            {step.picture}
            <div className="min-w-0">
              <h2 className="flex items-baseline gap-2.5 text-lg font-bold leading-snug text-stone-900">
                <span className="grid h-7 w-7 shrink-0 translate-y-0.5 place-items-center rounded-full bg-brand-500 text-sm font-extrabold text-white">
                  {i + 1}
                </span>
                {step.title}
              </h2>
              <p className="mt-1 text-stone-600 [&_b]:text-stone-900">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
