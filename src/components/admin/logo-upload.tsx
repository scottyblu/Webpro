"use client";

import { useMemo, useState, useTransition } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { removeLogo, saveLogo } from "@/app/actions/logo";
import { FormMessage } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import type { ActionState } from "@/lib/types";

type Background = "white" | "black";
const BACKGROUNDS: Record<Background, string> = { white: "#ffffff", black: "#1c1917" };

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => reject(new Error("That file isn't an image this browser can open. Try a PNG or JPG."));
    img.src = url;
  });
}

/** Draw the image centred in a square, scaled to fit inside the padding. */
function render(img: HTMLImageElement, size: number, opts: { background: string | null; padding: number }): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, size, size);
  }
  const box = size * (1 - opts.padding * 2);
  const scale = Math.min(box / img.naturalWidth, box / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
  return canvas.toDataURL("image/png");
}

function makeVariants(img: HTMLImageElement, background: Background) {
  const bg = BACKGROUNDS[background];
  return {
    mark: render(img, 256, { background: null, padding: 0 }),
    icon192: render(img, 192, { background: bg, padding: 0.06 }),
    icon512: render(img, 512, { background: bg, padding: 0.06 }),
    apple180: render(img, 180, { background: bg, padding: 0.06 }),
    // Android crops adaptive icons to a circle or squircle: keep the logo inside the safe zone.
    maskable512: render(img, 512, { background: bg, padding: 0.18 }),
  };
}

/** Settings → Firehouse logo: pick an image, preview it as the app icon, save. */
export function LogoUpload({ currentLogo }: { currentLogo: string | null }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [background, setBackground] = useState<Background>("white");
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => (image ? makeVariants(image, background) : null), [image, background]);

  async function onFile(file: File | undefined) {
    setState({});
    if (!file) return;
    try {
      setImage(await loadImage(file));
    } catch (err) {
      setImage(null);
      setState({ error: err instanceof Error ? err.message : "Could not open that image." });
    }
  }

  return (
    <div className="space-y-4 text-sm">
      <FormMessage state={state} />

      {preview ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-5">
            <figure className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview.apple180} alt="App icon preview" className="h-16 w-16 rounded-2xl shadow ring-1 ring-stone-200" />
              <figcaption className="mt-1 text-xs text-stone-500">App icon</figcaption>
            </figure>
            <figure className="text-center">
              <div className="flex h-16 items-center gap-2 rounded-lg bg-stone-900 px-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview.mark} alt="Menu logo preview" className="h-9 w-9 object-contain" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">Menu</span>
              </div>
              <figcaption className="mt-1 text-xs text-stone-500">In the app</figcaption>
            </figure>
          </div>
          <fieldset className="flex items-center gap-2">
            <legend className="sr-only">App icon background</legend>
            <span className="text-stone-600">Icon background:</span>
            {(Object.keys(BACKGROUNDS) as Background[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBackground(b)}
                aria-pressed={background === b}
                className={cn(
                  "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
                  background === b ? "bg-stone-900 text-white ring-stone-900" : "bg-white text-stone-700 ring-stone-300",
                )}
              >
                {b === "white" ? "White" : "Black"}
              </button>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className={buttonClass("primary")}
              onClick={() =>
                startTransition(async () => {
                  const result = await saveLogo(preview);
                  setState(result);
                  if (result.ok) setImage(null);
                })
              }
            >
              {pending ? "Saving…" : "Save logo"}
            </button>
            <button type="button" className={buttonClass("secondary")} onClick={() => setImage(null)} disabled={pending}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          {currentLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentLogo} alt="Current logo" className="h-16 w-16 object-contain" />
          ) : (
            <p className="text-stone-500">No logo yet: the app uses the default egg icon.</p>
          )}
          <label className={cn(buttonClass("secondary"), "cursor-pointer")}>
            <ImageUp className="h-4 w-4" aria-hidden />
            {currentLogo ? "Change logo" : "Upload logo"}
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          {currentLogo && (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("ghost", "md", "text-red-600")}
              onClick={() => {
                if (!window.confirm("Remove the logo and go back to the default icon?")) return;
                startTransition(async () => setState(await removeLogo()));
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden /> Remove
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-stone-500">
        A square image with the patch or logo filling most of it looks best. Members who already added the app to their home
        screen see the new icon after they remove it and add it again.
      </p>
    </div>
  );
}
