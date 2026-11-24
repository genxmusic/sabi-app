import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useApp } from '../lib/store'
import { CATEGORIES, day, errText, supabase, type Category, type Option, type Order, type OrderStatus, type Profile, type Question, type Service, type Settings } from '../lib/supabase'
import { OrderCard } from './Orders'
import { RequireTwoStep } from '../lib/twostep'

const FILTERS: [string, OrderStatus[]][] = [
  ['Quotes to price', ['quote_requested']], ['Payments to check', ['payment_submitted']], ['Quotes sent', ['quote_sent', 'quote_declined']],
  ['Active', ['paid', 'in_progress']], ['Done', ['completed']], ['Rejected or cancelled', ['rejected', 'cancelled']],
]

type Line = { service_name: string; option_name: string; qty: number; price_usd: string; monthly_usd: string }

/** What the customer told us: answers per service, timing, own words and follow-ups */
function IntakeDetails({ o }: { o: Order }) {
  const i = o.intake
  if (!i) return null
  return (
    <details open={o.status === 'quote_requested'}><summary>All answers</summary>
      <div className="answers">
        {i.services?.map(s => <div key={s.id}><b>{s.name}</b><ul className="lines">{s.answers.filter(a => a.a).map(a => <li key={a.q}>{a.q}: <b>{a.a}</b></li>)}</ul></div>)}
        {i.when && <p>When: <b>{i.when}</b></p>}
        {i.description && <p>In their words: {i.description}</p>}
        {!!i.followups?.length && <div><b>Follow-up answers</b><ul className="lines">{i.followups.map(f => <li key={f.q}>{f.q}: <b>{f.a}</b></li>)}</ul></div>}
      </div>
    </details>
  )
}

function QuoteEditor({ o, onSaved }: { o: Order; onSaved: () => void }) {
  const { settings } = useApp()
  const rate = Number(settings?.nle_per_usd ?? o.nle_per_usd)
  const existing = o.order_items.filter(x => !x.is_quote)
  const [lines, setLines] = useState<Line[]>(existing.length
    ? existing.map(x => ({ service_name: x.service_name, option_name: x.option_name === '-' ? '' : x.option_name, qty: x.qty, price_usd: String(Number(x.price_usd) || ''), monthly_usd: String(Number(x.monthly_usd) || '') }))
    : o.order_items.map(x => ({ service_name: x.service_name, option_name: '', qty: 1, price_usd: '', monthly_usd: '' })))
  const [dep, setDep] = useState(String(o.deposit_pct ?? settings?.deposit_pct ?? 50))
  const [valid, setValid] = useState('14')
  const [note, setNote] = useState(o.quote_note ?? '')
  const [prices, setPrices] = useState<(Option & { services: { name: string } })[]>([])
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  useEffect(() => { supabase.from('service_options').select('*, services(name)').eq('active', true).order('sort').then(({ data }) => setPrices((data ?? []) as never)) }, [])
  const upd = (i: number, p: Partial<Line>) => setLines(lines.map((l, j) => j === i ? { ...l, ...p } : l))
  const once = lines.reduce((t, l) => t + (Number(l.price_usd) || 0) * (l.qty || 1), 0)
  const month = lines.reduce((t, l) => t + (Number(l.monthly_usd) || 0) * (l.qty || 1), 0)
  const today = Math.round(once * (Number(dep) || 0)) / 100 + month
  const fmt = (n: number) => 'NLe' + Math.round(n * rate).toLocaleString('en-US') + ' (US$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ')'
  async function save(send: boolean) {
    setErr(''); setMsg(''); setBusy(true)
    const { error } = await supabase.rpc('save_quote', {
      p_order: o.id, p_note: note, p_deposit_pct: Number(dep), p_valid_days: Number(valid), p_send: send,
      p_items: lines.filter(l => l.service_name.trim()).map(l => ({ ...l, price_usd: Number(l.price_usd) || 0, monthly_usd: Number(l.monthly_usd) || 0 })),
    })
    setBusy(false)
    if (error) setErr(errText(error)); else { setMsg(send ? 'Quote sent.' : 'Draft saved.'); onSaved() }
  }
  return (
    <div className="form quoteedit">
      <b>Price this quote</b>
      <p className="note">Prices in US$; the customer sees leones at today's rate (NLe{rate.toFixed(2)}).</p>
      {lines.map((l, i) => (
        <div className="qline" key={i}>
          <input aria-label="Item" placeholder="Item" value={l.service_name} onChange={e => upd(i, { service_name: e.target.value })} />
          <input aria-label="Details" placeholder="Details (optional)" value={l.option_name} onChange={e => upd(i, { option_name: e.target.value })} />
          <label>Qty<input type="number" min={1} value={l.qty} onChange={e => upd(i, { qty: Math.max(1, +e.target.value || 1) })} /></label>
          <label>One-off US$<input type="number" min={0} step="0.01" value={l.price_usd} onChange={e => upd(i, { price_usd: e.target.value })} /></label>
          <label>Monthly US$<input type="number" min={0} step="0.01" value={l.monthly_usd} onChange={e => upd(i, { monthly_usd: e.target.value })} /></label>
          <button type="button" className="linkbtn" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
        </div>))}
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setLines([...lines, { service_name: '', option_name: '', qty: 1, price_usd: '', monthly_usd: '' }])}>Add a line</button>
        {prices.length > 0 && <select className="inp" value="" onChange={e => { const p = prices.find(x => x.id === e.target.value); if (p) setLines([...lines, { service_name: p.services?.name ?? p.name, option_name: p.name + (p.subtitle ? ': ' + p.subtitle : ''), qty: 1, price_usd: String(Number(p.price_usd) || ''), monthly_usd: String(Number(p.monthly_usd) || '') }]) }}>
          <option value="">Add from price list…</option>
          {prices.filter(p => !p.is_quote).map(p => <option key={p.id} value={p.id}>{p.services?.name}: {p.name} ({[Number(p.price_usd) ? 'US$' + Number(p.price_usd) : '', Number(p.monthly_usd) ? 'US$' + Number(p.monthly_usd) + '/mo' : ''].filter(Boolean).join(' + ')})</option>)}
        </select>}
      </div>
      <div className="grid2">
        <label className="f">Deposit on one-off work (%)<input type="number" min={0} max={100} value={dep} onChange={e => setDep(e.target.value)} /></label>
        <label className="f">Quote valid for (days)<input type="number" min={1} max={90} value={valid} onChange={e => setValid(e.target.value)} /></label>
      </div>
      <label className="f">Note to the customer (optional)<textarea rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={2000} /></label>
      <div className="sum">
        <div><span>One-off total</span><span>{fmt(once)}</span></div>
        {month > 0 && <div><span>Monthly</span><span>{fmt(month)}</span></div>}
        <div className="big"><span>Customer pays now</span><span>{fmt(today)}</span></div>
      </div>
      {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      <div className="row"><button className="btn ghost" disabled={busy} onClick={() => save(false)}>Save draft</button>
        <button className="btn grow" disabled={busy} onClick={() => save(true)}>{o.status === 'quote_requested' ? 'Approve and send to customer' : 'Update and resend'}</button></div>
    </div>
  )
}

/** Tell the customer on WhatsApp that their quote is ready */
function TellCustomer({ o }: { o: Order }) {
  const [copied, setCopied] = useState(false)
  const name = o.profiles?.full_name?.split(' ')[0] || 'there'
  const msg = `Hello ${name}, your Sabi quote ${o.ref} is ready: ${nleFmt(o)} to start. See it and accept it here: https://www.sabitechsl.com/orders\n\nSabi IT and Security Solutions. Smart tech. Safe business.`
  const phone = (o.profiles?.phone ?? '').replace(/\D/g, '')
  return (
    <div className="row">
      {phone && <a className="btn blue" href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener noreferrer">Tell them on WhatsApp</a>}
      <button type="button" className="btn ghost" onClick={() => navigator.clipboard?.writeText(msg).then(() => setCopied(true)).catch(() => {})}>{copied ? 'Copied' : 'Copy message'}</button>
      {!phone && o.profiles?.email && <span className="note">Customer email: {o.profiles.email}</span>}
    </div>
  )
}
const nleFmt = (o: Order) => 'NLe' + Math.round(Number(o.pay_today_usd) * Number(o.nle_per_usd)).toLocaleString('en-US')

function AdminOrders() {
  const [tab, setTab] = useState(0)
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [q, setQ] = useState(''); const [err, setErr] = useState('')
  async function load() {
    const { data, error } = await supabase.from('orders').select('*, order_items(*), profiles!orders_customer_id_fkey(full_name, business, email, phone)')
      .in('status', FILTERS[tab][1]).order('created_at', { ascending: false }).limit(200)
    if (error) setErr(errText(error)); setOrders((data ?? []) as Order[])
  }
  useEffect(() => { setOrders(null); load() }, [tab])
  async function act(o: Order, status: OrderStatus) {
    setErr('')
    const { error } = await supabase.rpc('set_order_status', { p_order: o.id, p_status: status, p_note: notes[o.id] || null })
    if (error) setErr(errText(error)); else load()
  }
  const term = q.trim().toLowerCase()
  const shown = (orders ?? []).filter(o => !term || [o.ref, o.txn_id, o.payer_number, o.profiles?.full_name, o.profiles?.business, o.profiles?.phone, o.profiles?.email, o.ai_summary].some(v => v?.toLowerCase().includes(term)))
  const actions: Partial<Record<OrderStatus, [OrderStatus, string, string?][]>> = {
    payment_submitted: [['paid', 'Payment received'], ['rejected', 'Payment not found', 'ghost']],
    quote_requested: [['cancelled', 'Cancel request', 'ghost']],
    quote_sent: [['cancelled', 'Withdraw quote', 'ghost']],
    quote_declined: [['cancelled', 'Close', 'ghost']],
    paid: [['in_progress', 'Start work'], ['completed', 'Mark completed', 'ghost']],
    in_progress: [['completed', 'Mark completed'], ['cancelled', 'Cancel', 'ghost']],
    rejected: [['payment_submitted', 'Check again', 'ghost']],
  }
  const quoting = (s: OrderStatus) => s === 'quote_requested' || s === 'quote_sent' || s === 'quote_declined'
  return (
    <>
      <div className="chips">{FILTERS.map(([n], i) => <button key={n} className="chip" aria-pressed={tab === i} onClick={() => setTab(i)}>{n}</button>)}</div>
      <label className="f mt">Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Reference, transaction ID, name, phone or request" /></label>
      {err && <p className="err">{err}</p>}
      {!orders ? <p>Loading…</p> : !shown.length ? <p className="muted">Nothing here.</p> : <div className="stackgap mt">{shown.map(o => (
        <OrderCard key={o.id} o={o} staff>
          <IntakeDetails o={o} />
          {o.status === 'quote_sent' && <TellCustomer o={o} />}
          {quoting(o.status) && <QuoteEditor o={o} onSaved={load} />}
          {actions[o.status] && <>
            {!quoting(o.status) && <label className="f">Note to customer (optional)<input value={notes[o.id] ?? ''} onChange={e => setNotes({ ...notes, [o.id]: e.target.value })} /></label>}
            <div className="row">{actions[o.status]!.map(([s, label, cls]) => <button key={s} className={'btn ' + (cls ?? '')} onClick={() => act(o, s)}>{label}</button>)}</div>
          </>}
        </OrderCard>))}</div>}
    </>
  )
}

const QTYPES: [Question['type'], string][] = [['text', 'Short answer'], ['long', 'Long answer'], ['number', 'Number'], ['select', 'Pick one'], ['multi', 'Pick any'], ['yesno', 'Yes / No']]

/** Edit the intake questions customers answer for one service */
function QuestionsEditor({ s, onSaved }: { s: Service; onSaved: () => void }) {
  const [qs, setQs] = useState<Question[]>(s.intake_questions ?? [])
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  const upd = (i: number, p: Partial<Question>) => setQs(qs.map((q, j) => j === i ? { ...q, ...p } : q))
  async function save() {
    setErr(''); setMsg('')
    const clean = qs.filter(q => q.label.trim()).map((q, i) => ({
      id: q.id || 'q' + Date.now().toString(36) + i, label: q.label.trim(), type: q.type,
      ...(q.type === 'select' || q.type === 'multi' ? { options: (q.options ?? []).map(o => o.trim()).filter(Boolean) } : {}),
      ...(q.required ? { required: true } : {}),
    }))
    if (clean.some(q => (q.type === 'select' || q.type === 'multi') && !q.options?.length)) { setErr('Questions of type "Pick one" or "Pick any" need choices.'); return }
    const { error } = await supabase.from('services').update({ intake_questions: clean }).eq('id', s.id)
    if (error) setErr(errText(error)); else { setMsg('Questions saved.'); setQs(clean as Question[]); onSaved() }
  }
  return (
    <details><summary>Intake questions ({qs.length})</summary>
      <div className="form">
        <p className="note">Customers answer these when they ask for a quote for this service. Everyone is also asked when they need it, where, and to describe it in their own words.</p>
        {qs.map((q, i) => (
          <div className="qline" key={q.id || i}>
            <input aria-label="Question" placeholder="Question" value={q.label} onChange={e => upd(i, { label: e.target.value })} />
            <select aria-label="Answer type" value={q.type} onChange={e => upd(i, { type: e.target.value as Question['type'] })}>{QTYPES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>
            {(q.type === 'select' || q.type === 'multi') && <input aria-label="Choices" placeholder="Choices, separated by commas" value={(q.options ?? []).join(', ')} onChange={e => upd(i, { options: e.target.value.split(',') })} />}
            <label className="check"><input type="checkbox" checked={!!q.required} onChange={e => upd(i, { required: e.target.checked })} /> Required</label>
            <button type="button" className="linkbtn" onClick={() => setQs(qs.filter((_, j) => j !== i))}>Remove</button>
          </div>))}
        <div className="row"><button type="button" className="btn ghost" onClick={() => setQs([...qs, { id: '', label: '', type: 'text' }])}>Add a question</button>
          <button type="button" className="btn" onClick={save}>Save questions</button></div>
        {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      </div>
    </details>
  )
}

function AdminServices() {
  const { services, reloadCatalogue } = useApp()
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  async function run(p: PromiseLike<{ error: unknown }>) {
    setErr(''); setMsg('')
    const { error } = await p
    if (error) setErr(errText(error)); else { setMsg('Saved.'); reloadCatalogue() }
  }
  const saveService = (s: Service, patch: Partial<Service>) => run(supabase.from('services').update(patch).eq('id', s.id))
  const saveOption = (o: Option, patch: Partial<Option>) => run(supabase.from('service_options').update(patch).eq('id', o.id))
  const addOption = (s: Service) => run(supabase.from('service_options').insert({ service_id: s.id, name: 'New package', sort: s.service_options.length + 1 }))
  const addService = () => run(supabase.from('services').insert({ category: 'digital', name: 'New service', active: false, sort: (services.at(-1)?.sort ?? 0) + 10 }))
  return (
    <>
      <p className="muted">The packages and prices below are your private price list: customers never see them, and you can add them to a quote with one click. Service names and descriptions are public. Changes go live straight away.</p>
      {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      <div className="stackgap">{services.map(s => (
        <article className="ordercard" key={s.id}>
          <div className="grid2">
            <label className="f">Service name<input defaultValue={s.name} onBlur={e => e.target.value !== s.name && saveService(s, { name: e.target.value })} /></label>
            <label className="f">Category<select value={s.category} onChange={e => saveService(s, { category: e.target.value as Category })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <label className="f">Description<textarea rows={2} defaultValue={s.description ?? ''} onBlur={e => e.target.value !== (s.description ?? '') && saveService(s, { description: e.target.value })} /></label>
          <div className="row">
            <label className="check"><input type="checkbox" checked={s.active} onChange={e => saveService(s, { active: e.target.checked })} /> Shown to customers</label>
            <label className="check"><input type="checkbox" checked={s.per_person} onChange={e => saveService(s, { per_person: e.target.checked })} /> Priced per person (paid in full)</label>
          </div>
          <div className="scroll"><table className="tbl"><thead><tr><th>Package</th><th>Subtitle</th><th>One-off US$</th><th>Monthly US$</th><th>Quote only</th><th>Shown</th></tr></thead>
            <tbody>{s.service_options.map(o => (
              <tr key={o.id}>
                <td><input defaultValue={o.name} onBlur={e => e.target.value !== o.name && saveOption(o, { name: e.target.value })} /></td>
                <td><input defaultValue={o.subtitle ?? ''} onBlur={e => e.target.value !== (o.subtitle ?? '') && saveOption(o, { subtitle: e.target.value })} /></td>
                <td><input type="number" min={0} step="0.01" defaultValue={o.price_usd} onBlur={e => +e.target.value !== Number(o.price_usd) && saveOption(o, { price_usd: +e.target.value })} /></td>
                <td><input type="number" min={0} step="0.01" defaultValue={o.monthly_usd} onBlur={e => +e.target.value !== Number(o.monthly_usd) && saveOption(o, { monthly_usd: +e.target.value })} /></td>
                <td><input type="checkbox" checked={o.is_quote} onChange={e => saveOption(o, { is_quote: e.target.checked })} /></td>
                <td><input type="checkbox" checked={o.active} onChange={e => saveOption(o, { active: e.target.checked })} /></td>
              </tr>))}</tbody></table></div>
          <button className="btn ghost" onClick={() => addOption(s)}>Add a package</button>
          <QuestionsEditor s={s} onSaved={reloadCatalogue} />
        </article>))}</div>
      <button className="btn mt" onClick={addService}>Add a service</button>
    </>
  )
}

function AdminCustomers() {
  const { profile } = useApp()
  const [rows, setRows] = useState<Profile[] | null>(null)
  const [q, setQ] = useState(''); const [who, setWho] = useState(''); const [role, setRole] = useState('staff')
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  const load = () => supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500).then(({ data }) => setRows((data ?? []) as Profile[]))
  useEffect(() => { load() }, [])
  async function setR() {
    setErr(''); setMsg('')
    const { error } = await supabase.rpc('set_role', { p_who: who, p_role: role })
    if (error) setErr(errText(error)); else { setMsg('Done.'); setWho(''); load() }
  }
  const term = q.trim().toLowerCase()
  const shown = (rows ?? []).filter(p => !term || [p.full_name, p.business, p.phone, p.email, p.location].some(v => v?.toLowerCase().includes(term)))
  return (
    <>
      {profile?.role === 'admin' && <div className="box">
        <b>Staff and admins</b><p className="note">Staff can check payments and update orders. Admins can also edit services, settings and roles.</p>
        <div className="row"><input className="grow inp" value={who} onChange={e => setWho(e.target.value)} placeholder="Their email or phone number" />
          <select className="inp" value={role} onChange={e => setRole(e.target.value)}><option value="staff">Staff</option><option value="admin">Admin</option><option value="customer">Customer</option></select>
          <button className="btn" onClick={setR}>Set role</button></div>
        {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      </div>}
      <label className="f mt">Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, business, phone or email" /></label>
      {!rows ? <p>Loading…</p> : <div className="scroll mt"><table className="tbl">
        <thead><tr><th>Name</th><th>Business</th><th>Phone</th><th>Email</th><th>Town</th><th>Role</th><th>Joined</th></tr></thead>
        <tbody>{shown.map(p => <tr key={p.id}><td>{p.full_name}</td><td>{p.business}</td><td className="nowrap">{p.phone ? '+' + p.phone.replace(/\D/g, '') : ''}</td><td>{p.email}</td><td>{p.location}</td><td>{p.role}</td><td className="nowrap">{day(p.created_at)}</td></tr>)}</tbody>
      </table><p className="note">{shown.length} accounts</p></div>}
    </>
  )
}

function AdminSettings() {
  const { settings, reloadCatalogue } = useApp()
  const [f, setF] = useState<Settings | null>(settings)
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('')
  useEffect(() => setF(settings), [settings])
  if (!f) return <p>Loading…</p>
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as Settings)
  async function acceptMarket() {
    setErr(''); setMsg('')
    const m = Number((f!.rate_alert ?? '').match(/to NLe([0-9.]+)/)?.[1])
    if (!m) { setErr('Could not read the new market rate. Turn off automatic updates and set the rate by hand.'); return }
    const { error } = await supabase.rpc('accept_market_rate', { p_market: m })
    if (error) setErr(errText(error)); else { setMsg('Market rate accepted.'); reloadCatalogue() }
  }
  async function save() {
    setErr(''); setMsg('')
    const { error } = await supabase.from('settings').update({
      ...(f!.rate_auto ? {} : { nle_per_usd: Number(f!.nle_per_usd), rate_date: f!.rate_date }),
      rate_auto: f!.rate_auto, rate_margin_pct: Number(f!.rate_margin_pct), deposit_pct: Number(f!.deposit_pct),
      whatsapp: f!.whatsapp?.replace(/\D/g, '') || null, email: f!.email?.trim() || null,
      orange_code: f!.orange_code?.trim() || null, afri_code: f!.afri_code?.trim() || null,
      orange_ussd: f!.orange_ussd, afri_ussd: f!.afri_ussd, card_link: f!.card_link?.trim() || null, updated_at: new Date().toISOString(),
    }).eq('id', 1)
    if (error) setErr(errText(error)); else { setMsg('Saved.'); reloadCatalogue() }
  }
  return (
    <div className="form">
      <div className="box">
        <b>Exchange rate</b>
        <p className="note">Customers see prices at <b>NLe{Number(f.nle_per_usd).toFixed(2)}</b> to US$1 (from {f.rate_date}).
          {f.rate_market ? <> Market rate NLe{Number(f.rate_market).toFixed(2)} from {f.rate_source}{f.rate_updated_at ? ', checked ' + day(f.rate_updated_at) : ''}.</> : null}</p>
        {f.rate_alert && <div className="adminnote"><p>{f.rate_alert}</p>
          <button className="btn" type="button" onClick={acceptMarket}>Accept market rate</button></div>}
        <label className="check"><input type="checkbox" checked={f.rate_auto} onChange={e => setF({ ...f, rate_auto: e.target.checked })} /> Update automatically every day (market rate + margin)</label>
        <div className="grid2">
          <label className="f">Sabi margin on top of market (%)<input type="number" min={0} max={50} step="0.5" value={f.rate_margin_pct} onChange={set('rate_margin_pct')} /></label>
          {!f.rate_auto && <>
            <label className="f">Leones per US$ (set by hand)<input type="number" step="0.01" value={f.nle_per_usd} onChange={set('nle_per_usd')} /></label>
            <label className="f">Rate date<input type="date" value={f.rate_date} onChange={set('rate_date')} /></label>
          </>}
        </div>
        <p className="note">A jump of more than 5% in one day is not applied automatically; you'll see a warning here to check it. Orders keep the rate they were placed at.</p>
      </div>
      <div className="grid2">
        <label className="f">Deposit on setup work (%)<input type="number" min={0} max={100} value={f.deposit_pct} onChange={set('deposit_pct')} /></label>
        <label className="f">WhatsApp number (with 232)<input value={f.whatsapp ?? ''} onChange={set('whatsapp')} /></label>
        <label className="f">Email<input type="email" value={f.email ?? ''} onChange={set('email')} /></label>
        <label className="f">Orange Money merchant code (Gen X Music)<input value={f.orange_code ?? ''} onChange={set('orange_code')} /></label>
        <label className="f">Orange Money dial code (menu)<input value={f.orange_ussd} onChange={set('orange_ussd')} /></label>
        <label className="f">Afrimoney merchant code (Gen X Music)<input value={f.afri_code ?? ''} onChange={set('afri_code')} /></label>
        <label className="f">Afrimoney dial code ({'{code}'} and {'{amount}'} are filled in)<input value={f.afri_ussd} onChange={set('afri_ussd')} /></label>
      </div>
      <label className="f">Stripe card payment link (customer chooses amount, US$)<input value={f.card_link ?? ''} onChange={set('card_link')} placeholder="https://buy.stripe.com/..." /></label>
      {msg && <p className="okmsg">{msg}</p>}{err && <p className="err">{err}</p>}
      <button className="btn" onClick={save}>Save settings</button>
    </div>
  )
}

type LogRow = { id: number; at: string; actor: string; action: string; target: string | null; details: Record<string, unknown> | null }
const show = (v: unknown) => v === null || v === undefined || v === '' ? '(empty)' : typeof v === 'object' ? JSON.stringify(v) : String(v)
function describe(d: LogRow['details']) {
  if (!d) return ''
  if ('from' in d && 'to' in d && Object.keys(d).every(k => ['from', 'to', 'note', 'txn_id', 'method'].includes(k)))
    return `${show(d.from)} → ${show(d.to)}` + (d.note ? ` · note: ${show(d.note)}` : '') + (d.txn_id ? ` · ID ${show(d.txn_id)}` : '')
  return Object.entries(d).map(([k, v]) => {
    const c = v as { from?: unknown; to?: unknown } | null
    return c && typeof c === 'object' && 'to' in c ? `${k.replace(/_/g, ' ')}: ${show(c.from)} → ${show(c.to)}` : `${k.replace(/_/g, ' ')}: ${show(v)}`
  }).join(' · ')
}

function AdminActivity() {
  const [rows, setRows] = useState<LogRow[] | null>(null); const [err, setErr] = useState(''); const [q, setQ] = useState('')
  useEffect(() => {
    supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(300)
      .then(({ data, error }) => { if (error) setErr(errText(error)); setRows((data ?? []) as LogRow[]) })
  }, [])
  const term = q.trim().toLowerCase()
  const shown = (rows ?? []).filter(r => !term || [r.actor, r.action, r.target, JSON.stringify(r.details)].some(v => v?.toLowerCase().includes(term)))
  return (
    <>
      <p className="muted">Every payment decision, price change, settings change and role change, with who did it. Entries can't be edited or deleted.</p>
      <label className="f">Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, order reference, action" /></label>
      {err && <p className="err">{err}</p>}
      {!rows ? <p>Loading…</p> : !shown.length ? <p className="muted">Nothing yet.</p> : <div className="scroll mt"><table className="tbl">
        <thead><tr><th>When</th><th>Who</th><th>What</th><th>On</th><th>Details</th></tr></thead>
        <tbody>{shown.map(r => <tr key={r.id}><td className="nowrap">{day(r.at)}</td><td>{r.actor}</td><td>{r.action}</td><td>{r.target}</td><td>{describe(r.details)}</td></tr>)}</tbody>
      </table></div>}
    </>
  )
}

export default function Admin() {
  const { profile } = useApp()
  const admin = profile?.role === 'admin'
  return (
    <section className="band"><div className="wrap">
      <h1>Sabi admin</h1>
      <RequireTwoStep>
      <nav className="tabs"><NavLink to="/admin" end>Orders</NavLink><NavLink to="/admin/customers">Customers</NavLink>
        {admin && <NavLink to="/admin/services">Services</NavLink>}{admin && <NavLink to="/admin/settings">Settings</NavLink>}{admin && <NavLink to="/admin/activity">Activity</NavLink>}</nav>
      <Routes>
        <Route index element={<AdminOrders />} />
        <Route path="customers" element={<AdminCustomers />} />
        {admin && <Route path="services" element={<AdminServices />} />}
        {admin && <Route path="settings" element={<AdminSettings />} />}
        {admin && <Route path="activity" element={<AdminActivity />} />}
      </Routes>
      </RequireTwoStep>
    </div></section>
  )
}

