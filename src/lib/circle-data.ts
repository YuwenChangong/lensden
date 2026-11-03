import type { SupabaseClient } from "@supabase/supabase-js";

type CircleBase = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  created_at: string;
  status?: string | null;
};

export type CircleRow = CircleBase & {
  image_path?: string | null;
  owner_id?: string | null;
};

function isMissingImagePathError(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    ((message.includes("image_path") || message.includes("owner_id") || message.includes("status")) && message.includes("does not exist")) ||
    message.includes("column circles.owner_id does not exist")
  );
}

export async function fetchCirclesWithFallback(
  supabase: SupabaseClient,
): Promise<{ circles: CircleRow[]; error: { message: string } | null; supportsExtendedSchema: boolean }> {
  const extendedResult = await supabase
    .from("circles")
    .select("id, name, slug, description, created_at, status, image_path, owner_id")
    .eq("status", "active")
    .order("name", { ascending: true });

  if (!extendedResult.error) {
    return {
      circles: (extendedResult.data ?? []) as CircleRow[],
      error: null,
      supportsExtendedSchema: true,
    };
  }

  if (!isMissingImagePathError(extendedResult.error)) {
    return {
      circles: [],
      error: { message: extendedResult.error.message },
      supportsExtendedSchema: false,
    };
  }

  const fallbackResult = await supabase
    .from("circles")
    .select("id, name, slug, description, created_at")
    .order("name", { ascending: true });

  return {
    circles: ((fallbackResult.data ?? []) as CircleBase[]).map((circle) => ({
      ...circle,
      status: "active",
      image_path: null,
      owner_id: null,
    })),
    error: fallbackResult.error ? { message: fallbackResult.error.message } : null,
    supportsExtendedSchema: false,
  };
}

export async function fetchCircleBySlugWithFallback(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ circle: CircleRow | null; error: { message: string } | null; supportsExtendedSchema: boolean }> {
  const extendedResult = await supabase
    .from("circles")
    .select("id, name, slug, description, created_at, status, image_path, owner_id")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (!extendedResult.error) {
    return {
      circle: (extendedResult.data ?? null) as CircleRow | null,
      error: null,
      supportsExtendedSchema: true,
    };
  }

  if (!isMissingImagePathError(extendedResult.error)) {
    return {
      circle: null,
      error: { message: extendedResult.error.message },
      supportsExtendedSchema: false,
    };
  }

  const fallbackResult = await supabase
    .from("circles")
    .select("id, name, slug, description, created_at")
    .eq("slug", slug)
    .single();

  return {
    circle: fallbackResult.data
      ? {
          ...(fallbackResult.data as CircleBase),
          status: "active",
          image_path: null,
          owner_id: null,
        }
      : null,
    error: fallbackResult.error ? { message: fallbackResult.error.message } : null,
    supportsExtendedSchema: false,
  };
}
