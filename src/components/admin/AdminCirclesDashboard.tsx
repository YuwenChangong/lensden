import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { localizeAdminSessionMessage } from "../../lib/i18n/messages/admin";
import { useLocale } from "../i18n/useLocale";
import { useEffect, useState } from "react";
import GlassConfirmDialog from "../common/GlassConfirmDialog";
import { adminFetch } from "../../lib/admin-api-client";
import { buildProfileHref } from "../../lib/profile-links";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { useAdminSession } from "./useAdminSession";

type CircleRecord = {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  image_path: string | null;
  cover_url?: string | null;
  owner_id: string | null;
  post_count: number;
  comment_count: number;
  owner_profile: {
    id: string | null;
    username?: string | null;
    display_name?: string | null;
    avatar_url?: string | null;
    role?: string | null;
  } | null;
};

type CirclePayload = {
  circles?: CircleRecord[];
  circle?: CircleRecord;
  error?: string;
};

type CircleStatus = "active" | "hidden" | "deleted";
type CircleFilter = "all" | CircleStatus;
type PurgePreview = {
  circleExists: boolean;
  status: string | null;
  name: string | null;
  postCount: number;
  circleReportCount: number;
  hasCover: boolean;
  allowed: boolean;
  reasonCode: string;
};

type PurgePayload = { preview?: PurgePreview; result?: { purged: boolean; reasonCode: string }; error?: string };

type CircleDraft = {
  name: string;
  description: string;
  type: string;
};

export default function AdminCirclesDashboard({ localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { localeContext?: LocaleContext } = {}) {
  const { context } = useLocale(localeContext);
  const locale = context.locale;
  const text = getUiMessages(locale).admin;
  const circleTypes = [
    { value: "topic", label: text.copy.generalTopic },
    { value: "device", label: text.copy.deviceCircle },
    { value: "project", label: text.copy.projectCircle },
  ] as const;

  function normalizeFileName(fileName: string) {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function mapCircleError(message: string) {
    if (message.includes("CIRCLE_NAME_ALREADY_EXISTS")) return text.copy.aCircleWithThisNameAlreadyExists;
    if (message.includes("CIRCLE_COVER_UPLOAD_FAILED")) return text.copy.circleCoverUploadFailed;
    if (message.includes("INVALID_GENERATED_CIRCLE_SLUG")) return text.copy.circleURLGenerationFailedTryADifferentName;
    if (message.includes("CIRCLE_STATUS_SCHEMA_NOT_READY")) return text.copy.theCircleStatusMigrationIsNotInstalled;
    return message;
  }

  function ownerLabel(circle: CircleRecord) {
    return circle.owner_profile?.display_name || circle.owner_profile?.username || circle.owner_id || text.copy.noOwner;
  }

  function ownerHref(circle: CircleRecord) {
    return buildProfileHref({
      id: circle.owner_profile?.id ?? circle.owner_id,
      username: circle.owner_profile?.username ?? null,
    });
  }

  function statusLabel(status: string) {
    if (status === "active") return text.copy.activeCircle;
    if (status === "hidden") return text.copy.hidden;
    if (status === "deleted") return text.copy.deleted;
    return status;
  }

  function purgeReasonLabel(reasonCode: string) {
    if (reasonCode === "CIRCLE_NOT_DELETED") return text.copy.onlyDeletedCirclesCanBePermanentlyDeleted;
    if (reasonCode === "CIRCLE_HAS_POSTS") return text.copy.thisCircleStillHasPostsAndCannotBePermanently;
    if (reasonCode === "CIRCLE_HAS_REPORTS") return text.copy.thisCircleStillHasReportsAndCannotBePermanently;
    if (reasonCode === "CIRCLE_NOT_FOUND") return text.copy.theCircleDoesNotExistOrWasDeleted;
    return text.copy.permanentDeletionIsUnavailableInThisState;
  }

  const adminSession = useAdminSession();
  const [circles, setCircles] = useState<CircleRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, CircleDraft>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createType, setCreateType] = useState<(typeof circleTypes)[number]["value"]>("topic");
  const [createImage, setCreateImage] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState<CircleFilter>("active");
  const [confirmCircleAction, setConfirmCircleAction] = useState<
    | { kind: "status"; id: string; name: string; nextStatus: CircleStatus }
    | { kind: "purge"; id: string; name: string; preview: PurgePreview }
    | null
  >(null);
  const [purgeConfirmationName, setPurgeConfirmationName] = useState("");

  const accessToken = adminSession.session?.access_token ?? "";

  useEffect(() => {
    if (adminSession.state.status !== "ready" || !adminSession.session) return;

    let cancelled = false;
    const load = async () => {
      setError("");
      try {
        const payload = await adminFetch<CirclePayload>("/api/admin/forum/circles", {
          method: "GET",
          session: adminSession.session,
        });
        if (cancelled) return;
        const items = payload.circles ?? [];
        setCircles(items);
        setDrafts(
          items.reduce<Record<string, CircleDraft>>((acc, circle) => {
            acc[circle.id] = {
              name: circle.name,
              description: circle.description ?? "",
              type: circle.type,
            };
            return acc;
          }, {}),
        );
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadCircles);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [adminSession.session, adminSession.state.status]);

  async function uploadCircleImage(file: File, userId: string) {
    if (!accessToken) throw new Error(text.copy.yourSessionExpiredSignInAgain);
    const objectPath = `circle-covers/${userId}/${Date.now()}-${normalizeFileName(file.name)}`;
    try {
      await uploadToPostMediaWithTus({ file, objectPath, accessToken });
    } catch {
      throw new Error("CIRCLE_COVER_UPLOAD_FAILED");
    }
    return objectPath;
  }

  async function handleCreate() {
    if (!adminSession.session || !adminSession.me) return;
    setCreating(true);
    setError("");
    setSuccess("");
    let uploadedPath = "";

    try {
      if (createImage) {
        uploadedPath = await uploadCircleImage(createImage, adminSession.me.user_id);
      }

      const payload = await adminFetch<CirclePayload>("/api/admin/forum/circles", {
        method: "POST",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim(),
          type: createType,
          image_path: uploadedPath || null,
        }),
      });

      if (payload.circle) {
        const defaults = { status: "active" };
        const nextCircle = { ...defaults, ...payload.circle };
        setCircles((current) => [nextCircle, ...current]);
        setDrafts((current) => ({
          ...current,
          [nextCircle.id]: {
            name: nextCircle.name,
            description: nextCircle.description ?? "",
            type: nextCircle.type,
          },
        }));
      }

      setCreateName("");
      setCreateDescription("");
      setCreateType("topic");
      setCreateImage(null);
      setSuccess(text.copy.circleCreated);
    } catch (requestError) {
      if (uploadedPath) {
        await adminSession.supabase?.storage.from("post-media").remove([uploadedPath]).catch(() => undefined);
      }
      setError(mapCircleError(requestError instanceof Error ? requestError.message : text.copy.failedToCreateCircle));
    } finally {
      setCreating(false);
    }
  }

  async function saveCircle(circleId: string) {
    if (!adminSession.session) return;
    const draft = drafts[circleId];
    if (!draft) return;
    setLoadingId(circleId);
    setError("");
    setSuccess("");

    try {
      const payload = await adminFetch<CirclePayload>("/api/admin/forum/circles", {
        method: "PATCH",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: circleId,
          name: draft.name.trim(),
          description: draft.description.trim(),
          type: draft.type,
        }),
      });

      if (payload.circle) {
        setCircles((current) => current.map((circle) => (circle.id === circleId ? { ...circle, ...payload.circle } as CircleRecord : circle)));
      }
      setSuccess(text.copy.circleUpdated);
    } catch (requestError) {
      setError(mapCircleError(requestError instanceof Error ? requestError.message : text.copy.failedToUpdateCircle));
    } finally {
      setLoadingId(null);
    }
  }

  async function updateCover(circle: CircleRecord, file: File | null) {
    if (!adminSession.session) return;
    setLoadingId(circle.id);
    setError("");
    setSuccess("");
    let imagePath: string | null = null;

    try {
      if (file) {
        imagePath = await uploadCircleImage(file, adminSession.me?.user_id || "admin");
      }

      const payload = await adminFetch<CirclePayload>("/api/admin/forum/circles", {
        method: "PATCH",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: circle.id,
          image_path: imagePath,
        }),
      });

      if (payload.circle) {
        setCircles((current) => current.map((item) => (item.id === circle.id ? { ...item, ...payload.circle } as CircleRecord : item)));
      }

      setSuccess(imagePath ? text.copy.circleCoverUpdated : text.copy.circleCoverCleared);
    } catch (requestError) {
      if (imagePath) {
        await adminSession.supabase?.storage.from("post-media").remove([imagePath]).catch(() => undefined);
      }
      setError(mapCircleError(requestError instanceof Error ? requestError.message : text.copy.failedToUpdateCover));
    } finally {
      setLoadingId(null);
    }
  }

  async function updateCircleStatus(circleId: string, status: CircleStatus) {
    if (!adminSession.session) return;
    setLoadingId(circleId);
    setError("");
    setSuccess("");

    try {
      const payload = await adminFetch<CirclePayload>("/api/admin/forum/circles", {
        method: "PATCH",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: circleId, status }),
      });

      if (payload.circle) {
        setCircles((current) => current.map((circle) => (circle.id === circleId ? { ...circle, ...payload.circle } as CircleRecord : circle)));
      }
      setSuccess(status === "deleted" ? text.copy.circleDeleted : status === "hidden" ? text.copy.circleHidden : text.copy.circleVisibilityRestored);
    } catch (requestError) {
      setError(mapCircleError(requestError instanceof Error ? requestError.message : text.copy.failedToUpdateCircleStatus));
    } finally {
      setLoadingId(null);
    }
  }

  async function startPurge(circle: CircleRecord) {
    if (!adminSession.session) return;
    setLoadingId(circle.id);
    setError("");
    setSuccess("");
    try {
      const payload = await adminFetch<PurgePayload>("/api/admin/forum/circles/purge", {
        method: "POST",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: circle.id, action: "preview" }),
      });
      if (!payload.preview) throw new Error("PURGE_PREVIEW_INVALID");
      setPurgeConfirmationName("");
      setConfirmCircleAction({ kind: "purge", id: circle.id, name: circle.name, preview: payload.preview });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadPermanentDeletionChecks);
    } finally {
      setLoadingId(null);
    }
  }

  async function purgeCircle(action: Extract<NonNullable<typeof confirmCircleAction>, { kind: "purge" }>) {
    if (!adminSession.session) return;
    setLoadingId(action.id);
    setError("");
    try {
      const payload = await adminFetch<PurgePayload>("/api/admin/forum/circles/purge", {
        method: "POST",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: action.id, action: "purge", confirmationName: purgeConfirmationName }),
      });
      if (!payload.result?.purged) throw new Error(payload.result?.reasonCode ?? "PURGE_NOT_COMPLETED");
      setCircles((current) => current.filter((circle) => circle.id !== action.id));
      setSuccess(text.copy.circlePermanentlyDeleted);
      setConfirmCircleAction(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.copy.permanentDeletionFailed);
    } finally {
      setLoadingId(null);
    }
  }

  if (adminSession.state.status !== "ready") {
    return (
      <section className="community-surface">
        <div className="community-empty admin-state-message">
          <strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>
          {"details" in adminSession.state && adminSession.state.details ? <p className="admin-debug-note">{adminSession.state.details}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="community-surface">
      <div className="community-stream-head">
        <div>
          <h2>{text.copy.circleManagement}</h2>
          <p>{text.copy.reviewOwnersPostAndCommentCountsAndMaintainCircle}</p>
        </div>
      </div>

      <div className="admin-user-line">
        {text.copy.currentAdministrator}{adminSession.me?.profile?.display_name || adminSession.me?.profile?.username || adminSession.me?.user_id} {text.copy.role}{adminSession.me?.role}
      </div>

      <div className="admin-inline-actions" role="tablist" aria-label={text.copy.circleStatusFilters}>
        {([
          ["all", text.copy.all],
          ["active", text.copy.activeCircle],
          ["hidden", text.copy.hidden],
          ["deleted", text.copy.deleted],
        ] as Array<[CircleFilter, string]>).map(([filter, label]) => (
          <button key={filter} type="button" className={statusFilter === filter ? "community-button" : "community-button--secondary"} onClick={() => setStatusFilter(filter)}>
            {label} {filter === "all" ? circles.length : circles.filter((circle) => circle.status === filter).length}
          </button>
        ))}
      </div>

      <div className="community-list" style={{ gap: "0.8rem", marginTop: "0.8rem" }}>
        <article className="community-list-item" style={{ gap: "0.75rem" }}>
          <strong>{text.copy.createCircle}</strong>
          <div className="admin-meta-grid">
            <label>
              <span>{text.copy.circleName}</span>
              <input className="community-input" value={createName} onChange={(event) => setCreateName(event.target.value)} maxLength={40} />
            </label>
            <label>
              <span>{text.copy.circleType}</span>
              <select className="community-input" value={createType} onChange={(event) => setCreateType(event.target.value as (typeof circleTypes)[number]["value"])}>
                {circleTypes.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{text.copy.coverImageFile}</span>
              <input className="community-input" type="file" accept="image/*" onChange={(event) => setCreateImage(event.target.files?.[0] ?? null)} />
            </label>
          </div>
          <label>
            <span className="community-meta">{text.copy.circleDescription}</span>
            <textarea className="community-input community-input--textarea" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} maxLength={200} />
          </label>
          <div className="admin-inline-actions">
            <button type="button" className="admin-action-button" onClick={() => void handleCreate()} disabled={creating}>
              {creating ? text.copy.creating : text.copy.createCircle}
            </button>
          </div>
        </article>

        {error ? <div className="admin-error">{error}</div> : null}
        {success ? <div className="admin-inline-success">{success}</div> : null}

        {circles.filter((circle) => statusFilter === "all" || circle.status === statusFilter).map((circle) => {
          const draft = drafts[circle.id] ?? {
            name: circle.name,
            description: circle.description ?? "",
            type: circle.type,
          };
          const rowLoading = loadingId === circle.id;

          return (
            <article key={circle.id} className="community-list-item" style={{ gap: "0.7rem" }}>
              {circle.cover_url ? (
                <div className="create-circle-form__preview">
                  <img src={circle.cover_url} alt={formatUiMessage(text.copy.circleCoverAlt, { value0: circle.name })} />
                </div>
              ) : null}
              <div className="admin-action-row">
                <strong>{circle.name}</strong>
                <span className={`admin-status-badge admin-status-${circle.status}`}>{statusLabel(circle.status)}</span>
                <span className="admin-status-badge">{circle.type}</span>
              </div>
              <div className="admin-meta-grid">
                <span>owner：{ownerHref(circle) ? <a href={ownerHref(circle)!} className="community-post-meta__link">{ownerLabel(circle)}</a> : ownerLabel(circle)}</span>
                <span>slug：<code>{circle.slug}</code></span>
                <span>{text.copy.created2}{new Date(circle.created_at).toLocaleString(locale)}</span>
                <span>{text.copy.cover}{circle.image_path ? text.copy.set : text.copy.notSet}</span>
                <span>{text.copy.post2}{circle.post_count}</span>
                <span>{text.copy.comments}{circle.comment_count}</span>
              </div>
              <div className="admin-meta-grid">
                <label>
                  <span>{text.copy.circleName}</span>
                  <input
                    className="community-input"
                    value={draft.name}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [circle.id]: { ...draft, name: event.target.value },
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{text.copy.circleType}</span>
                  <select
                    className="community-input"
                    value={draft.type}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [circle.id]: { ...draft, type: event.target.value },
                      }))
                    }
                  >
                    {circleTypes.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{text.copy.updateCover}</span>
                  <input className="community-input" type="file" accept="image/*" onChange={(event) => void updateCover(circle, event.target.files?.[0] ?? null)} disabled={rowLoading} />
                </label>
              </div>
              <label>
                <span className="community-meta">{text.copy.circleDescription}</span>
                <textarea
                  className="community-input community-input--textarea"
                  value={draft.description}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [circle.id]: { ...draft, description: event.target.value },
                    }))
                  }
                  maxLength={200}
                />
              </label>
              <div className="admin-inline-actions">
                <button type="button" className="admin-action-button" onClick={() => void saveCircle(circle.id)} disabled={rowLoading}>
                  {rowLoading ? text.copy.savingChanges : text.copy.saveChanges}
                </button>
                <button type="button" className="admin-action-button" onClick={() => void updateCover(circle, null)} disabled={rowLoading}>
                  {text.copy.clearCover}</button>
                {circle.status === "active" ? (
                  <>
                    <button type="button" className="admin-action-button" onClick={() => void updateCircleStatus(circle.id, "hidden")} disabled={rowLoading}>{text.copy.hide}</button>
                    <button type="button" className="admin-action-button admin-action-danger" onClick={() => setConfirmCircleAction({ kind: "status", id: circle.id, name: circle.name, nextStatus: "deleted" })} disabled={rowLoading}>{text.copy.delete}</button>
                  </>
                ) : circle.status === "hidden" ? (
                  <>
                    <button type="button" className="admin-action-button" onClick={() => void updateCircleStatus(circle.id, "active")} disabled={rowLoading}>{text.copy.restoreVisibility}</button>
                    <button type="button" className="admin-action-button admin-action-danger" onClick={() => setConfirmCircleAction({ kind: "status", id: circle.id, name: circle.name, nextStatus: "deleted" })} disabled={rowLoading}>{text.copy.delete}</button>
                  </>
                ) : (
                  <>
                  <button
                    type="button"
                    className="admin-action-button"
                    onClick={() => void updateCircleStatus(circle.id, "active")}
                    disabled={rowLoading}
                  >
                    {text.copy.restoreCircle}</button>
                  <button
                    type="button"
                    className="admin-action-button admin-action-danger"
                    onClick={() => void startPurge(circle)}
                    disabled={rowLoading}
                  >
                    {text.copy.permanentlyDelete}</button>
                  </>
                )}
                <a href={`/circles/${circle.slug}/manage/`} className="admin-action-button">{text.copy.managePostsAndComments}</a>
                {circle.status !== "active" ? (
                  <span className="admin-action-button" aria-disabled="true">{text.copy.publicPageHidden}</span>
                ) : (
                  <a href={`/circles/${circle.slug}/`} className="admin-action-button">{text.copy.viewPublicPage}</a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <GlassConfirmDialog
        open={!!confirmCircleAction}
        title={confirmCircleAction?.kind === "purge" ? text.copy.permanentlyDelete : text.copy.confirmCircleDeletion}
        description={confirmCircleAction?.kind === "purge" ? text.copy.thisCannotBeUndoneContinueOnlyWhenTheCircle : text.copy.deletionHidesTheCircleFromPublicListsItsDetail}
        detail={confirmCircleAction?.kind === "purge" ? formatUiMessage(text.copy.circlePurgeSummary, { value0: confirmCircleAction.preview.postCount, value1: confirmCircleAction.preview.circleReportCount, value2: confirmCircleAction.preview.hasCover ? "有" : "无", value3: confirmCircleAction.preview.allowed ? "" : ` · ${purgeReasonLabel(confirmCircleAction.preview.reasonCode)}` }) : confirmCircleAction ? formatUiMessage(text.copy.targetNameValue, { value0: confirmCircleAction.name }) : ""}
        confirmLabel={confirmCircleAction?.kind === "purge" ? text.copy.confirmPermanentDeletion : text.copy.confirmCircleDeletion}
        cancelLabel={text.copy.cancel}
        danger={true}
        loading={!!confirmCircleAction && loadingId === confirmCircleAction.id}
        error=""
        confirmationLabel={confirmCircleAction?.kind === "purge" && confirmCircleAction.preview.allowed ? formatUiMessage(text.copy.enterCircleNameValue, { value0: confirmCircleAction.name }) : undefined}
        confirmationText={confirmCircleAction?.kind === "purge" && confirmCircleAction.preview.allowed ? confirmCircleAction.name : undefined}
        confirmDisabled={confirmCircleAction?.kind === "purge" && !confirmCircleAction.preview.allowed}
        onConfirmationChange={setPurgeConfirmationName}
        onCancel={() => { setConfirmCircleAction(null); setPurgeConfirmationName(""); }}
        onConfirm={() => {
          if (!confirmCircleAction) return;
          void (async () => {
            if (confirmCircleAction.kind === "purge") {
              await purgeCircle(confirmCircleAction);
            } else {
              await updateCircleStatus(confirmCircleAction.id, confirmCircleAction.nextStatus);
              setConfirmCircleAction(null);
            }
          })();
        }}
      />
    </section>
  );
}
