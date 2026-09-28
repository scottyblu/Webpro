import type { Metadata } from "next";
import Link from "next/link";
import { Download, UserPlus } from "lucide-react";
import { MembersDirectory, type DirectoryRow } from "@/components/admin/members-directory";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { fetchAllMembers, getMemberTotals, getMonthOverview } from "@/lib/data";
import { periodLabel } from "@/lib/periods";
import { hasLiveSubscription } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAdmin();
  const { deleted } = await searchParams;
  const supabase = await createClient();
  const [members, totals, overview] = await Promise.all([
    fetchAllMembers(supabase),
    getMemberTotals(supabase),
    getMonthOverview(supabase),
  ]);
  const statusById = new Map(overview.rows.map((r) => [r.memberId, r.status]));

  const rows: DirectoryRow[] = members.map((m) => ({
    id: m.id,
    fullName: m.full_name,
    email: m.email,
    phone: m.phone,
    joinedDate: m.joined_date,
    membershipStatus: m.membership_status,
    monthStatus: statusById.get(m.id) ?? (m.membership_status === "active" ? "UNPAID" : "CANCELLED"),
    totalPaidCents: totals.get(m.id) ?? 0,
    autopay: hasLiveSubscription(m),
  }));

  return (
    <>
      <PageHeader
        title="Members"
        description={`${members.length} total · add, edit, deactivate or remove members`}
        actions={
          <>
            <Link href="/api/export?type=members" className={buttonClass("secondary")}>
              <Download className="h-4 w-4" aria-hidden /> Export CSV
            </Link>
            <Link href="/member-management/new" className={buttonClass("primary")}>
              <UserPlus className="h-4 w-4" aria-hidden /> Add member
            </Link>
          </>
        }
      />
      {deleted && (
        <Alert tone="success" className="mb-4">
          Member deleted. Their past payments remain in the payment history and reports.
        </Alert>
      )}
      <Card>
        <MembersDirectory rows={rows} currency={overview.settings.currency} monthLabel={periodLabel(overview.period)} />
      </Card>
    </>
  );
}
