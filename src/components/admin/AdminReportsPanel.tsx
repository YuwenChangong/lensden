import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { localizeAdminSessionMessage } from "../../lib/i18n/messages/admin";
import { useLocale } from "../i18n/useLocale";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { AdminApiError, adminFetch } from "../../lib/admin-api-client";
import GlassConfirmDialog from "../common/GlassConfirmDialog";
import { useAdminSession } from "./useAdminSession";

type ReportTargetType = "post" | "comment" | "circle" | "user";
type ReportStatus = "open" | "reviewing" | "actioned" | "dismissed";
type ReportPriority = "low" | "normal" | "high";
type ReportReasonCode =
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
type ReportAdminAction =
  | "dismiss"
  | "reviewing"
  | "hide_target"
  | "reject_target"
  | "warn_user"
  | "suspend_user"
  | "ban_user";

type ProfilePreview = {
  id: string;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
  role?: string | null;
};

type AdminReportQueueItem = {
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
  open_count_for_target: number;
  target:
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
      }
    | null;
};

type ReportEventRecord = {
  id: string;
  report_id: string;
  actor_id: string | null;
  actor_profile: ProfilePreview | null;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

type ReportsPayload = {
  reports?: AdminReportQueueItem[];
};

type ReportDetailPayload = {
  report: AdminReportQueueItem;
  events: ReportEventRecord[];
};

type ActionPayload = {
  ok?: boolean;
  report?: AdminReportQueueItem;
  events?: ReportEventRecord[];
  error?: string;
};

type FilterValue = "all" | string;
type DataState = "idle" | "loading" | "ready" | "error";
type ConfirmState = {
  action: ReportAdminAction;
  reportId: string;
};
type ActionGroupKey = "low" | "content" | "safety";

export default function AdminReportsPanel({ localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { localeContext?: LocaleContext } = {}) {
  const { context } = useLocale(localeContext);
  const locale = context.locale;
  const text = getUiMessages(locale).admin;
  const STATUS_OPTIONS: Array<{ value: FilterValue; label: string }> = [
    { value: "all", label: text.reports.filters.status.all },
    { value: "open", label: text.copy.open },
    { value: "reviewing", label: text.copy.inReview },
    { value: "actioned", label: text.copy.actioned },
    { value: "dismissed", label: text.copy.dismissed },
  ];

  const TARGET_OPTIONS: Array<{ value: FilterValue; label: string }> = [
    { value: "all", label: text.reports.filters.target.all },
    { value: "post", label: text.copy.post },
    { value: "comment", label: text.copy.comment },
    { value: "circle", label: text.copy.circle },
    { value: "user", label: text.copy.user },
  ];

  const PRIORITY_OPTIONS: Array<{ value: FilterValue; label: string }> = [
    { value: "all", label: text.copy.allPriorities },
    { value: "low", label: text.copy.low },
    { value: "normal", label: text.copy.normal },
    { value: "high", label: text.copy.high },
  ];

  const REASON_OPTIONS: Array<{ value: FilterValue; label: string }> = [
    { value: "all", label: text.copy.allReasons },
    { value: "spam", label: text.copy.spam },
    { value: "harassment", label: text.copy.harassment },
    { value: "hate", label: text.copy.hateContent },
    { value: "sexual", label: text.copy.sexualContent },
    { value: "violence", label: text.copy.violenceOrThreats },
    { value: "illegal", label: text.copy.illegalContent },
    { value: "off_platform_contact", label: text.copy.offPlatformContact },
    { value: "misinformation", label: text.copy.misleadingInformation },
    { value: "privacy", label: text.copy.privacyExposure },
    { value: "other", label: text.copy.other },
  ];

  const ACTION_GROUP_LABELS: Record<ActionGroupKey, { title: string; description: string }> = {
    low: {
      title: text.copy.lowRiskActions,
      description: text.copy.takeOwnershipOrCloseAReportAfterReviewingIt,
    },
    content: {
      title: text.copy.contentActions,
      description: text.copy.theseActionsChangePublicVisibilityConfirmCarefully,
    },
    safety: {
      title: text.copy.userSafetyActions,
      description: text.copy.highRiskActionsThatAffectTheUserSPosting,
    },
  };

  const ACTION_CONFIG: Record<
    ReportAdminAction,
    {
      label: string;
      shortLabel: string;
      description: string;
      confirmTitle: string;
      confirmDescription: string;
      confirmLabel: string;
      loadingLabel: string;
      danger?: boolean;
      group: ActionGroupKey;
      reversible: string;
    }
  > = {
    reviewing: {
      label: text.copy.markInReview,
      shortLabel: text.copy.inReview,
      description: text.copy.markTheReportInReviewAndAssignTheCurrent,
      confirmTitle: text.copy.takeOwnershipOfThisReport,
      confirmDescription: text.copy.theReportWillBeMarkedInReviewSoThe,
      confirmLabel: text.copy.confirmInReview,
      loadingLabel: text.copy.updatingStatus,
      group: "low",
      reversible: text.copy.theReportCanLaterBeDismissedOrActioned,
    },
    dismiss: {
      label: text.reports.actions.dismiss.label,
      shortLabel: text.copy.dismiss,
      description: text.copy.theReportWillBeDismissedAddANoteExplaining,
      confirmTitle: text.copy.dismissThisReport,
      confirmDescription: text.copy.thisRemovesTheReportFromTheOpenQueueBut,
      confirmLabel: text.copy.confirmDismissal,
      loadingLabel: text.copy.dismissingReport,
      group: "low",
      reversible: text.copy.furtherGovernanceRecordsCanAddContextButThisReport,
    },
    hide_target: {
      label: text.reports.actions.hide_target.label,
      shortLabel: text.copy.hide,
      description: text.copy.hideTheTargetContentOrCircleFromPublicView,
      confirmTitle: text.copy.hideThisContent,
      confirmDescription: text.copy.thisChangesPublicVisibilityWhileRetainingTheRecord,
      confirmLabel: text.copy.confirmHide,
      loadingLabel: text.copy.hidingTarget,
      danger: true,
      group: "content",
      reversible: text.copy.aLaterAdminActionCanUsuallyRestoreTheTarget,
    },
    reject_target: {
      label: text.copy.rejectTarget,
      shortLabel: text.copy.reject,
      description: text.copy.rejectAPostOrCommentAsAStrongerContent,
      confirmTitle: text.copy.rejectThisContent,
      confirmDescription: text.copy.rejectionTreatsTheContentAsAViolationAddA,
      confirmLabel: text.copy.confirmRejection,
      loadingLabel: text.copy.rejectingContent,
      danger: true,
      group: "content",
      reversible: text.copy.ordinaryUserFlowsGenerallyCannotRestoreRejectedContentProceed,
    },
    warn_user: {
      label: text.copy.warnUser,
      shortLabel: text.copy.warn,
      description: text.copy.recordAWarningWithoutBanningTheAccount,
      confirmTitle: text.copy.warnThisUser,
      confirmDescription: text.copy.theWarningWillBeRecordedInTheUserS,
      confirmLabel: text.copy.confirmWarning,
      loadingLabel: text.copy.warningUser,
      group: "safety",
      reversible: text.copy.ifSupportedWarningsCanBeClearedThroughTheUser,
    },
    suspend_user: {
      label: text.copy.suspendUser,
      shortLabel: text.copy.suspend,
      description: text.copy.temporarilySuspendPostingAnExpiryIsRequired,
      confirmTitle: text.copy.suspendThisUser,
      confirmDescription: text.copy.suspensionRestrictsPostingAndInteractionCheckTheExpiryAnd,
      confirmLabel: text.copy.confirmSuspension,
      loadingLabel: text.copy.suspendingUser,
      danger: true,
      group: "safety",
      reversible: text.copy.theSuspensionCanExpireAutomaticallyOrBeLiftedBy,
    },
    ban_user: {
      label: text.reports.actions.ban_user.label,
      shortLabel: text.copy.ban,
      description: text.copy.aHighRiskActionThatChangesTheUserS,
      confirmTitle: text.copy.banThisUser,
      confirmDescription: text.copy.checkTheTargetEvidenceAndNoteCarefullyBeforeBanning,
      confirmLabel: text.copy.confirmBan,
      loadingLabel: text.copy.banningUser,
      danger: true,
      group: "safety",
      reversible: text.copy.onlyALaterAdministratorActionCanLiftTheBan,
    },
  };

  const STATUS_BADGE_CLASS: Record<string, string> = {
    open: "admin-pill admin-pill--status-open",
    reviewing: "admin-pill admin-pill--status-reviewing",
    actioned: "admin-pill admin-pill--status-actioned",
    dismissed: "admin-pill admin-pill--status-dismissed",
    published: "admin-pill admin-status-published",
    pending: "admin-pill admin-status-pending",
    hidden: "admin-pill admin-status-hidden",
    deleted: "admin-pill admin-status-deleted",
    rejected: "admin-pill admin-status-deleted",
    hidden_by_admin: "admin-pill admin-status-hidden",
    active: "admin-pill admin-pill--target-active",
  };

  const PRIORITY_CLASS: Record<ReportPriority, string> = {
    low: "admin-pill admin-pill--priority-low",
    normal: "admin-pill admin-pill--priority-normal",
    high: "admin-pill admin-pill--priority-high",
  };

  function cx(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
  }

  function profileLabel(profile: ProfilePreview | null, fallback = text.copy.unknownUser) {
    return profile?.display_name || profile?.username || fallback;
  }

  function shortId(id: string | null | undefined) {
    if (!id) return "-";
    return `${id.slice(0, 8)}...`;
  }

  function targetLabel(report: Pick<AdminReportQueueItem, "target_type">) {
    switch (report.target_type) {
      case "post":
        return text.copy.post;
      case "comment":
        return text.copy.comment;
      case "circle":
        return text.copy.circle;
      case "user":
        return text.copy.user;
      default:
        return report.target_type;
    }
  }

  function statusLabel(status: string | null) {
    switch (status) {
      case "open":
        return text.copy.open;
      case "reviewing":
        return text.copy.inReview;
      case "actioned":
        return text.copy.actioned;
      case "dismissed":
        return text.copy.dismissed;
      case "published":
        return text.copy.public;
      case "pending":
        return text.copy.pendingReview;
      case "deleted":
        return text.copy.deleted;
      case "hidden":
        return text.copy.hidden;
      case "rejected":
        return text.copy.rejected;
      case "hidden_by_admin":
        return text.copy.hiddenByAdministrator;
      case "active":
        return text.copy.active;
      default:
        return status ?? text.copy.unknown;
    }
  }

  function priorityLabel(priority: ReportPriority) {
    switch (priority) {
      case "low":
        return text.copy.low;
      case "high":
        return text.copy.high;
      default:
        return text.copy.normal;
    }
  }

  function reasonLabel(reasonCode: ReportReasonCode) {
    return REASON_OPTIONS.find((option) => option.value === reasonCode)?.label ?? reasonCode;
  }

  function targetLink(report: AdminReportQueueItem) {
    if (!report.target) return null;
    switch (report.target.target_type) {
      case "post":
        return `/posts/${report.target.target_id}/`;
      case "comment":
        return report.target.post?.id ? `/posts/${report.target.post.id}/#comment-${report.target.target_id}` : null;
      case "circle":
        return report.target.circle?.slug ? `/circles/${report.target.circle.slug}/` : null;
      case "user":
        return report.target.author_profile?.username ? `/u/${encodeURIComponent(report.target.author_profile.username)}/` : null;
      default:
        return null;
    }
  }

  function isHideSupported(report: AdminReportQueueItem | null) {
    return report?.target_type === "post" || report?.target_type === "comment" || report?.target_type === "circle";
  }

  function isRejectSupported(report: AdminReportQueueItem | null) {
    return report?.target_type === "post" || report?.target_type === "comment";
  }

  function hasTargetUser(report: AdminReportQueueItem | null) {
    return Boolean(report && (report.target_type === "user" ? report.target_id : report.target?.author_id));
  }

  function getActionTargetUserId(report: AdminReportQueueItem | null) {
    if (!report) return null;
    return report.target_type === "user" ? report.target_id : report.target?.author_id ?? null;
  }

  function formatDateTime(value: string | null | undefined) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getLatestActivity(report: AdminReportQueueItem) {
    return report.updated_at || report.resolved_at || report.created_at;
  }

  function getTargetStateBadges(report: AdminReportQueueItem) {
    const statuses: Array<{ label: string; className: string }> = [];
    if (report.target?.status) {
      statuses.push({
        label: statusLabel(report.target.status),
        className: STATUS_BADGE_CLASS[report.target.status] ?? "admin-pill",
      });
    }
    if (report.target?.moderation_status) {
      statuses.push({
        label: statusLabel(report.target.moderation_status),
        className: STATUS_BADGE_CLASS[report.target.moderation_status] ?? "admin-pill",
      });
    }
    if (!report.target) {
      statuses.push({
        label: text.copy.targetUnavailable,
        className: "admin-pill admin-pill--missing",
      });
    }
    return statuses;
  }

  function getActionErrorMessage(error: unknown) {
    if (!(error instanceof AdminApiError)) {
      return error instanceof Error ? error.message : text.copy.actionFailedTryAgainLater;
    }

    switch (error.message) {
      case "REPORT_TARGET_NOT_FOUND":
        return text.copy.theTargetContentIsUnavailableThisActionCannotContinue;
      case "REPORT_TARGET_USER_UNAVAILABLE":
        return text.copy.theAssociatedUserCannotBeIdentifiedUserSafetyActions;
      case "USER_SAFETY_SELF_ACTION_FORBIDDEN":
        return text.copy.youCannotApplyUserSafetyActionsToYourOwn;
      case "REASON_REQUIRED":
        return text.copy.enterAHandlingNoteBeforeSuspendingOrBanning;
      case "INVALID_SUSPEND_UNTIL":
        return text.copy.invalidSuspensionExpirySelectItAgain;
      case "SUSPEND_UNTIL_REQUIRED":
        return text.copy.enterAnExpiryBeforeSuspendingTheUser;
      case "SUSPEND_UNTIL_MUST_BE_FUTURE":
        return text.copy.theSuspensionExpiryMustBeLaterThanNow;
      case "USER_ALREADY_SUSPENDED":
        return text.copy.thisUserIsAlreadySuspended;
      case "USER_ALREADY_BANNED":
        return text.copy.thisUserHasAlreadyBeenBanned;
      case "USER_SAFETY_ACTION_CONFLICT":
        return text.copy.thisActionConflictsWithTheUserSCurrentSafety;
      case "REPORT_REJECT_UNSUPPORTED_FOR_CIRCLE":
        return text.copy.circleReportsDoNotSupportRejectionUseHideTarget;
      case "REPORT_HIDE_UNSUPPORTED_FOR_USER":
        return text.copy.userReportsDoNotSupportHidingUseAUser;
      case "REPORT_NOT_FOUND":
        return text.copy.thisReportNoLongerExistsOrIsTemporarilyUnavailable;
      default:
        return error.message || text.copy.actionFailedTryAgainLater;
    }
  }

  function getReportSearchText(report: AdminReportQueueItem) {
    return [
      report.id,
      report.target_id,
      report.reason,
      report.reason_text ?? "",
      targetLabel(report),
      reasonLabel(report.reason_code),
      profileLabel(report.reporter_profile, ""),
      profileLabel(report.target?.author_profile ?? null, ""),
      report.target?.title ?? "",
      report.target?.excerpt ?? "",
      report.target && "circle" in report.target ? report.target.circle?.name ?? "" : "",
      report.target && "post" in report.target ? report.target.post?.title ?? "" : "",
    ]
      .join(" ")
      .toLowerCase();
  }

  function summarizeEvent(event: ReportEventRecord) {
    const action = typeof event.metadata.action === "string" ? event.metadata.action : null;

    switch (event.event_type) {
      case "created":
        return {
          title: text.copy.reportCreated,
          lines: [
            formatUiMessage(text.copy.reasonCategoryValue, { value0: typeof event.metadata.reason_code === "string" ? reasonLabel(event.metadata.reason_code as ReportReasonCode) : "未记录" }),
          ],
        };
      case "reviewing":
        return {
          title: text.copy.markedInReview,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [text.copy.anAdministratorHasTakenOwnership],
        };
      case "dismissed":
        return {
          title: text.copy.reportDismissed,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [text.copy.noAdditionalExplanationRecorded],
        };
      case "hide_target":
        return {
          title: text.copy.targetHidden,
          lines: [
            formatUiMessage(text.copy.actionTargetValue, { value0: targetLabel({ target_type: typeof event.metadata.target_type === "string" ? (event.metadata.target_type as ReportTargetType) : "post" }) }),
            typeof event.metadata.note === "string" && event.metadata.note.trim() ? formatUiMessage(text.copy.noteValue, { value0: event.metadata.note }) : text.copy.theTargetIsHiddenFromPublicView,
          ],
        };
      case "warn_user":
        return {
          title: text.copy.userWarned,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [text.copy.theWarningWasRecordedInTheUserSafetySystem],
        };
      case "suspend_user":
        return {
          title: text.copy.userSuspended,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [text.copy.theUserHasBeenTemporarilySuspended],
        };
      case "ban_user":
        return {
          title: text.copy.userBanned,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [text.copy.theUserHasBeenBanned],
        };
      case "actioned":
        return {
          title: action === "reject_target" ? text.copy.targetRejected : text.copy.reportActioned,
          lines: typeof event.metadata.note === "string" && event.metadata.note.trim()
            ? [formatUiMessage(text.copy.noteValue, { value0: event.metadata.note })]
            : [action === "reject_target" ? text.copy.theTargetContentWasHandledAsAViolation : text.copy.theAdministratorHasCompletedTheAction],
        };
      default: {
        const lines: string[] = [];
        for (const [key, value] of Object.entries(event.metadata ?? {})) {
          if (value == null || value === "") continue;
          if (typeof value === "object") continue;
          lines.push(`${key}: ${String(value)}`);
        }
        return {
          title: event.event_type,
          lines: lines.length > 0 ? lines.slice(0, 3) : [text.copy.noAdditionalSummary],
        };
      }
    }
  }

  function buildActionDetail(report: AdminReportQueueItem, action: ReportAdminAction, note: string, until: string) {
    const config = ACTION_CONFIG[action];
    const targetUserId = getActionTargetUserId(report);
    const lines = [
      formatUiMessage(text.copy.reportTargetValue, { value0: targetLabel(report), value1: report.target?.title || shortId(report.target_id) }),
      formatUiMessage(text.copy.reportIdValue, { value0: shortId(report.id) }),
      formatUiMessage(text.copy.currentStatusValue, { value0: statusLabel(report.status) }),
      formatUiMessage(text.copy.actionImpactValue, { value0: config.description }),
      formatUiMessage(text.copy.reversibilityValue, { value0: config.reversible }),
    ];

    if (targetUserId && config.group === "safety") {
      lines.push(formatUiMessage(text.copy.targetUserValue, { value0: profileLabel(report.target?.author_profile ?? report.reporter_profile, "社区用户"), value1: shortId(targetUserId) }));
    }
    if (note.trim()) {
      lines.push(formatUiMessage(text.copy.handlingNoteValue, { value0: note.trim() }));
    }
    if (action === "suspend_user" && until.trim()) {
      lines.push(formatUiMessage(text.copy.suspensionExpiryValue, { value0: until.trim() }));
    }

    return lines.join("\n");
  }

  function buildActionSuccessMessage(action: ReportAdminAction) {
    switch (action) {
      case "reviewing":
        return text.copy.reportMarkedInReview;
      case "dismiss":
        return text.copy.reportDismissed2;
      case "hide_target":
        return text.copy.targetHiddenReportUpdated;
      case "reject_target":
        return text.copy.targetRejectedReportUpdated;
      case "warn_user":
        return text.copy.userWarningRecorded;
      case "suspend_user":
        return text.copy.userSuspended2;
      case "ban_user":
        return text.copy.userBanned2;
      default:
        return text.copy.actionUpdated;
    }
  }

  function getFilteredEmptyMessage(searchQuery: string, filters: Record<string, FilterValue>) {
    if (searchQuery.trim()) {
      return text.copy.noSearchMatchesShortenTheQueryOrClearFilters;
    }
    if (Object.values(filters).some((value) => value !== "all")) {
      return text.copy.noReportsMatchTheseFilters;
    }
    return text.copy.noReportsCurrentlyNeedHandling;
  }

  const adminSession = useAdminSession();
  // The hook wrapper changes on every render; list reads follow stable auth fields.
  const { session: reportSession, state: { status: reportSessionStatus }, setState: setReportSessionState } = adminSession;
  const [dataState, setDataState] = useState<DataState>("idle");
  const [error, setError] = useState("");
  const [reports, setReports] = useState<AdminReportQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailMissing, setDetailMissing] = useState(false);
  const [detail, setDetail] = useState<ReportDetailPayload | null>(null);
  const [note, setNote] = useState("");
  const [until, setUntil] = useState("");
  const [rowMessage, setRowMessage] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [actionLoading, setActionLoading] = useState<ReportAdminAction | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filters, setFilters] = useState({
    status: "open" as FilterValue,
    target_type: "all" as FilterValue,
    reason_code: "all" as FilterValue,
    priority: "all" as FilterValue,
  });

  const selectedReport = detail?.report ?? reports.find((report) => report.id === selectedId) ?? null;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "120");
    if (filters.status !== "all") params.set("status", filters.status);
    if (filters.target_type !== "all") params.set("target_type", filters.target_type);
    if (filters.reason_code !== "all") params.set("reason_code", filters.reason_code);
    if (filters.priority !== "all") params.set("priority", filters.priority);
    return params.toString();
  }, [filters]);

  const filteredReports = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return reports;
    return reports.filter((report) => getReportSearchText(report).includes(query));
  }, [deferredSearchQuery, reports]);

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onClear: () => void }> = [];
    if (filters.status !== "all") {
      chips.push({
        key: "status",
        label: formatUiMessage(text.copy.statusValue, { value0: STATUS_OPTIONS.find((option) => option.value === filters.status)?.label ?? filters.status }),
        onClear: () => setFilters((current) => ({ ...current, status: "all" })),
      });
    }
    if (filters.target_type !== "all") {
      chips.push({
        key: "target_type",
        label: formatUiMessage(text.copy.targetValue, { value0: TARGET_OPTIONS.find((option) => option.value === filters.target_type)?.label ?? filters.target_type }),
        onClear: () => setFilters((current) => ({ ...current, target_type: "all" })),
      });
    }
    if (filters.reason_code !== "all") {
      chips.push({
        key: "reason_code",
        label: formatUiMessage(text.copy.reasonValue, { value0: REASON_OPTIONS.find((option) => option.value === filters.reason_code)?.label ?? filters.reason_code }),
        onClear: () => setFilters((current) => ({ ...current, reason_code: "all" })),
      });
    }
    if (filters.priority !== "all") {
      chips.push({
        key: "priority",
        label: formatUiMessage(text.copy.priorityValue, { value0: PRIORITY_OPTIONS.find((option) => option.value === filters.priority)?.label ?? filters.priority }),
        onClear: () => setFilters((current) => ({ ...current, priority: "all" })),
      });
    }
    if (searchQuery.trim()) {
      chips.push({
        key: "search",
        label: formatUiMessage(text.copy.searchValue, { value0: searchQuery.trim() }),
        onClear: () => setSearchQuery(""),
      });
    }
    return chips;
  }, [filters, searchQuery]);

  const queueSummary = useMemo(() => {
    return {
      total: filteredReports.length,
      open: filteredReports.filter((report) => report.status === "open").length,
      reviewing: filteredReports.filter((report) => report.status === "reviewing").length,
      highPriority: filteredReports.filter((report) => report.priority === "high").length,
    };
  }, [filteredReports]);

  useEffect(() => {
    if (reportSessionStatus !== "ready" || !reportSession) return;
    let cancelled = false;
    const controller = new AbortController();

    async function loadReports() {
      const showFullLoadingState = reports.length === 0 && dataState !== "ready";
      if (showFullLoadingState) {
        setDataState("loading");
      } else {
        setIsRefreshing(true);
      }
      setError("");
      try {
        const payload = await adminFetch<ReportsPayload>(`/api/admin/reports?${queryString}`, {
          method: "GET",
          session: reportSession,
          signal: controller.signal,
        });
        if (cancelled) return;
        const nextReports = payload.reports ?? [];
        setReports(nextReports);
        setSelectedId((current) => {
          if (current && nextReports.some((report) => report.id === current)) return current;
          return nextReports[0]?.id ?? null;
        });
        setDataState("ready");
      } catch (requestError) {
        if (cancelled) return;
        if (requestError instanceof AdminApiError && requestError.status === 401) {
          setReportSessionState({
            status: "signed_out",
            message: text.copy.yourSessionExpiredSignInAgain,
            details: `api status code: 401 | error message: ${requestError.message}`,
          });
          return;
        }
        if (requestError instanceof AdminApiError && requestError.status === 403) {
          setReportSessionState({
            status: "forbidden",
            message: text.copy.thisAccountDoesNotHaveAdministratorAccess,
            details:
              typeof requestError.details === "string"
                ? requestError.details
                : `api status code: 403 | error message: ${requestError.message}`,
          });
          return;
        }
        setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadReports);
        setDataState(showFullLoadingState ? "error" : "ready");
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }

    void loadReports();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [reportSession, reportSessionStatus, setReportSessionState, queryString, refreshNonce]);

  useEffect(() => {
    if (!selectedId || adminSession.state.status !== "ready" || !adminSession.session) {
      setDetail(null);
      setDetailMissing(false);
      return;
    }
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      setDetailMissing(false);
      try {
        const payload = await adminFetch<ReportDetailPayload>(`/api/admin/reports/${selectedId}`, {
          method: "GET",
          session: adminSession.session,
        });
        if (!cancelled) {
          setDetail(payload);
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          if (requestError instanceof AdminApiError && requestError.status === 404) {
            setDetail(null);
            setDetailMissing(true);
            setError("");
            return;
          }
          setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadReportDetails);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [adminSession.session, adminSession.state.status, selectedId]);

  useEffect(() => {
    if (filteredReports.length === 0) return;
    if (selectedId && filteredReports.some((report) => report.id === selectedId)) return;
    setSelectedId(filteredReports[0]?.id ?? null);
  }, [filteredReports, selectedId]);

  function clearFilters() {
    setFilters({
      status: "all",
      target_type: "all",
      reason_code: "all",
      priority: "all",
    });
    setSearchQuery("");
  }

  async function runAction(action: ReportAdminAction) {
    if (!selectedReport || !adminSession.session) return;
    setActionLoading(action);
    setError("");
    setDialogError("");
    setRowMessage("");
    try {
      const payload = await adminFetch<ActionPayload>(`/api/admin/reports/${selectedReport.id}/action`, {
        method: "POST",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: note.trim() || null,
          until: until.trim() || null,
        }),
      });

      if (payload.report) {
        setReports((current) =>
          current.map((report) => (report.id === payload.report?.id ? payload.report : report)),
        );
      }
      if (payload.report && payload.events) {
        setDetail({ report: payload.report, events: payload.events });
      }

      setRowMessage(buildActionSuccessMessage(action));
      setDialogError("");
      setConfirmState(null);
      if (action !== "reviewing") {
        setNote("");
        setUntil("");
      }
      setRefreshNonce((current) => current + 1);
    } catch (requestError) {
      const nextError = getActionErrorMessage(requestError);
      if (confirmState?.action === action) {
        setDialogError(nextError);
      } else {
        setError(nextError);
      }
    } finally {
      setActionLoading(null);
    }
  }

  function requestAction(action: ReportAdminAction) {
    if (!selectedReport) return;
    setError("");
    setDialogError("");
    setRowMessage("");
    setConfirmState({ action, reportId: selectedReport.id });
  }

  const confirmReport =
    confirmState?.reportId === selectedReport?.id
      ? selectedReport
      : reports.find((report) => report.id === confirmState?.reportId) ?? null;
  const confirmConfig = confirmState ? ACTION_CONFIG[confirmState.action] : null;

  if (adminSession.state.status === "checking") {
    return <div className="community-empty admin-state-message"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong></div>;
  }
  if (adminSession.state.status === "timeout") {
    return <div className="community-empty admin-state-message admin-timeout"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>{adminSession.state.details ? <p className="admin-debug-note">{adminSession.state.details}</p> : null}</div>;
  }
  if (adminSession.state.status === "signed_out") {
    return <div className="community-empty admin-state-message"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>{adminSession.state.details ? <p className="admin-debug-note">{adminSession.state.details}</p> : null}</div>;
  }
  if (adminSession.state.status === "forbidden") {
    return <div className="community-empty admin-state-message admin-error"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>{adminSession.state.details ? <p className="admin-debug-note">{adminSession.state.details}</p> : null}</div>;
  }
  if (adminSession.state.status === "error") {
    return <div className="community-empty admin-state-message admin-error"><strong>{localizeAdminSessionMessage(adminSession.state.message, locale)}</strong>{adminSession.state.details ? <p className="admin-debug-note">{adminSession.state.details}</p> : null}</div>;
  }

  return (
    <section className="community-surface">
      <div className="community-stream-head">
        <div>
          <h2>{text.copy.reportQueue}</h2>
          <p>{text.copy.reviewReportStatusTargetsAndHistoryWhilePreservingReporter}</p>
        </div>
      </div>

      <div className="admin-user-line">
        {text.copy.currentAdministrator}{adminSession.me?.profile?.display_name || adminSession.me?.profile?.username || shortId(adminSession.me?.user_id)} {text.copy.role}{adminSession.me?.role}
      </div>

      <div className="admin-reports-overview">
        <div className="admin-reports-overview__card">
          <span>{text.copy.currentResults}</span>
          <strong>{queueSummary.total}</strong>
          <p>{text.copy.reportsAfterFilteringAndSearch}</p>
        </div>
        <div className="admin-reports-overview__card">
          <span>{text.copy.open}</span>
          <strong>{queueSummary.open}</strong>
          <p>{text.copy.awaitingAnAdministrator}</p>
        </div>
        <div className="admin-reports-overview__card">
          <span>{text.copy.inReview}</span>
          <strong>{queueSummary.reviewing}</strong>
          <p>{text.copy.assignedToAnAdministrator}</p>
        </div>
        <div className="admin-reports-overview__card">
          <span>{text.copy.highPriority}</span>
          <strong>{queueSummary.highPriority}</strong>
          <p>{text.copy.reportsToReviewFirst}</p>
        </div>
      </div>

      <div className="admin-reports-toolbar">
        <label className="admin-search-field">
          <span className="community-meta">{text.copy.localSearch}</span>
          <input
            type="search"
            className="community-field"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={text.copy.searchReportTitlesExcerptsReasonsOrTargetIDs}
          />
        </label>

        <div className="admin-reports-filters" role="group" aria-label={text.copy.reportFilters}>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={filters.target_type} onChange={(event) => setFilters((current) => ({ ...current, target_type: event.target.value }))}>
            {TARGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={filters.reason_code} onChange={(event) => setFilters((current) => ({ ...current, reason_code: event.target.value }))}>
            {REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={filters.priority} onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}>
            {PRIORITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="button" className="admin-action-button admin-action-button--quiet" onClick={clearFilters}>
            {text.copy.clearFilters}</button>
        </div>
      </div>

      {activeFilterChips.length > 0 ? (
        <div className="admin-filter-chips" aria-label={text.copy.currentFilters}>
          {activeFilterChips.map((chip) => (
            <button key={chip.key} type="button" className="admin-filter-chip" onClick={chip.onClear}>
              {chip.label} {text.copy.clear}</button>
          ))}
        </div>
      ) : null}

      {error ? <div className="admin-error">{error}</div> : null}
      {rowMessage ? <div className="admin-inline-success">{rowMessage}</div> : null}
      {isRefreshing && reports.length > 0 ? <p className="community-meta admin-state-message">{text.copy.refreshingQueue}</p> : null}

      {dataState === "loading" && reports.length === 0 ? (
        <div className="admin-reports-loading">
          <p className="community-meta admin-state-message">{text.copy.loadingReports}</p>
          <div className="admin-reports-loading__grid">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="admin-report-skeleton" aria-hidden="true" />
            ))}
          </div>
        </div>
      ) : null}

      {dataState === "ready" && filteredReports.length === 0 ? (
        <div className="community-empty">
          <strong>{reports.length === 0 ? text.copy.noReports : text.copy.noMatchingResults}</strong>
          <p>{getFilteredEmptyMessage(searchQuery, filters)}</p>
        </div>
      ) : null}

      {filteredReports.length > 0 ? (
        <div className="admin-reports-layout">
          <div className="admin-reports-list" aria-label={text.copy.reports}>
            {filteredReports.map((report) => {
              const active = report.id === selectedId;
              const duplicateCount = Math.max(report.open_count_for_target - 1, 0);
              return (
                <button
                  key={report.id}
                  type="button"
                  className={cx(
                    "community-list-item admin-report-card admin-report-card--selectable",
                    active && "is-active",
                  )}
                  onClick={() => {
                    setSelectedId(report.id);
                    setError("");
                    setRowMessage("");
                  }}
                  aria-pressed={active}
                >
                  <div className="admin-action-row admin-action-row--spread">
                    <strong>{report.target?.title || `${targetLabel(report)} ${shortId(report.target_id)}`}</strong>
                    <div className="admin-report-card__badges">
                      <span className={STATUS_BADGE_CLASS[report.status] ?? "admin-pill"}>{statusLabel(report.status)}</span>
                      <span className={PRIORITY_CLASS[report.priority]}>{priorityLabel(report.priority)}</span>
                    </div>
                  </div>

                  <div className="admin-report-card__meta">
                    <span className="admin-pill admin-pill--target">{targetLabel(report)}</span>
                    <span className="admin-pill admin-pill--reason">{reasonLabel(report.reason_code)}</span>
                    {getTargetStateBadges(report).map((badge, index) => (
                      <span key={`${badge.label}-${index}`} className={badge.className}>{badge.label}</span>
                    ))}
                  </div>

                  <div className="admin-report-target">
                    <span>
                      {text.copy.reporter}{profileLabel(report.reporter_profile, text.copy.anonymousReporter)} {text.copy.created}{formatDateTime(report.created_at)}
                    </span>
                    <p className="admin-post-excerpt">{report.target?.excerpt || report.reason_text || report.reason}</p>
                  </div>

                  <div className="admin-report-card__footer">
                    <span>{text.copy.targetAuthor}{profileLabel(report.target?.author_profile ?? null, text.copy.notRecorded)}</span>
                    <span>{text.copy.lastActivity}{formatDateTime(getLatestActivity(report))}</span>
                    <span>{duplicateCount > 0 ? formatUiMessage(text.copy.openReportsCount, { value0: report.open_count_for_target }) : text.copy.theOnlyOpenReportForThisTarget}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="admin-reports-detail community-list-item">
            {detailLoading ? (
              <p className="community-meta">{text.copy.loadingReportDetails}</p>
            ) : !selectedReport && detailMissing ? (
              <div className="community-empty admin-report-empty-detail">
                <strong>{text.copy.reportUnavailable}</strong>
                <p>{text.copy.thisReportMayBeDeletedOrTemporarilyUnavailableSelect}</p>
              </div>
            ) : !selectedReport ? (
              <p className="community-meta">{text.copy.selectAReportToViewDetails}</p>
            ) : (
              <>
                <div className="admin-action-row admin-action-row--spread">
                  <div>
                    <strong>{selectedReport.target?.title || `${targetLabel(selectedReport)} ${shortId(selectedReport.target_id)}`}</strong>
                    <p className="community-meta admin-detail-subtitle">
                      {targetLabel(selectedReport)} {text.copy.reportStatus}{statusLabel(selectedReport.status)} {text.copy.openReportsForThisTarget}{selectedReport.open_count_for_target}
                    </p>
                  </div>
                  <div className="admin-inline-actions">
                    {targetLink(selectedReport) ? (
                      <a href={targetLink(selectedReport) ?? "#"} className="admin-action-button">
                        {text.copy.viewTarget}</a>
                    ) : (
                      <span className="admin-action-button" aria-disabled="true">{text.copy.targetInaccessible}</span>
                    )}
                  </div>
                </div>

                <div className="admin-detail-panels">
                  <section className="admin-detail-panel">
                    <h3>{text.copy.reportInformation}</h3>
                    <div className="admin-meta-grid">
                      <span>{text.copy.reportID}<code>{shortId(selectedReport.id)}</code></span>
                      <span>{text.copy.reporter}{profileLabel(selectedReport.reporter_profile)} <code>{shortId(selectedReport.reporter_id)}</code></span>
                      <span>{text.copy.reasonCategory}{reasonLabel(selectedReport.reason_code)}</span>
                      <span>{text.copy.priority}{priorityLabel(selectedReport.priority)}</span>
                      <span>{text.copy.created2}{formatDateTime(selectedReport.created_at)}</span>
                      <span>{text.copy.lastActivity}{formatDateTime(getLatestActivity(selectedReport))}</span>
                    </div>
                  </section>

                  <section className="admin-detail-panel">
                    <h3>{text.copy.targetOverview}</h3>
                    <div className="admin-meta-grid">
                      <span>{text.copy.targetType}{targetLabel(selectedReport)}</span>
                      <span>{text.copy.targetID}<code>{shortId(selectedReport.target_id)}</code></span>
                      <span>{text.copy.contentAuthor}{profileLabel(selectedReport.target?.author_profile ?? null)} <code>{shortId(selectedReport.target?.author_id ?? null)}</code></span>
                      <span>{text.copy.currentVisibility}{getTargetStateBadges(selectedReport).map((badge) => badge.label).join(" / ") || text.copy.notRecorded}</span>
                      <span>{text.copy.assignedAdministrator}<code>{shortId(selectedReport.assigned_to)}</code></span>
                      <span>{text.copy.resolvedBy}<code>{shortId(selectedReport.resolved_by)}</code></span>
                    </div>
                    <div className="admin-report-target">
                      <span>{text.copy.targetExcerpt}</span>
                      <p className="admin-post-excerpt">{selectedReport.target?.excerpt || text.copy.noTargetExcerptAvailable}</p>
                    </div>
                  </section>

                  <section className="admin-detail-panel">
                    <h3>{text.copy.reportDescription}</h3>
                    <div className="admin-report-target">
                      <span>{text.copy.reportReason}</span>
                      <p className="admin-post-excerpt">{selectedReport.reason_text || selectedReport.reason}</p>
                      <span>{text.copy.handlingNote}</span>
                      <p className="admin-post-excerpt">{selectedReport.resolution_note || text.copy.noHandlingNoteRecorded}</p>
                      <span>{text.copy.completedAt}</span>
                      <p className="admin-post-excerpt">{selectedReport.resolved_at ? formatDateTime(selectedReport.resolved_at) : text.copy.notResolved}</p>
                    </div>
                  </section>
                </div>

                <section className="admin-detail-panel">
                  <h3>{text.copy.actionInput}</h3>
                  <p className="community-meta">{text.copy.addANoteForHighRiskActionsSuspendingA}</p>
                  <label className="admin-note-field">
                    <span className="community-meta">{text.copy.handlingNote}</span>
                    <textarea
                      className="glass-textarea"
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={text.copy.recordTheReasonEvidenceSummaryOrUserSafetyContext}
                      maxLength={1000}
                    />
                  </label>

                  <label className="admin-note-field">
                    <span className="community-meta">{text.copy.suspensionExpiry}</span>
                    <input
                      type="datetime-local"
                      className="community-field"
                      value={until}
                      onChange={(event) => setUntil(event.target.value)}
                    />
                  </label>
                </section>

                <section className="admin-detail-panel">
                  <h3>{text.copy.actions}</h3>
                  <div className="admin-action-groups">
                    <div className="admin-action-group">
                      <div>
                        <strong>{ACTION_GROUP_LABELS.low.title}</strong>
                        <p className="community-meta">{ACTION_GROUP_LABELS.low.description}</p>
                      </div>
                      <div className="admin-inline-actions">
                        {(["reviewing", "dismiss"] as ReportAdminAction[]).map((action) => (
                          <button
                            key={action}
                            type="button"
                            className="admin-action-button"
                            disabled={actionLoading !== null}
                            onClick={() => requestAction(action)}
                          >
                            {actionLoading === action ? ACTION_CONFIG[action].loadingLabel : ACTION_CONFIG[action].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(isHideSupported(selectedReport) || isRejectSupported(selectedReport)) ? (
                      <div className="admin-action-group">
                        <div>
                          <strong>{ACTION_GROUP_LABELS.content.title}</strong>
                          <p className="community-meta">{ACTION_GROUP_LABELS.content.description}</p>
                        </div>
                        <div className="admin-inline-actions">
                          {isHideSupported(selectedReport) ? (
                            <button
                              type="button"
                              className="admin-action-button"
                              disabled={actionLoading !== null}
                              onClick={() => requestAction("hide_target")}
                            >
                              {actionLoading === "hide_target" ? ACTION_CONFIG.hide_target.loadingLabel : ACTION_CONFIG.hide_target.label}
                            </button>
                          ) : null}
                          {isRejectSupported(selectedReport) ? (
                            <button
                              type="button"
                              className="admin-action-button"
                              disabled={actionLoading !== null}
                              onClick={() => requestAction("reject_target")}
                            >
                              {actionLoading === "reject_target" ? ACTION_CONFIG.reject_target.loadingLabel : ACTION_CONFIG.reject_target.label}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {hasTargetUser(selectedReport) ? (
                      <div className="admin-action-group admin-action-group--danger">
                        <div>
                          <strong>{ACTION_GROUP_LABELS.safety.title}</strong>
                          <p className="community-meta">{ACTION_GROUP_LABELS.safety.description}</p>
                        </div>
                        <div className="admin-inline-actions">
                          {(["warn_user", "suspend_user", "ban_user"] as ReportAdminAction[]).map((action) => (
                            <button
                              key={action}
                              type="button"
                              className={cx(
                                "admin-action-button",
                                ACTION_CONFIG[action].danger && "admin-action-danger",
                              )}
                              disabled={actionLoading !== null}
                              onClick={() => requestAction(action)}
                            >
                              {actionLoading === action ? ACTION_CONFIG[action].loadingLabel : ACTION_CONFIG[action].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>

                <div className="admin-report-events">
                  <h3>{text.copy.actionTimeline}</h3>
                  {detail?.events?.length ? (
                    detail.events.map((event) => {
                      const summary = summarizeEvent(event);
                      return (
                        <div key={event.id} className="admin-report-event">
                          <div className="admin-action-row admin-action-row--spread">
                            <strong>{summary.title}</strong>
                            <span className="community-meta">{formatDateTime(event.created_at)}</span>
                          </div>
                          <p className="community-meta">
                            {text.copy.actor}{profileLabel(event.actor_profile)} {event.actor_id ? <code>{shortId(event.actor_id)}</code> : null}
                          </p>
                          <ul className="admin-event-lines">
                            {summary.lines.map((line, index) => <li key={`${event.id}-${index}`}>{line}</li>)}
                          </ul>
                        </div>
                      );
                    })
                  ) : (
                    <p className="community-meta">{text.copy.noActionHistory}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <GlassConfirmDialog
        open={!!confirmState && !!confirmReport && !!confirmConfig}
        title={confirmConfig?.confirmTitle ?? text.copy.confirmAction}
        description={confirmConfig?.confirmDescription ?? text.copy.confirmBeforeContinuing}
        detail={confirmReport && confirmState ? buildActionDetail(confirmReport, confirmState.action, note, until) : ""}
        confirmLabel={confirmConfig?.confirmLabel ?? text.copy.confirm}
        cancelLabel={text.copy.cancel}
        danger={confirmConfig?.danger ?? false}
        loading={!!confirmState && actionLoading === confirmState.action}
        loadingLabel={confirmConfig?.loadingLabel ?? text.copy.processing}
        error={dialogError}
        onCancel={() => {
          if (actionLoading) return;
          setConfirmState(null);
          setDialogError("");
        }}
        onConfirm={() => {
          if (!confirmState) return;
          void runAction(confirmState.action);
        }}
      />
    </section>
  );
}
