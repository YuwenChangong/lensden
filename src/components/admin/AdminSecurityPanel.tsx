import { useEffect, useRef, useState } from "react";
import { useAdminSession } from "./useAdminSession";
import { enrollAdminTotp, loadAdminFactors, removeAdminTotp, verifyAdminTotp } from "../../lib/admin-totp";
import "./admin-security.css";

type Factor = Awaited<ReturnType<typeof loadAdminFactors>>[number];
type Enrollment = Awaited<ReturnType<typeof enrollAdminTotp>>;

export default function AdminSecurityPanel() {
  const { supabase, state } = useAdminSession();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [pending, setPending] = useState<Enrollment | null>(null);
  const [selected, setSelected] = useState("");
  const [backup, setBackup] = useState("");
  const [code, setCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const actor = state.status === "ready" ? state.me.user_id : null;
  const currentActor = useRef(actor);
  currentActor.current = actor;
  const operationActive = useRef(false);

  useEffect(() => {
    setPending(null); setCode(""); setBackupCode(""); setFactors([]); setSelected(""); setBackup("");
    let active = true;
    if (actor && supabase) {
      void loadAdminFactors(supabase).then(result => {
        if (active) setFactors(result);
      }).catch(() => { if (active) setMessage("Authenticator status unavailable."); });
    }
    return () => { active = false; };
  }, [actor, supabase]);

  async function run(action: () => Promise<() => void>) {
    if (operationActive.current || !supabase || !actor) return;
    operationActive.current = true;
    const startedFor = actor;
    setBusy(true); setMessage("");
    try {
      const apply = await action();
      const result = await loadAdminFactors(supabase);
      if (currentActor.current !== startedFor) return;
      apply();
      setFactors(result);
    } catch {
      if (currentActor.current === startedFor) setMessage("Operation not confirmed. Check your authenticator and session; no automatic retry was made.");
    } finally {
      operationActive.current = false;
      setCode(""); setBackupCode(""); setBusy(false);
    }
  }

  if (state.status !== "ready" || !supabase) {
    return <p role="status">{state.status === "signed_out" ? <a className="community-link" href="/login/?next=/admin/security/">Log in</a> : state.message}</p>;
  }
  const verified = factors.filter(factor => factor.status === "verified");
  const target = factors.find(factor => factor.id === selected);
  const verifyId = pending?.id ?? selected;
  // Render the Auth-provided QR as an image, never as executable inline SVG.
  const rawQr = pending?.totp.qr_code ?? "";
  const qr = rawQr.startsWith("data:image/svg+xml;utf-8,")
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(rawQr.slice("data:image/svg+xml;utf-8,".length))}` : "";

  return <div className="admin-security">
    <p role="status" aria-live="polite">{message}</p>
    <fieldset disabled={busy}>
      <legend>Authenticator</legend>
      <label>Saved authenticators
        <select value={selected} onChange={event => { setSelected(event.target.value); setCode(""); }}>
          <option value="">Select authenticator</option>
          {factors.map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Authenticator ${index + 1}`} ({factor.status})</option>)}
        </select>
      </label>
      <button className="community-button" type="button" disabled={!!pending} onClick={() => void run(async () => {
        const enrollment = await enrollAdminTotp(supabase);
        return () => { setPending(enrollment); setMessage("Scan the QR code with your authenticator, then verify its code."); };
      })}>Add authenticator</button>
      {pending && <div className="admin-security-enrollment">
        {qr && <img src={qr} width="220" height="220" alt="Private authenticator enrollment QR code" referrerPolicy="no-referrer" />}
        <details><summary>Private setup key</summary><code>{pending.totp.secret}</code></details>
      </div>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        await verifyAdminTotp(supabase, verifyId, code);
        return () => { setPending(null); setMessage("Server-verified AAL2 session active."); };
      }); }}>
        <label>Authenticator code
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value)} required />
        </label>
        <button className="community-button" type="submit" disabled={!verifyId || !/^\d{6}$/.test(code)}>Verify session</button>
      </form>
    </fieldset>
    <fieldset disabled={busy}>
      <legend>Recovery and replacement</legend>
      <p>Keep a second verified authenticator on a separately protected device before retiring an existing one. A password reset does not replace MFA.</p>
      <p>If every factor is lost, stop sensitive actions and contact the project owner for independently verified, explicitly authorized factor recovery. No self-service MFA bypass is provided.</p>
      {target?.status === "verified" && <label>Different verified backup authenticator
        <select value={backup} onChange={event => setBackup(event.target.value)}>
          <option value="">Select backup authenticator</option>
          {verified.filter(factor => factor.id !== selected).map((factor, index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || `Backup ${index + 1}`}</option>)}
        </select>
      </label>}
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        await removeAdminTotp(supabase, selected, backup, backupCode);
        return () => {
          if (pending?.id === selected) setPending(null);
          setSelected(""); setBackup(""); setMessage("Authenticator removal confirmed.");
        };
      }); }}>
        {target?.status === "verified" && <label>Backup authenticator code
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={backupCode} onChange={event => setBackupCode(event.target.value)} required />
        </label>}
        <label className="admin-security-confirm"><input type="checkbox" required />Retire the selected authenticator</label>
        <button className="community-button" type="submit" disabled={!target || (target.status === "verified" && (!backup || !/^\d{6}$/.test(backupCode)))}>Remove selected authenticator</button>
      </form>
    </fieldset>
    <a className="community-link" href="/admin/reports/">Return to reports</a>
  </div>;
}
