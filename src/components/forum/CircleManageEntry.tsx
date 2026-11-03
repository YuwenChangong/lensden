import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import { useBrowserAuthState } from "../auth/useBrowserAuthState";
import { resolveLocale, type LocaleContext } from "../../lib/i18n/locale";
import { useLocale } from "../i18n/useLocale";

interface CircleManageEntryProps {
  localeContext?: LocaleContext;
  circleSlug: string;
  ownerId: string | null;
}

type ManageViewerPayload = {
  ok?: boolean;
  viewer?: {
    id: string;
    role: string | null;
    is_owner: boolean;
    can_manage: boolean;
  };
  error?: string;
};

export default function CircleManageEntry({ circleSlug, ownerId, localeContext = resolveLocale({ acceptLanguage: "zh-CN" }) }: CircleManageEntryProps) {
  const { messages } = useLocale(localeContext);
  const text = messages.community;
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const authState = useBrowserAuthState(supabase);
  const [canManage, setCanManage] = useState(false);
  const [checkingPermission, setCheckingPermission] = useState(true);

  useEffect(() => {
    if (authState.status !== "signed_in" || !authState.user || !supabase) {
      setCanManage(false);
      setCheckingPermission(authState.status === "checking");
      return;
    }

    const client = supabase;
    let cancelled = false;
    setCheckingPermission(true);
    client.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error || !data.session?.access_token) {
          console.warn("[circle-manage-entry] session lookup failed", error?.message ?? "missing access token");
          setCanManage(false);
          setCheckingPermission(false);
          return;
        }

        const response = await fetch(`/api/forum/circles/${circleSlug}/manage`, {
          method: "GET",
          headers: {
            authorization: `Bearer ${data.session.access_token}`,
          },
        });

        const payload = (await response.json().catch(() => null)) as ManageViewerPayload | null;
        if (cancelled) return;

        if (!response.ok) {
          const errorCode = payload?.error ?? `HTTP_${response.status}`;
          console.warn("[circle-manage-entry] manage visibility denied", errorCode, { circleSlug, ownerId });
          if (
            errorCode.includes("NOT_AUTHENTICATED") ||
            errorCode.includes("CIRCLE_MANAGE_FORBIDDEN") ||
            errorCode.includes("CIRCLE_NOT_FOUND")
          ) {
            setCanManage(false);
            setCheckingPermission(false);
            return;
          }
          console.warn("[circle-manage-entry] manage visibility check failed", errorCode);
          setCanManage(false);
          setCheckingPermission(false);
          return;
        }

        setCanManage(Boolean(payload?.viewer?.can_manage));
        setCheckingPermission(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("[circle-manage-entry] visibility check crashed", error);
        setCanManage(false);
        setCheckingPermission(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authState.status, authState.user, circleSlug, ownerId, supabase]);

  if (authState.status !== "signed_in" || !authState.user) {
    if (authState.status === "checking") {
      return <span className="community-action-button community-action-button--muted">{text.checkingPermission}</span>;
    }
    return null;
  }

  if (checkingPermission) {
    return <span className="community-action-button community-action-button--muted">{text.checkingPermission}</span>;
  }

  if (!canManage) {
    return null;
  }

  return (
    <a href={`/circles/${circleSlug}/manage/`} className="community-action-button community-action-button--muted">
      {text.manageCircle}
    </a>
  );
}
