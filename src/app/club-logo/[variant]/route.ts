import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOGO_FILES, LOGO_VARIANTS, getLogoImage, type LogoVariant } from "@/lib/logo";

export const dynamic = "force-dynamic";

/**
 * The firehouse logo and app icons: /club-logo/mark, /club-logo/icon192, …
 * Public (the login screen and the phone's home screen need them). Falls back to
 * the default Breakfast Club icons until a logo is uploaded in Settings.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params;
  if (!LOGO_VARIANTS.includes(variant as LogoVariant)) return new NextResponse("Not found", { status: 404 });

  const dataUrl = await getLogoImage(variant as LogoVariant);
  const match = dataUrl ? /^data:(image\/png);base64,(.+)$/.exec(dataUrl) : null;
  if (!match) {
    return NextResponse.redirect(new URL(DEFAULT_LOGO_FILES[variant as LogoVariant], request.url), {
      status: 307,
      headers: { "Cache-Control": "public, max-age=300" },
    });
  }

  return new NextResponse(new Uint8Array(Buffer.from(match[2]!, "base64")), {
    headers: {
      "Content-Type": match[1]!,
      // Versioned links (?v=…) change whenever the logo changes, so they can be cached for long.
      "Cache-Control": request.nextUrl.searchParams.has("v")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300, s-maxage=300",
    },
  });
}
