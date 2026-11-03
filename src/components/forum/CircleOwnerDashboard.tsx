import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import GlassConfirmDialog from "../common/GlassConfirmDialog";
import { buildLoginHref } from "../../lib/auth-redirect";
import { buildProfileHref } from "../../lib/profile-links";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useBrowserAuthState } from "../auth/useBrowserAuthState";
import CircleCoverEditor from "./CircleCoverEditor";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { useLocale } from "../i18n/useLocale";
type CommunityMessages = ReturnType<typeof getUiMessages>["community"];

type ManagedCircle = {
  id: string;
  slug: string;
  name: string;
  description: string;
  type: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  image_path: string | null;
  cover_url?: string | null;
  owner_id: string | null;
  post_count: number;
  comment_count: number;
};

type ManagedPost = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  author: { id?: string | null; label?: string | null; display_name?: string | null; username?: string | null } | null;
  can_manage?: boolean;
  media_count: number;
  report_count: number;
};

type ManagedComment = {
  id: string;
  body: string;
  status: string;
  created_at: string;
  post_title: string;
  can_manage?: boolean;
  author: { id?: string | null; display_name?: string | null; username?: string | null } | null;
};

type ManagePayload = {
  ok?: boolean;
  circle?: ManagedCircle;
  viewer?: {
    id: string;
    role: string | null;
    is_owner: boolean;
    can_manage: boolean;
  };
  error?: string;
};

type ApiErrorPayload = {
  error?: string;
  details?: string;
};

function formatActorLabel(author: { display_name?: string | null; username?: string | null; label?: string | null } | null | undefined, fallback: string) {
  return author?.display_name || author?.username || author?.label || fallback;
}

function actorHref(author?: { id?: string | null; username?: string | null } | null) {
  return buildProfileHref({
    id: author?.id ?? null,
    username: author?.username ?? null,
  });
}

async function requestWithSession<T>(path: string, session: Session, options: RequestInit | undefined, requestFailed: string): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
      authorization: `Bearer ${session.access_token}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as ApiErrorPayload | null;
  if (!response.ok) {
    const detailSuffix = payload?.details ? `: ${payload.details}` : "";
    throw new Error(`${payload?.error ?? `${requestFailed} (${response.status})`}${detailSuffix}`);
  }
  return (payload ?? {}) as T;
}

function mapManageError(message: string, text: CommunityMessages) {
  if (message.includes("NOT_AUTHENTICATED")) return { kind: "auth", text: text.manageLoginRequired };
  if (message.includes("CIRCLE_NOT_FOUND")) return { kind: "not_found", text: text.circleMissing };
  if (message.includes("PROFILE_NOT_FOUND")) return { kind: "profile", text: text.manageProfileMissing };
  if (message.includes("CIRCLE_MANAGE_FORBIDDEN")) return { kind: "forbidden", text: text.manageForbidden };
  if (message.includes("FORBIDDEN")) return { kind: "forbidden", text: text.contentManageForbidden };
  if (message.includes("CIRCLE_STATUS_SCHEMA_NOT_READY") || message.includes("CIRCLE_STATUS_COLUMN_MISSING")) {
    return { kind: "schema", text: text.circleStatusMigration };
  }
  if (message.includes("CIRCLE_DELETE_RLS_FAILED")) return { kind: "delete_rls", text: text.circleDeleteRls };
  if (message.includes("CIRCLE_DELETE_FAILED")) return { kind: "delete_failed", text: text.circleDeleteFailed };
  if (message.includes("CIRCLE_MANAGE_QUERY_FAILED")) return { kind: "query", text: text.manageQueryFailed };
  return { kind: "generic", text: message };
}

export default function CircleOwnerDashboard({ circleSlug, localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { circleSlug: string; localeContext?: LocaleContext }) {
  const { context, messages } = useLocale(localeContext);
  const text = messages.community;
  const sessionFetch = <T,>(path: string, session: Session, options?: RequestInit) => requestWithSession<T>(path, session, options, text.requestFailed);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const authState = useBrowserAuthState(supabase);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionError, setPermissionError] = useState("");
  const [notFoundError, setNotFoundError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [circle, setCircle] = useState<ManagedCircle | null>(null);
  const [posts, setPosts] = useState<ManagedPost[]>([]);
  const [comments, setComments] = useState<ManagedComment[]>([]);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingCircle, setSavingCircle] = useState(false);
  const [rowLoadingId, setRowLoadingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "post" | "comment" | "circle"; id: string; title: string } | null>(null);
  const [deletingCircle, setDeletingCircle] = useState(false);

  async function loadAll(activeSession: Session) {
    setLoading(true);
    setError("");
    setPermissionError("");
    setNotFoundError("");

    try {
      const managePayload = await sessionFetch<ManagePayload>(`/api/forum/circles/${circleSlug}/manage`, activeSession, { method: "GET" });
      if (!managePayload.circle) {
        throw new Error("CIRCLE_MANAGE_QUERY_FAILED");
      }

      setCircle(managePayload.circle);
      setDraftName(managePayload.circle.name);
      setDraftDescription(managePayload.circle.description ?? "");

      const [postsPayload, commentsPayload] = await Promise.all([
        sessionFetch<{ posts: ManagedPost[] }>(`/api/forum/circles/${circleSlug}/posts`, activeSession, { method: "GET" }),
        sessionFetch<{ comments: ManagedComment[] }>(`/api/forum/circles/${circleSlug}/comments`, activeSession, { method: "GET" }),
      ]);

      setPosts(postsPayload.posts ?? []);
      setComments(commentsPayload.comments ?? []);
    } catch (requestError) {
      const mapped = mapManageError(requestError instanceof Error ? requestError.message : text.manageLoadFailed, text);
      if (mapped.kind === "forbidden") {
        setPermissionError(mapped.text);
      } else if (mapped.kind === "not_found") {
        setNotFoundError(mapped.text);
      } else {
        setError(mapped.text);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (authState.status !== "signed_in" || !supabase) {
      setSession(null);
      setLoading(false);
      return;
    }

    const client = supabase;
    let cancelled = false;
    client.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const nextSession = data.session ?? null;
      setSession(nextSession);
      if (nextSession) {
        void loadAll(nextSession);
      } else {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authState.status, circleSlug, supabase]);

  async function refreshLists(activeSession: Session) {
    const [managePayload, postsPayload, commentsPayload] = await Promise.all([
      sessionFetch<ManagePayload>(`/api/forum/circles/${circleSlug}/manage`, activeSession, { method: "GET" }),
      sessionFetch<{ posts: ManagedPost[] }>(`/api/forum/circles/${circleSlug}/posts`, activeSession, { method: "GET" }),
      sessionFetch<{ comments: ManagedComment[] }>(`/api/forum/circles/${circleSlug}/comments`, activeSession, { method: "GET" }),
    ]);

    if (managePayload.circle) setCircle(managePayload.circle);
    setPosts(postsPayload.posts ?? []);
    setComments(commentsPayload.comments ?? []);
  }

  async function saveCircle() {
    if (!session || !circle) return;
    setSavingCircle(true);
    setError("");
    setSuccess("");

    try {
      const payload = await sessionFetch<{ circle: ManagedCircle }>(`/api/forum/circles/${circleSlug}/manage`, session, {
        method: "PATCH",
        body: JSON.stringify({
          name: draftName.trim(),
          description: draftDescription.trim(),
        }),
      });
      setCircle(payload.circle);
      setDraftName(payload.circle.name);
      setDraftDescription(payload.circle.description ?? "");
      setSuccess(text.circleUpdated);
    } catch (requestError) {
      setError(mapManageError(requestError instanceof Error ? requestError.message : text.circleUpdateFailed, text).text);
    } finally {
      setSavingCircle(false);
    }
  }

  async function updatePostStatus(postId: string, status: "published" | "hidden" | "deleted") {
    if (!session) return;
    setRowLoadingId(postId);
    setError("");
    setSuccess("");

    try {
      await sessionFetch(`/api/forum/circles/${circleSlug}/posts`, session, {
        method: "PATCH",
        body: JSON.stringify({ id: postId, status }),
      });
      await refreshLists(session);
      setSuccess(status === "hidden" ? text.postHidden : status === "published" ? text.postRestored : text.postDeleted);
    } catch (requestError) {
      setError(mapManageError(requestError instanceof Error ? requestError.message : text.postStatusFailed, text).text);
    } finally {
      setRowLoadingId(null);
    }
  }

  async function updateCircleStatus(status: "active" | "deleted") {
    if (!session || !circle) return;
    setSavingCircle(true);
    setError("");
    setSuccess("");

    try {
      const payload = await sessionFetch<{ circle: ManagedCircle }>(`/api/forum/circles/${circleSlug}/manage`, session, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setCircle(payload.circle);
      setSuccess(status === "deleted" ? text.circleDeleted : text.circleRestored);
    } catch (requestError) {
      setError(mapManageError(requestError instanceof Error ? requestError.message : text.circleStatusFailed, text).text);
    } finally {
      setSavingCircle(false);
    }
  }

  async function confirmDeleteAction() {
    if (!session || !confirmDelete) return;
    if (confirmDelete.type === "circle" && deletingCircle) return;
    setRowLoadingId(confirmDelete.id);
    setError("");

    try {
      if (confirmDelete.type === "circle") {
        setDeletingCircle(true);
        await sessionFetch(`/api/forum/circles/${circleSlug}/manage`, session, { method: "DELETE" });
        setConfirmDelete(null);
        setSuccess(text.circleDeletedRedirect);
        window.location.assign("/circles/");
        return;
      } else if (confirmDelete.type === "post") {
        await sessionFetch(`/api/forum/circles/${circleSlug}/posts?id=${confirmDelete.id}`, session, { method: "DELETE" });
      } else {
        await sessionFetch(`/api/forum/circles/${circleSlug}/comments?id=${confirmDelete.id}`, session, { method: "DELETE" });
      }
      await refreshLists(session);
      setSuccess(
        confirmDelete.type === "post" ? text.postDeleted : text.commentRemoved,
      );
      setConfirmDelete(null);
    } catch (requestError) {
      setConfirmDelete(null);
      setError(mapManageError(requestError instanceof Error ? requestError.message : text.deleteFailed, text).text);
    } finally {
      setDeletingCircle(false);
      setRowLoadingId(null);
    }
  }

  async function updateCommentStatus(commentId: string, status: "published" | "deleted") {
    if (!session) return;
    setRowLoadingId(commentId);
    setError("");

    try {
      await sessionFetch(`/api/forum/circles/${circleSlug}/comments`, session, {
        method: "PATCH",
        body: JSON.stringify({ id: commentId, status }),
      });
      await refreshLists(session);
      setSuccess(status === "published" ? text.commentRestored : text.commentRemoved);
    } catch (requestError) {
      setError(mapManageError(requestError instanceof Error ? requestError.message : text.commentStatusFailed, text).text);
    } finally {
      setRowLoadingId(null);
    }
  }

  if (authState.status === "checking") {
    return <section className="community-surface community-surface--padded circle-manage-shell"><p>{text.checkingAuth}</p></section>;
  }

  if (authState.status === "signed_in" && !session) {
    return <section className="community-surface community-surface--padded circle-manage-shell"><p>{text.loadingManage}</p></section>;
  }

  if (authState.status !== "signed_in" || !session) {
    return (
      <section className="community-surface community-surface--padded circle-manage-shell circle-manage-gate">
        <h2>{text.manageCircle}</h2>
        <p>{text.manageOwnedHint}</p>
        <div className="community-cta-row">
          <a href={buildLoginHref(`/circles/${circleSlug}/manage/`)} className="community-action-button community-action-button--primary">
            {text.goLogin}
          </a>
          <a href={`/circles/${circleSlug}/`} className="community-action-button community-action-button--muted">
            {text.backCircleDetail}
          </a>
        </div>
      </section>
    );
  }

  if (loading) {
    return <section className="community-surface community-surface--padded circle-manage-shell"><p>{text.loadingManage}</p></section>;
  }

  if (notFoundError) {
    return (
      <section className="community-surface community-surface--padded circle-manage-shell circle-manage-gate">
        <h2>{text.circleNotFound}</h2>
        <p>{notFoundError}</p>
        <a href="/circles/" className="community-action-button community-action-button--muted">
          {text.backCircles}
        </a>
      </section>
    );
  }

  if (permissionError) {
    return (
      <section className="community-surface community-surface--padded circle-manage-shell circle-manage-gate">
        <h2>{text.manageDenied}</h2>
        <p>{permissionError}</p>
        <a href={`/circles/${circleSlug}/`} className="community-action-button community-action-button--muted">
          {text.backCircleDetail}
        </a>
      </section>
    );
  }

  if (!circle) {
    return <section className="community-surface community-surface--padded circle-manage-shell"><p>{text.circleMissing}</p></section>;
  }

  return (
    <>
      <section className="community-surface community-surface--padded circle-manage-shell">
        <div className="community-stream-head">
          <div>
            <h2>{text.manageCircle}</h2>
          </div>
          <div className="community-inline-links">
            {circle.status === "deleted" ? (
              <a href="/circles/" className="community-action-button community-action-button--muted">{text.backCircles}</a>
            ) : (
              <a href={`/circles/${circle.slug}/`} className="community-action-button community-action-button--muted">{text.backCircleDetail}</a>
            )}
          </div>
        </div>

        {error ? <div className="admin-error">{error}</div> : null}
        {success ? <div className="admin-inline-success">{success}</div> : null}

        <div className="circle-manage-grid">
          <article className="community-list-item circle-manage-panel">
            <strong>{text.circleInfo}</strong>
            <div className="admin-meta-grid">
              <span>slug：<code>{circle.slug}</code></span>
              <span className="circle-manage-status">{text.statusLabel}<span className={`admin-status-badge admin-status-${circle.status}`}>{circle.status}</span></span>
              <span>{text.postsLabel}{circle.post_count.toLocaleString(context.locale)}</span>
              <span>{text.commentsLabel}{circle.comment_count.toLocaleString(context.locale)}</span>
              <span>{text.createdLabel}{new Date(circle.created_at).toLocaleString(context.locale)}</span>
            </div>
            {circle.cover_url ? (
              <div className="create-circle-form__preview">
                <img src={circle.cover_url} alt={formatUiMessage(text.circleCover, { name: circle.name })} />
              </div>
            ) : null}
            <label>
              <span className="community-meta">{text.circleName}</span>
              <input className="community-input" value={draftName} onChange={(event) => setDraftName(event.target.value)} maxLength={40} />
            </label>
            <label>
              <span className="community-meta">{text.circleIntroduction}</span>
              <textarea className="community-input community-input--textarea" value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} maxLength={200} />
            </label>
            <CircleCoverEditor
              localeContext={context}
              circleId={circle.id}
              circleSlug={circle.slug}
              supportsExtendedSchema={true}
              ownerId={circle.owner_id}
              onUpdated={(imagePath, coverUrl) =>
                setCircle((current) => (current ? { ...current, image_path: imagePath, cover_url: coverUrl ?? null } : current))
              }
            />
            <div className="community-cta-row">
              <button type="button" className="community-button" disabled={savingCircle} onClick={() => void saveCircle()}>
                {savingCircle ? text.saving : text.saveCircle}
              </button>
              {circle.status === "deleted" ? (
                <button
                  type="button"
                  className="community-action-button community-action-button--muted"
                  disabled={savingCircle}
                  onClick={() => void updateCircleStatus("active")}
                >
                  {text.restoreCircle}
                </button>
              ) : (
                <button
                  type="button"
                  className="community-action-button community-action-button--danger"
                  disabled={savingCircle || deletingCircle}
                  onClick={() => {
                    if (deletingCircle) return;
                    setConfirmDelete({ type: "circle", id: circle.id, title: circle.name });
                  }}
                >
                  {text.deleteCircle}
                </button>
              )}
            </div>
          </article>

          <article className="community-list-item circle-manage-panel">
            <strong>{text.circlePosts}</strong>
            <div className="circle-manage-list">
              {posts.length === 0 ? <p className="community-meta">{text.noManagedPosts}</p> : posts.map((post) => (
                <div key={post.id} className="circle-manage-item">
                  <div className="admin-action-row">
                    <strong>{post.title}</strong>
                    <span className={`admin-status-badge admin-status-${post.status}`}>{post.status}</span>
                  </div>
                  <div className="admin-meta-grid">
                    <span>{text.authorLabel}{actorHref(post.author) ? <a href={actorHref(post.author)!} className="community-post-meta__link">{formatActorLabel(post.author, text.unknownUser)}</a> : formatActorLabel(post.author, text.unknownUser)}</span>
                    <span>{text.mediaLabel}{post.media_count.toLocaleString(context.locale)}</span>
                    <span>{text.reportsLabel}{post.report_count.toLocaleString(context.locale)}</span>
                    <span>{text.createdLabel}{new Date(post.created_at).toLocaleString(context.locale)}</span>
                  </div>
                  <div className="admin-inline-actions">
                    {post.can_manage ? (
                      <>
                        {post.status !== "hidden" ? (
                          <button type="button" className="admin-action-button" disabled={rowLoadingId === post.id} onClick={() => void updatePostStatus(post.id, "hidden")}>
                            {text.hidePost}
                          </button>
                        ) : (
                          <button type="button" className="admin-action-button" disabled={rowLoadingId === post.id} onClick={() => void updatePostStatus(post.id, "published")}>
                            {text.restorePublic}
                          </button>
                        )}
                        {post.status === "deleted" ? (
                          <button type="button" className="admin-action-button" disabled={rowLoadingId === post.id} onClick={() => void updatePostStatus(post.id, "published")}>
                            {text.restorePost}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-action-button admin-action-danger"
                            disabled={rowLoadingId === post.id}
                            onClick={() => setConfirmDelete({ type: "post", id: post.id, title: post.title })}
                          >
                            {text.deletePost}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="community-meta">{text.postManageOwnersOnly}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="community-list-item circle-manage-panel circle-manage-panel--full">
            <strong>{text.circleComments}</strong>
            <div className="circle-manage-list">
              {comments.length === 0 ? <p className="community-meta">{text.noManagedComments}</p> : comments.map((comment) => (
                <div key={comment.id} className="circle-manage-item">
                  <div className="admin-action-row">
                    <strong>{comment.status === "deleted" ? text.commentDeleted : comment.body.slice(0, 80)}</strong>
                    <span className={`admin-status-badge admin-status-${comment.status}`}>{comment.status}</span>
                  </div>
                  <div className="admin-meta-grid">
                    <span>{text.authorLabel}{actorHref(comment.author) ? <a href={actorHref(comment.author)!} className="community-post-meta__link">{formatActorLabel(comment.author, text.unknownUser)}</a> : formatActorLabel(comment.author, text.unknownUser)}</span>
                    <span>{text.postsLabel}{comment.post_title}</span>
                    <span>{text.createdLabel}{new Date(comment.created_at).toLocaleString(context.locale)}</span>
                  </div>
                  <div className="admin-inline-actions">
                    {comment.can_manage ? (
                      <>
                        {comment.status === "deleted" ? (
                          <button type="button" className="admin-action-button" disabled={rowLoadingId === comment.id} onClick={() => void updateCommentStatus(comment.id, "published")}>
                            {text.restoreComment}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="admin-action-button admin-action-danger"
                            disabled={rowLoadingId === comment.id}
                            onClick={() => setConfirmDelete({ type: "comment", id: comment.id, title: comment.post_title })}
                          >
                            {text.deleteComment}
                          </button>
                        )}
                      </>
                    ) : (
                      <span className="community-meta">{text.commentManageOwnersOnly}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <GlassConfirmDialog
        open={!!confirmDelete}
        title={
          confirmDelete?.type === "circle"
            ? text.confirmDeleteCircle
            : confirmDelete?.type === "post"
              ? text.confirmDeletePost
              : text.confirmDeleteComment
        }
        description={
          confirmDelete?.type === "circle"
            ? text.deleteCircleDescription
            : confirmDelete?.type === "post"
              ? text.deleteManagedPostDescription
              : text.deleteManagedCommentDescription
        }
        detail={confirmDelete ? formatUiMessage(text.target, { title: confirmDelete.title }) : ""}
        confirmLabel={
          confirmDelete?.type === "circle"
            ? text.confirmDeleteCircle
            : confirmDelete?.type === "post"
              ? text.confirmDeletePost
              : text.confirmDeleteComment
        }
        cancelLabel={text.cancel}
        localeContext={context}
        danger={true}
        loading={confirmDelete?.type === "circle" ? deletingCircle : !!confirmDelete && rowLoadingId === confirmDelete.id}
        error=""
        onCancel={() => {
          if (deletingCircle) return;
          setConfirmDelete(null);
        }}
        onConfirm={() => void confirmDeleteAction()}
      />
    </>
  );
}
