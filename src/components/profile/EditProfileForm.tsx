import { useEffect, useMemo, useRef, useState } from "react";
import { buildLoginHref } from "../../lib/auth-redirect";
import { getProfileById, type ProfileRecord } from "../../lib/profile-data";
import { isValidProfileUsername } from "../../lib/profile-links";
import { resolveProfileAvatarUrl, resolveProfileBannerUrl } from "../../lib/profile-media";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { useLocale } from "../i18n/useLocale";
import { getUiMessages } from "../../lib/i18n/catalog";
type AccountMessages = ReturnType<typeof getUiMessages>["account"];

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const MAX_BANNER_SIZE = 8 * 1024 * 1024;

type EditableProfile = ProfileRecord & {
  banner_url?: string | null;
};

type PendingUploadState = {
  path: string | null;
  previewUrl: string | null;
};

function normalizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeUsernameForSave(value: string) {
  return value.trim().toLowerCase();
}

function normalizeUsernameForBlur(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

function mapProfileError(message: string, text: AccountMessages) {
  if (/PROFILE_FORBIDDEN_FIELD_UPDATE/i.test(message)) return text.forbidden;
  if (/PROFILE_UPDATE_FAILED/i.test(message)) return text.saveFailed;
  if (/23505|duplicate key|profiles_username_unique_ci/i.test(message)) return text.usernameTaken;
  if (/username/i.test(message) && /check|constraint|invalid/i.test(message)) {
    return text.usernameInvalid;
  }
  if (/RATE_LIMITED/i.test(message)) return text.rateLimited;
  if (/TURNSTILE_REQUIRED|TURNSTILE_INVALID/i.test(message)) return text.uploadVerification;
  if (/PROFILE_CONTENT_REJECTED/i.test(message)) return text.contentRejected;
  if (/PROFILE_IMAGE_NOT_ALLOWED/i.test(message)) return text.imageRejected;
  if (/PROFILE_IMAGE_MODERATION_UNAVAILABLE/i.test(message)) return text.moderationUnavailable;
  if (/banner_url/i.test(message)) return text.bannerUnavailable;
  return message;
}

function validateProfileInput(values: {
  displayName: string;
  username: string;
  bio: string;
}, text: AccountMessages) {
  const displayName = values.displayName.trim();
  const username = normalizeUsernameForSave(values.username);
  const bio = values.bio.trim();

  if (!displayName) return text.nameRequired;
  if (displayName.length > 40) return text.nameLong;
  if (username && !isValidProfileUsername(username)) {
    return text.usernameInvalid;
  }
  if (bio.length > 240) return text.bioLong;
  return "";
}

export default function EditProfileForm({ localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { localeContext?: LocaleContext }) {
  const { messages } = useLocale(localeContext);
  const text = messages.account;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<"avatar" | "banner" | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPending, setAvatarPending] = useState<PendingUploadState>({ path: null, previewUrl: null });
  const [bannerPending, setBannerPending] = useState<PendingUploadState>({ path: null, previewUrl: null });
  const [avatarResolvedUrl, setAvatarResolvedUrl] = useState<string | null>(null);
  const [bannerResolvedUrl, setBannerResolvedUrl] = useState<string | null>(null);
  const [usernameComposing, setUsernameComposing] = useState(false);

  const avatarDisplayUrl = avatarPending.previewUrl ?? avatarResolvedUrl;
  const bannerDisplayUrl = bannerPending.previewUrl ?? bannerResolvedUrl;
  const isBusy = saving || uploadingKind !== null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!supabase) {
        if (!cancelled) {
          setLoading(false);
          setError(text.loginUnavailable);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        window.location.replace(buildLoginHref("/me/edit/"));
        return;
      }

      const profileRow = (await getProfileById(supabase, session.user.id)) as EditableProfile | null;
      if (!profileRow) {
        if (!cancelled) {
          setLoading(false);
          setError(text.profileUnavailable);
        }
        return;
      }

      const [resolvedAvatarUrl, resolvedBannerUrl] = await Promise.all([
        resolveProfileAvatarUrl(supabase, profileRow.avatar_url, undefined, {
          publicProxyUserId: profileRow.id,
        }),
        resolveProfileBannerUrl(supabase, profileRow.banner_url ?? null, undefined, {
          publicProxyUserId: profileRow.id,
        }),
      ]);

      if (!cancelled) {
        setProfile(profileRow);
        setDisplayName(profileRow.display_name ?? "");
        setUsername(profileRow.username ?? "");
        setBio(profileRow.bio ?? "");
        setAvatarResolvedUrl(resolvedAvatarUrl);
        setBannerResolvedUrl(resolvedBannerUrl);
        setLoading(false);
      }
    }

    void load().catch((requestError) => {
      if (cancelled) return;
      setLoading(false);
      setError(requestError instanceof Error ? requestError.message : text.loadFailed);
    });

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    return () => {
      if (avatarPending.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(avatarPending.previewUrl);
      if (bannerPending.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(bannerPending.previewUrl);
    };
  }, [avatarPending.previewUrl, bannerPending.previewUrl]);

  async function getSessionToken(client: NonNullable<typeof supabase>) {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? "";
  }

  async function removeStorageObject(path: string | null | undefined) {
    if (!supabase || !path || !/^(profile-avatars|profile-banners)\//.test(path)) return;
    await supabase.storage.from("post-media").remove([path]).catch(() => undefined);
  }

  async function guardUpload(token: string, sizeBytes: number, uploadKind: "profile_avatar" | "profile_banner") {
    const response = await fetch("/api/forum/media-upload-guard", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        upload_kind: uploadKind,
        size_bytes: sizeBytes,
      }),
    });

    const payload = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (!response.ok) {
      throw new Error(
        payload?.code ? `${payload.code}: ${payload.error ?? ""}` : payload?.error ?? `${text.uploadFailed} (${response.status})`,
      );
    }
  }

  async function uploadProfileImage(file: File, kind: "avatar" | "banner") {
    if (!profile || !supabase) throw new Error(text.profileLoading);
    const token = await getSessionToken(supabase);
    if (!token) {
      window.location.replace(buildLoginHref("/me/edit/"));
      return null;
    }

    const sizeLimit = kind === "avatar" ? MAX_AVATAR_SIZE : MAX_BANNER_SIZE;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw new Error(text.imageType);
    if (file.size > sizeLimit) throw new Error(kind === "avatar" ? text.avatarSize : text.bannerSize);

    const objectPath = `${kind === "avatar" ? "profile-avatars" : "profile-banners"}/${profile.id}/${Date.now()}-${normalizeFileName(file.name)}`;
    await guardUpload(token, file.size, kind === "avatar" ? "profile_avatar" : "profile_banner");
    await uploadToPostMediaWithTus({ file, objectPath, accessToken: token });
    return objectPath;
  }

  async function handleImageUpload(kind: "avatar" | "banner", file: File | null) {
    if (!file || !profile || isBusy) return;
    setUploadingKind(kind);
    setError("");
    setSuccess("");

    let nextPath: string | null = null;
    const previousPendingPath = kind === "avatar" ? avatarPending.path : bannerPending.path;
    const previousPreviewUrl = kind === "avatar" ? avatarPending.previewUrl : bannerPending.previewUrl;

    try {
      nextPath = await uploadProfileImage(file, kind);
      if (!nextPath) return;

      const nextPreviewUrl = URL.createObjectURL(file);
      if (kind === "avatar") {
        setAvatarPending({ path: nextPath, previewUrl: nextPreviewUrl });
      } else {
        setBannerPending({ path: nextPath, previewUrl: nextPreviewUrl });
      }

      if (previousPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(previousPreviewUrl);
      }
      if (previousPendingPath && previousPendingPath !== nextPath) {
        await removeStorageObject(previousPendingPath);
      }

      setSuccess(kind === "avatar" ? text.avatarUploaded : text.bannerUploaded);
    } catch (requestError) {
      if (nextPath) {
        await removeStorageObject(nextPath);
      }
      setError(mapProfileError(requestError instanceof Error ? requestError.message : text.uploadFailed, text));
    } finally {
      setUploadingKind(null);
      if (kind === "avatar" && avatarInputRef.current) avatarInputRef.current.value = "";
      if (kind === "banner" && bannerInputRef.current) bannerInputRef.current.value = "";
    }
  }

  async function handleSaveProfile() {
    if (!profile || !supabase || isBusy) return;
    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const nextDisplayName = displayName.trim();
      const nextUsername = normalizeUsernameForSave(username);
      const nextBio = bio.trim();
      const validationError = validateProfileInput({
        displayName: nextDisplayName,
        username: nextUsername,
        bio: nextBio,
      }, text);
      if (validationError) throw new Error(validationError);

      const payload = {
        display_name: nextDisplayName || null,
        username: nextUsername || null,
        bio: nextBio || null,
        avatar_url: avatarPending.path ?? profile.avatar_url ?? null,
        banner_url: bannerPending.path ?? profile.banner_url ?? null,
      };
      const token = await getSessionToken(supabase);
      if (!token) {
        window.location.replace(buildLoginHref("/me/edit/"));
        return;
      }

      const response = await fetch("/api/users/me/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            field?: "avatar" | "banner";
            profile?: EditableProfile & {
              resolved_avatar_url?: string | null;
              resolved_banner_url?: string | null;
            };
          }
        | null;
      if (!response.ok || !responsePayload?.profile) {
        if (responsePayload?.field === "avatar") {
          setAvatarPending((current) => {
            if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
            return { path: null, previewUrl: null };
          });
        }
        if (responsePayload?.field === "banner") {
          setBannerPending((current) => {
            if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
            return { path: null, previewUrl: null };
          });
        }
        throw new Error(responsePayload?.error ?? responsePayload?.message ?? `${text.saveFailed} (${response.status})`);
      }
      const data = responsePayload.profile;

      const previousAvatarPath = profile.avatar_url ?? null;
      const previousBannerPath = profile.banner_url ?? null;
      const finalAvatarPath = data.avatar_url ?? null;
      const finalBannerPath = data.banner_url ?? null;

      if (avatarPending.path && previousAvatarPath && previousAvatarPath !== finalAvatarPath) {
        await removeStorageObject(previousAvatarPath);
      }
      if (bannerPending.path && previousBannerPath && previousBannerPath !== finalBannerPath) {
        await removeStorageObject(previousBannerPath);
      }

      const resolvedAvatar =
        responsePayload.profile.resolved_avatar_url ??
        (await resolveProfileAvatarUrl(supabase, finalAvatarPath, undefined, {
          publicProxyUserId: data.id,
        }));
      const resolvedBanner =
        responsePayload.profile.resolved_banner_url ??
        (await resolveProfileBannerUrl(supabase, finalBannerPath, undefined, {
          publicProxyUserId: data.id,
        }));
      setProfile(data);
      setDisplayName(data.display_name ?? "");
      setUsername(data.username ?? "");
      setBio(data.bio ?? "");
      setAvatarResolvedUrl(resolvedAvatar);
      setBannerResolvedUrl(resolvedBanner);
      setAvatarPending((current) => {
        if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
        return { path: null, previewUrl: null };
      });
      setBannerPending((current) => {
        if (current.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(current.previewUrl);
        return { path: null, previewUrl: null };
      });
      setSuccess(text.profileSaved);
    } catch (requestError) {
      setError(mapProfileError(requestError instanceof Error ? requestError.message : text.saveFailed, text));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="community-surface community-surface--padded profile-shell">
        <h1>{text.editProfile}</h1>
        <p className="community-meta">{text.loading}</p>
      </section>
    );
  }

  if (error && !profile) {
    return (
      <section className="community-surface community-surface--padded profile-shell">
        <h1>{text.editProfile}</h1>
        <p className="community-meta">{error}</p>
      </section>
    );
  }

  const visibleName = displayName.trim() || profile?.display_name?.trim() || username.trim() || profile?.username?.trim() || text.myDetails;

  return (
    <section className="community-surface community-surface--padded profile-shell profile-editor">
      <div className="community-stream-head profile-editor__head">
        <div>
          <h2>{text.editProfile}</h2>
        </div>
        <div className="community-inline-links">
          <a href="/me/" className="community-inline-link">
            {text.backProfile}
          </a>
        </div>
      </div>

      {bannerDisplayUrl ? (
        <div className="profile-banner">
          <img src={bannerDisplayUrl} alt="" className="profile-banner__image" loading="eager" decoding="async" />
        </div>
      ) : null}

      <div className="profile-head profile-head--editor">
        <div className="profile-avatar-wrap">
          {avatarDisplayUrl ? (
            <img src={avatarDisplayUrl} alt="" className="profile-avatar-image" loading="eager" decoding="async" />
          ) : (
            <span className="community-avatar profile-avatar-fallback" aria-hidden="true">
              {(visibleName.trim().charAt(0) || "U").toUpperCase()}
            </span>
          )}
        </div>
        <div className="profile-copy">
          <div className="profile-copy__title">
            <h1>{visibleName}</h1>
            {profile ? <span className="profile-account-id">ID: {profile.id}</span> : null}
          </div>
          <div className="profile-upload-grid">
            <label className="profile-upload-field">
              <span className="community-meta">{text.avatar}</span>
              <input
                ref={avatarInputRef}
                className="community-input"
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageUpload("avatar", event.target.files?.[0] ?? null)}
                disabled={isBusy}
              />
              <small className="community-meta">{text.avatarHint}</small>
            </label>
            <label className="profile-upload-field">
              <span className="community-meta">{text.banner}</span>
              <input
                ref={bannerInputRef}
                className="community-input"
                type="file"
                accept="image/*"
                onChange={(event) => void handleImageUpload("banner", event.target.files?.[0] ?? null)}
                disabled={isBusy}
              />
              <small className="community-meta">{text.bannerHint}</small>
            </label>
          </div>
        </div>
      </div>

      <label className="create-circle-form__field">
        <span>{text.name}</span>
        <input
          className="community-input"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          maxLength={40}
          autoCapitalize="words"
          autoCorrect="off"
        />
      </label>

      <label className="create-circle-form__field">
        <span>{text.username}</span>
        <input
          className="community-input"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          onCompositionStart={() => setUsernameComposing(true)}
          onCompositionEnd={() => setUsernameComposing(false)}
          onBlur={() => {
            if (!usernameComposing) {
              setUsername((current) => normalizeUsernameForBlur(current));
            }
          }}
          maxLength={30}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <small className="community-meta">{text.usernameHint}</small>
      </label>

      <label className="create-circle-form__field">
        <span>{text.bio}</span>
        <textarea
          className="community-input community-input--textarea"
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={240}
        />
      </label>

      {error ? <span className="inline-error">{error}</span> : null}
      {success ? <span className="inline-success">{success}</span> : null}

      <div className="community-cta-row">
        <button type="button" className="community-button" onClick={() => void handleSaveProfile()} disabled={isBusy}>
          {saving ? text.saving : text.save}
        </button>
      </div>
    </section>
  );
}
