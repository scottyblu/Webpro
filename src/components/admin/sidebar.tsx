"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CreditCard, LayoutDashboard, LogOut, Menu, Settings, User, Users, X } from "lucide-react";
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
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

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

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-stone-900 px-4 py-3 lg:hidden">
        <Link href="/admin">
          <Logo light name={clubName} />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-2 text-stone-300 hover:bg-stone-800 hover:text-white"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-stone-900 px-4 py-5">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo light name={clubName} />
              <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-stone-400 hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <Footer email={email} />
          </div>
        </div>
      )}
    </>
  );
}
