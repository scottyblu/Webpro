import type { Metadata } from "next";
import Link from "next/link";
import { removeAdmin } from "@/app/actions/settings";
import { LogoUpload } from "@/components/admin/logo-upload";
import {
  AddAdminForm,
  PushKeysGenerator,
  ReminderSettingsForm,
  SettingsForm,
  TestEmailButton,
} from "@/components/admin/settings-forms";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { logoSrc } from "@/components/logo";
import { requireAdmin } from "@/lib/auth";
import { getLogoVersion } from "@/lib/logo";
import { formatDate } from "@/lib/format";
import { emailConfigured, pushConfigured, smsConfigured } from "@/lib/notifications";
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
  const logoVersion = await getLogoVersion();
  const services = { sms: smsConfigured(), email: emailConfigured() !== null, push: pushConfigured() };

  const integrations = [
    { name: "Zelle payments", on: !!settings.zelle_contact },
    { name: "Stripe card payments (optional)", on: !!process.env.STRIPE_SECRET_KEY },
    { name: "Stripe webhooks (optional)", on: !!process.env.STRIPE_WEBHOOK_SECRET },
    { name: emailConfigured() === "resend" ? "Email (Resend)" : "Email (Gmail)", on: emailConfigured() !== null },
    { name: "Text messages (Twilio)", on: services.sms },
    { name: "App notifications (VAPID keys)", on: services.push },
    { name: "Scheduled reminders (CRON_SECRET)", on: !!process.env.CRON_SECRET },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Club details, dues and administrators." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Club settings" />
            <CardBody className="py-6">
              <SettingsForm settings={settings} />
            </CardBody>
          </Card>

          <Card>
            <div id="reminders" className="scroll-mt-20" />
            <CardHeader
              title="Payment reminders"
              description="Automatic reminders to members who haven't paid yet. See what was sent under Notifications."
              action={
                <Link href="/admin/notifications" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
                  Notification history →
                </Link>
              }
            />
            <CardBody className="py-6">
              <ReminderSettingsForm settings={settings} services={services} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Firehouse logo" description="Shown on the login screen, in the menu and as the app icon on phones." />
            <CardBody>
              <LogoUpload currentLogo={logoSrc(logoVersion)} />
            </CardBody>
          </Card>

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
            <CardHeader
              title="Email"
              description={`Alerts go to: ${settings.notification_emails?.length ? settings.notification_emails.join(", ") : "no one yet (add addresses under Notification emails)"}`}
            />
            <CardBody>
              <TestEmailButton configured={emailConfigured() !== null} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="App notifications" description="Payment reminders on members' phones (for members who installed the app)." />
            <CardBody>
              <PushKeysGenerator configured={services.push} />
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
