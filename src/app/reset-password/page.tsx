import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/password-forms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a password" };

export default async function ResetPasswordPage() {
  const user = await requireUser();
  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm email={user.email} />
    </AuthShell>
  );
}
