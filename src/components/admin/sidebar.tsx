"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CreditCard, LayoutDashboard, LogOut, Settings, User, UserCircle, Users, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/components/ui/cn";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/member-management", label: "Members", icon: Users },
  { href: "/payment-management", label: "Payments", icon: CreditCard },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-brand-500 text-white" : "text-stone-300 hover:bg-stone-800 hover:text-white",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function Footer({ email }: { email: string }) {
  return (
    <div className="space-y-1 border-t border-stone-800 pt-4">
      <Link href="/dashboard" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-400 hover:bg-stone-800 hover:text-white">
        <User className="h-4 w-4" aria-hidden /> My membership
      </Link>
      <form action="/auth/signout" method="post">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-stone-400 hover:bg-stone-800 hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </button>
      </form>
      <p className="truncate px-3 pt-2 text-xs text-stone-500" title={email}>
        {email}
      </p>
    </div>
  );
}

export function AdminSidebar({ email, clubName }: { email: string; clubName: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-stone-900 px-4 py-6 lg:flex">
        <Link href="/admin" className="mb-8 px-2">
          <Logo light name={clubName} />
        </Link>
        <NavLinks />
        <Footer email={email} />
      </aside>

      {/* Phone / tablet: app-style top bar */}
      <header className="sticky top-0 z-30 bg-stone-900 pt-[env(safe-area-inset-top)] lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/admin">
            <Logo light name={clubName} />
          </Link>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-full p-2 text-stone-300 hover:bg-stone-800 hover:text-white"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <UserCircle className="h-7 w-7" />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Account menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+4rem)] rounded-2xl bg-stone-900 p-3 shadow-xl">
            <div className="flex justify-end">
              <button onClick={() => setMenuOpen(false)} className="rounded-lg p-1.5 text-stone-400 hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Footer email={email} />
          </div>
        </div>
      )}

      {/* Phone / tablet: bottom tab bar */}
      <BottomTabs />
    </>
  );
}

function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-lg">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-1 select-none flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                active ? "text-brand-600" : "text-stone-500",
              )}
            >
              <Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
