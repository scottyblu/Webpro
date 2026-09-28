import { Logo } from "@/components/logo";
import { MemberNav } from "@/components/member/member-nav";
import { getAdminRecord, requireUser } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const admin = await getAdminRecord();
  return (
    <div className="min-h-dvh">
      <header className="bg-stone-900">
        <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center justify-between">
            <Logo light />
            <form action="/auth/signout" method="post" className="sm:hidden">
              <button className="text-sm font-medium text-stone-400 hover:text-white">Sign out</button>
            </form>
          </div>
          <div className="flex items-center gap-4">
            <MemberNav isAdmin={!!admin} />
            <form action="/auth/signout" method="post" className="hidden sm:block">
              <button className="text-sm font-medium text-stone-400 hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
