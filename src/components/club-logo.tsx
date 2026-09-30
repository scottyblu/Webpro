import { connection } from "next/server";
import { getLogoVersion } from "@/lib/logo";
import { Logo, logoSrc } from "./logo";

/** The club logo with the firehouse logo from Settings (server components only). */
export async function ClubLogo(props: Omit<Parameters<typeof Logo>[0], "src">) {
  await connection(); // Always read the current logo, never a copy baked in at build time.
  return <Logo {...props} src={logoSrc(await getLogoVersion())} />;
}
