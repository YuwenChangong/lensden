import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCircleCoverUrlMap } from "./circle-cover";

export interface CircleImageRow {
  id: string;
  name?: string | null;
  description?: string | null;
  image_path?: string | null;
}

function buildCircleFallbackImage(circle: CircleImageRow): string {
  const name = (circle.name ?? "Lensden Circle").trim();
  const subtitle = (circle.description ?? "Lensden community").trim();
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" role="img" aria-label="${name}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#101417"/>
          <stop offset="100%" stop-color="#1a2024"/>
        </linearGradient>
      </defs>
      <rect width="1280" height="720" rx="36" fill="url(#bg)"/>
      <circle cx="1088" cy="156" r="112" fill="rgba(47,129,247,0.14)"/>
      <circle cx="980" cy="184" r="54" fill="rgba(255,255,255,0.06)"/>
      <rect x="78" y="86" width="1124" height="548" rx="28" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)"/>
      <path d="M120 206H1160" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
      <path d="M120 498H760" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
      <path d="M120 548H620" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
      <text x="120" y="186" fill="rgba(255,255,255,0.56)" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="700" letter-spacing="6">CIRCLE</text>
      <text x="120" y="332" fill="#f5f5f5" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="700">${name}</text>
      <text x="120" y="412" fill="rgba(255,255,255,0.72)" font-family="Arial, Helvetica, sans-serif" font-size="32">${subtitle.slice(0, 42)}</text>
      <text x="1048" y="546" text-anchor="middle" fill="rgba(255,255,255,0.16)" font-family="Arial, Helvetica, sans-serif" font-size="160" font-weight="700">${initials || "OG"}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function buildCircleImageMap(
  supabase: SupabaseClient,
  circles: CircleImageRow[],
  expiresIn = 60 * 60,
  options?: { publicProxy?: boolean },
): Promise<Map<string, string>> {
  const imageMap = await buildCircleCoverUrlMap(supabase, circles, expiresIn, options);

  circles.forEach((circle) => {
    const resolved = imageMap.get(circle.id);
    if (!resolved) {
      imageMap.set(circle.id, buildCircleFallbackImage(circle));
    }
  });

  return imageMap;
}
