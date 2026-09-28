import { AdminSidebar } from "@/components/admin/sidebar";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { createClient } from "@/lib/supabase/server";

/**
 * Every page under this layout (/admin, /member-management, /payment-management, /reports)
 * is gated server-side: non-admins are redirected before anything renders.
 * (The middleware checks too, and every admin server action re-checks.)
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin();
  const settings = await getSettings(await createClient());
  return (
    <div className="min-h-dvh">
      <AdminSidebar email={user.email ?? ""} clubName={settings.club_name} />
      <div className="lg:pl-64">
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
