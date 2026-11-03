import { useEffect, useMemo, useState } from "react";
import { buildLoginHref } from "../../lib/auth-redirect";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { useLocale } from "../i18n/useLocale";
import { localizeCommunityStatus } from "../../lib/i18n/messages/community";

interface CommentFormProps {
  localeContext?: LocaleContext;
  postId: string;
  parentId?: string | null;
  placeholder?: string;
  onCommentCreated?: (comment: unknown) => void;
  loginHref?: string;
  inline?: boolean;
  onCancel?: () => void;
}

export default function CommentForm({
  postId,
  parentId,
  placeholder,
  onCommentCreated,
  loginHref,
  inline,
  onCancel,
  localeContext = resolveLocale({ acceptLanguage: "zh-CN" }),
}: CommentFormProps) {
  const { context, messages } = useLocale(localeContext);
  const text = messages.community;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const resolvedLoginHref = loginHref ?? buildLoginHref(`/posts/${postId}/#comments`);
  const resolvedPlaceholder = placeholder ?? text.writeComment;

  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>(text.commentPublished);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setIsLoggedIn(!!data.session);
    });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    if (success) setSuccess(false);
    if (error) setError("");
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !body.trim()) return;

    setLoading(true);
    setError("");
    setSuccess(false);
    setSuccessMessage(text.commentPublished);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token) {
        throw new Error(text.loginComment);
      }

      const reqBody: Record<string, unknown> = {
        post_id: postId,
        body: body.trim(),
      };
      if (parentId) reqBody.parent_id = parentId;

      const response = await fetch("/api/forum/comments", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify(reqBody),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; code?: string; comment?: Record<string, unknown>; pending_review?: boolean; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          payload?.code ? `${payload.code}: ${payload.error ?? ""}` : payload?.error ?? `${text.requestFailed} (${response.status})`,
        );
      }

      setBody("");
      setSuccess(true);
      setSuccessMessage(localizeCommunityStatus(payload?.message, context.locale) || (payload?.pending_review ? text.commentReview : text.commentPublished));
      onCommentCreated?.(payload?.comment ?? { id: "", post_id: postId, body: body.trim() });
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : text.submitFailed;
      if (/CONTENT_REJECTED/i.test(message)) {
        setError(text.commentRejected);
      } else if (/RATE_LIMITED/i.test(message)) {
        setError(text.commentRateLimited);
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!supabase) {
    return (
      <section className="comment-shell">
        <div className="glass-panel comment-panel comment-panel__login">
          <p className="community-meta">{text.commentUnconfigured}</p>
        </div>
      </section>
    );
  }

  if (isLoggedIn === false) {
    if (inline) return null;
    return (
      <section className="comment-shell">
        <div className="glass-panel comment-panel comment-panel__login">
          <p className="community-meta" style={{ margin: "0 0 0.75rem" }}>
            {text.signInComment}
          </p>
          <a href={resolvedLoginHref} className="community-button">
            {text.goLogin}
          </a>
        </div>
      </section>
    );
  }

  const panelClass = inline
    ? "glass-card comment-panel comment-panel--inline comment-reply-form__panel"
    : "glass-panel comment-panel";
  const Shell = inline ? "div" : "section";

  return (
    <Shell className={inline ? "comment-reply-form" : "comment-shell"}>
      <div className={panelClass}>
        {!inline && <h3 className="comment-panel__title">{text.publishComment}</h3>}
        <form onSubmit={handleSubmit} className="comment-form">
          <textarea
            className="glass-textarea"
            value={body}
            onChange={handleBodyChange}
            placeholder={resolvedPlaceholder}
            minLength={1}
            maxLength={5000}
            required
            rows={inline ? 3 : undefined}
          />
          <div className="comment-form__footer">
            <span className="community-meta">{body.length}/5000</span>
            <div className="comment-form__actions">
              {inline && onCancel ? (
                <button
                  type="button"
                  className="community-action-button community-action-button--muted"
                  onClick={onCancel}
                  disabled={loading}
                >
                  {text.cancelReply}
                </button>
              ) : null}
              <button type="submit" className="community-button" disabled={loading || !body.trim()}>
                {loading ? text.submitting : parentId ? text.publishReply : text.submitComment}
              </button>
            </div>
          </div>
        </form>
        {error && <div className="comment-inline-error">{error}</div>}
        {success && <div className="comment-inline-success">{successMessage}</div>}
      </div>
    </Shell>
  );
}
