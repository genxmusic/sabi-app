import { useState, type FormEvent } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/store'
import { errText, intlPhone, supabase } from '../lib/supabase'

/** Sign up or sign in with a phone number (SMS code) or an email and password. */
export default function Login() {
  const { session } = useApp()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [how, setHow] = useState<'phone' | 'email'>('phone')
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [f, setF] = useState({ name: '', business: '', location: '', phone: '', email: '', password: '', code: '' })
  const [sent, setSent] = useState(false)
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  if (session) return <Navigate to={next.startsWith('/') ? next : '/'} replace />
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const meta = { full_name: f.name.trim(), business: f.business.trim(), location: f.location.trim() }

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(''); setMsg('')
    if (mode === 'up' && !f.name.trim()) { setErr('Enter your name.'); return }
    setBusy(true)
    try {
      if (how === 'phone') {
        const phone = intlPhone(f.phone)
        if (!phone) throw new Error("That phone number doesn't look right.")
        if (!sent) {
          const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: mode === 'up', data: mode === 'up' ? meta : undefined } })
          if (error) throw error
          setSent(true); setMsg('We sent a code by SMS to ' + phone + '.')
        } else {
          const { error } = await supabase.auth.verifyOtp({ phone, token: f.code.trim(), type: 'sms' })
          if (error) throw error
        }
      } else if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email: f.email.trim(), password: f.password, options: { data: meta, emailRedirectTo: location.origin + next } })
        if (error) throw error
        if (!data.session) setMsg('Check your email and tap the link to finish signing up.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw error
      }
    } catch (x) {
      const m = errText(x)
      setErr(/Signups not allowed|User not found|otp_disabled/i.test(m) && mode === 'in' ? 'No account with that number yet. Tap "Create account".' : m)
    } finally { setBusy(false) }
  }

  return (
    <section className="band"><div className="wrap narrow">
      <h1>{mode === 'up' ? 'Create your Sabi account' : 'Sign in'}</h1>
      <p className="muted">{mode === 'up' ? 'Track your orders, payments and quotes in one place.' : 'Welcome back.'}</p>
      <div className="chips" role="tablist">
        <button className="chip" aria-pressed={how === 'phone'} onClick={() => { setHow('phone'); setSent(false) }}>Phone number</button>
        <button className="chip" aria-pressed={how === 'email'} onClick={() => setHow('email')}>Email</button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === 'up' && <>
          <label className="f"><span className="req">Full name</span><input value={f.name} onChange={set('name')} autoComplete="name" /></label>
          <label className="f">Business name<input value={f.business} onChange={set('business')} autoComplete="organization" /></label>
          <label className="f">Town<input value={f.location} onChange={set('location')} placeholder="e.g. Freetown" /></label>
        </>}
        {how === 'phone' ? <>
          <label className="f"><span className="req">Phone number</span><input type="tel" value={f.phone} onChange={set('phone')} placeholder="076 123 456" autoComplete="tel" disabled={sent} /></label>
          {sent && <label className="f"><span className="req">SMS code</span><input inputMode="numeric" value={f.code} onChange={set('code')} autoComplete="one-time-code" /></label>}
        </> : <>
          <label className="f"><span className="req">Email</span><input type="email" value={f.email} onChange={set('email')} autoComplete="email" /></label>
          <label className="f"><span className="req">Password</span><input type="password" value={f.password} onChange={set('password')} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={8} /></label>
        </>}
        {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : how === 'phone' ? (sent ? 'Confirm code' : 'Send me a code') : mode === 'up' ? 'Create account' : 'Sign in'}</button>
        {sent && <button type="button" className="linkbtn" onClick={() => { setSent(false); setF({ ...f, code: '' }) }}>Use a different number</button>}
      </form>
      <p>{mode === 'in' ? 'New to Sabi? ' : 'Already have an account? '}
        <button className="linkbtn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setSent(false); setErr(''); setMsg('') }}>{mode === 'in' ? 'Create account' : 'Sign in'}</button></p>
    </div></section>
  )
}
