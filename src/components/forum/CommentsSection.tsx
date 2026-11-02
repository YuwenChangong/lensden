import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import GlassConfirmDialog from "../common/GlassConfirmDialog";
import { createBrowserSupabaseClient, syncBrowserRealtimeAuth } from "../../lib/supabase-browser";
import CommentForm from "./CommentForm";
import { buildProfileHref } from "../../lib/profile-links";
import ReportTrigger from "../reports/ReportTrigger";
import { resolveLocale, type LocaleContext, type ResolvedLocale } from "../../lib/i18n/locale";
import { useLocale } from "../i18n/useLocale";

interface Author {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string | null;
  parent_id: string | null;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
  author: Author | null;
  like_count: number;
  liked_by_me: boolean;
  reply_count: number | null;
  can_delete: boolean;
  delete_as_staff?: boolean;
}

interface CommentsSectionProps {
  localeContext?: LocaleContext;
  postId: string;
  postAuthorId?: string;
  refreshKey?: number;
  loginHref?: string;
  publicPage?: number;
  children?: ReactNode;
}

const LIKE_ANIMATION_MS = 240;

function formatDate(dateStr: string, locale: ResolvedLocale): string {
  try {
    return new Date(dateStr).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function authorDisplayName(author: Author | null, fallback: string): string {
  return author?.display_name || author?.username || fallback;
}

export default function CommentsSection({ postId, postAuthorId, refreshKey, loginHref, publicPage, children, localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: CommentsSectionProps) {
  const { context, messages } = useLocale(localeContext);
  const text = messages.community;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [likeAnimatingById, setLikeAnimatingById] = useState<Record<string, boolean>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [likePendingById, setLikePendingById] = useState<Record<string, boolean>>({});
  const likeTimerRef = useRef<Record<string, number>>({});

  const clearCommentError = useCallback((commentId: string) => {
    setCommentErrors((current) => {
      const next = { ...current };
      delete next[commentId];
      return next;
    });
  }, []);

  const fetchComments = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!silent || !hasLoadedOnce) {
      setLoading(true);
      setError("");
    }
    try {
      const headers: Record<string, string> = {};
      if (supabase) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) {
          headers.authorization = `Bearer ${data.session.access_token}`;
        }
      }
      const res = await fetch(`/api/forum/comments?post_id=${encodeURIComponent(postId)}${publicPage ? `&public_page=${publicPage}` : ''}`, { headers });
      const data = (await res.json().catch(() => null)) as { comments?: Comment[]; error?: string } | null;
      if (!res.ok) {
        if (data?.error === "COMMENTS_INTERACTIONS_MIGRATION_REQUIRED") {
          throw new Error(`MIGRATION_REQUIRED::${text.commentsMigration}`);
        }
        throw new Error(data?.error ?? `${text.requestFailed} (${res.status})`);
      }
      setComments(data?.comments ?? []);
      setHasLoadedOnce(true);
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : text.commentsFailed;
      if (msg.startsWith("MIGRATION_REQUIRED::")) {
        setError(msg.slice("MIGRATION_REQUIRED::".length));
      } else {
        setError(msg);
      }
      setHasLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  }, [hasLoadedOnce, postId, publicPage, supabase]);

  useEffect(() => {
    let cancelled = false;
    if (!cancelled) {
      void fetchComments();
    }
    return () => {
      cancelled = true;
    };
  }, [fetchComments, refreshKey]);

  const visibleCommentIds = useMemo(
    () => comments.map((comment) => comment.id).sort().join(","),
    [comments],
  );

  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;

    const setupChannel = async () => {
      await syncBrowserRealtimeAuth(supabase);
      if (cancelled) return;

      channel = supabase
        .channel(`forum-comments-${postId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comments",
            filter: `post_id=eq.${postId}`,
          },
          () => {
            void fetchComments({ silent: true });
          },
        );

      for (const commentId of visibleCommentIds.split(",").filter(Boolean)) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "comment_reactions",
            filter: `comment_id=eq.${commentId}`,
          },
          () => {
            void fetchComments({ silent: true });
          },
        );
      }

      channel.subscribe((subscriptionStatus) => {
        if (import.meta.env.DEV) {
          console.debug("[realtime] comments", { subscriptionStatus, postId });
        }
      });
    };

    void setupChannel();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [fetchComments, postId, supabase, visibleCommentIds]);

  useEffect(() => {
    return () => {
      Object.values(likeTimerRef.current).forEach((timerId) => window.clearTimeout(timerId));
    };
  }, []);

  const handleCommentCreated = useCallback((newComment: Comment) => {
    setComments((prev) => [...prev, newComment]);
    setReplyingTo(null);
  }, []);

  const triggerLikeAnimation = useCallback((commentId: string) => {
    setLikeAnimatingById((current) => ({ ...current, [commentId]: true }));
    if (likeTimerRef.current[commentId]) {
      window.clearTimeout(likeTimerRef.current[commentId]);
    }
    likeTimerRef.current[commentId] = window.setTimeout(() => {
      setLikeAnimatingById((current) => {
        const next = { ...current };
        delete next[commentId];
        return next;
      });
      delete likeTimerRef.current[commentId];
    }, LIKE_ANIMATION_MS);
  }, []);

  const handleToggleLike = useCallback(async (commentId: string) => {
    if (!supabase || likePendingById[commentId]) return;
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.access_token) return;

    clearCommentError(commentId);

    let previous: { liked_by_me: boolean; like_count: number } | null = null;
    setComments((prev) =>
      prev.map((comment) => {
        if (comment.id !== commentId) return comment;
        previous = { liked_by_me: comment.liked_by_me, like_count: comment.like_count };
        const nextLiked = !comment.liked_by_me;
        return {
          ...comment,
          liked_by_me: nextLiked,
          like_count: Math.max(0, comment.like_count + (nextLiked ? 1 : -1)),
        };
      }),
    );
    triggerLikeAnimation(commentId);
    setLikePendingById((current) => ({ ...current, [commentId]: true }));

    try {
      const res = await fetch("/api/forum/comments", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({ comment_id: commentId }),
      });
      const payload = (await res.json().catch(() => null)) as { liked?: boolean; like_count?: number; error?: string } | null;
      if (!res.ok) throw new Error(payload?.error ?? text.actionFailed);

      setComments((prev) =>
        prev.map((comment) =>
          comment.id === commentId
            ? {
                ...comment,
                liked_by_me: Boolean(payload?.liked),
                like_count: Math.max(0, Number(payload?.like_count ?? comment.like_count)),
              }
            : comment,
        ),
      );
    } catch (likeError) {
      if (previous) {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentId
              ? { ...comment, liked_by_me: previous!.liked_by_me, like_count: previous!.like_count }
              : comment,
          ),
        );
      }
      setCommentErrors((current) => ({
        ...current,
        [commentId]: likeError instanceof Error ? likeError.message : text.likeFailed,
      }));
    } finally {
      setLikePendingById((current) => {
        const next = { ...current };
        delete next[commentId];
        return next;
      });
    }
  }, [clearCommentError, likePendingById, supabase, triggerLikeAnimation]);

  const openDeleteModal = useCallback((commentId: string) => {
    setDeleteError("");
    setDeleteNotice("");
    clearCommentError(commentId);
    setDeleteTargetId(commentId);
  }, [clearCommentError]);

  const closeDeleteModal = useCallback(() => {
    if (deletingId) return;
    setDeleteTargetId(null);
    setDeleteError("");
  }, [deletingId]);

  const handleConfirmDelete = useCallback(async () => {
    if (!supabase || !deleteTargetId) return;
    setDeletingId(deleteTargetId);
    setDeleteError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token) throw new Error(text.loginFirst);

      const commentBeforeDelete = comments.find((comment) => comment.id === deleteTargetId) ?? null;
      const hasPublishedReplies = comments.some(
        (comment) => comment.parent_id === deleteTargetId && comment.status === "published",
      );

      const res = await fetch(`/api/forum/comments?id=${encodeURIComponent(deleteTargetId)}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${sessionData.session.access_token}` },
      });
      const payload = (await res.json().catch(() => null)) as
        | { ok?: boolean; comment_id?: string; status?: string; already_deleted?: boolean; error?: string; details?: string }
        | null;
      if (!res.ok) {
        const details = typeof payload?.details === "string" && payload.details.trim()
          ? `：${payload.details.trim()}`
          : "";
        throw new Error(`${payload?.error ?? text.deleteFailed}${details}`);
      }

      setReplyingTo((current) => (current === deleteTargetId ? null : current));
      setDeleteTargetId(null);
      setDeleteNotice(text.commentRemoved);
      if (!commentBeforeDelete) return;

      if (hasPublishedReplies) {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === deleteTargetId
              ? { ...comment, status: "deleted", body: "", author: null, author_id: null, can_delete: false, delete_as_staff: false, liked_by_me: false, like_count: 0 }
              : comment,
          ),
        );
      } else {
        setComments((prev) => prev.filter((comment) => comment.id !== deleteTargetId));
      }
    } catch (deleteRequestError) {
      setDeleteError(deleteRequestError instanceof Error ? deleteRequestError.message : text.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  }, [comments, deleteTargetId, supabase, text.commentRemoved]);

  const commentIds = new Set(comments.map((c) => c.id));
  const topLevelComments = comments.filter((c) => !c.parent_id || !commentIds.has(c.parent_id));
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parent_id) {
      const list = repliesByParent.get(c.parent_id) ?? [];
      list.push(c);
      repliesByParent.set(c.parent_id, list);
    }
  }

  const totalCount = comments.filter((c) => c.status !== "deleted").length;

  const renderComment = (comment: Comment, isReply: boolean, ancestors: ReadonlySet<string> = new Set()) => {
    // The API bounds the returned set; never revisit a node in malformed cycles.
    if (ancestors.has(comment.id) || ancestors.size >= commentIds.size) return null;
    const path = new Set([...ancestors, comment.id]);
    const isDeleted = comment.status === "deleted";
    const replies = repliesByParent.get(comment.id) ?? [];
    const authorName = isDeleted ? text.anonymous : authorDisplayName(comment.author, text.member);
    const authorHref = !isDeleted && comment.author_id
      ? buildProfileHref({ id: comment.author_id, username: comment.author?.username ?? null })
      : null;
    const showReplyForm = replyingTo === comment.id;
    const isPostAuthor = Boolean(postAuthorId) && comment.author_id === postAuthorId;

    return (
      <div key={comment.id} className={isReply ? "comment-thread comment-thread--reply" : "comment-thread"}>
        <article
          id={`comment-${comment.id}`}
          className={`glass-card comment-card comment-item${isDeleted ? " comment-deleted" : ""}`}
        >
          <div className="comment-item-main">
            <div className="comment-meta">
              {authorHref ? (
                <a href={authorHref} className={`comment-author comment-author-link${isPostAuthor ? " comment-author--author" : ""}`}>
                  {authorName}
                </a>
              ) : (
                <span className={`comment-author${isPostAuthor ? " comment-author--author" : ""}`}>
                  {authorName}
                </span>
              )}
              {isPostAuthor && !isDeleted ? (
                <span className="comment-staff-badge">{text.author}</span>
              ) : null}
              {comment.status === "pending" ? (
                <span className="comment-staff-badge">{text.pendingReview}</span>
              ) : null}
              <span className="comment-time">{formatDate(comment.created_at, context.locale)}</span>
              {comment.updated_at && comment.updated_at !== comment.created_at && !isDeleted ? (
                <span className="comment-time">{text.edited}</span>
              ) : null}
            </div>

            {isDeleted ? (
              <div className="comment-body comment-deleted">{text.commentDeleted}</div>
            ) : (
              <div className="comment-body">{comment.body}</div>
            )}
          </div>

          {!isDeleted ? (
            <>
              <div className="comment-action-row">
                <button
                  type="button"
                  className={`community-action-button community-action-button--social comment-action-button${comment.liked_by_me ? " is-active is-liked" : ""}`}
                  onClick={() => void handleToggleLike(comment.id)}
                  disabled={!supabase || Boolean(likePendingById[comment.id])}
                  aria-label={comment.liked_by_me ? text.unlike : text.like}
                >
                  <span className={`community-like-heart${likeAnimatingById[comment.id] ? " is-animating" : ""}`} aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <path d="M12 21.35 10.55 20C5.4 15.24 2 12.09 2 8.23 2 5.08 4.42 2.7 7.5 2.7c1.74 0 3.41.82 4.5 2.09 1.09-1.27 2.76-2.09 4.5-2.09 3.08 0 5.5 2.38 5.5 5.53 0 3.86-3.4 7.01-8.55 11.78L12 21.35Z" />
                    </svg>
                  </span>
                  <span>{comment.like_count}</span>
                </button>

                <button
                  type="button"
                  className="community-action-button comment-action-button"
                  onClick={() => {
                    clearCommentError(comment.id);
                    setReplyingTo(showReplyForm ? null : comment.id);
                  }}
                  disabled={!supabase}
                >
                  <span className="comment-action-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      <polyline points="9 17 4 12 9 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M20 18v-2a4 4 0 0 0-4-4H4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span>{text.reply}</span>
                  <span>{comment.reply_count}</span>
                </button>

                <ReportTrigger
                  targetType="comment"
                  targetId={comment.id}
                  buttonLabel={text.report}
                  localeContext={context}
                  loginHref={loginHref}
                  className="community-action-button comment-action-button"
                  compact
                />

                {comment.can_delete ? (
                  <button
                    type="button"
                    className="community-action-button community-action-button--danger community-action-button--compact comment-action-button is-danger"
                    onClick={() => openDeleteModal(comment.id)}
                    disabled={Boolean(deletingId)}
                  >
                    <span className="comment-action-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" focusable="false">
                      <polyline points="3 6 5 6 21 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10 11v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span>{comment.delete_as_staff ? text.moderateDeleteComment : text.delete}</span>
                  </button>
                ) : null}
              </div>

              {commentErrors[comment.id] ? <div className="comment-inline-error">{commentErrors[comment.id]}</div> : null}
            </>
          ) : null}
        </article>

        {replies.length > 0 ? (
          <div className="comment-replies">
            {replies.map((reply) => renderComment(reply, true, path))}
          </div>
        ) : null}

        {showReplyForm ? (
          <div className="comment-reply-form">
            <CommentForm
              postId={postId}
              parentId={comment.id}
              placeholder={text.replyPlaceholder}
              localeContext={context}
              onCommentCreated={(c) => handleCommentCreated(c as Comment)}
              loginHref={loginHref}
              inline
              onCancel={() => setReplyingTo(null)}
            />
          </div>
        ) : null}
      </div>
    );
  };

  // The anonymous server snapshot remains visible until the existing island
  // hydrates and obtains interaction permissions. No invented reaction counts.
  if (loading && children) return <div data-public-comment-snapshot>{children}</div>;
  return (
    <section className="comment-shell" aria-label={text.commentsArea}>
      <CommentForm
        localeContext={context}
        postId={postId}
        loginHref={loginHref}
        onCommentCreated={(c) => handleCommentCreated(c as Comment)}
      />

      <h2 className="comment-panel__title" style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        {text.comments}
        {!loading ? <span className="comment-count">{totalCount}</span> : null}
      </h2>
      {deleteNotice ? <div role="status">{deleteNotice}</div> : null}

      {loading ? <div className="comment-empty">{text.loadingComments}</div> : null}

      {error ? (
        <div className="glass-card comment-card auth-alert auth-alert--error" style={{ textAlign: "center" }}>
          {error}
        </div>
      ) : null}

      {!loading && !error && topLevelComments.length === 0 ? (
        <div className="comment-empty">{text.noComments}</div>
      ) : null}

      {!loading && !error && topLevelComments.length > 0 ? (
        <div className="comment-list">
          {topLevelComments.map((comment) => renderComment(comment, false))}
        </div>
      ) : null}

      <GlassConfirmDialog
        open={Boolean(deleteTargetId)}
        localeContext={context}
        title={text.deleteComment}
        description={comments.find((c) => c.id === deleteTargetId)?.delete_as_staff ? text.moderateDeleteCommentDetail : text.deleteCommentDetail}
        detail={text.irreversible}
        confirmLabel={text.confirmDelete}
        cancelLabel={text.cancel}
        danger
        loading={Boolean(deletingId)}
        error={deleteError}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={closeDeleteModal}
      />
    </section>
  );
}
