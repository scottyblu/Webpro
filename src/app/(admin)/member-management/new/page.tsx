import type { Metadata } from "next";
import Link from "next/link";
import { createMember } from "@/app/actions/members";
import { MemberForm } from "@/components/admin/member-form";
import { Card, CardBody } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireAdmin } from "@/lib/auth";
import { zonedDateString } from "@/lib/periods";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Add member" };

export default async function NewMemberPage() {
  await requireAdmin();
  const settings = await getSettings(await createClient());
  return (
    <>
      <Link href="/member-management" className="text-sm font-medium text-stone-500 hover:text-stone-800">
        ← Members
      </Link>
      <div className="mt-2">
        <PageHeader title="Add member" description="Add someone to the club. They can pay online or you can record cash payments." />
      </div>
      <Card className="max-w-2xl">
        <CardBody className="py-6">
          <MemberForm
            action={createMember}
            submitLabel="Add member"
            showInvite
            initial={{ full_name: "", email: "", phone: "", joined_date: zonedDateString(new Date(), settings.timezone), notes: "" }}
          />
        </CardBody>
      </Card>
    </>
  );
}
