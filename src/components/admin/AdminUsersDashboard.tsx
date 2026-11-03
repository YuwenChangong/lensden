import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { getUiMessages, formatUiMessage } from "../../lib/i18n/catalog";
import { localizeAdminSessionMessage } from "../../lib/i18n/messages/admin";
import { useLocale } from "../i18n/useLocale";
import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../lib/admin-api-client";
import { buildProfileHref } from "../../lib/profile-links";
import { useAdminSession } from "./useAdminSession";

type UserListItem = {
  id: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  role?: string | null;
  created_at?: string | null;
  safety: {
    reputation_score: number;
    strike_count: number;
    warning_count: number;
    status: string;
    suspended_until?: string | null;
    last_action_at?: string | null;
  };
};

type SafetyEvent = {
  id: string;
  event_type: string;
  reason: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
  actor_profile?: {
    id?: string | null;
    username?: string | null;
    display_name?: string | null;
    role?: string | null;
  } | null;
};

type SafetyDetailPayload = {
  user?: UserListItem;
  state?: UserListItem["safety"] & { ban_reason?: string | null; effective_status?: string | null };
  events?: SafetyEvent[];
};

export default function AdminUsersDashboard({ localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: { localeContext?: LocaleContext } = {}) {
  const { context } = useLocale(localeContext);
  const locale = context.locale;
  const text = getUiMessages(locale).admin;
  function userLabel(user: UserListItem | null) {
    if (!user) return text.copy.noUserSelected;
    return user.display_name || user.username || user.id;
  }

  function formatDate(value?: string | null) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(locale);
  }

  function buildStatusLabel(status: string) {
    if (status === "warned") return text.copy.warned;
    if (status === "suspended") return text.copy.suspended;
    if (status === "banned") return text.copy.banned;
    return text.copy.active;
  }

  function mapUserSafetyError(message: string) {
    if (/USER_SAFETY_SELF_ACTION_FORBIDDEN/i.test(message)) return text.copy.youCannotApplyThisActionToYourOwnAdministrator;
    if (/REASON_REQUIRED/i.test(message)) return text.copy.enterAReason;
    if (/SUSPEND_UNTIL_REQUIRED/i.test(message)) return text.copy.enterTheSuspensionExpiry;
    if (/INVALID_SUSPEND_UNTIL/i.test(message)) return text.copy.invalidSuspensionExpiry;
    if (/SUSPEND_UNTIL_MUST_BE_FUTURE/i.test(message)) return text.copy.theSuspensionExpiryMustBeInTheFuture;
    if (/USER_ALREADY_BANNED/i.test(message)) return text.copy.thisUserIsAlreadyBanned;
    if (/USER_ALREADY_SUSPENDED/i.test(message)) return text.copy.thisUserIsAlreadySuspended;
    if (/USER_NOT_RESTRICTED/i.test(message)) return text.copy.thisUserHasNoSuspensionOrBanToRemove;
    if (/USER_SAFETY_ACTION_CONFLICT/i.test(message)) return text.copy.thisActionIsUnavailableInTheCurrentState;
    return message;
  }

  function eventTypeLabel(eventType: string) {
    if (eventType === "warn") return text.copy.warn;
    if (eventType === "warning") return text.copy.warn;
    if (eventType === "suspend") return text.copy.suspend;
    if (eventType === "ban") return text.copy.ban;
    if (eventType === "unban") return text.copy.liftRestriction;
    if (eventType === "strike_added") return text.copy.addStrike;
    if (eventType === "strike_removed") return text.copy.removeStrike;
    return text.copy.note;
  }

  function actorLabel(event: SafetyEvent) {
    return event.actor_profile?.display_name || event.actor_profile?.username || text.copy.administrator;
  }

  const adminSession = useAdminSession();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SafetyDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState<null | { type: "warn" | "suspend" | "ban" | "unban"; user: UserListItem }>(null);
  const [actionReason, setActionReason] = useState("");
  const [actionUntil, setActionUntil] = useState("");

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users],
  );

  async function loadUsers(nextQuery = query) {
    if (adminSession.state.status !== "ready" || !adminSession.session) return;
    setLoading(true);
    setError("");
    try {
      const payload = await adminFetch<{ users?: UserListItem[] }>(`/api/admin/users?q=${encodeURIComponent(nextQuery)}`, {
        method: "GET",
        session: adminSession.session,
      });
      const items = payload.users ?? [];
      setUsers(items);
      if (!selectedUserId && items[0]) {
        setSelectedUserId(items[0].id);
      } else if (selectedUserId && !items.some((item) => item.id === selectedUserId)) {
        setSelectedUserId(items[0]?.id ?? null);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadUsers);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(userId: string) {
    if (adminSession.state.status !== "ready" || !adminSession.session) return;
    setDetailLoading(true);
    setError("");
    try {
      const payload = await adminFetch<SafetyDetailPayload>(`/api/admin/users/${encodeURIComponent(userId)}/safety`, {
        method: "GET",
        session: adminSession.session,
      });
      setDetail(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : text.copy.failedToLoadSafetyDetails);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (adminSession.state.status !== "ready" || !adminSession.session) return;
    void loadUsers("");
  }, [adminSession.session, adminSession.state.status]);

  useEffect(() => {
    if (!selectedUserId) {
      setDetail(null);
      return;
    }
    void loadDetail(selectedUserId);
  }, [selectedUserId, adminSession.session, adminSession.state.status]);

  async function runAction() {
    if (!actionModal || !adminSession.session) return;
    setActionLoading(true);
    setError("");
    setSuccess("");
    try {
      const body =
        actionModal.type === "suspend"
          ? { reason: actionReason.trim(), until: actionUntil }
          : { reason: actionReason.trim() };

      await adminFetch(`/api/admin/users/${encodeURIComponent(actionModal.user.id)}/${actionModal.type}`, {
        method: "POST",
        session: adminSession.session,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      setSuccess(formatUiMessage(text.copy.actionApplied, { value0: eventTypeLabel(actionModal.type) }));
      setActionModal(null);
      setActionReason("");
      setActionUntil("");
      await loadUsers(query);
      await loadDetail(actionModal.user.id);
    } catch (requestError) {
      setError(mapUserSafetyError(requestError instanceof Error ? requestError.message : text.copy.actionFailed));
    } finally {
      setActionLoading(false);
    }
  }

  const state = detail?.state ?? selectedUser?.safety ?? null;

  return (
    <section className="community-surface">
      <div className="community-stream-head">
        <div>
          <h2>{text.copy.userSafetyConsole}</h2>
          <p>{text.copy.searchUsersInspectSafetyStatusAndManageWarningsSuspensions}</p>
        </div>
      </div>

      <div className="community-toolbar" style={{ marginTop: "1rem", gap: "0.75rem", flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text.copy.searchUsernameOrDisplayName}
          className="community-input"
          style={{ minWidth: "220px", flex: "1 1 280px" }}
        />
        <button type="button" className="community-button" onClick={() => void loadUsers(query)} disabled={loading}>
          {text.copy.search}</button>
      </div>

      {error ? <div className="admin-error" style={{ marginTop: "0.8rem" }}>{error}</div> : null}
      {success ? <div className="admin-success" style={{ marginTop: "0.8rem" }}>{success}</div> : null}

      <div style={{ display: "grid", gap: "1rem", marginTop: "1rem", gridTemplateColumns: "minmax(320px, 1.1fr) minmax(320px, 1fr)" }}>
        <div className="community-list">
          {loading ? <p className="community-meta">{text.copy.loadingUsers}</p> : null}
          {!loading && users.length === 0 ? (
            <div className="community-empty">
              <strong>{text.copy.noUsersFound}</strong>
            </div>
          ) : null}

          {users.map((user) => {
            const active = selectedUserId === user.id;
            return (
              <button
                key={user.id}
                type="button"
                className="community-list-item"
                onClick={() => setSelectedUserId(user.id)}
                style={{
                  textAlign: "left",
                  border: active ? "1px solid rgba(244,244,245,0.24)" : undefined,
                  background: active ? "rgba(255,255,255,0.06)" : undefined,
                }}
              >
                <div className="admin-action-row">
                  <strong>{userLabel(user)}</strong>
                  <span className="admin-status-badge">{buildStatusLabel(user.safety.status)}</span>
                </div>
                <div className="community-meta">@{user.username || "no-handle"} {text.copy.role}{user.role || "user"}</div>
                <div className="community-meta">warning {user.safety.warning_count} · strike {user.safety.strike_count}</div>
              </button>
            );
          })}
        </div>

        <div className="community-card-stack">
          {!selectedUser ? (
            <div className="community-empty"><strong>{text.copy.selectAUser}</strong></div>
          ) : (
            <>
              <article className="community-surface">
                <div className="admin-action-row">
                  <div>
                    <h3 style={{ margin: 0 }}>{userLabel(selectedUser)}</h3>
                    <div className="community-meta">
                      <a className="community-link" href={buildProfileHref({ id: selectedUser.id, username: selectedUser.username ?? null }) ?? undefined}>
                        {text.copy.viewPublicProfile}</a>
                    </div>
                  </div>
                  <span className="admin-status-badge">{buildStatusLabel(state?.status ?? "active")}</span>
                </div>
                <div className="community-meta" style={{ marginTop: "0.6rem" }}>
                  warning {state?.warning_count ?? 0} · strike {state?.strike_count ?? 0} · reputation {state?.reputation_score ?? 0}
                </div>
                {state?.suspended_until ? <div className="community-meta">{text.copy.suspendedUntil}{formatDate(state.suspended_until)}</div> : null}
                {detail?.state?.ban_reason ? <div className="community-meta">{text.copy.reason}{detail.state.ban_reason}</div> : null}
                <div className="admin-action-row" style={{ marginTop: "0.9rem", flexWrap: "wrap" }}>
                  <button type="button" className="community-button" onClick={() => setActionModal({ type: "warn", user: selectedUser })}>{text.copy.warn}</button>
                  <button type="button" className="community-button" onClick={() => setActionModal({ type: "suspend", user: selectedUser })}>{text.copy.suspend}</button>
                  <button type="button" className="community-button" onClick={() => setActionModal({ type: "ban", user: selectedUser })}>{text.copy.ban}</button>
                  <button type="button" className="community-button--secondary" onClick={() => setActionModal({ type: "unban", user: selectedUser })}>{text.copy.liftRestriction}</button>
                </div>
              </article>

              <article className="community-surface">
                <div className="community-stream-head">
                  <div>
                    <h3>{text.copy.eventHistory}</h3>
                    <p>{text.copy.administratorActionsNewestFirst}</p>
                  </div>
                </div>
                {detailLoading ? <p className="community-meta">{text.copy.loadingSafetyDetails}</p> : null}
                {!detailLoading && (!detail?.events || detail.events.length === 0) ? (
                  <div className="community-empty"><strong>{text.copy.noEventsYet}</strong></div>
                ) : null}
                {!detailLoading && detail?.events?.length ? (
                  <div className="community-list" style={{ marginTop: "0.8rem" }}>
                    {detail.events.map((event) => (
                      <article key={event.id} className="community-list-item">
                        <div className="admin-action-row">
                          <strong>{eventTypeLabel(event.event_type)}</strong>
                          <span className="community-meta">{formatDate(event.created_at)}</span>
                        </div>
                        <div className="community-meta">{text.copy.performedBy}{actorLabel(event)}</div>
                        {event.reason ? <div>{event.reason}</div> : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </article>
            </>
          )}
        </div>
      </div>

      {actionModal ? (
        <div className="glass-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="glass-confirm-dialog glass-modal">
            <div className="glass-confirm-header glass-modal__header">
              <h3>{eventTypeLabel(actionModal.type)}{text.copy.user}</h3>
              <p>{userLabel(actionModal.user)}</p>
            </div>
            <div className="glass-confirm-body glass-modal__body" style={{ display: "grid", gap: "0.75rem" }}>
              <textarea
                className="community-input"
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder={text.copy.enterAReason2}
                rows={4}
              />
              {actionModal.type === "suspend" ? (
                <input
                  className="community-input"
                  type="datetime-local"
                  value={actionUntil}
                  onChange={(event) => setActionUntil(event.target.value)}
                />
              ) : null}
            </div>
            <div className="glass-confirm-actions glass-modal__actions">
              <button type="button" className="community-button--secondary" onClick={() => setActionModal(null)} disabled={actionLoading}>
                {text.copy.cancel}</button>
              <button type="button" className="community-button" onClick={() => void runAction()} disabled={actionLoading}>
                {actionLoading ? text.copy.processing : text.copy.confirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
