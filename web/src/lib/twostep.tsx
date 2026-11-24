import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { errText, supabase } from './supabase'

/**
 * Two-step sign-in for Sabi staff and admins (same approach as SmarTix): after the email or SMS code,
 * a 6-digit code from an authenticator app. The database only grants staff/admin powers after this step (aal2).
 */
type Level = { current: string | null; factorId: string | null; loading: boolean }

export function useTwoStep() {
  const [lvl, setLvl] = useState<Level>({ current: null, factorId: null, loading: true })
  const reload = useCallback(async () => {
    const [{ data: a }, { data: f }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ])
    const verified = f?.totp?.find(x => x.status === 'verified')
    setLvl({ current: a?.currentLevel ?? null, factorId: verified?.id ?? null, loading: false })
  }, [])
  useEffect(() => { reload() }, [reload])
  return { ...lvl, reload }
}

function CodePrompt({ factorId, onDone }: { factorId: string; onDone: () => void }) {
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    setBusy(false)
    if (error) setErr(/invalid|expired/i.test(error.message) ? 'That code is wrong or expired. Use the newest code in the app.' : errText(error))
    else { setCode(''); onDone() }
  }
  return (
    <form className="form" onSubmit={submit}>
      <h2>Enter your two-step code</h2>
      <p className="muted">Open your authenticator app and type the 6-digit code for Sabi.</p>
      <label className="f">Code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Continue'}</button>
    </form>
  )
}

function TwoStepSetup({ onDone }: { onDone: () => void }) {
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  async function start() {
    setErr(''); setBusy(true)
    const { data: f } = await supabase.auth.mfa.listFactors()   // clear any half-finished setup first
    for (const x of f?.all ?? []) if (x.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: x.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Sabi ' + new Date().toISOString().slice(0, 10) })
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  async function confirm(e: FormEvent) {
    e.preventDefault(); if (!enroll) return
    setErr(''); setBusy(true)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
    setBusy(false)
    if (error) setErr(/invalid|expired/i.test(error.message) ? 'That code is wrong. Type the code the app shows right now.' : errText(error)); else onDone()
  }
  if (!enroll) return (
    <div className="form">
      <h2>Set up two-step sign-in</h2>
      <p>Sabi staff and admin accounts need a second step when signing in: a 6-digit code from an authenticator app on your phone. This protects payments and prices even if someone gets into your email.</p>
      <p className="muted">First install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone.</p>
      {err && <p className="err">{err}</p>}
      <button className="btn" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Set up now'}</button>
    </div>
  )
  return (
    <form className="form" onSubmit={confirm}>
      <h2>Scan this code</h2>
      <ol className="how">
        <li>In your authenticator app, tap <b>+</b> and <b>Scan a QR code</b>.</li>
        <li>Scan the square below. Can't scan? Choose <b>Enter a setup key</b> and type the key.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <img src={enroll.qr} alt="QR code for your authenticator app" style={{ width: 200, height: 200, background: '#fff', padding: 8, borderRadius: 8, justifySelf: 'center' }} />
      <p className="note" style={{ textAlign: 'center', wordBreak: 'break-all' }}>Setup key: <code>{enroll.secret}</code></p>
      <label className="f">Code from the app<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} /></label>
      {err && <p className="err">{err}</p>}
      <button className="btn" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-step sign-in'}</button>
    </form>
  )
}

/** Staff and admin pages only open after the second step. */
export function RequireTwoStep({ children }: { children: ReactNode }) {
  const t = useTwoStep()
  if (t.loading) return <p className="muted">Loading…</p>
  if (t.current === 'aal2') return <>{children}</>
  return (
    <div className="narrow">
      <p className="adminnote">The admin pages open after your second sign-in step.</p>
      {t.factorId ? <CodePrompt factorId={t.factorId} onDone={t.reload} /> : <TwoStepSetup onDone={t.reload} />}
    </div>
  )
}
