import { useMemo, useRef, useState } from "react";
import { buildLoginHref } from "../../lib/auth-redirect";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useBrowserAuthState } from "../auth/useBrowserAuthState";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages } from "../../lib/i18n/catalog";
import { useLocale } from "../i18n/useLocale";

interface CircleCoverEditorProps {
  localeContext?: LocaleContext;
  circleId: string;
  circleSlug: string;
  supportsExtendedSchema: boolean;
  ownerId: string | null;
  onUpdated?: (imagePath: string | null, coverUrl?: string | null) => void;
}

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function normalizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapCoverError(message: string, text: ReturnType<typeof getUiMessages>["community"]) {
  if (/RATE_LIMITED/i.test(message)) return text.uploadRateLimited;
  if (/TURNSTILE_REQUIRED|TURNSTILE_INVALID/i.test(message)) return text.uploadVerification;
  return message;
}

export default function CircleCoverEditor({
  circleId,
  circleSlug,
  supportsExtendedSchema,
  ownerId,
  onUpdated,
  localeContext = resolveLocale({ acceptLanguage: "zh-CN" }),
}: CircleCoverEditorProps) {
  const { messages } = useLocale(localeContext);
  const text = messages.community;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const authState = useBrowserAuthState(supabase);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canEdit = authState.status === "signed_in" && !!authState.user;

  async function getSessionToken() {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function updateCircleCover(imagePath: string | null, token: string) {
    const response = await fetch(`/api/forum/circles/${circleSlug}/manage`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        id: circleId,
        image_path: imagePath,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; circle?: { cover_url?: string | null } }
      | null;
    if (!response.ok) {
      throw new Error(payload?.error ?? `${text.coverUpdateFailed} (${response.status})`);
    }
    return payload?.circle?.cover_url ?? null;
  }

  async function guardUpload(token: string, sizeBytes: number) {
    const response = await fetch("/api/forum/media-upload-guard", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        upload_kind: "circle_cover",
        size_bytes: sizeBytes,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; code?: string }
      | null;
    if (!response.ok) {
      throw new Error(
        payload?.code ? `${payload.code}: ${payload.error ?? ""}` : payload?.error ?? `${text.uploadGuardFailed} (${response.status})`,
      );
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file || loading) return;

    setError("");
    setMessage("");

    if (!supportsExtendedSchema) {
      setError(text.coverUnsupported);
      event.target.value = "";
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError(text.coverType);
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(text.coverSize);
      event.target.value = "";
      return;
    }

    setLoading(true);
    let uploadedPath = "";

    try {
      const token = await getSessionToken();
      if (!token || authState.status !== "signed_in" || !authState.user) {
        window.location.assign(buildLoginHref(`/circles/${circleSlug}/manage/`));
        return;
      }

      await guardUpload(token, file.size);
      uploadedPath = `circle-covers/${authState.user.id}/${Date.now()}-${normalizeFileName(file.name)}`;
      try {
        await uploadToPostMediaWithTus({
          file,
          objectPath: uploadedPath,
          accessToken: token,
        });
      } catch {
        throw new Error(text.coverUploadFailed);
      }

      const coverUrl = await updateCircleCover(uploadedPath, token);
      setMessage(text.coverUpdated);
      onUpdated?.(uploadedPath, coverUrl);
    } catch (requestError) {
      if (uploadedPath) {
        await client.storage.from("post-media").remove([uploadedPath]).catch(() => undefined);
      }
      setError(mapCoverError(requestError instanceof Error ? requestError.message : text.coverUpdateFailed, text));
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleClearCover() {
    if (loading) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!supportsExtendedSchema) {
        throw new Error(text.coverClearUnsupported);
      }

      const token = await getSessionToken();
      if (!token) {
        window.location.assign(buildLoginHref(`/circles/${circleSlug}/manage/`));
        return;
      }

      const coverUrl = await updateCircleCover(null, token);
      setMessage(text.coverCleared);
      onUpdated?.(null, coverUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.coverClearFailed);
    } finally {
      setLoading(false);
    }
  }

  if (!canEdit || !supabase) {
    if (authState.status === "signed_in" && !authState.user) {
      console.warn("[circle-cover-editor] signed-in state missing user", { circleSlug, ownerId });
    }
    return null;
  }
  const client = supabase;

  return (
    <div className="circle-cover-editor">
      <div className="circle-cover-editor__row">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={loading} />
        <button
          type="button"
          className="community-action-button community-action-button--muted"
          onClick={handleClearCover}
          disabled={loading}
        >
          {text.clearCover}
        </button>
      </div>
      {supportsExtendedSchema ? (
        <p className="community-meta">{text.coverHint}</p>
      ) : (
        <p className="community-meta">{text.coverMigration}</p>
      )}
      {error ? <span className="inline-error">{error}</span> : null}
      {message ? <span className="inline-success">{message}</span> : null}
    </div>
  );
}
