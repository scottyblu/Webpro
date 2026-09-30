import { cn } from "./ui/cn";

export function Logo({
  className,
  light = false,
  name = "The Breakfast Club",
  src,
}: {
  className?: string;
  light?: boolean;
  name?: string;
  /** The firehouse logo (from Settings); the default egg icon is shown when there isn't one. */
  src?: string | null;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- served by our own route, already sized
        <img src={src} alt="" className="h-9 w-9 shrink-0 object-contain" />
      ) : (
        <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
          <circle cx="16" cy="16" r="15" fill="#f5780b" />
          <ellipse cx="16" cy="17" rx="10" ry="8.5" fill="#fff" />
          <circle cx="16" cy="17" r="4.5" fill="#fbbf24" />
        </svg>
      )}
      <span className={cn("text-sm font-extrabold uppercase leading-tight tracking-wider", light ? "text-white" : "text-stone-900")}>
        {name}
      </span>
    </span>
  );
}

/** Link to the uploaded logo, or null when none has been uploaded. */
export function logoSrc(version: string | null): string | null {
  return version ? `/club-logo/mark?v=${version}` : null;
}
