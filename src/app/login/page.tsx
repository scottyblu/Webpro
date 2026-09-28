import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string }>;
}) {
  const { next, error, confirmed } = await searchParams;
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Breakfast Club account."
      footer={
        <>
          New member?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      {confirmed && (
        <Alert tone="success" className="mb-4">
          Your email is confirmed! Sign in below with your email and password.
        </Alert>
      )}
      {error === "expired" && (
        <Alert tone="error" className="mb-4">
          That link has expired or was already used. Sign in below. If it says your email isn&apos;t confirmed, tap
          &quot;Resend confirmation email&quot; for a new link.
        </Alert>
      )}
      {error && error !== "expired" && (
        <Alert tone="error" className="mb-4">
          That link didn&apos;t work. Try signing in below. If it says your email isn&apos;t confirmed, tap &quot;Resend
          confirmation email&quot;.
        </Alert>
      )}
      <LoginForm next={next} />
    </AuthShell>
  );
}
