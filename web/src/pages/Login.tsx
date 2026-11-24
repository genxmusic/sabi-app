import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/store'
import { errText, intlPhone, supabase } from '../lib/supabase'

/**
 * Sign up and sign in are the same step (like SmarTix): phone number or email, then a one-time code.
 * No passwords. New accounts are created on the first code; then we ask for name and business once.
 */
export default function Login() {
  const { session, profile, reloadProfile } = useApp()
  const [params] = useSearchParams()
  const raw = params.get('next') || ''
  const next = /^\/(?![/\\])/.test(raw) ? raw : '/'   // same-site paths only
  const nav = useNavigate()
  const [how, setHow] = useState<'phone' | 'email'>('phone')
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState('')
  const [code, setCode] = useState(''); const [sent, setSent] = useState(false)
  const [d, setD] = useState({ full_name: '', business: '', location: '' })
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)

  const needsDetails = !!session && !!profile && !profile.full_name
  useEffect(() => { if (session && profile && profile.full_name) nav(next, { replace: true }) }, [session, profile, next, nav])

  async function send(e: FormEvent) {
    e.preventDefault(); setErr('')
    const intl = intlPhone(phone)
    if (how === 'phone' && !intl) { setErr('Check the phone number, for example 076 123 456.'); return }
    if (how === 'email' && !/^\S+@\S+\.\S+$/.test(email.trim())) { setErr("That email address doesn't look right."); return }
    setBusy(true)
    const { error } = how === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: intl, options: { channel: 'sms' } })
      : await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.origin + '/login?next=' + encodeURIComponent(next) } })
    setBusy(false)
    if (error) setErr(errText(error)); else setSent(true)
  }

  async function verify(e: FormEvent) {
    e.preventDefault(); if (busy || !code.trim()) return
    setErr(''); setBusy(true)
    const { error } = how === 'phone'
      ? await supabase.auth.verifyOtp({ phone: intlPhone(phone), token: code.trim(), type: 'sms' })
      : await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setErr(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check it, or start again for a new one.' : errText(error))
  }

  async function saveDetails(e: FormEvent) {
    e.preventDefault(); setErr('')
    if (!d.full_name.trim()) { setErr('Enter your name.'); return }
    setBusy(true)
    const { error } = await supabase.from('profiles').update({
      full_name: d.full_name.trim(), business: d.business.trim() || null, location: d.location.trim() || null,
    }).eq('id', profile!.id)
    setBusy(false)
    if (error) setErr(errText(error)); else await reloadProfile()
  }

  if (needsDetails) return (
    <section className="band"><div className="wrap narrow">
      <h1>Welcome to Sabi</h1>
      <p className="muted">Tell us who you are, so we know who your orders are for.</p>
      <form className="form" onSubmit={saveDetails}>
        <label className="f"><span className="req">Full name</span><input value={d.full_name} onChange={e => setD({ ...d, full_name: e.target.value })} autoComplete="name" autoFocus /></label>
        <label className="f">Business name<input value={d.business} onChange={e => setD({ ...d, business: e.target.value })} autoComplete="organization" /></label>
        <label className="f">Town<input value={d.location} onChange={e => setD({ ...d, location: e.target.value })} placeholder="e.g. Freetown" /></label>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
      </form>
    </div></section>
  )

  if (session) return <section className="band wrap">Signing you in…</section>

  return (
    <section className="band"><div className="wrap narrow">
      <h1>Sign in or create an account</h1>
      <p className="muted">One step for both. We send you a code, no password needed.</p>
      {!sent ? (
        <form className="form" onSubmit={send}>
          <div className="chips" role="tablist">
            {(['phone', 'email'] as const).map(h => (
              <button key={h} type="button" role="tab" className="chip" aria-pressed={how === h} onClick={() => { setHow(h); setErr('') }}>
                {h === 'phone' ? 'Phone number' : 'Email'}</button>))}
          </div>
          {how === 'phone' ? <>
            <label className="f">Phone number<input type="tel" inputMode="tel" autoComplete="tel" placeholder="076 123 456" value={phone} onChange={e => setPhone(e.target.value)} /></label>
            <p className="note">We'll text you a sign-in code. Outside Sierra Leone? Start with + and your country code, or use Email.</p>
          </> : (
            <label className="f">Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
          )}
          {err && <p className="err">{err}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
        </form>
      ) : (
        <form className="form" onSubmit={verify}>
          <p className="okmsg">{how === 'phone'
            ? <>We sent a code by SMS to {intlPhone(phone)}.</>
            : <>We sent a sign-in email to {email.trim()}. Type the code from it, or tap the link in it.</>}</p>
          <label className="f">Code<input inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus /></label>
          {err && <p className="err">{err}</p>}
          <button className="btn" disabled={busy || !code}>{busy ? 'Checking…' : 'Sign in'}</button>
          <button type="button" className="btn ghost" onClick={() => { setSent(false); setCode(''); setErr('') }}>
            {how === 'phone' ? 'Wrong number? Start again' : 'Wrong email? Start again'}</button>
        </form>
      )}
    </div></section>
  )
}
