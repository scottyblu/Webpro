import type { Metadata } from "next";
import Link from "next/link";
import { ProfileForm } from "@/components/member/profile-form";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getCurrentMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const member = await getCurrentMember();
  if (!member) {
    return <p className="text-stone-600">No membership is linked to this account.</p>;
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold sm:text-3xl">Your profile</h1>
      <Card>
        <CardHeader title="Contact information" />
        <CardBody>
          <ProfileForm fullName={member.full_name} email={member.email} phone={member.phone ?? ""} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Password" />
        <CardBody>
          <Link href="/reset-password" className="text-sm font-semibold text-brand-600 hover:text-brand-700">
            Change your password →
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
