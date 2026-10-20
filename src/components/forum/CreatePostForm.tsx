import { useEffect, useMemo, useRef, useState } from "react";
import { buildLoginHref } from "../../lib/auth-redirect";
import { createOptimizedImageVariant } from "../../lib/client-image";
import { uploadToPostMediaWithTus } from "../../lib/storage-tus";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useBrowserAuthState } from "../auth/useBrowserAuthState";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { useLocale } from "../i18n/useLocale";
import { localizeCommunityStatus } from "../../lib/i18n/messages/community";
type CommunityMessages = ReturnType<typeof getUiMessages>["community"];

interface CircleOption {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
}

interface LocalMedia {
  id: string;
  file: File;
  thumbnailFile: File | null;
  previewUrl: string;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  sizeBytes: number;
  mimeType: string;
  isCover: boolean;
}

const postTypes = [
  { value: "question" },
  { value: "experience" },
  { value: "review" },
  { value: "dev" },
  { value: "news" },
  { value: "feedback" },
] as const;

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const ACCEPTED_VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE = 150 * 1024 * 1024;
const MAX_MEDIA_COUNT = 6;
const MAX_TOTAL_SIZE = 150 * 1024 * 1024;

function normalizeFileName(fileName: string) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes >= 50 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const totalSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remain = totalSeconds % 60;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function formatDimensions(width: number | null, height: number | null): string {
  if (!width || !height) return "";
  return `${width} × ${height}`;
}

function withSingleCover(items: LocalMedia[], preferredId?: string): LocalMedia[] {
  if (items.length === 0) return items;
  const coverId = preferredId ?? items.find((item) => item.isCover)?.id ?? items[0].id;
  return items.map((item) => ({
    ...item,
    isCover: item.id === coverId,
  }));
}

function readImageMetadata(file: File, previewUrl: string, text: CommunityMessages): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    };
    image.onerror = () => reject(new Error(formatUiMessage(text.imageMetadata, { name: file.name })));
    image.src = previewUrl;
  });
}

function readVideoMetadata(
  file: File,
  previewUrl: string,
  text: CommunityMessages,
): Promise<{ width: number; height: number; durationSeconds: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      resolve({
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : 0,
      });
    };
    video.onerror = () => reject(new Error(formatUiMessage(text.videoMetadata, { name: file.name })));
    video.src = previewUrl;
  });
}

function mapAuthError(errorMessage: string, text: CommunityMessages): string {
  if (/RATE_LIMITED/i.test(errorMessage)) return text.actionRateLimited;
  if (/TURNSTILE_REQUIRED|TURNSTILE_INVALID/i.test(errorMessage)) {
    return text.uploadVerification;
  }
  if (/CONTENT_REJECTED/i.test(errorMessage)) {
    return text.postRejected;
  }
  if (/INVALID_POST_BODY/i.test(errorMessage)) return text.invalidPostBody;
  if (/Invalid login credentials/i.test(errorMessage)) return text.invalidCredentials;
  if (/Email not confirmed/i.test(errorMessage)) return text.emailUnconfirmed;
  if (/User already registered/i.test(errorMessage)) return text.alreadyRegistered;
  if (/exceeded the maximum allowed size/i.test(errorMessage)) {
    return text.videoUploadFailed;
  }
  return errorMessage;
}

function presentVideoUploadError(message: string, text: CommunityMessages): string {
  const initialization = /^视频上传初始化失败 \((\d+)\)$/.exec(message);
  if (initialization) return `${text.videoInitFailed} (${initialization[1]})`;
  const upload = /^视频上传失败 \((\d+)\)$/.exec(message);
  return upload ? `${text.videoUploadFailed} (${upload[1]})` : message;
}

async function uploadVideoToExternal(params: {
  accessToken: string;
  postId: string;
  file: File;
}): Promise<{ mediaUrl: string; storagePath: string }> {
  const { accessToken, postId, file } = params;
  const ticketResponse = await fetch("/api/forum/external-video-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      post_id: postId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    }),
  });

  const ticketPayload = (await ticketResponse.json().catch(() => null)) as
    | {
        error?: string;
        code?: string;
        upload_url?: string;
        media_url?: string;
        storage_path?: string;
      }
    | null;

  if (
    !ticketResponse.ok ||
    !ticketPayload?.upload_url ||
    !ticketPayload.media_url ||
    !ticketPayload.storage_path
  ) {
    throw new Error(
      ticketPayload?.code
        ? `${ticketPayload.code}: ${ticketPayload?.error ?? ""}`
        : ticketPayload?.error ?? `视频上传初始化失败 (${ticketResponse.status})`,
    );
  }

  const uploadResponse = await fetch(ticketPayload.upload_url, {
    method: "PUT",
    headers: {
      "content-type": file.type || "application/octet-stream",
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(errorText || `视频上传失败 (${uploadResponse.status})`);
  }

  return { mediaUrl: ticketPayload.media_url, storagePath: ticketPayload.storage_path };
}

type Props = {
  localeContext?: LocaleContext;
  initialTitle?: string;
  initialBody?: string;
  nextPath?: string;
  discussionDeviceName?: string;
};

export default function CreatePostForm({
  initialTitle = "",
  initialBody = "",
  nextPath = "/posts/new/",
  discussionDeviceName,
  localeContext = resolveLocale({ acceptLanguage: "zh-CN" }),
}: Props) {
  const { context, messages } = useLocale(localeContext);
  const text = messages.community;
  const localizedPostTypes = postTypes.map(item => ({ ...item, label: text.composerTypes[item.value], description: text.composerTypeHints[item.value] }));
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const circlePickerRef = useRef<HTMLDivElement | null>(null);
  const circleButtonRef = useRef<HTMLButtonElement | null>(null);
  const mediaFilesRef = useRef<LocalMedia[]>([]);
  const submitLockRef = useRef(false);
  const unresolvedPostRef = useRef("");
  const [unresolvedPostId, setUnresolvedPostId] = useState("");
  const [circleSlug, setCircleSlug] = useState("");
  const [type, setType] = useState("question");
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [circles, setCircles] = useState<CircleOption[]>([]);
  const [circleMenuOpen, setCircleMenuOpen] = useState(false);
  const [circleActiveIndex, setCircleActiveIndex] = useState(0);
  const [mediaFiles, setMediaFiles] = useState<LocalMedia[]>([]);
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const authState = useBrowserAuthState(supabase);

  useEffect(() => {
    if (!supabase) {
      setError(text.missingPublicAuthConfig);
    }
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function fetchCircles() {
      setLoadingCircles(true);
      try {
        const response = await fetch("/api/forum/circles");
        const payload = (await response.json().catch(() => null)) as
          | { circles?: CircleOption[]; error?: string }
          | null;

        if (cancelled) return;
        if (!response.ok) {
          throw new Error(payload?.error ?? `${text.requestFailed} (${response.status})`);
        }

        const nextCircles = payload?.circles ?? [];
        setCircles(nextCircles);
        if (nextCircles[0] && !circleSlug) {
          setCircleSlug(nextCircles[0].slug);
          setCircleActiveIndex(0);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : text.circlesFailed);
        }
      } finally {
        if (!cancelled) {
          setLoadingCircles(false);
        }
      }
    }

    fetchCircles();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    mediaFilesRef.current = mediaFiles;
  }, [mediaFiles]);

  useEffect(() => {
    if (!circleMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!circlePickerRef.current?.contains(event.target as Node)) {
        setCircleMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCircleMenuOpen(false);
        circleButtonRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [circleMenuOpen]);

  useEffect(() => {
    return () => {
      mediaFilesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  async function guardDirectMediaUpload(params: {
    accessToken: string;
    sizeBytes: number;
    uploadKind: "post_media" | "circle_cover";
  }) {
    const response = await fetch("/api/forum/media-upload-guard", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify({
        upload_kind: params.uploadKind,
        size_bytes: params.sizeBytes,
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

  async function addMediaFiles(fileList: FileList | File[]) {
    const nextFiles = Array.from(fileList);
    if (!nextFiles.length) return;

    setError("");

    if (mediaFiles.length + nextFiles.length > MAX_MEDIA_COUNT) {
      setError(formatUiMessage(text.maxMedia, { count: MAX_MEDIA_COUNT }));
      return;
    }

    const currentTotalSize = mediaFiles.reduce((sum, item) => sum + item.file.size, 0);
    let videoCount = mediaFiles.filter((item) => item.kind === "video").length;
    let nextTotalSize = currentTotalSize;
    const accepted: LocalMedia[] = [];

    for (const file of nextFiles) {
      const isImage = ACCEPTED_IMAGE_TYPES.has(file.type);
      const isVideo = ACCEPTED_VIDEO_TYPES.has(file.type);
      if (!isImage && !isVideo) {
        setError(text.mediaTypes);
        continue;
      }
      if (isImage && file.size > MAX_IMAGE_SIZE) {
        setError(text.imageMaxSize);
        continue;
      }
      if (isVideo && file.size > MAX_VIDEO_SIZE) {
        setError(text.videoMaxSize);
        continue;
      }
      if (isVideo && videoCount >= 1) {
        setError(text.oneVideo);
        continue;
      }
      nextTotalSize += file.size;
      if (nextTotalSize > MAX_TOTAL_SIZE) {
        setError(text.totalMediaSize);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const id = `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`;

      try {
        if (isVideo) {
          videoCount += 1;
          const metadata = await readVideoMetadata(file, previewUrl, text);
          accepted.push({
            id,
            file,
            thumbnailFile: null,
            previewUrl,
            kind: "video",
            width: metadata.width,
            height: metadata.height,
            durationSeconds: metadata.durationSeconds,
            sizeBytes: file.size,
            mimeType: file.type,
            isCover: false,
          });
        } else {
          URL.revokeObjectURL(previewUrl);
          const optimizedUpload = await createOptimizedImageVariant(file, {
            maxWidth: 1600,
            quality: 0.82,
          });
          const optimizedThumb = await createOptimizedImageVariant(file, {
            maxWidth: 480,
            quality: 0.72,
            fileName: `${file.name.replace(/\.[a-z0-9]+$/i, "")}-thumb`,
          });
          const optimizedPreviewUrl = URL.createObjectURL(optimizedUpload.file);
          const metadata = await readImageMetadata(optimizedUpload.file, optimizedPreviewUrl, text);
          accepted.push({
            id,
            file: optimizedUpload.file,
            thumbnailFile: optimizedThumb.file !== optimizedUpload.file ? optimizedThumb.file : null,
            previewUrl: optimizedPreviewUrl,
            kind: "image",
            width: optimizedUpload.width || metadata.width,
            height: optimizedUpload.height || metadata.height,
            durationSeconds: null,
            sizeBytes: optimizedUpload.file.size,
            mimeType: optimizedUpload.mimeType || optimizedUpload.file.type,
            isCover: false,
          });
        }
      } catch (metadataError) {
        URL.revokeObjectURL(previewUrl);
        setError(metadataError instanceof Error ? metadataError.message : text.metadataFailed);
      }
    }

    if (accepted.length > 0) {
      setMediaFiles((current) => withSingleCover([...current, ...accepted]));
    }
  }

  function removeMedia(id: string) {
    setMediaFiles((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return withSingleCover(current.filter((item) => item.id !== id));
    });
  }

  function markAsCover(id: string) {
    setMediaFiles((current) => withSingleCover(current, id));
  }

  function selectCircle(slug: string) {
    const nextIndex = circles.findIndex((circle) => circle.slug === slug);
    setCircleSlug(slug);
    setCircleActiveIndex(nextIndex >= 0 ? nextIndex : 0);
    setCircleMenuOpen(false);
    circleButtonRef.current?.focus();
  }

  async function rollbackPendingPost(token: string, postId: string) {
    await fetch(`/api/forum/posts?id=${encodeURIComponent(postId)}`, {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${token}`,
      },
    }).catch(() => undefined);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase || submitLockRef.current || unresolvedPostRef.current) return;

    submitLockRef.current = true;
    setSubmitting(true);
    setError("");
    setMessage("");

    const uploadedPaths: string[] = [];
    let createdPostId = "";
    let accessToken = "";
    let mediaAttachDispatched = false;

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !sessionData.session?.access_token || !sessionData.session.user) {
        window.location.replace(buildLoginHref(nextPath));
        return;
      }

      accessToken = sessionData.session.access_token;

      const createResponse = await fetch("/api/forum/posts", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          circle_slug: circleSlug.trim(),
          type: type.trim(),
          title: title.trim(),
          body: body.trim(),
          has_media: mediaFiles.length > 0,
        }),
      });

      const createPayload = (await createResponse.json().catch(() => null)) as
        | { error?: string; code?: string; post?: { id: string; status: string }; pending_review?: boolean; message?: string }
        | null;

      if (!createResponse.ok || !createPayload?.post?.id) {
        throw new Error(
          createPayload?.code ? `${createPayload.code}: ${createPayload?.error ?? ""}` : createPayload?.error ?? `${text.createPostFailed} (${createResponse.status})`,
        );
      }

      createdPostId = createPayload.post.id;
      const mediaPayload: Array<{
        kind: "image" | "video";
        storage_path?: string;
        url?: string;
        thumbnail_url?: string;
        alt_text?: string;
        sort_order: number;
        width?: number | null;
        height?: number | null;
        duration_seconds?: number | null;
        size_bytes?: number | null;
        mime_type?: string | null;
        is_cover?: boolean;
      }> = [];

      if (mediaFiles.length > 0) {
        for (const [index, item] of mediaFiles.entries()) {
          if (item.kind === "video") {
            try {
              const uploaded = await uploadVideoToExternal({
                accessToken,
                postId: createdPostId,
                file: item.file,
              });
              mediaPayload.push({
                kind: "video",
                storage_path: uploaded.storagePath,
                alt_text: title.trim() || item.file.name,
                sort_order: index,
                width: item.width,
                height: item.height,
                duration_seconds: item.durationSeconds,
                size_bytes: item.sizeBytes,
                mime_type: item.mimeType,
                is_cover: item.isCover,
              });
            } catch (uploadError) {
              const uploadMessage = uploadError instanceof Error ? uploadError.message : text.unknownError;
              const canFallbackToSupabase =
                /Missing required env var: R2_/i.test(uploadMessage) ||
                /视频上传初始化失败 \(500\)/i.test(uploadMessage) ||
                /Failed to fetch/i.test(uploadMessage) ||
                /NetworkError/i.test(uploadMessage) ||
                /Load failed/i.test(uploadMessage);

              if (!canFallbackToSupabase) {
                throw new Error(`${text.videoUploadFailed} ${presentVideoUploadError(uploadMessage, text)}`);
              }

              const fileName = normalizeFileName(item.file.name) || `video-${index + 1}.mp4`;
              const storagePath = `${sessionData.session.user.id}/${createdPostId}/${Date.now()}-${index}-${fileName}`;
              try {
                await guardDirectMediaUpload({
                  accessToken,
                  sizeBytes: item.sizeBytes,
                  uploadKind: "post_media",
                });
                await uploadToPostMediaWithTus({
                  file: item.file,
                  objectPath: storagePath,
                  accessToken,
                });
              } catch (fallbackError) {
                const fallbackMessage =
                  fallbackError instanceof Error ? fallbackError.message : text.unknownError;
                throw new Error(`${text.videoUploadFailed} ${presentVideoUploadError(fallbackMessage, text)}`);
              }
              uploadedPaths.push(storagePath);
              mediaPayload.push({
                kind: "video",
                storage_path: storagePath,
                alt_text: title.trim() || item.file.name,
                sort_order: index,
                width: item.width,
                height: item.height,
                duration_seconds: item.durationSeconds,
                size_bytes: item.sizeBytes,
                mime_type: item.mimeType,
                is_cover: item.isCover,
              });
            }
            continue;
          }

          const fileName = normalizeFileName(item.file.name) || `image-${index + 1}.jpg`;
          const storagePath = `${sessionData.session.user.id}/${createdPostId}/${Date.now()}-${index}-${fileName}`;
          const thumbnailPath = item.thumbnailFile
            ? `${sessionData.session.user.id}/${createdPostId}/thumb-${Date.now()}-${index}-${normalizeFileName(item.thumbnailFile.name || fileName)}`
            : "";
          try {
            await guardDirectMediaUpload({
              accessToken,
              sizeBytes: item.sizeBytes,
              uploadKind: "post_media",
            });
            await uploadToPostMediaWithTus({
              file: item.file,
              objectPath: storagePath,
              accessToken,
            });
            if (item.thumbnailFile && thumbnailPath) {
              await uploadToPostMediaWithTus({
                file: item.thumbnailFile,
                objectPath: thumbnailPath,
                accessToken,
              });
            }
          } catch (uploadError) {
            const uploadMessage = uploadError instanceof Error ? uploadError.message : text.unknownError;
            throw new Error(`${text.imageUploadFailed} ${uploadMessage}`);
          }

          uploadedPaths.push(storagePath);
          if (thumbnailPath) {
            uploadedPaths.push(thumbnailPath);
          }
          mediaPayload.push({
            kind: "image",
            storage_path: storagePath,
            thumbnail_url: thumbnailPath || undefined,
            alt_text: title.trim() || item.file.name,
            sort_order: index,
            width: item.width,
            height: item.height,
            duration_seconds: item.durationSeconds,
            size_bytes: item.sizeBytes,
            mime_type: item.mimeType,
            is_cover: item.isCover,
          });
        }
      }

      if (mediaPayload.length > 0) {
        // Finish serialization before crossing the conservative dispatch boundary.
        const mediaBody = JSON.stringify({ post_id: createdPostId, media: mediaPayload });
        mediaAttachDispatched = true;
        const mediaResponse = await fetch("/api/forum/post-media", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${accessToken}`,
          },
          body: mediaBody,
        });

        const mediaResult = (await mediaResponse.json().catch(() => null)) as
          | {
              media?: unknown[];
              error?: string;
              message?: string;
              reason_code?: string | null;
              post?: { id: string; status?: string | null; moderation_status?: string | null };
              pending_review?: boolean;
              rejected?: boolean;
            }
          | null;
        if (!mediaResponse.ok) {
          throw new Error(mediaResult?.error ?? `${text.mediaWriteFailed} (${mediaResponse.status})`);
        }
        if (!Array.isArray(mediaResult?.media) || mediaResult.media.length !== mediaPayload.length) {
          throw new Error(text.mediaWriteFailed);
        }

        if (mediaResult?.post?.status) {
          createPayload.post.status = mediaResult.post.status;
        }
        if (typeof mediaResult?.pending_review === "boolean") {
          createPayload.pending_review = mediaResult.pending_review;
        }
        if (mediaResult?.message) {
          createPayload.message = mediaResult.message;
        }
        if (
          mediaResult?.pending_review &&
          mediaResult?.reason_code &&
          /video_thumbnail_missing_review|video_thumbnail_required_review|openai_video_thumbnail_missing_review/i.test(
            mediaResult.reason_code,
          )
        ) {
          createPayload.message = text.videoReview;
        }
      }

      mediaFiles.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setTitle("");
      setBody("");
      setMediaFiles([]);

      const createdStatus = createPayload.post.status ?? "published";
      if (createdStatus === "published") {
        setMessage(localizeCommunityStatus(createPayload.message, context.locale) || text.publishedRedirecting);
        window.location.assign(`/posts/${createdPostId}/`);
        return;
      }
      setMessage(localizeCommunityStatus(createPayload.message, context.locale) || (createPayload.pending_review ? text.postReview : text.published));
    } catch (submitError) {
      if (mediaAttachDispatched) {
        // A lost response or later moderation failure can hide a committed row.
        // Keep both storage backends and the post; never resubmit this draft.
        unresolvedPostRef.current = createdPostId;
        setUnresolvedPostId(createdPostId);
        setError("");
        return;
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("post-media").remove(uploadedPaths).catch(() => undefined);
      }
      if (createdPostId && accessToken) {
        await rollbackPendingPost(accessToken, createdPostId);
      }

      const rawMessage = submitError instanceof Error ? submitError.message : text.submitFailed;
      setError(mapAuthError(rawMessage, text));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  if (error && authState.status !== "signed_in" && !loadingCircles) {
    return <section className="post-composer post-composer--status"><div className="auth-alert auth-alert--error">{error}</div></section>;
  }

  if (authState.status === "checking") {
    return <section className="post-composer post-composer--status post-composer--checking"><div className="auth-alert">{text.checkingAuth}</div></section>;
  }

  if (authState.status !== "signed_in") {
    return (
      <section className="post-composer post-composer--status post-composer--signed-out">
        <div className="auth-alert auth-alert--action">
          <a href={buildLoginHref(nextPath)} className="community-link post-composer__auth-link">{text.loginPost}</a>
        </div>
      </section>
    );
  }

  const selectedCircle =
    circles.find((circle) => circle.slug === circleSlug) ??
    circles[0] ??
    null;

  return (
    <section className="post-composer">
      <div className="post-composer__intro">
        <h2>{text.publishPost}</h2>
        {discussionDeviceName ? <p>{formatUiMessage(text.deviceDraft, { name: discussionDeviceName })}</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="post-composer__form">
        <div>
          <label className="post-composer__label">{text.postType}</label>
          <div className="post-type-grid">
            {localizedPostTypes.map((option) => {
              const active = type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setType(option.value)}
                  className={`post-type-option${active ? " is-active" : ""}`}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <label>
          <span className="post-composer__label">{text.circles}</span>
          <div className={`community-select${circleMenuOpen ? " is-open" : ""}${loadingCircles ? " is-disabled" : ""}`} ref={circlePickerRef}>
            <input type="hidden" name="circle_slug" value={circleSlug} />
            <button
              ref={circleButtonRef}
              type="button"
              className="community-select__trigger"
              onClick={() => {
                if (loadingCircles || circles.length === 0) return;
                setCircleMenuOpen((current) => !current);
              }}
              disabled={loadingCircles || circles.length === 0}
              aria-haspopup="listbox"
              aria-expanded={circleMenuOpen}
            >
              <span className="community-select__content">
                <strong>{selectedCircle?.name ?? (loadingCircles ? text.loadingCircles : text.noAvailableCircles)}</strong>
                <span>{selectedCircle?.description || text.chooseCircle}</span>
              </span>
              <span className="community-select__chevron" aria-hidden="true">⌄</span>
            </button>
            {circleMenuOpen ? (
              <div className="community-select__menu" role="listbox" aria-label={text.circleList}>
                {circles.map((circle, index) => {
                  const active = circle.slug === circleSlug;
                  return (
                    <button
                      key={circle.id}
                      type="button"
                      className={`community-select__option${active ? " is-selected" : ""}${circleActiveIndex === index ? " is-active" : ""}`}
                      onClick={() => selectCircle(circle.slug)}
                      onMouseEnter={() => setCircleActiveIndex(index)}
                      role="option"
                      aria-selected={active}
                    >
                      <strong>{circle.name}</strong>
                      <span>{circle.description || circle.slug}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </label>

        <label>
          <span className="post-composer__label">{text.title}</span>
          <input
            className="community-input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={3}
            maxLength={180}
            required
          />
        </label>

        <label>
          <span className="post-composer__label">{text.body}</span>
          <textarea
            className="community-input community-input--textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={50000}
          />
        </label>

        <div className="media-upload-block">
          <div className="post-composer__label-row">
            <span className="post-composer__label">{text.mediaFiles}</span>
          </div>
          <button
            type="button"
            className="media-dropzone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files) {
                addMediaFiles(event.dataTransfer.files);
              }
            }}
          >
            <strong>{text.dropMedia}</strong>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/mp4,video/webm,video/quicktime"
            multiple
            hidden
            onChange={async (event) => {
              if (event.target.files) {
                await addMediaFiles(event.target.files);
                event.target.value = "";
              }
            }}
          />
          {mediaFiles.length > 0 && (
            <div className="media-preview-grid">
              {mediaFiles.map((item) => (
                <figure key={item.id} className="media-preview-card">
                  <div className="media-preview-card__visual">
                    {item.kind === "video" ? (
                      <video src={item.previewUrl} muted playsInline preload="metadata" />
                    ) : (
                      <img src={item.previewUrl} alt={item.file.name} />
                    )}
                    {item.kind === "video" ? <span className="media-preview-card__badge">{text.video}</span> : null}
                    {item.isCover ? <span className="media-preview-card__badge media-preview-card__badge--cover">{text.cover}</span> : null}
                  </div>
                  <figcaption>
                    <div className="media-preview-card__meta">
                      <strong title={item.file.name}>{item.file.name}</strong>
                      <span>{formatBytes(item.sizeBytes)}</span>
                      <span>
                        {item.kind === "video"
                          ? `${formatDimensions(item.width, item.height) || text.video}${item.durationSeconds != null ? ` · ${formatDuration(item.durationSeconds)}` : ""}`
                          : formatDimensions(item.width, item.height) || text.image}
                      </span>
                    </div>
                    <div className="media-preview-card__actions">
                      <button type="button" onClick={() => markAsCover(item.id)} disabled={item.isCover}>
                        {item.isCover ? text.currentCover : text.setCover}
                      </button>
                      <button type="button" onClick={() => removeMedia(item.id)}>
                        {text.delete}
                      </button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="community-cta-row">
          <button type="submit" className="community-button post-composer__submit" disabled={submitting || loadingCircles || Boolean(unresolvedPostId)}>
            {submitting ? text.submitting : text.submitPost}
          </button>
        </div>
      </form>

      <div className="post-composer__feedback">
        {unresolvedPostId ? (
          <div className="auth-alert auth-alert--error" role="status">
            {text.publicationUnresolved}{" "}
            <a className="community-link" href={`/posts/${unresolvedPostId}/`}>{text.viewSubmittedPost}</a>
          </div>
        ) : null}
        {error ? <div className="auth-alert auth-alert--error">{error}</div> : null}
        {message ? <div className="auth-alert auth-alert--success">{message}</div> : null}
      </div>
    </section>
  );
}
