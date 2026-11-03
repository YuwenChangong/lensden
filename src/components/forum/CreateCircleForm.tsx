import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildLoginHref } from "../../lib/auth-redirect";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useBrowserAuthState } from "../auth/useBrowserAuthState";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages } from "../../lib/i18n/catalog";
import { useLocale } from "../i18n/useLocale";

const circleTypes = [
  { value: "topic" },
  { value: "device" },
  { value: "project" },
] as const;

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function normalizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mapCircleError(message: string, text: ReturnType<typeof getUiMessages>["community"]) {
  if (message.includes("RATE_LIMITED")) return text.createRateLimited;
  if (/TURNSTILE_REQUIRED|TURNSTILE_INVALID/i.test(message)) return text.uploadVerification;
  if (message.includes("NOT_AUTHENTICATED")) return text.circleAuthExpired;
  if (message.includes("CIRCLE_NAME_ALREADY_EXISTS")) return text.circleNameTaken;
  if (message.includes("CIRCLE_COVER_UPLOAD_FAILED")) return text.coverUploadFailed;
  if (/CONTENT_REJECTED/i.test(message)) return text.circleRejected;
  if (message.includes("INVALID_GENERATED_CIRCLE_SLUG")) return text.circleSlugFailed;
  if (message.includes("CIRCLE_CREATE_FORBIDDEN")) return text.circleCreateForbidden;
  if (message.includes("CIRCLE_OWNER_RLS_NOT_READY")) return text.circleRlsMissing;
  if (message.includes("PROFILE_NOT_FOUND")) return text.circleProfileMissing;
  if (message.includes("CIRCLE_CREATE_FAILED")) return text.circleCreateFailed;
  return message;
}

type CreateCircleFormProps = {
  localeContext?: LocaleContext;
  mode?: "inline" | "page";
};

export default function CreateCircleForm({ mode = "inline", localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: CreateCircleFormProps) {
  const { messages } = useLocale(localeContext);
  const text = messages.community;
  const localizedTypes = circleTypes.map(item => ({ ...item, label: text.circleTypes[item.value] }));
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const authState = useBrowserAuthState(supabase);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typePickerRef = useRef<HTMLDivElement | null>(null);
  const typeButtonRef = useRef<HTMLButtonElement | null>(null);
  const typeMenuRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<(typeof circleTypes)[number]["value"]>("topic");
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [typeActiveIndex, setTypeActiveIndex] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mounted, setMounted] = useState(false);
  const [typeMenuPosition, setTypeMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUp: boolean;
  } | null>(null);

  const selectedType = localizedTypes.find((item) => item.value === type) ?? localizedTypes[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!typeMenuOpen) return;

    function updateTypeMenuPosition() {
      const trigger = typeButtonRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const horizontalPadding = 16;
      const verticalGap = 8;
      const viewportTopPadding = 76;
      const viewportBottomPadding = 16;
      const minMenuHeight = 160;
      const preferredMenuHeight = 280;
      const availableBelow = viewportHeight - rect.bottom - viewportBottomPadding - verticalGap;
      const availableAbove = rect.top - viewportTopPadding - verticalGap;
      const openUp = availableBelow < minMenuHeight && availableAbove > availableBelow;
      const width = Math.min(rect.width, viewportWidth - horizontalPadding * 2);
      const left = Math.min(Math.max(rect.left, horizontalPadding), viewportWidth - width - horizontalPadding);
      const maxHeight = Math.max(
        120,
        Math.min(preferredMenuHeight, openUp ? availableAbove : availableBelow),
      );
      const top = openUp
        ? Math.max(viewportTopPadding, rect.top - verticalGap - maxHeight)
        : Math.min(rect.bottom + verticalGap, viewportHeight - viewportBottomPadding - maxHeight);

      setTypeMenuPosition({ top, left, width, maxHeight, openUp });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!typePickerRef.current?.contains(target) && !typeMenuRef.current?.contains(target)) {
        setTypeMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setTypeMenuOpen(false);
      }
    }

    updateTypeMenuPosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", updateTypeMenuPosition);
    window.addEventListener("scroll", updateTypeMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", updateTypeMenuPosition);
      window.removeEventListener("scroll", updateTypeMenuPosition, true);
    };
  }, [typeMenuOpen]);

  function selectType(nextType: (typeof circleTypes)[number]["value"]) {
    setType(nextType);
    setTypeActiveIndex(circleTypes.findIndex((item) => item.value === nextType));
    setTypeMenuOpen(false);
  }

  const typeMenuPortal = mounted && typeMenuOpen && typeMenuPosition
    ? createPortal(
        <div
          ref={typeMenuRef}
          className={`community-select__menu community-select-menu--floating circle-type-menu${typeMenuPosition.openUp ? " community-select-menu--open-up" : ""}`}
          role="listbox"
          aria-label={text.circleType}
          style={{
            position: "fixed",
            top: `${typeMenuPosition.top}px`,
            left: `${typeMenuPosition.left}px`,
            width: `${typeMenuPosition.width}px`,
            maxHeight: `${typeMenuPosition.maxHeight}px`,
            zIndex: 80,
          }}
        >
          {localizedTypes.map((item, index) => {
            const active = item.value === type;
            return (
              <button
                key={item.value}
                type="button"
                className={`community-select__option community-select-option circle-type-option${active ? " is-selected" : ""}${typeActiveIndex === index ? " is-active" : ""}`}
                onClick={() => selectType(item.value)}
                onMouseEnter={() => setTypeActiveIndex(index)}
                role="option"
                aria-selected={active}
              >
                <strong>{item.label}</strong>
                <span>{text.circleTypeHints[item.value]}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  function handleSelectImage(file: File | null) {
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setError(text.coverType);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(text.coverSize);
      return;
    }

    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setError("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setMessage("");
    let uploadedPath = "";

    try {
      const { data: sessionData, error: sessionError } = await client.auth.getSession();
      const session = sessionData.session;
      if (sessionError || !session?.access_token || !session.user) {
        throw new Error("NOT_AUTHENTICATED");
      }

      const nextName = name.trim();
      const nextDescription = description.trim();

      if (nextName.length < 2 || nextName.length > 40) {
        throw new Error(text.circleNameLength);
      }
      if (nextDescription.length > 200) {
        throw new Error(text.circleDescriptionLength);
      }

      if (imageFile) {
        const guardResponse = await fetch("/api/forum/media-upload-guard", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            upload_kind: "circle_cover",
            size_bytes: imageFile.size,
          }),
        });
        const guardPayload = (await guardResponse.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        if (!guardResponse.ok) {
          throw new Error(
            guardPayload?.code
              ? `${guardPayload.code}: ${guardPayload.error ?? ""}`
              : guardPayload?.error ?? `${text.uploadGuardFailed} (${guardResponse.status})`,
          );
        }

        uploadedPath = `circle-covers/${session.user.id}/${Date.now()}-${normalizeFileName(imageFile.name)}`;
        try {
          await uploadToPostMediaWithTus({
            file: imageFile,
            objectPath: uploadedPath,
            accessToken: session.access_token,
          });
        } catch {
          throw new Error("CIRCLE_COVER_UPLOAD_FAILED");
        }
      }

      const response = await fetch("/api/forum/circles", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: nextName,
          description: nextDescription,
          type,
          image_path: uploadedPath || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { circle?: { slug?: string }; error?: string; code?: string }
        | null;
      if (!response.ok) {
        throw new Error(
          payload?.code ? `${payload.code}: ${payload.error ?? ""}` : payload?.error ?? `CIRCLE_CREATE_FAILED (${response.status})`,
        );
      }
      if (!payload?.circle?.slug) {
        throw new Error("CIRCLE_CREATE_FAILED");
      }

      setMessage(text.circleCreated);
      window.location.assign(`/circles/${payload.circle.slug}/`);
    } catch (submitError) {
      if (uploadedPath) {
        await client.storage.from("post-media").remove([uploadedPath]).catch(() => undefined);
      }

      const nextMessage = submitError instanceof Error ? submitError.message : "CIRCLE_CREATE_FAILED";
      if (nextMessage === "NOT_AUTHENTICATED") {
        window.location.replace(buildLoginHref("/circles/new/"));
        return;
      }
      setError(mapCircleError(nextMessage, text));
    } finally {
      setSubmitting(false);
    }
  }

  if (mode === "inline") {
    return (
      <div className="circle-create-inline-entry">
        <a href="/circles/new/" className="community-action-button community-action-button--primary">
          {text.createCircle}
        </a>
      </div>
    );
  }

  if (authState.status === "checking") {
    return (
      <section className="create-circle-form create-circle-form--page-state">
        <div className="community-cta-row circle-create-actions circle-create-actions--start">
          <button type="button" className="community-action-button community-action-button--muted" disabled>
            {text.checkingLogin}
          </button>
        </div>
      </section>
    );
  }

  if (authState.status !== "signed_in" || !supabase) {
    return (
      <section className="create-circle-form create-circle-form--page-state">
        <p className="community-meta">{text.signInCreateCircle}</p>
        <div className="community-cta-row circle-create-actions circle-create-actions--start">
          <a href={buildLoginHref("/circles/new/")} className="community-action-button community-action-button--primary">
            {text.goLogin}
          </a>
        </div>
      </section>
    );
  }

  const client = supabase;

  return (
    <form className="create-circle-form create-circle-form--page" onSubmit={handleSubmit}>
      <div className="create-circle-form__grid circle-create-grid">
        <label className="create-circle-form__field circle-create-field">
          <span>{text.circleName}</span>
          <input
            className="community-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            disabled={submitting}
          />
        </label>

        <label className="create-circle-form__field create-circle-form__field--full circle-create-field">
          <span>{text.circleOptionalDescription}</span>
          <textarea
            className="community-input community-input--textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            disabled={submitting}
          />
        </label>

        <div className="create-circle-form__field circle-create-field">
          <span>{text.circleType}</span>
          <div className={`community-select circle-type-select${typeMenuOpen ? " is-open" : ""}${submitting ? " is-disabled" : ""}`} ref={typePickerRef}>
            <input type="hidden" name="type" value={type} />
            <button
              ref={typeButtonRef}
              type="button"
              className="community-select__trigger circle-type-trigger"
              onClick={() => {
                if (submitting) return;
                setTypeMenuOpen((current) => !current);
              }}
              disabled={submitting}
              aria-haspopup="listbox"
              aria-expanded={typeMenuOpen}
            >
              <span className="community-select__content">
                <strong>{selectedType.label}</strong>
              </span>
              <span className="community-select__chevron" aria-hidden="true">⌄</span>
            </button>
          </div>
        </div>

        <div className="create-circle-form__field circle-create-field">
          <span>{text.circleCoverLabel}</span>
          <div className="create-circle-form__image-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => handleSelectImage(event.target.files?.[0] ?? null)}
              disabled={submitting}
            />
            {imageFile ? (
              <button type="button" className="community-button--secondary" onClick={clearImage} disabled={submitting}>
                {text.removeCover}
              </button>
            ) : null}
          </div>
          {imagePreview ? (
            <div className="create-circle-form__preview">
              <img src={imagePreview} alt={text.coverPreview} />
            </div>
          ) : null}
        </div>
      </div>

      {error ? <span className="inline-error">{error}</span> : null}
      {message ? <span className="inline-success">{message}</span> : null}

      <div className="community-cta-row circle-create-actions">
        <button type="submit" className="community-button" disabled={submitting}>
          {submitting ? text.creating : text.createCircle}
        </button>
      </div>
      {typeMenuPortal}
    </form>
  );
}
