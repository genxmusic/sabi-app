import { useEffect, useState } from 'react'
import { useApp } from '../lib/store'
import { errText, supabase } from '../lib/supabase'

export default function Account() {
  const { profile, reloadProfile } = useApp()
  const [f, setF] = useState({ full_name: '', business: '', location: '' })
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { if (profile) setF({ full_name: profile.full_name ?? '', business: profile.business ?? '', location: profile.location ?? '' }) }, [profile])
  if (!profile) return <section className="band wrap">Loading…</section>
  async function save() {
    setMsg(''); setErr('')
    const { error } = await supabase.from('profiles').update({ full_name: f.full_name.trim() || null, business: f.business.trim() || null, location: f.location.trim() || null }).eq('id', profile!.id)
    if (error) setErr(errText(error)); else { setMsg('Saved.'); reloadProfile() }
  }
  return (
    <section className="band"><div className="wrap narrow">
      <h1>Your account</h1>
      <p className="muted">Signed in with {profile.phone ? '+' + profile.phone.replace(/\D/g, '') : profile.email}{profile.role !== 'customer' ? ` · Sabi ${profile.role}` : ''}</p>
      <div className="form">
        <label className="f">Full name<input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></label>
        <label className="f">Business name<input value={f.business} onChange={e => setF({ ...f, business: e.target.value })} /></label>
        <label className="f">Town or address<input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} /></label>
        {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
        <button className="btn" onClick={save}>Save</button>
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </div></section>
  )
}
