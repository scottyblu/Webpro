"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, UserRound, Wallet } from "lucide-react";
import { cn } from "@/components/ui/cn";

const links = [
  { href: "/dashboard", label: "My Membership", short: "Membership", icon: Wallet },
  { href: "/dashboard/profile", label: "Profile", short: "Profile", icon: UserRound },
];

function useLinks(isAdmin: boolean) {
  return isAdmin ? [...links, { href: "/admin", label: "Admin", short: "Admin", icon: LayoutDashboard }] : links;
}

/** Desktop: tabs in the header. */
export function MemberNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-1 sm:flex">
      {useLinks(isAdmin).map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
            pathname === l.href ? "bg-stone-800 text-white" : "text-stone-300 hover:bg-stone-800 hover:text-white",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phone: app-style bottom tab bar. */
export function MemberBottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      aria-label="Main"
    >
      <div className="flex">
        {useLinks(isAdmin).map(({ href, short, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn("flex flex-1 select-none flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-600" : "text-stone-500")}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
              {short}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
