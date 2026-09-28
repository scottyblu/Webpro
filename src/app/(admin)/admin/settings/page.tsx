import type { Metadata } from "next";
import { removeAdmin } from "@/app/actions/settings";
import { AddAdminForm, SettingsForm } from "@/components/admin/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";
import type { AdminUser } from "@/lib/types";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { admin: me } = await requireAdmin();
  const supabase = await createClient();
  const [settings, { data }] = await Promise.all([
    getSettings(supabase),
    supabase.from("admin_users").select("*").order("created_at"),
  ]);
  const admins = (data ?? []) as AdminUser[];

  const integrations = [
    { name: "Stripe payments", on: !!process.env.STRIPE_SECRET_KEY },
    { name: "Stripe webhooks", on: !!process.env.STRIPE_WEBHOOK_SECRET },
    { name: "Email notifications (Resend)", on: !!process.env.RESEND_API_KEY && !!process.env.NOTIFICATIONS_FROM_EMAIL },
    { name: "SMS notifications (Twilio)", on: !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN && !!process.env.TWILIO_FROM_NUMBER },
    { name: "Scheduled reminders (CRON_SECRET)", on: !!process.env.CRON_SECRET },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Club details, dues and administrators." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Club settings" />
          <CardBody className="py-6">
            <SettingsForm settings={settings} />
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Administrators" description="People who can open the admin dashboard." />
            <ul className="divide-y divide-stone-100">
              {admins.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.email}</p>
                    <p className="text-xs text-stone-500">Since {formatDate(a.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={a.role === "owner" ? "yellow" : "gray"}>{a.role}</Badge>
                    {a.id !== me.id && (a.role !== "owner" || me.role === "owner") && (
                      <form action={removeAdmin.bind(null, a.id)}>
                        <SubmitButton variant="ghost" size="sm" className="text-red-600" pendingText="…" confirmMessage={`Remove admin access for ${a.email}?`}>
                          Remove
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <CardBody className="border-t border-stone-100">
              <AddAdminForm />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Integrations" description="Configured with environment variables." />
            <ul className="divide-y divide-stone-100">
              {integrations.map((i) => (
                <li key={i.name} className="flex items-center justify-between px-4 py-2.5 text-sm sm:px-6">
                  <span>{i.name}</span>
                  <Badge tone={i.on ? "green" : "gray"}>{i.on ? "Connected" : "Not set"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
