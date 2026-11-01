import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { localizeAdminSessionMessage } from "../../lib/i18n/messages/admin";
import { useLocale } from "../i18n/useLocale";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdminApiError, adminFetch } from "../../lib/admin-api-client";
import { createOptimizedImageVariant } from "../../lib/client-image";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { useAdminSession } from "./useAdminSession";
import GlassConfirmDialog from "../common/GlassConfirmDialog";

type NewsStatus = "draft" | "published" | "archived";
type NewsCategory =
  | "industry"
  | "devices"
  | "ai_glasses"
  | "ar_glasses"
  | "developer"
  | "community"
  | "openglass";

type AdminNewsArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  cover_image_url: string | null;
  category: NewsCategory;
  source_name: string | null;
  source_url: string | null;
  status: NewsStatus;
  author_id: string | null;
  pinned: boolean;
  featured: boolean;
  view_count: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AdminNewsPayload = {
  ok?: boolean;
  articles?: AdminNewsArticle[];
  article?: AdminNewsArticle | null;
  message?: string;
  error?: string;
};

type FormState = {
  id?: string;
  title: string;
  slug: string;
  category: NewsCategory;
  summary: string;
  content: string;
  cover_image_url: string;
  source_name: string;
  source_url: string;
  pinned: boolean;
  featured: boolean;
  status: NewsStatus;
  published_at: string;
};

type SaveAction = "save" | "draft" | "publish" | "archive" | null;

export default function AdminNewsDashboard({ localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { localeContext?: LocaleContext } = {}) {
  const { context } = useLocale(localeContext);
  const locale = context.locale;
  const text = getUiMessages(locale).admin;
  const EMPTY_FORM: FormState = {
    title: "",
    slug: "",
    category: "industry",
    summary: "",
    content: "",
    cover_image_url: "",
    source_name: "Lensden",
    source_url: "",
    pinned: false,
    featured: false,
    status: "draft",
    published_at: "",
  };

  const CATEGORY_OPTIONS: Array<{ value: NewsCategory; label: string }> = [
    { value: "industry", label: text.copy.featuredIndustry },
    { value: "devices", label: text.copy.devices },
    { value: "ai_glasses", label: text.copy.aIGlasses },
    { value: "ar_glasses", label: text.copy.aRGlasses },
    { value: "developer", label: text.copy.developers },
    { value: "community", label: text.copy.community },
    { value: "openglass", label: "Lensden" },
  ];

  const STATUS_OPTIONS: Array<{ value: "all" | NewsStatus; label: string }> = [
    { value: "all", label: text.copy.all },
    { value: "draft", label: text.copy.draft },
    { value: "published", label: text.copy.published },
    { value: "archived", label: text.copy.archived },
  ];

  const ADMIN_CATEGORY_OPTIONS: Array<{ value: "all" | NewsCategory; label: string }> = [
    { value: "all", label: text.copy.allCategories },
    ...CATEGORY_OPTIONS,
  ];

  function slugifyDraftTitle(title: string) {
    const latinBase = title
      .trim()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

    if (latinBase) return latinBase;

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `news-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  }

  function normalizeFileName(fileName: string) {
    return fileName
      .toLowerCase()
      .replace(/[^a-z0-9.\-_]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function normalizeUrlDraft(value: string) {
    const text = value.trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;
    if (/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(text)) {
      return `https://${text}`;
    }
    return text;
  }

  function isNewsStoragePath(value: string) {
    return value.startsWith("news-covers/") || value.startsWith("news-content/");
  }

  function toFormState(article?: AdminNewsArticle | null): FormState {
    if (!article) return { ...EMPTY_FORM };
    return {
      id: article.id,
      title: article.title,
      slug: article.slug,
      category: article.category,
      summary: article.summary ?? "",
      content: article.content ?? "",
      cover_image_url: article.cover_image_url ?? "",
      source_name: article.source_name ?? "Lensden",
      source_url: article.source_url ?? "",
      pinned: article.pinned,
      featured: article.featured,
      status: article.status,
      published_at: article.published_at ? article.published_at.slice(0, 16) : "",
    };
  }

  function statusLabel(status: NewsStatus) {
    if (status === "published") return text.copy.published;
    if (status === "archived") return text.copy.archived;
    return text.copy.draft;
  }

  function categoryLabel(category: NewsCategory) {
    return CATEGORY_OPTIONS.find((item) => item.value === category)?.label ?? category;
  }

  function successLabel(action: SaveAction, fallbackStatus: NewsStatus) {
    if (action === "publish") return text.copy.published;
    if (action === "archive") return text.copy.archived;
    if (action === "draft" || fallbackStatus === "draft") return text.copy.draftSaved;
    return text.copy.saved;
  }

  function pendingLabel(action: SaveAction) {
    if (action === "draft" || action === "save") return text.copy.saving;
    if (action === "publish") return text.copy.publishing;
    if (action === "archive") return text.copy.archiving;
    return "";
  }

  function normalizeActionError(error: unknown) {
    if (error instanceof AdminApiError) {
      if (error.status === 401) return text.copy.yourSessionHasExpiredSignInAgain;
      if (error.status === 403) return text.copy.thisAccountHasNoAdministratorAccess;
      return error.message || text.copy.actionFailedPleaseTryAgainLater;
    }
    if (error instanceof Error && error.message.trim()) {
      return error.message;
    }
    return text.copy.actionFailedPleaseTryAgainLater;
  }

  function bodyImageMarkdown(alt: string, url: string) {
    return `![${alt || "图片"}](${url})`;
  }

  function defaultImageAltText(fileName: string) {
    return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim() || "图片";
  }

  const adminSession = useAdminSession();
  const [statusFilter, setStatusFilter] = useState<"all" | NewsStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | NewsCategory>("all");
  const [searchDraft, setSearchDraft] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [articles, setArticles] = useState<AdminNewsArticle[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [loading, setLoading] = useState(false);
  const [saveAction, setSaveAction] = useState<SaveAction>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [slugEditedManually, setSlugEditedManually] = useState(false);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [coverPreviewBroken, setCoverPreviewBroken] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [contentUploading, setContentUploading] = useState(false);
  const [contentImagePanelOpen, setContentImagePanelOpen] = useState(false);
  const [contentImageUrl, setContentImageUrl] = useState("");
  const [contentImageAlt, setContentImageAlt] = useState("");
  const [contentImageError, setContentImageError] = useState("");

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const contentInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isDev = import.meta.env.DEV;

  const selectedArticle = useMemo(
    () => articles.find((article) => article.id === selectedId) ?? null,
    [articles, selectedId],
  );

  async function loadArticles() {
    if (!adminSession.session) return;
    setLoading(true);
    setError("");
    try {
      const payload = await adminFetch<AdminNewsPayload>(
        `/api/admin/news?status=${encodeURIComponent(statusFilter)}&category=${encodeURIComponent(categoryFilter)}&search=${encodeURIComponent(searchFilter)}&limit=120`,
        {
          method: "GET",
          session: adminSession.session,
        },
      );

      const nextArticles = payload.articles ?? [];
      setArticles(nextArticles);
      if (selectedId) {
        const nextSelected = nextArticles.find((item) => item.id === selectedId) ?? null;
        if (nextSelected) {
          setForm(toFormState(nextSelected));
        }
      }
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        adminSession.setState({
          status: "signed_out",
          message: text.copy.yourSessionExpiredSignInAgain,
          details: `api status code: 401 | error message: ${requestError.message}`,
        });
        return;
      }
      if (requestError instanceof AdminApiError && requestError.status === 403) {
        adminSession.setState({
          status: "forbidden",
          message: text.copy.thisAccountDoesNotHaveAdministratorAccess,
          details:
            typeof requestError.details === "string"
              ? requestError.details
              : `api status code: 403 | error message: ${requestError.message}`,
        });
        return;
      }
      setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadNews);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (adminSession.state.status !== "ready" || !adminSession.session) return;
    void loadArticles();
  }, [adminSession.session, adminSession.state.status, statusFilter, categoryFilter, searchFilter]);

  useEffect(() => {
    if (!adminSession.supabase) return;
    const coverValue = form.cover_image_url.trim();
    setCoverPreviewBroken(false);

    if (!coverValue) {
      setCoverPreviewUrl("");
      return;
    }

    if (!isNewsStoragePath(coverValue)) {
      setCoverPreviewUrl(normalizeUrlDraft(coverValue));
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data, error: signedError } = await adminSession.supabase!.storage
        .from("post-media")
        .createSignedUrl(coverValue, 60 * 60);

      if (cancelled) return;
      if (signedError || !data?.signedUrl) {
        setCoverPreviewUrl("");
        setCoverPreviewBroken(true);
        return;
      }

      setCoverPreviewUrl(data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [adminSession.supabase, form.cover_image_url]);

  function upsertLocalArticle(article: AdminNewsArticle) {
    setArticles((current) => {
      const index = current.findIndex((item) => item.id === article.id);
      if (index === -1) return [article, ...current];
      const next = [...current];
      next[index] = article;
      return next;
    });
  }

  function startNewArticle() {
    setSelectedId("");
    setForm({ ...EMPTY_FORM });
    setSlugEditedManually(false);
    setShowAdvanced(false);
    setError("");
    setSuccess("");
    setContentImagePanelOpen(false);
    setContentImageError("");
  }

  function selectArticle(article: AdminNewsArticle) {
    setSelectedId(article.id);
    setForm(toFormState(article));
    setSlugEditedManually(true);
    setError("");
    setSuccess("");
    setContentImagePanelOpen(false);
    setContentImageError("");
  }

  function patchForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function logAction(event: string, details?: Record<string, unknown>) {
    if (!isDev) return;
    console.debug(`[admin-news] ${event}`, details ?? {});
  }

  function applySearchFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchFilter(searchDraft.trim());
  }

  function handleTitleChange(nextTitle: string) {
    setForm((current) => ({
      ...current,
      title: nextTitle,
      slug: slugEditedManually ? current.slug : slugifyDraftTitle(nextTitle),
    }));
  }

  function handleSlugChange(nextSlug: string) {
    setSlugEditedManually(true);
    patchForm("slug", nextSlug.toLowerCase());
  }

  function insertIntoContent(markdown: string) {
    const textarea = textareaRef.current;
    if (!textarea) {
      patchForm("content", `${form.content}${form.content.endsWith("\n") || !form.content ? "" : "\n"}${markdown}`);
      return;
    }

    const start = textarea.selectionStart ?? form.content.length;
    const end = textarea.selectionEnd ?? form.content.length;
    const nextValue = `${form.content.slice(0, start)}${markdown}${form.content.slice(end)}`;
    patchForm("content", nextValue);

    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + markdown.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function uploadNewsAsset(file: File, prefix: "news-covers" | "news-content") {
    if (!adminSession.me?.user_id || !adminSession.accessToken) {
      throw new Error(text.copy.yourSessionExpiredSignInAgain);
    }

    const optimizedFile = /^image\/(jpeg|png|webp)$/i.test(file.type)
      ? (await createOptimizedImageVariant(file, {
          maxWidth: prefix === "news-covers" ? 1600 : 1400,
          quality: prefix === "news-covers" ? 0.82 : 0.8,
        })).file
      : file;

    const objectPath = `${prefix}/${adminSession.me.user_id}/${Date.now()}-${normalizeFileName(optimizedFile.name || file.name)}`;
    await uploadToPostMediaWithTus({
      file: optimizedFile,
      objectPath,
      accessToken: adminSession.accessToken,
    });
    return objectPath;
  }

  async function handleCoverUpload(file: File | null) {
    if (!file) return;
    setCoverUploading(true);
    setError("");
    setSuccess("");
    try {
      const objectPath = await uploadNewsAsset(file, "news-covers");
      patchForm("cover_image_url", objectPath);
      setSuccess(text.copy.coverUploaded);
    } catch {
      setError(text.copy.coverUploadFailedTryAgainLater);
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  }

  async function handleContentImageUpload(file: File | null) {
    if (!file) return;
    setContentUploading(true);
    setContentImageError("");
    try {
      const objectPath = await uploadNewsAsset(file, "news-content");
      insertIntoContent(`${bodyImageMarkdown(defaultImageAltText(file.name), objectPath)}\n`);
      setSuccess(text.copy.bodyImageInserted);
    } catch {
      setContentImageError(text.copy.bodyImageUploadFailedTryAgainLater);
    } finally {
      setContentUploading(false);
      if (contentInputRef.current) contentInputRef.current.value = "";
    }
  }

  function insertImageFromUrl() {
    const normalizedUrl = normalizeUrlDraft(contentImageUrl);
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      setContentImageError("请输入有效的图片链接");
      return;
    }
    insertIntoContent(`${bodyImageMarkdown(contentImageAlt.trim() || "图片", normalizedUrl)}\n`);
    setContentImageUrl("");
    setContentImageAlt("");
    setContentImageError("");
    setContentImagePanelOpen(false);
  }

  async function saveArticle(nextStatus?: NewsStatus, action?: SaveAction) {
    if (!adminSession.session) {
      setError(text.copy.yourSessionHasExpiredSignInAgain);
      setSuccess("");
      return;
    }
    const finalAction = action ?? "save";
    setSaveAction(finalAction);
    setError("");
    setSuccess("");
    logAction("mutation:start", {
      action: finalAction,
      hasId: Boolean(form.id),
      status: nextStatus ?? form.status,
      hasTitle: Boolean(form.title.trim()),
    });

    try {
      const body = {
        ...form,
        source_url: normalizeUrlDraft(form.source_url),
        cover_image_url: form.cover_image_url.trim(),
        status: nextStatus ?? form.status,
        published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
      };

      const payload = form.id
        ? await adminFetch<AdminNewsPayload>("/api/admin/news", {
            method: "PATCH",
            session: adminSession.session,
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ ...body, id: form.id }),
          })
        : await adminFetch<AdminNewsPayload>("/api/admin/news", {
            method: "POST",
            session: adminSession.session,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });

      logAction("mutation:response", {
        action: finalAction,
        ok: payload.ok ?? true,
        message: payload.message ?? null,
        articleId: payload.article?.id ?? null,
      });

      const article = payload.article ?? null;
      if (article) {
        setSelectedId(article.id);
        setForm(toFormState(article));
        setSlugEditedManually(true);
        upsertLocalArticle(article);
      }

      setSuccess(payload.message || successLabel(finalAction, nextStatus ?? form.status));
      await loadArticles();
    } catch (requestError) {
      logAction("mutation:error", {
        action: finalAction,
        message: requestError instanceof Error ? requestError.message : String(requestError),
      });
      setError(normalizeActionError(requestError));
    } finally {
      setSaveAction(null);
    }
  }

  async function deleteArticle() {
    if (!adminSession.session) {
      setError(text.copy.yourSessionHasExpiredSignInAgain);
      setSuccess("");
      return;
    }
    if (!form.id) {
      setError(text.copy.noNewsArticleSelectedForDeletion);
      setSuccess("");
      return;
    }
    setDeleting(true);
    setError("");
    setSuccess("");
    logAction("delete:start", { id: form.id });
    try {
      const payload = await adminFetch<AdminNewsPayload>(`/api/admin/news?id=${encodeURIComponent(form.id)}`, {
        method: "DELETE",
        session: adminSession.session,
      });
      logAction("delete:response", {
        ok: payload.ok ?? true,
        message: payload.message ?? null,
        id: form.id,
      });
      setConfirmDeleteOpen(false);
      setSelectedId("");
      setForm({ ...EMPTY_FORM });
      setSlugEditedManually(false);
      setSuccess(payload.message || text.copy.deleted);
      setArticles((current) => current.filter((item) => item.id !== form.id));
    } catch (requestError) {
      logAction("delete:error", {
        message: requestError instanceof Error ? requestError.message : String(requestError),
      });
      setError(normalizeActionError(requestError));
    } finally {
      setDeleting(false);
    }
  }

  if (adminSession.state.status === "checking") {
    return <div className="community-empty"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong></div>;
  }

  if (adminSession.state.status === "signed_out" || adminSession.state.status === "forbidden" || adminSession.state.status === "error" || adminSession.state.status === "timeout") {
    return (
      <div className="community-empty admin-state-message admin-error">
        <strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>
        {"details" in adminSession.state && adminSession.state.details ? (
          <p className="admin-debug-note">{adminSession.state.details}</p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="community-surface admin-news-dashboard">
      <div className="community-stream-head">
        <div>
          <h2>{text.copy.newsPublishing}</h2>
          <p>{text.copy.createIllustratePublishAndArchiveNewsArticles}</p>
        </div>
        <div className="community-cta-row">
          <button type="button" className="community-button" onClick={startNewArticle}>
            {text.copy.newArticle}</button>
        </div>
      </div>

      <div className="admin-user-line">
        {text.copy.currentAdministrator}{adminSession.me?.profile?.display_name || adminSession.me?.profile?.username || adminSession.me?.user_id} {text.copy.role}{adminSession.me?.role}
      </div>

      {error ? <div className="admin-error">{error}</div> : null}
      {success ? <div className="admin-inline-success">{success}</div> : null}

      <div className="admin-news-toolbar">
        <div className="admin-news-toolbar__filters">
          <div className="admin-news-toolbar__group">
            <span className="admin-news-toolbar__label">{text.copy.status}</span>
            <div className="admin-news-toolbar__chips">
              {STATUS_OPTIONS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={statusFilter === item.value ? "community-button" : "community-button--secondary"}
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="community-form-field admin-news-toolbar__select">
            <span>{text.copy.category}</span>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "all" | NewsCategory)}>
              {ADMIN_CATEGORY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <form className="admin-news-toolbar__search" onSubmit={applySearchFilter}>
          <label className="community-form-field">
            <span>{text.copy.search}</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={text.copy.titleOrSlug}
            />
          </label>
          <div className="admin-news-toolbar__search-actions">
            <button type="submit" className="community-button">{text.copy.filter}</button>
            <button
              type="button"
              className="community-button--secondary"
              onClick={() => {
                setSearchDraft("");
                setSearchFilter("");
              }}
            >
              {text.copy.clear2}</button>
          </div>
        </form>
      </div>

      <div className="admin-news-dashboard__grid">
        <div className="admin-news-dashboard__list">
          <div className="admin-news-dashboard__list-head">
            <div>
              <strong>{text.copy.articles}</strong>
              <p>{text.copy.newestUpdatesFirstFilterByStatusCategoryTitleOr}</p>
            </div>
            <span className="community-tag">{articles.length} {text.copy.articles2}</span>
          </div>

          {loading ? <p className="community-meta">{text.copy.loadingArticles}</p> : null}
          {articles.length === 0 && !loading ? (
            <div className="community-empty">
              <strong>{text.copy.noArticles}</strong>
              <p>{text.copy.createTheFirstArticle}</p>
            </div>
          ) : null}

          {articles.map((article) => (
            <button
              key={article.id}
              type="button"
              className={`admin-news-card${selectedId === article.id ? " is-active" : ""}`}
              onClick={() => selectArticle(article)}
            >
              <div className="admin-news-card__meta">
                <span className="community-tag">{categoryLabel(article.category)}</span>
                <span className={`admin-news-status-pill admin-news-status-pill--${article.status}`}>{statusLabel(article.status)}</span>
              </div>
              <strong>{article.title}</strong>
              {article.summary ? <p>{article.summary}</p> : null}
              <div className="community-inline-meta">
                <span>{article.published_at ? new Date(article.published_at).toLocaleString(locale) : text.copy.unpublished}</span>
                <span>{text.copy.updated}{new Date(article.updated_at).toLocaleString(locale)}</span>
                <span>{article.view_count} {text.copy.views}</span>
                {article.featured ? <span>{text.copy.featured}</span> : null}
                {article.pinned ? <span>{text.copy.pinned}</span> : null}
              </div>
            </button>
          ))}
        </div>

        <form
          className="admin-news-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveArticle(undefined, "save");
          }}
        >
          <div className="admin-news-form__head">
            <div>
              <strong>{form.id ? text.copy.editArticle : text.copy.newArticle}</strong>
              <p>{text.copy.editTheTitleCoverBodyAndPublicationSettingsPublishing}</p>
            </div>
            <div className="admin-news-form__head-meta">
              <span className={`admin-news-status-pill admin-news-status-pill--${form.status}`}>{statusLabel(form.status)}</span>
              {selectedArticle?.published_at ? <span className="community-meta">{text.copy.published2}{new Date(selectedArticle.published_at).toLocaleString(locale)}</span> : null}
              {selectedArticle ? <span className="community-meta">{text.copy.updated}{new Date(selectedArticle.updated_at).toLocaleString(locale)}</span> : null}
            </div>
          </div>

          <section className="admin-news-form__section">
            <div className="admin-news-form__section-head">
              <div>
                <strong>{text.copy.basicInformation}</strong>
                <p>{text.copy.theTitleGeneratesAnArticleURLPreviewAutomatically}</p>
              </div>
              <button
                type="button"
                className="community-action-button community-action-button--compact community-action-button--muted"
                onClick={() => {
                  setSlugEditedManually(false);
                  patchForm("slug", slugifyDraftTitle(form.title));
                }}
              >
                {text.copy.generatedFromTitle}</button>
            </div>

            <label className="community-form-field">
              <span>{text.copy.title}</span>
              <input value={form.title} onChange={(event) => handleTitleChange(event.target.value)} placeholder={text.copy.enterAnArticleTitle} />
            </label>

            <label className="community-form-field">
              <span>{text.copy.articleURLPreview}</span>
              <div className="admin-news-slug-preview">/news/{form.slug || slugifyDraftTitle(form.title) || "news-..."}/</div>
              <small className="community-meta">{text.copy.usedInTheArticleURLCanBeGeneratedAutomatically}</small>
            </label>

            <label className="community-form-field">
              <span>{text.copy.summary}</span>
              <textarea value={form.summary} onChange={(event) => patchForm("summary", event.target.value)} rows={4} placeholder={text.copy.summaryForNewsCardsAndTheArticlePage} />
            </label>
          </section>

          <section className="admin-news-form__section">
            <div className="admin-news-form__section-head">
              <div>
                <strong>{text.copy.coverImage}</strong>
                <p>{text.copy.pasteAnImageURLOrUploadAnImage}</p>
              </div>
              <button
                type="button"
                className="community-action-button community-action-button--compact community-action-button--muted"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
              >
                {coverUploading ? text.copy.uploading : text.copy.uploadCover}
              </button>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="admin-news-hidden-input"
              onChange={(event) => void handleCoverUpload(event.target.files?.[0] ?? null)}
            />

            <label className="community-form-field">
              <span>{text.copy.coverURL}</span>
              <input
                value={form.cover_image_url}
                onChange={(event) => patchForm("cover_image_url", event.target.value)}
                onBlur={(event) => patchForm("cover_image_url", normalizeUrlDraft(event.target.value))}
                placeholder={text.copy.httpsOrAnUploadedCoverPath}
              />
            </label>

            {coverPreviewUrl ? (
              <div className="admin-news-cover-preview">
                <img
                  src={coverPreviewUrl}
                  alt={form.title || text.copy.coverPreview}
                  onError={() => setCoverPreviewBroken(true)}
                />
              </div>
            ) : (
              <div className="community-media-placeholder">{text.copy.coverPreviewAppearsHere}</div>
            )}
            {coverPreviewBroken ? <div className="comment-inline-error">{text.copy.coverPreviewUnavailableCheckTheURLOrUploadAgain}</div> : null}
          </section>

          <section className="admin-news-form__section">
            <div className="admin-news-form__section-head">
              <div>
                <strong>{text.copy.articleContent}</strong>
                <p>{text.copy.markdownSupportsParagraphsHeadingsLinksAndImages}</p>
              </div>
              <div className="admin-news-toolbar__search-actions">
                <button
                  type="button"
                  className="community-action-button community-action-button--compact community-action-button--muted"
                  onClick={() => setContentImagePanelOpen((current) => !current)}
                >
                  {text.copy.insertImageURL}</button>
                <button
                  type="button"
                  className="community-action-button community-action-button--compact community-action-button--muted"
                  onClick={() => contentInputRef.current?.click()}
                  disabled={contentUploading}
                >
                  {contentUploading ? text.copy.uploading : text.copy.uploadImage}
                </button>
              </div>
            </div>

            <input
              ref={contentInputRef}
              type="file"
              accept="image/*"
              className="admin-news-hidden-input"
              onChange={(event) => void handleContentImageUpload(event.target.files?.[0] ?? null)}
            />

            {contentImagePanelOpen ? (
              <div className="admin-news-inline-panel">
                <label className="community-form-field">
                  <span>{text.copy.imageURL}</span>
                  <input
                    value={contentImageUrl}
                    onChange={(event) => setContentImageUrl(event.target.value)}
                    onBlur={(event) => setContentImageUrl(normalizeUrlDraft(event.target.value))}
                    placeholder="https://..."
                  />
                </label>
                <label className="community-form-field">
                  <span>{text.copy.imageDescription}</span>
                  <input
                    value={contentImageAlt}
                    onChange={(event) => setContentImageAlt(event.target.value)}
                    placeholder={text.copy.imageDescription}
                  />
                </label>
                <div className="admin-news-inline-panel__actions">
                  <button type="button" className="community-button" onClick={insertImageFromUrl}>
                    {text.copy.insertIntoBody}</button>
                  <button
                    type="button"
                    className="community-button--secondary"
                    onClick={() => {
                      setContentImagePanelOpen(false);
                      setContentImageError("");
                    }}
                  >
                    {text.copy.cancel}</button>
                </div>
                {contentImageError ? <div className="comment-inline-error">{contentImageError}</div> : null}
              </div>
            ) : null}

            <label className="community-form-field">
              <span>{text.copy.body}</span>
              <textarea
                ref={textareaRef}
                value={form.content}
                onChange={(event) => patchForm("content", event.target.value)}
                rows={18}
                placeholder={text.copy.heading1010BodyParagraph1010ImageHttps}
              />
            </label>
          </section>

          <section className="admin-news-form__section">
            <div className="admin-news-form__section-head">
              <div>
                <strong>{text.copy.publicationSettings}</strong>
                <p>{text.copy.leaveThePublicationTimeBlankToUseTheCurrent}</p>
              </div>
              <button
                type="button"
                className="community-action-button community-action-button--compact community-action-button--muted"
                onClick={() => setShowAdvanced((current) => !current)}
              >
                {showAdvanced ? text.copy.hideAdvancedSettings : text.copy.advancedSettings}
              </button>
            </div>

            <div className="admin-news-form__grid">
              <label className="community-form-field">
                <span>{text.copy.category}</span>
                <select value={form.category} onChange={(event) => patchForm("category", event.target.value as NewsCategory)}>
                  {CATEGORY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label className="community-form-field">
                <span>{text.copy.status}</span>
                <select value={form.status} onChange={(event) => patchForm("status", event.target.value as NewsStatus)}>
                  <option value="draft">{text.copy.draft}</option>
                  <option value="published">{text.copy.published}</option>
                  <option value="archived">{text.copy.archived}</option>
                </select>
              </label>
            </div>

            <div className="admin-news-form__checks admin-news-form__checks--stacked">
              <label>
                <input type="checkbox" checked={form.pinned} onChange={(event) => patchForm("pinned", event.target.checked)} />
                <span>
                  <strong>{text.copy.pinToTheTopOfTheNewsList}</strong>
                  <small>{text.copy.publishedPinnedArticlesAppearFirst}</small>
                </span>
              </label>
              <label>
                <input type="checkbox" checked={form.featured} onChange={(event) => patchForm("featured", event.target.checked)} />
                <span>
                  <strong>{text.copy.featureAsTheTopHeadline}</strong>
                  <small>{text.copy.theLatestFeaturedArticleAppearsAtTheTopOf}</small>
                </span>
              </label>
            </div>

            {showAdvanced ? (
              <div className="admin-news-form__advanced">
                <label className="community-form-field">
                  <span>{text.copy.articleSlug}</span>
                  <input
                    value={form.slug}
                    onChange={(event) => handleSlugChange(event.target.value)}
                    placeholder={text.copy.leaveBlankToGenerateFromTheTitle}
                  />
                  <small className="community-meta">{text.copy.useLowercaseLettersNumbersAndHyphensOnly}</small>
                </label>

                <div className="admin-news-form__advanced-row">
                  <label className="community-form-field">
                    <span>{text.copy.customPublicationTime}</span>
                    <input
                      type="datetime-local"
                      value={form.published_at}
                      onChange={(event) => patchForm("published_at", event.target.value)}
                    />
                    <small className="community-meta">{text.copy.leaveBlankToPublishNow}</small>
                  </label>

                  <div className="admin-news-form__helper">
                    <button
                      type="button"
                      className="community-action-button community-action-button--compact community-action-button--muted"
                      onClick={() => patchForm("published_at", "")}
                    >
                      {text.copy.clearTime}</button>
                    <button
                      type="button"
                      className="community-action-button community-action-button--compact community-action-button--muted"
                      onClick={() => {
                        setSlugEditedManually(false);
                        patchForm("slug", slugifyDraftTitle(form.title));
                      }}
                    >
                      {text.copy.regenerateURL}</button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>

          <section className="admin-news-form__section">
            <div className="admin-news-form__section-head">
              <div>
                <strong>{text.copy.sourceInformation}</strong>
                <p>{text.copy.sourceNameAndURLAreOptionalKeepTheDefault}</p>
              </div>
            </div>

            <div className="admin-news-form__grid">
              <label className="community-form-field">
                <span>{text.copy.sourceName}</span>
                <input value={form.source_name} onChange={(event) => patchForm("source_name", event.target.value)} placeholder="Lensden" />
              </label>
              <label className="community-form-field">
                <span>{text.copy.sourceURL}</span>
                <input
                  value={form.source_url}
                  onChange={(event) => patchForm("source_url", event.target.value)}
                  onBlur={(event) => patchForm("source_url", normalizeUrlDraft(event.target.value))}
                  placeholder="https://..."
                />
              </label>
            </div>
          </section>

          <div className="admin-news-form__actions">
            <button type="submit" className="community-button" disabled={saveAction !== null}>
              {saveAction === "save" ? text.copy.savingChanges : text.copy.saveChanges}
            </button>
            <button type="button" className="community-button--secondary" onClick={() => void saveArticle("draft", "draft")} disabled={saveAction !== null}>
              {saveAction === "draft" ? text.copy.savingChanges : text.copy.saveDraft}
            </button>
            <button type="button" className="community-button--secondary" onClick={() => void saveArticle("published", "publish")} disabled={saveAction !== null}>
              {saveAction === "publish" ? text.copy.publishingArticle : text.copy.publish}
            </button>
            <button type="button" className="community-button--secondary" onClick={() => void saveArticle("archived", "archive")} disabled={saveAction !== null || !form.id}>
              {saveAction === "archive" ? text.copy.archivingArticle : text.copy.archive}
            </button>
            <button type="button" className="community-button--secondary" onClick={() => setConfirmDeleteOpen(true)} disabled={!form.id || deleting}>
              {deleting ? text.copy.deleting : text.copy.delete}
            </button>
            {form.slug ? (
              <a href={`/news/${form.slug}/`} target="_blank" rel="noreferrer" className="community-action-button">
                {text.copy.preview}</a>
            ) : null}
          </div>

          {saveAction ? <div className="community-meta">{pendingLabel(saveAction)}</div> : null}
        </form>
      </div>

      <GlassConfirmDialog
        open={confirmDeleteOpen}
        title={text.copy.deleteArticle}
        description={text.copy.thisRemovesTheArticleFromTheAdminListAnd}
        detail={form.title || text.copy.confirmDeletionOfThisArticle}
        confirmLabel={text.copy.confirmDelete}
        cancelLabel={text.copy.cancel}
        danger={true}
        loading={deleting}
        error={error}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void deleteArticle()}
      />
    </section>
  );
}
