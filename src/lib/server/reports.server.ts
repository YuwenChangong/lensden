import type { SupabaseClient } from "@supabase/supabase-js";
import { joinedRecord } from "./joined-record.ts";
import { applyModerationAdminAction, type ModerationAdminTarget } from "./moderation-admin.ts";
import {
  notifyCommentModerated,
  notifyPostModerated,
  type ModerationNotificationWriter,
} from "./moderation-notifications.server.ts";
import { applyUserSafetyAction, insertUserSafetyEvent, sanitizeSafetyReason } from "./user-safety.server.ts";
import { isPublicVisibleCircle } from "../site-navigation.ts";

export type ReportTargetType = "post" | "comment" | "circle" | "user";
export type ReportReasonCode =
  | "spam"
  | "harassment"
  | "hate"
  | "sexual"
  | "violence"
  | "illegal"
  | "off_platform_contact"
  | "misinformation"
  | "privacy"
  | "other";
export type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";
export type ReportPriority = "low" | "normal" | "high";
export type ReportAdminAction =
  | "dismiss"
  | "reviewing"
  | "hide_target"
  | "reject_target"
  | "warn_user"
  | "suspend_user"
  | "ban_user";

type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string | null;
  reason_code: string | null;
  reason_text: string | null;
  status: string | null;
  priority: string | null;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at?: string | null;
};

type ProfilePreview = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type ReportTargetPreview =
  | {
      target_type: "post";
      target_id: string;
      title: string | null;
      excerpt: string;
      status: string | null;
      moderation_status: string | null;
      author_id: string | null;
      author_profile: ProfilePreview | null;
      circle: { id: string; name: string | null; slug: string | null } | null;
    }
  | {
      target_type: "comment";
      target_id: string;
      title: string | null;
      excerpt: string;
      status: string | null;
      moderation_status: string | null;
      author_id: string | null;
      author_profile: ProfilePreview | null;
      post: { id: string; title: string | null; status: string | null } | null;
      circle: { id: string; name: string | null; slug: string | null } | null;
    }
  | {
      target_type: "circle";
      target_id: string;
      title: string | null;
      excerpt: string;
      status: string | null;
      moderation_status: null;
      author_id: string | null;
      author_profile: ProfilePreview | null;
      circle: { id: string; name: string | null; slug: string | null } | null;
    }
  | {
      target_type: "user";
      target_id: string;
      title: string | null;
      excerpt: string;
      status: string | null;
      moderation_status: null;
      author_id: string | null;
      author_profile: ProfilePreview | null;
    };

export type AdminReportQueueItem = {
  id: string;
  reporter_id: string;
  reporter_profile: ProfilePreview | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  reason_code: ReportReasonCode;
  reason_text: string | null;
  status: ReportStatus;
  priority: ReportPriority;
  assigned_to: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string | null;
  target: ReportTargetPreview | null;
  open_count_for_target: number;
};

export type ReportEventRecord = {
  id: string;
  report_id: string;
  actor_id: string | null;
  actor_profile: ProfilePreview | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type UserReportTargetPreview = {
  target_type: ReportTargetType;
  target_id: string;
  title: string | null;
  excerpt: string;
  available: boolean;
};

export const REPORT_TARGET_TYPES: ReportTargetType[] = ["post", "comment", "circle", "user"];
export const REPORT_REASON_CODES: ReportReasonCode[] = [
  "spam",
  "harassment",
  "hate",
  "sexual",
  "violence",
  "illegal",
  "off_platform_contact",
  "misinformation",
  "privacy",
  "other",
];
export const REPORT_PRIORITIES: ReportPriority[] = ["low", "normal", "high"];
export const REPORT_STATUSES: ReportStatus[] = ["open", "reviewing", "actioned", "dismissed"];

const REPORT_REASON_LABELS: Record<ReportReasonCode, string> = {
  spam: "垃圾广告",
  harassment: "骚扰或攻击",
  hate: "仇恨内容",
  sexual: "性相关违规",
  violence: "暴力或威胁",
  illegal: "违法内容",
  off_platform_contact: "站外引流",
  misinformation: "虚假或误导信息",
  privacy: "隐私泄露",
  other: "其他",
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function sanitizeText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function sanitizeReportReasonText(value: unknown): string {
  return sanitizeText(value, 1000);
}

export function sanitizeReportResolutionNote(value: unknown): string {
  return sanitizeText(value, 1000);
}

export function normalizeReportStatus(value: string | null | undefined): ReportStatus {
  if (value === "reviewing" || value === "actioned" || value === "dismissed") return value;
  if (value === "reviewed") return "actioned";
  return "open";
}

export function normalizeReportPriority(value: string | null | undefined): ReportPriority {
  if (value === "low" || value === "high") return value;
  return "normal";
}

export function buildLegacyReason(reasonCode: ReportReasonCode, reasonText: string | null) {
  const label = REPORT_REASON_LABELS[reasonCode] ?? REPORT_REASON_LABELS.other;
  return reasonText ? `${label}：${reasonText}` : label;
}

export function parseUserReportPayload(payload: unknown):
  | {
      ok: true;
      targetType: ReportTargetType;
      targetId: string;
      reasonCode: ReportReasonCode;
      reasonText: string | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  const record = (payload ?? {}) as Record<string, unknown>;
  const targetType = String(record.target_type ?? "").trim() as ReportTargetType;
  const targetId = String(record.target_id ?? "").trim();
  const reasonCode = String(record.reason_code ?? "").trim() as ReportReasonCode;
  const reasonTextRaw = sanitizeReportReasonText(record.reason_text);
  const reasonText = reasonTextRaw || null;

  if (!REPORT_TARGET_TYPES.includes(targetType)) {
    return { ok: false, status: 400, error: "INVALID_REPORT_TARGET_TYPE" };
  }
  if (!isUuid(targetId)) {
    return { ok: false, status: 400, error: "INVALID_REPORT_TARGET_ID" };
  }
  if (!REPORT_REASON_CODES.includes(reasonCode)) {
    return { ok: false, status: 400, error: "INVALID_REPORT_REASON_CODE" };
  }
  if (reasonText && reasonText.length < 5) {
    return { ok: false, status: 400, error: "INVALID_REPORT_REASON_TEXT" };
  }

  return { ok: true, targetType, targetId, reasonCode, reasonText };
}

function excerpt(text: string | null | undefined, limit = 180) {
  return String(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function mapProfilePreview(row: Record<string, unknown> | null | undefined): ProfilePreview | null {
  if (!row) return null;
  return {
    id: String(row.id ?? ""),
    username: typeof row.username === "string" ? row.username : null,
    display_name: typeof row.display_name === "string" ? row.display_name : null,
    avatar_url: typeof row.avatar_url === "string" ? row.avatar_url : null,
    role: typeof row.role === "string" ? row.role : null,
  };
}

export async function resolveReportTargetPreview(
  client: SupabaseClient,
  targetType: ReportTargetType,
  targetId: string,
): Promise<{ exists: boolean; available: boolean; target: ReportTargetPreview | null; error?: string }> {
  if (targetType === "post") {
    const { data, error } = await client
      .from("posts")
      .select("id,title,body,status,moderation_status,author_id,circle_id,profiles:author_id(id,username,display_name,avatar_url,role),circles:circle_id(id,name,slug,status)")
      .eq("id", targetId)
      .maybeSingle();
    if (error) return { exists: false, available: false, target: null, error: error.message };
    if (!data) return { exists: false, available: false, target: null };
    const status = typeof data.status === "string" ? data.status : null;
    const moderationStatus = typeof data.moderation_status === "string" ? data.moderation_status : null;
    const circle = joinedRecord(data.circles);
    return {
      exists: String(data.id ?? "") === targetId,
      available:
        String(data.id ?? "") === targetId &&
        status === "published" &&
        moderationStatus === "published" &&
        circle?.status === "active" &&
        isPublicVisibleCircle(circle),
      target: {
        target_type: "post",
        target_id: data.id,
        title: typeof data.title === "string" ? data.title : null,
        excerpt: excerpt(data.body),
        status,
        moderation_status: moderationStatus,
        author_id: typeof data.author_id === "string" ? data.author_id : null,
        author_profile: mapProfilePreview(joinedRecord(data.profiles)),
        circle: circle
          ? {
              id: String(circle.id ?? ""),
              name: typeof circle.name === "string"
                ? (circle.name as string)
                : null,
              slug: typeof circle.slug === "string"
                ? (circle.slug as string)
                : null,
            }
          : null,
      },
    };
  }

  if (targetType === "comment") {
    const { data, error } = await client
      .from("comments")
      .select("id,body,status,moderation_status,author_id,post_id,profiles:author_id(id,username,display_name,avatar_url,role),posts:post_id(id,title,status,moderation_status,circle_id,circles:circle_id(id,name,slug,status))")
      .eq("id", targetId)
      .maybeSingle();
    if (error) return { exists: false, available: false, target: null, error: error.message };
    if (!data) return { exists: false, available: false, target: null };
    const status = typeof data.status === "string" ? data.status : null;
    const moderationStatus = typeof data.moderation_status === "string" ? data.moderation_status : null;
    const postRow = joinedRecord(data.posts);
    const circleRow = joinedRecord(postRow?.circles);
    return {
      exists: String(data.id ?? "") === targetId,
      available:
        String(data.id ?? "") === targetId &&
        status === "published" &&
        moderationStatus === "published" &&
        typeof postRow?.id === "string" &&
        postRow.id === data.post_id &&
        postRow.status === "published" &&
        postRow.moderation_status === "published" &&
        circleRow?.status === "active" &&
        isPublicVisibleCircle(circleRow),
      target: {
        target_type: "comment",
        target_id: data.id,
        title: typeof postRow?.title === "string" ? postRow.title : "评论",
        excerpt: excerpt(data.body),
        status,
        moderation_status: moderationStatus,
        author_id: typeof data.author_id === "string" ? data.author_id : null,
        author_profile: mapProfilePreview(joinedRecord(data.profiles)),
        post: postRow
          ? {
              id: String(postRow.id ?? ""),
              title: typeof postRow.title === "string" ? postRow.title : null,
              status: typeof postRow.status === "string" ? postRow.status : null,
            }
          : null,
        circle: circleRow
          ? {
              id: String(circleRow.id ?? ""),
              name: typeof circleRow.name === "string" ? circleRow.name : null,
              slug: typeof circleRow.slug === "string" ? circleRow.slug : null,
            }
          : null,
      },
    };
  }

  if (targetType === "circle") {
    const { data, error } = await client
      .from("circles")
      .select("id,name,description,status,owner_id,slug,profiles:owner_id(id,username,display_name,avatar_url,role)")
      .eq("id", targetId)
      .maybeSingle();
    if (error) return { exists: false, available: false, target: null, error: error.message };
    if (!data) return { exists: false, available: false, target: null };
    const status = typeof data.status === "string" ? data.status : "active";
    return {
      exists: String(data.id ?? "") === targetId,
      available:
        String(data.id ?? "") === targetId &&
        status === "active" &&
        isPublicVisibleCircle(data),
      target: {
        target_type: "circle",
        target_id: data.id,
        title: typeof data.name === "string" ? data.name : null,
        excerpt: excerpt(data.description),
        status,
        moderation_status: null,
        author_id: typeof data.owner_id === "string" ? data.owner_id : null,
        author_profile: mapProfilePreview(joinedRecord(data.profiles)),
        circle: {
          id: data.id,
          name: typeof data.name === "string" ? data.name : null,
          slug: typeof data.slug === "string" ? data.slug : null,
        },
      },
    };
  }

  const { data, error } = await client
    .from("profiles")
    .select("id,username,display_name,avatar_url,role,bio")
    .eq("id", targetId)
    .maybeSingle();
  if (error) return { exists: false, available: false, target: null, error: error.message };
  if (!data) return { exists: false, available: false, target: null };
  return {
    exists: String(data.id ?? "") === targetId,
    available: true,
    target: {
      target_type: "user",
      target_id: data.id,
      title: typeof data.display_name === "string" && data.display_name.trim()
        ? data.display_name
        : typeof data.username === "string"
          ? data.username
          : "社区用户",
      excerpt: excerpt((data as Record<string, unknown>).bio as string | null | undefined),
      status: "active",
      moderation_status: null,
      author_id: data.id,
      author_profile: mapProfilePreview((data as Record<string, unknown>) ?? null),
    },
  };
}

export async function findDuplicateUserReport(
  client: SupabaseClient,
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string,
  windowMs = 24 * 60 * 60 * 1000,
) {
  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await client
    .from("reports")
    .select("id,status,created_at")
    .eq("reporter_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data
    ? {
        id: String(data.id),
        status: normalizeReportStatus(typeof data.status === "string" ? data.status : null),
        created_at: String(data.created_at ?? ""),
      }
    : null;
}

export async function countRecentReportsByUser(
  client: SupabaseClient,
  reporterId: string,
  windowMs = 15 * 60 * 1000,
) {
  const sinceIso = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await client
    .from("reports")
    .select("id", { count: "exact", head: true })
    .eq("reporter_id", reporterId)
    .gte("created_at", sinceIso);

  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertReportEvent(
  client: SupabaseClient,
  reportId: string,
  actorId: string | null,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await client.from("report_events").insert({
    report_id: reportId,
    actor_id: actorId,
    event_type: eventType,
    metadata,
  });

  if (error) throw new Error(error.message);
}

export async function createUserReport(params: {
  client: SupabaseClient;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reasonCode: ReportReasonCode;
  reasonText: string | null;
}) {
  const duplicate = await findDuplicateUserReport(
    params.client,
    params.reporterId,
    params.targetType,
    params.targetId,
  );
  if (duplicate) {
    return {
      duplicate: true as const,
      report: duplicate,
    };
  }

  const reason = buildLegacyReason(params.reasonCode, params.reasonText);
  const { data, error } = await params.client
    .from("reports")
    .insert({
      reporter_id: params.reporterId,
      target_type: params.targetType,
      target_id: params.targetId,
      reason,
      reason_code: params.reasonCode,
      reason_text: params.reasonText,
      status: "open",
      priority: "normal",
    })
    .select("id,status,created_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  try {
    await insertReportEvent(params.client, String(data.id), params.reporterId, "created", {
      target_type: params.targetType,
      target_id: params.targetId,
      reason_code: params.reasonCode,
    });
  } catch (error) {
    console.warn("[reports] report created but event insert failed", {
      reportId: String(data.id),
      message: error instanceof Error ? error.message : "unknown error",
    });
  }

  return {
    duplicate: false as const,
    report: {
      id: String(data.id),
      status: normalizeReportStatus(typeof data.status === "string" ? data.status : null),
      created_at: String(data.created_at ?? ""),
    },
  };
}

function normalizeQueueRow(row: ReportRow): Omit<AdminReportQueueItem, "target" | "reporter_profile" | "open_count_for_target"> {
  return {
    id: row.id,
    reporter_id: row.reporter_id,
    target_type: row.target_type as ReportTargetType,
    target_id: row.target_id,
    reason: row.reason_text ? buildLegacyReason((row.reason_code as ReportReasonCode) ?? "other", row.reason_text) : row.reason ?? buildLegacyReason((row.reason_code as ReportReasonCode) ?? "other", null),
    reason_code: ((row.reason_code as ReportReasonCode) ?? "other"),
    reason_text: row.reason_text ?? null,
    status: normalizeReportStatus(row.status),
    priority: normalizeReportPriority(row.priority),
    assigned_to: row.assigned_to ?? null,
    resolved_by: row.resolved_by ?? null,
    resolved_at: row.resolved_at ?? null,
    resolution_note: row.resolution_note ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  };
}

export async function fetchAdminReportsQueue(params: {
  client: SupabaseClient;
  status?: string;
  targetType?: string;
  reasonCode?: string;
  priority?: string;
  limit?: number;
}) {
  let query = params.client
    .from("reports")
    .select("id,reporter_id,target_type,target_id,reason,reason_code,reason_text,status,priority,assigned_to,resolved_by,resolved_at,resolution_note,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(params.limit ?? 80, 200)));

  if (params.status && params.status !== "all") query = query.eq("status", params.status);
  if (params.targetType && params.targetType !== "all") query = query.eq("target_type", params.targetType);
  if (params.reasonCode && params.reasonCode !== "all") query = query.eq("reason_code", params.reasonCode);
  if (params.priority && params.priority !== "all") query = query.eq("priority", params.priority);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as ReportRow[]);
  const reporterIds = Array.from(new Set(rows.map((row) => row.reporter_id).filter(Boolean)));
  const targetKeys = rows.map((row) => ({ targetType: row.target_type as ReportTargetType, targetId: row.target_id }));

  const [profilesResult, openCountsResult] = await Promise.all([
    reporterIds.length
      ? params.client.from("profiles").select("id,username,display_name,avatar_url,role").in("id", reporterIds)
      : Promise.resolve({ data: [], error: null }),
    rows.length
      ? params.client
          .from("reports")
          .select("target_type,target_id,status")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (openCountsResult.error) throw new Error(openCountsResult.error.message);

  const profileMap = new Map(
    ((profilesResult.data ?? []) as Array<Record<string, unknown>>).map((profile) => [String(profile.id ?? ""), mapProfilePreview(profile)]),
  );

  const openCountMap = new Map<string, number>();
  for (const row of ((openCountsResult.data ?? []) as Array<Record<string, unknown>>)) {
    const status = normalizeReportStatus(typeof row.status === "string" ? row.status : null);
    if (status !== "open" && status !== "reviewing") continue;
    const key = `${String(row.target_type ?? "")}:${String(row.target_id ?? "")}`;
    openCountMap.set(key, (openCountMap.get(key) ?? 0) + 1);
  }

  const targetMap = new Map<string, ReportTargetPreview | null>();
  for (const item of targetKeys) {
    const key = `${item.targetType}:${item.targetId}`;
    if (targetMap.has(key)) continue;
    const resolved = await resolveReportTargetPreview(params.client, item.targetType, item.targetId);
    targetMap.set(key, resolved.target);
  }

  return rows.map((row) => {
    const base = normalizeQueueRow(row);
    return {
      ...base,
      reporter_profile: profileMap.get(row.reporter_id) ?? null,
      target: targetMap.get(`${row.target_type}:${row.target_id}`) ?? null,
      open_count_for_target: openCountMap.get(`${row.target_type}:${row.target_id}`) ?? 0,
    } satisfies AdminReportQueueItem;
  });
}

export async function fetchAdminReportDetail(client: SupabaseClient, reportId: string) {
  const { data, error } = await client
    .from("reports")
    .select("id,reporter_id,target_type,target_id,reason,reason_code,reason_text,status,priority,assigned_to,resolved_by,resolved_at,resolution_note,created_at,updated_at")
    .eq("id", reportId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const reportRow = data as ReportRow;
  const [targetResolved, reporterResult, openCountResult] = await Promise.all([
    resolveReportTargetPreview(client, reportRow.target_type as ReportTargetType, reportRow.target_id),
    client
      .from("profiles")
      .select("id,username,display_name,avatar_url,role")
      .eq("id", reportRow.reporter_id)
      .maybeSingle(),
    client
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", reportRow.target_type)
      .eq("target_id", reportRow.target_id)
      .in("status", ["open", "reviewing"]),
  ]);

  if (reporterResult.error) throw new Error(reporterResult.error.message);
  if (openCountResult.error) throw new Error(openCountResult.error.message);

  const item = {
    ...normalizeQueueRow(reportRow),
    reporter_profile: mapProfilePreview((reporterResult.data as Record<string, unknown> | null | undefined) ?? null),
    target: targetResolved.target,
    open_count_for_target: openCountResult.count ?? 0,
  } satisfies AdminReportQueueItem;

  const { data: events, error: eventsError } = await client
    .from("report_events")
    .select("id,report_id,actor_id,event_type,metadata,created_at")
    .eq("report_id", reportId)
    .order("created_at", { ascending: false });

  if (eventsError) throw new Error(eventsError.message);

  const actorIds = Array.from(
    new Set(
      ((events ?? []) as Array<Record<string, unknown>>)
        .map((event) => (typeof event.actor_id === "string" ? event.actor_id : ""))
        .filter(Boolean),
    ),
  );
  const { data: actors, error: actorsError } = actorIds.length
    ? await client.from("profiles").select("id,username,display_name,avatar_url,role").in("id", actorIds)
    : { data: [], error: null };
  if (actorsError) throw new Error(actorsError.message);
  const actorMap = new Map(
    ((actors ?? []) as Array<Record<string, unknown>>).map((actor) => [String(actor.id ?? ""), mapProfilePreview(actor)]),
  );

  return {
    report: item,
    events: ((events ?? []) as Array<Record<string, unknown>>).map((event) => ({
      id: String(event.id ?? ""),
      report_id: String(event.report_id ?? ""),
      actor_id: typeof event.actor_id === "string" ? event.actor_id : null,
      actor_profile:
        typeof event.actor_id === "string" ? actorMap.get(event.actor_id) ?? null : null,
      event_type: String(event.event_type ?? ""),
      metadata:
        event.metadata && typeof event.metadata === "object"
          ? (event.metadata as Record<string, unknown>)
          : {},
      created_at: String(event.created_at ?? ""),
    })) as ReportEventRecord[],
  };
}

export function getUserReportTargetPreview(target: ReportTargetPreview | null): UserReportTargetPreview | null {
  if (!target) return null;
  return {
    target_type: target.target_type,
    target_id: target.target_id,
    title: target.title,
    excerpt: target.excerpt,
    available:
      target.target_type === "user"
        ? true
        : target.target_type === "circle"
          ? target.status !== "deleted"
          : target.status !== "deleted" &&
            target.status !== "hidden" &&
            target.moderation_status !== "rejected" &&
            target.moderation_status !== "hidden_by_admin",
  };
}

async function updateReportStatus(params: {
  client: SupabaseClient;
  reportId: string;
  nextStatus: ReportStatus;
  moderatorId: string;
  resolutionNote?: string | null;
  assign?: boolean;
}) {
  const patch: Record<string, unknown> = {
    status: params.nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (params.assign) {
    patch.assigned_to = params.moderatorId;
  }
  if (params.nextStatus === "dismissed" || params.nextStatus === "actioned") {
    patch.resolved_by = params.moderatorId;
    patch.resolved_at = new Date().toISOString();
    patch.resolution_note = params.resolutionNote ?? null;
  }

  const { data, error } = await params.client
    .from("reports")
    .update(patch)
    .eq("id", params.reportId)
    .select("id,reporter_id,target_type,target_id,reason,reason_code,reason_text,status,priority,assigned_to,resolved_by,resolved_at,resolution_note,created_at,updated_at")
    .single();

  if (error) throw new Error(error.message);
  return data as ReportRow;
}

export async function applyAdminReportAction(params: {
  client: SupabaseClient;
  moderatorId: string;
  reportId: string;
  action: ReportAdminAction;
  note?: string | null;
  until?: string | null;
  notificationWriter?: ModerationNotificationWriter;
}) {
  const detail = await fetchAdminReportDetail(params.client, params.reportId);
  if (!detail) {
    return { ok: false as const, status: 404, error: "REPORT_NOT_FOUND" };
  }

  const report = detail.report;
  const target = report.target;
  const note = sanitizeReportResolutionNote(params.note);
  const targetUserId =
    report.target_type === "user"
      ? report.target_id
      : target?.author_id ?? null;

  if (params.action === "reviewing") {
    const updated = await updateReportStatus({
      client: params.client,
      reportId: report.id,
      nextStatus: "reviewing",
      moderatorId: params.moderatorId,
      assign: true,
    });
    await insertReportEvent(params.client, report.id, params.moderatorId, "reviewing", {
      note: note || null,
    });
    return { ok: true as const, report: updated };
  }

  if (params.action === "dismiss") {
    const updated = await updateReportStatus({
      client: params.client,
      reportId: report.id,
      nextStatus: "dismissed",
      moderatorId: params.moderatorId,
      resolutionNote: note || null,
      assign: true,
    });
    await insertReportEvent(params.client, report.id, params.moderatorId, "dismissed", {
      note: note || null,
    });
    return { ok: true as const, report: updated };
  }

  if (params.action === "hide_target" || params.action === "reject_target") {
    if (!target) {
      return { ok: false as const, status: 404, error: "REPORT_TARGET_NOT_FOUND" };
    }
    if (report.target_type === "post" || report.target_type === "comment") {
      const moderation = await applyModerationAdminAction({
        client: params.client,
        moderatorId: params.moderatorId,
        targetType: report.target_type as ModerationAdminTarget,
        targetId: report.target_id,
        action: params.action === "reject_target" ? "reject" : "hide",
        reason:
          note ||
          (params.action === "reject_target"
            ? `Rejected from report ${report.id}`
            : `Hidden from report ${report.id}`),
      });
      if (!moderation.ok) {
        return { ok: false as const, status: moderation.status ?? 500, error: moderation.error };
      }
    } else if (report.target_type === "circle") {
      if (params.action === "reject_target") {
        return { ok: false as const, status: 400, error: "REPORT_REJECT_UNSUPPORTED_FOR_CIRCLE" };
      }
      const { error } = await params.client
        .from("circles")
        .update({ status: "deleted" })
        .eq("id", report.target_id);
      if (error) return { ok: false as const, status: 500, error: error.message };
    } else {
      return { ok: false as const, status: 400, error: "REPORT_HIDE_UNSUPPORTED_FOR_USER" };
    }

    const updated = await updateReportStatus({
      client: params.client,
      reportId: report.id,
      nextStatus: "actioned",
      moderatorId: params.moderatorId,
      resolutionNote: note || null,
      assign: true,
    });
    await insertReportEvent(params.client, report.id, params.moderatorId, params.action === "reject_target" ? "actioned" : "hide_target", {
      note: note || null,
      action: params.action,
      target_type: report.target_type,
      target_id: report.target_id,
    });

    if (report.target_type === "post" && params.notificationWriter && target.author_id) {
      void notifyPostModerated(params.notificationWriter, { recipientId: target.author_id, postId: report.target_id });
    } else if (report.target_type === "comment" && target.target_type === "comment" && params.notificationWriter && target.author_id && target.post?.id) {
      void notifyCommentModerated(params.notificationWriter, {
        recipientId: target.author_id,
        commentId: report.target_id,
        postId: target.post.id,
      });
    }

    return { ok: true as const, report: updated };
  }

  if (!targetUserId) {
    return { ok: false as const, status: 400, error: "REPORT_TARGET_USER_UNAVAILABLE" };
  }

  if (!note && (params.action === "ban_user" || params.action === "suspend_user")) {
    return { ok: false as const, status: 400, error: "REASON_REQUIRED" };
  }

  const safetyAction =
    params.action === "warn_user"
      ? "warn"
      : params.action === "suspend_user"
        ? "suspend"
        : "ban";

  const safetyResult = await applyUserSafetyAction({
    client: params.client,
    actorId: params.moderatorId,
    targetUserId,
    action: safetyAction,
    reason: sanitizeSafetyReason(note || `${params.action} via report ${report.id}`) || null,
    until: params.until ?? null,
    notificationWriter: params.notificationWriter,
  });

  if (!safetyResult.ok) {
    return { ok: false as const, status: safetyResult.status, error: safetyResult.error };
  }

  try {
    if (params.action === "warn_user" && note) {
      await insertUserSafetyEvent(params.client, {
        user_id: targetUserId,
        actor_id: params.moderatorId,
        event_type: "note",
        reason: note,
        metadata: { source: "report", report_id: report.id },
      });
    }
  } catch (error) {
    console.warn("[reports] supplemental user safety note failed", {
      reportId: report.id,
      message: error instanceof Error ? error.message : "unknown error",
    });
  }

  const updated = await updateReportStatus({
    client: params.client,
    reportId: report.id,
    nextStatus: "actioned",
    moderatorId: params.moderatorId,
    resolutionNote: note || null,
    assign: true,
  });

  const eventType =
    params.action === "warn_user"
      ? "warn_user"
      : params.action === "suspend_user"
        ? "suspend_user"
        : "ban_user";

  await insertReportEvent(params.client, report.id, params.moderatorId, eventType, {
    note: note || null,
    target_user_id: targetUserId,
  });

  return { ok: true as const, report: updated, safety_state: safetyResult.state };
}
