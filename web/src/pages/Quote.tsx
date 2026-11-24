import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { errText, supabase, type Intake, type QA, type Question, type Service } from '../lib/supabase'

/**
 * Intelligent intake: the customer picks services, answers each service's own questions, the AI asks
 * follow-ups and writes a summary (no prices), and the request goes to Sabi to price and approve.
 */
type Answers = Record<string, Record<string, string | string[]>>   // service id -> question id -> answer
type Draft = { answers: Answers; when: string; description: string; address: string; followups: QA[]; summary: string; step: Step }
type Step = 'form' | 'followups' | 'summary'
const KEY = 'sabiIntakeDraft'
const WHEN = ['As soon as possible', 'Within a month', 'In 1 to 3 months', 'Just exploring']
const blank: Draft = { answers: {}, when: '', description: '', address: '', followups: [], summary: '', step: 'form' }
function loadDraft(): Draft { try { return { ...blank, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return blank } }

const show = (v: string | string[] | undefined) => Array.isArray(v) ? v.join(', ') : (v ?? '')

function Field({ q, value, onChange }: { q: Question; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const label = <span className={q.required ? 'req' : ''}>{q.label}</span>
  if (q.type === 'select' || q.type === 'yesno') {
    const opts = q.type === 'yesno' ? ['Yes', 'No', 'Not sure'] : q.options ?? []
    return <fieldset className="f"><legend>{label}</legend><div className="chips">{opts.map(o =>
      <button type="button" key={o} className="chip" aria-pressed={value === o} onClick={() => onChange(value === o ? '' : o)}>{o}</button>)}</div></fieldset>
  }
  if (q.type === 'multi') {
    const cur = Array.isArray(value) ? value : []
    return <fieldset className="f"><legend>{label} <span className="note">(choose any)</span></legend><div className="chips">{(q.options ?? []).map(o =>
      <button type="button" key={o} className="chip" aria-pressed={cur.includes(o)} onClick={() => onChange(cur.includes(o) ? cur.filter(x => x !== o) : [...cur, o])}>{o}</button>)}</div></fieldset>
  }
  if (q.type === 'long') return <label className="f">{label}<textarea rows={3} value={show(value)} onChange={e => onChange(e.target.value)} maxLength={1500} /></label>
  return <label className="f">{label}<input type={q.type === 'number' ? 'number' : 'text'} min={q.type === 'number' ? 0 : undefined} inputMode={q.type === 'number' ? 'numeric' : undefined}
    value={show(value)} onChange={e => onChange(e.target.value)} maxLength={300} /></label>
}

export default function Quote() {
  const { services, picked, setPicked, session, profile } = useApp()
  const nav = useNavigate()
  const [d, setD] = useState<Draft>(loadDraft)
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(''); const [aiUsed, setAiUsed] = useState(true)
  const [done, setDone] = useState<string | null>(null)
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)) } catch { /* private mode */ } }, [d])
  useEffect(() => { if (profile?.location && !d.address) setD(x => ({ ...x, address: profile.location ?? '' })) }, [profile])

  const chosen = useMemo(() => picked.map(id => services.find(s => s.id === id)).filter((s): s is Service => !!s && s.active), [picked, services])
  const others = services.filter(s => s.active && !picked.includes(s.id))
  const set = (p: Partial<Draft>) => setD(x => ({ ...x, ...p }))
  const answer = (sid: string, qid: string, v: string | string[]) => setD(x => ({ ...x, answers: { ...x.answers, [sid]: { ...x.answers[sid], [qid]: v } } }))

  const intake = (): Intake => ({
    services: chosen.map(s => ({ id: s.id, name: s.name, answers: (s.intake_questions ?? []).map(q => ({ q: q.label, a: show(d.answers[s.id]?.[q.id]) })) })),
    when: d.when, description: d.description.trim(), followups: d.followups.filter(f => f.a.trim()), ai: aiUsed,
  })
  const aiBody = (step: 'followups' | 'summary') => {
    const i = intake()
    return { step, services: i.services.map(s => ({ name: s.name, answers: [...s.answers, ...(d.when ? [{ q: 'When they need it', a: d.when }] : []), ...(d.address ? [{ q: 'Location', a: d.address }] : [])] })), description: i.description, followups: i.followups }
  }

  async function toFollowups() {
    setErr('')
    if (!chosen.length) { setErr('Choose at least one service.'); return }
    for (const s of chosen) for (const q of s.intake_questions ?? []) {
      const v = d.answers[s.id]?.[q.id]
      if (q.required && !(Array.isArray(v) ? v.length : String(v ?? '').trim())) { setErr(`Please answer: ${q.label} (${s.name})`); return }
    }
    if (!d.address.trim()) { setErr('Tell us your town or site address.'); return }
    if (!session) { nav('/login?next=/quote'); return }   // the draft is saved; they come straight back
    setBusy('Checking your answers…')
    const { data, error } = await supabase.functions.invoke('intake-ai', { body: aiBody('followups') })
    setBusy('')
    if (error || data?.error) { setErr(data?.error || errText(error)); return }
    setAiUsed(!!data.ai)
    const qs: string[] = data.questions ?? []
    if (!qs.length) return toSummary([])
    set({ followups: qs.map(q => ({ q, a: d.followups.find(f => f.q === q)?.a ?? '' })), step: 'followups' })
  }

  async function toSummary(followups = d.followups) {
    setErr(''); setBusy('Writing your summary…')
    const body = { ...aiBody('summary'), followups: followups.filter(f => f.a.trim()) }
    const { data, error } = await supabase.functions.invoke('intake-ai', { body })
    setBusy('')
    if (error || data?.error) { setErr(data?.error || errText(error)); return }
    setAiUsed(x => x && !!data.ai)
    set({ followups, summary: data.summary ?? '', step: 'summary' })
  }

  async function send() {
    setErr(''); setBusy('Sending…')
    const { data, error } = await supabase.rpc('submit_intake', {
      p_service_ids: chosen.map(s => s.id), p_intake: intake(), p_summary: d.summary.trim(), p_address: d.address.trim(), p_notes: '',
    })
    setBusy('')
    if (error) { setErr(errText(error)); return }
    setDone((data as { ref: string }[])[0].ref)
    setPicked([]); setD(blank); try { localStorage.removeItem(KEY) } catch { /* */ }
  }

  if (done) return (
    <section className="band"><div className="wrap narrow center">
      <svg width="64" height="72" viewBox="0 0 76 90"><path d="M38 0 76 14v30c0 22-15 38-38 46C15 82 0 66 0 44V14z" fill="#F16C21" /><path d="m22 44 11 11 21-22" stroke="#fff" strokeWidth="7" fill="none" /></svg>
      <h1>Request sent</h1><p>Your reference</p><div className="ref">{done}</div>
      <p>Sabi will review your request and prepare your quote. You'll find it in My orders, ready to accept and pay.</p>
      <Link className="btn" to="/orders">See my orders</Link>
    </div></section>
  )

  return (
    <section className="band"><div className="wrap narrow">
      <h1>Get a quote</h1>
      <div className="prog"><i className="on" /><i className={d.step !== 'form' ? 'on' : ''} /><i className={d.step === 'summary' ? 'on' : ''} /></div>

      {d.step === 'form' && <div className="form">
        <p className="muted">Answer a few questions about what you need. The more you tell us, the more accurate your quote.</p>
        {!chosen.length && <p className="adminnote">No service chosen yet. Pick one below.</p>}
        {chosen.map(s => (
          <div className="box" key={s.id}>
            <div className="row between"><h3>{s.name}</h3>
              <button type="button" className="linkbtn" onClick={() => setPicked(picked.filter(x => x !== s.id))}>Remove</button></div>
            {(s.intake_questions ?? []).map(q => <Field key={q.id} q={q} value={d.answers[s.id]?.[q.id]} onChange={v => answer(s.id, q.id, v)} />)}
          </div>))}
        {others.length > 0 && <fieldset className="f"><legend>Add another service</legend><div className="chips">
          {others.map(s => <button type="button" key={s.id} className="chip" onClick={() => setPicked([...picked, s.id])}>+ {s.name}</button>)}</div></fieldset>}
        <fieldset className="f"><legend>When do you need it?</legend><div className="chips">{WHEN.map(w =>
          <button type="button" key={w} className="chip" aria-pressed={d.when === w} onClick={() => set({ when: d.when === w ? '' : w })}>{w}</button>)}</div></fieldset>
        <label className="f"><span className="req">Town or site address</span><input value={d.address} onChange={e => set({ address: e.target.value })} placeholder="e.g. Wilberforce, Freetown" maxLength={200} /></label>
        <label className="f">Anything else, in your own words<textarea rows={4} value={d.description} onChange={e => set({ description: e.target.value })} maxLength={3000} placeholder="Krio or English is fine" /></label>
        {!session && <p className="note">Next, you'll sign in with your phone or email so we know where to send your quote. Your answers are kept.</p>}
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={!!busy} onClick={toFollowups}>{busy || 'Continue'}</button>
      </div>}

      {d.step === 'followups' && <div className="form">
        <h2>A few more questions</h2>
        <p className="muted">Our assistant needs a little more detail to get your quote right. Skip any you're not sure about.</p>
        {d.followups.map((f, i) => (
          <label className="f" key={f.q}>{f.q}<textarea rows={2} value={f.a} maxLength={800}
            onChange={e => set({ followups: d.followups.map((x, j) => j === i ? { ...x, a: e.target.value } : x) })} /></label>))}
        {err && <p className="err">{err}</p>}
        <div className="row"><button className="btn ghost" onClick={() => set({ step: 'form' })}>Back</button>
          <button className="btn grow" disabled={!!busy} onClick={() => toSummary()}>{busy || 'Continue'}</button></div>
      </div>}

      {d.step === 'summary' && <div className="form">
        <h2>Check your request</h2>
        <p className="muted">This is what we'll send to Sabi. You can correct anything before sending.</p>
        <textarea className="summary" rows={14} value={d.summary} onChange={e => set({ summary: e.target.value })} maxLength={6000} />
        {!aiUsed && <p className="note">Written from your answers.</p>}
        {err && <p className="err">{err}</p>}
        <div className="row"><button className="btn ghost" onClick={() => set({ step: d.followups.length ? 'followups' : 'form' })}>Back</button>
          <button className="btn grow" disabled={!!busy || !d.summary.trim()} onClick={send}>{busy || 'Send my request to Sabi'}</button></div>
      </div>}
    </div></section>
  )
}
