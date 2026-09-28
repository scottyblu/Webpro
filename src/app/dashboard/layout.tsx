import { Logo } from "@/components/logo";
import { MemberBottomTabs, MemberNav } from "@/components/member/member-nav";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { getAdminRecord, requireUser } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const admin = await getAdminRecord();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 bg-stone-900 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Logo light />
          <div className="flex items-center gap-4">
            <MemberNav isAdmin={!!admin} />
            <form action="/auth/signout" method="post">
              <button className="text-sm font-medium text-stone-400 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:py-10">
        <InstallPrompt className="mb-6" />
        {children}
      </main>
      <MemberBottomTabs isAdmin={!!admin} />
    </div>
  );
}
