import type { Metadata } from "next";
import Link from "next/link";
import { NotificationHistory, NOTIFICATION_TYPE_LABELS, type NotificationLogRow } from "@/components/admin/notification-history";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/components/ui/cn";
import { requireAdmin } from "@/lib/auth";
import { fetchAllMembers } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Notifications" };

const FILTERS = [
  { value: "reminders", label: "Reminders", types: ["upcoming_payment_reminder", "past_due_reminder", "manual_reminder"] },
  { value: "failed", label: "Failed", types: null },
  { value: "all", label: "Everything", types: null },
] as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin();
  const { show } = await searchParams;
  const filter = FILTERS.find((f) => f.value === show) ?? FILTERS[0];
  const supabase = await createClient();
  const [settings, members] = await Promise.all([getSettings(supabase), fetchAllMembers(supabase)]);

  let query = supabase.from("notification_log").select("*").neq("channel", "log").order("created_at", { ascending: false }).limit(300);
  if (filter.value === "reminders") query = query.in("type", [...FILTERS[0].types]);
  if (filter.value === "failed") query = query.eq("status", "failed");
  const { data, error } = await query;
  const rows = (data ?? []) as NotificationLogRow[];
  const memberNames = new Map(members.map((m) => [m.id, m.full_name]));

  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <>
      <Link href="/admin/settings#reminders" className="text-sm font-medium text-stone-500 hover:text-stone-800">
        ← Payment reminder settings
      </Link>
      <div className="mt-2">
        <PageHeader
          title="Notifications"
          description="Every reminder and message sent: who, how, when, which month, and whether it was delivered."
        />
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/notifications?show=${f.value}`}
            aria-current={filter.value === f.value ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium",
              filter.value === f.value ? "bg-stone-900 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200",
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader
          title={filter.label}
          description={
            error
              ? `Could not load the history: ${error.message}`
              : `Latest ${rows.length} · ${sent} delivered · ${failed} failed${
                  filter.value === "reminders" ? ` · types: ${FILTERS[0].types.map((t) => NOTIFICATION_TYPE_LABELS[t]).join(", ")}` : ""
                }`
          }
        />
        <NotificationHistory rows={rows} timeZone={settings.timezone} memberNames={memberNames} emptyText="Nothing here yet." />
      </Card>
    </>
  );
}
