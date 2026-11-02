import { useEffect, useMemo, useState } from "react";
import { getSafeNext } from "../../lib/auth-redirect";
import { getLegalConsentStatus, LegalConsentClientError } from "../../lib/legal-consent-client";
import { classifyLegalConsentRoute, type LegalConsentAccessMode } from "../../lib/legal-consent-route-policy";
import { createBrowserSupabaseClient } from "../../lib/supabase-browser";
import type { LegalConsentAdapter, LegalConsentGateAdapter, LegalConsentNavigationAdapter } from "../../lib/legal-consent-adapters";

type GateState = "loading" | "failure" | "ready";

export default function LegalConsentGate({ pathname, authAdapter, consentAdapter, navigationAdapter }: { pathname: string; authAdapter?: LegalConsentGateAdapter; consentAdapter?: LegalConsentAdapter; navigationAdapter?: LegalConsentNavigationAdapter }) {
  const mode: LegalConsentAccessMode = useMemo(() => classifyLegalConsentRoute(pathname), [pathname]);
  const [state, setState] = useState<GateState>(mode === "exempt" ? "ready" : "loading");
  const [error, setError] = useState("");
  const reveal = () => document.querySelector<HTMLElement>("[data-consent-gated-main]")?.removeAttribute("hidden");
  const safeNext = getSafeNext(`${pathname}${window.location.search}`, "/");
  const redirect = (path: string) => {
    const destination = getSafeNext(path);
    if (navigationAdapter) navigationAdapter.replace(destination); else window.location.replace(destination);
  };

  useEffect(() => {
    let active = true;
    if (mode === "exempt") { reveal(); return; }
    const supabase = authAdapter ? null : createBrowserSupabaseClient();
    if (!supabase && !authAdapter) {
      if (mode === "public-signed-out-consent-if-authenticated") { reveal(); return; }
      redirect(`/login/?next=${encodeURIComponent(safeNext)}`); return;
    }
    async function check() {
      setState("loading"); setError("");
      const adapterSession = authAdapter ? await authAdapter.getSession() : null;
      const sessionResult = { token: adapterSession?.accessToken ?? null, error: null };
      const nativeSession = authAdapter ? null : await supabase!.auth.getSession();
      const token = authAdapter ? sessionResult.token : nativeSession?.data.session?.access_token ?? null;
      const sessionError = authAdapter ? sessionResult.error : nativeSession?.error;
      if (!active) return;
      if (sessionError || !token) {
        if (mode === "public-signed-out-consent-if-authenticated") { reveal(); setState("ready"); return; }
        redirect(`/login/?next=${encodeURIComponent(safeNext)}`); return;
      }
      try {
        const consent = consentAdapter ? await consentAdapter.getCurrentConsent(token) : await getLegalConsentStatus(token);
        if (!active) return;
        if (!consent.current) { redirect(`/legal-consent/?next=${encodeURIComponent(safeNext)}`); return; }
        reveal(); setState("ready");
      } catch (cause) {
        if (!active) return;
        if (cause instanceof LegalConsentClientError && cause.code === "UNAUTHORIZED") { redirect(`/login/?next=${encodeURIComponent(safeNext)}`); return; }
        setError(cause instanceof LegalConsentClientError && cause.code === "RATE_LIMITED" ? "政策确认状态检查过于频繁，请稍后重试。" : "暂时无法确认政策状态，请重试或退出登录。");
        setState("failure");
      }
    }
    void check();
    const unsubscribe = authAdapter?.subscribe ? authAdapter.subscribe(() => { void check(); }) : supabase!.auth.onAuthStateChange(() => { void check(); }).data.subscription.unsubscribe;
    return () => { active = false; unsubscribe(); };
  }, [mode, safeNext, authAdapter, consentAdapter]);
  if (state === "ready") return null;
  return <section className="legal-consent-gate" role={state === "failure" ? "alert" : "status"} aria-live="polite"><div className="auth-card">{state === "failure" ? <><p>{error}</p><div className="community-cta-row"><button className="community-button auth-button" onClick={() => window.location.reload()}>重试</button><a className="community-button--secondary auth-button" href={`/login/?next=${encodeURIComponent(safeNext)}`}>返回登录</a></div></> : <p>正在确认访问状态...</p>}</div></section>;
}
