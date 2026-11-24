import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { PayBox, type PayDetails } from '../components/PayBox'
import { useApp } from '../lib/store'
import { day, errText, METHOD, nle, STATUS, supabase, usd, type Order } from '../lib/supabase'

const priced = (o: Order) => !['quote_requested'].includes(o.status) && o.order_items.some(i => !i.is_quote)

export function OrderCard({ o, children, staff }: { o: Order; children?: ReactNode; staff?: boolean }) {
  const r = Number(o.nle_per_usd)
  return (
    <article className="ordercard">
      <div className="row between"><b className="refsm">{o.ref}</b><span className={'status s-' + o.status}>{STATUS[o.status]}</span></div>
      <p className="note">{day(o.created_at)}{o.address ? ' · ' + o.address : ''}</p>
      {o.profiles && <p><b>{o.profiles.full_name || 'No name'}</b>{o.profiles.business ? ' · ' + o.profiles.business : ''}<br /><span className="note">{[o.profiles.phone && '+' + o.profiles.phone.replace(/\D/g, ''), o.profiles.email].filter(Boolean).join(' · ')}</span></p>}
      {priced(o) ? <>
        <div className="scroll"><table className="tbl"><thead><tr><th>Item</th><th>Qty</th><th className="num">One-off</th><th className="num">Monthly</th></tr></thead>
          <tbody>{o.order_items.map(i => <tr key={i.id}><td><b>{i.service_name}</b>{i.option_name && i.option_name !== '-' ? <><br /><span className="note">{i.option_name}</span></> : null}</td><td>{i.qty}</td>
            <td className="num">{Number(i.price_usd) ? nle(i.price_usd * i.qty, r) : ''}</td><td className="num">{Number(i.monthly_usd) ? nle(i.monthly_usd * i.qty, r) + '/mo' : ''}</td></tr>)}</tbody></table></div>
        <div className="sum">
          <div className="big"><span>Pay now</span><span>{nle(o.pay_today_usd, r)} <small className="muted">({usd(o.pay_today_usd)})</small></span></div>
          {Number(o.balance_usd) > 0 && <div><span>Balance on completion</span><span>{nle(o.balance_usd, r)}</span></div>}
          {Number(o.monthly_usd) > 0 && <div><span>Then monthly</span><span>{nle(o.monthly_usd, r)}/mo</span></div>}
          {o.deposit_pct != null && Number(o.balance_usd) > 0 && <p className="note">Pay now = {o.deposit_pct}% deposit on setup work{Number(o.monthly_usd) > 0 ? ' + the first month' : ''}.</p>}
        </div>
        {o.quote_note && <p className="adminnote">{o.quote_note}</p>}
        {o.status === 'quote_sent' && o.quote_valid_until && <p className="note">Quote valid until {new Date(o.quote_valid_until + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>}
      </> : <ul className="lines">{o.order_items.map(i => <li key={i.id}>{i.service_name}</li>)}</ul>}
      {o.txn_id && <p>Paid by {o.method ? METHOD[o.method] : ''} · ID <b>{o.txn_id}</b>{o.payer_number ? ' from ' + o.payer_number : ''}</p>}
      {o.decline_reason && <p className="note">Declined: {o.decline_reason}</p>}
      {o.admin_note && <p className="adminnote">Sabi: {o.admin_note}</p>}
      {o.ai_summary && <details><summary>{staff ? 'Request summary' : 'Your request'}</summary><pre className="summary">{o.ai_summary}</pre></details>}
      {children}
    </article>
  )
}

function AcceptQuote({ o, onDone }: { o: Order; onDone: () => void }) {
  const { settings } = useApp()
  const [mode, setMode] = useState<'' | 'pay' | 'decline'>('')
  const [pay, setPay] = useState<PayDetails>({ method: '', txn: '', payer: '' })
  const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const expired = !!o.quote_valid_until && o.quote_valid_until < new Date().toISOString().slice(0, 10)
  if (expired) return <p className="note">This quote has expired. Please ask Sabi on WhatsApp for an updated quote.</p>
  async function accept() {
    setErr('')
    if (!pay.method) { setErr('Choose how you want to pay.'); return }
    if (!pay.txn.trim()) { setErr(pay.method === 'card' ? 'Enter the receipt number from your card payment.' : 'Enter the transaction ID from your payment SMS.'); return }
    if (pay.method !== 'card' && !pay.payer.trim()) { setErr('Enter the number you paid from.'); return }
    setBusy(true)
    const { error } = await supabase.rpc('accept_quote', { p_order: o.id, p_method: pay.method, p_txn: pay.txn, p_payer: pay.payer })
    setBusy(false)
    if (error) setErr(errText(error)); else onDone()
  }
  async function decline() {
    setBusy(true)
    const { error } = await supabase.rpc('decline_quote', { p_order: o.id, p_reason: reason })
    setBusy(false)
    if (error) setErr(errText(error)); else onDone()
  }
  if (!mode) return <div className="row"><button className="btn grow" onClick={() => setMode('pay')}>Accept and pay</button><button className="btn ghost" onClick={() => setMode('decline')}>Decline</button></div>
  if (mode === 'decline') return (
    <div className="form">
      <label className="f">Why are you declining? (optional, helps us improve)<input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>
      {err && <p className="err">{err}</p>}
      <div className="row"><button className="btn ghost" onClick={() => setMode('')}>Back</button><button className="btn grow" disabled={busy} onClick={decline}>Decline quote</button></div>
    </div>)
  return (
    <div className="form">
      <PayBox amountUsd={Number(o.pay_today_usd)} rate={Number(o.nle_per_usd)} settings={settings} value={pay} onChange={setPay} />
      {err && <p className="err">{err}</p>}
      <div className="row"><button className="btn ghost" onClick={() => setMode('')}>Back</button><button className="btn grow" disabled={busy} onClick={accept}>{busy ? 'Sending…' : 'I have paid: confirm'}</button></div>
    </div>)
}

export default function Orders() {
  const { session } = useApp()
  const [orders, setOrders] = useState<Order[] | null>(null); const [err, setErr] = useState('')
  const load = useCallback(() => {
    if (!session) return
    supabase.from('orders').select('*, order_items(*)').eq('customer_id', session.user.id).order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setErr(errText(error)); setOrders((data ?? []) as Order[]) })
  }, [session])
  useEffect(() => { load() }, [load])
  return (
    <section className="band"><div className="wrap narrow">
      <h1>My orders</h1>
      {err && <p className="err">{err}</p>}
      {!orders ? <p>Loading…</p> : !orders.length ? <p>No requests yet. <Link to="/">Get a quote</Link></p>
        : <div className="stackgap">{orders.map(o => <OrderCard key={o.id} o={o}>{o.status === 'quote_sent' && <AcceptQuote o={o} onDone={load} />}</OrderCard>)}</div>}
    </div></section>
  )
}
