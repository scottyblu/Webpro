"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/components/ui/cn";

const links = [
  { href: "/dashboard", label: "My Membership" },
  { href: "/dashboard/profile", label: "Profile" },
];

export function MemberNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {links.map((l) => (
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
      {isAdmin && (
        <Link href="/admin" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-brand-300 hover:bg-stone-800">
          Admin
        </Link>
      )}
    </nav>
  );
}
