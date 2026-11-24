import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { priceCart, useApp } from '../lib/store'
import { errText, nle, supabase, usd } from '../lib/supabase'
import { ORANGE_REFERENCE, payLink } from '../lib/dial'

type Method = 'orange' | 'afrimoney' | 'card'

export default function Checkout() {
  const { cart, setCart, services, settings, session, profile } = useApp()
  const nav = useNavigate()
  const rate = Number(settings?.nle_per_usd ?? 0)
  const t = priceCart(cart, services, settings?.deposit_pct ?? 50)
  const [method, setMethod] = useState<Method | ''>('')
  const [txn, setTxn] = useState(''); const [payer, setPayer] = useState('')
  const [address, setAddress] = useState(''); const [notes, setNotes] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ ref: string } | null>(null)
  const onlyQuotes = t.lines.length > 0 && t.today === 0

  if (done) return (
    <section className="band"><div className="wrap narrow center">
      <svg width="64" height="72" viewBox="0 0 76 90"><path d="M38 0 76 14v30c0 22-15 38-38 46C15 82 0 66 0 44V14z" fill="#F16C21" /><path d="m22 44 11 11 21-22" stroke="#fff" strokeWidth="7" fill="none" /></svg>
      <p>Your order reference</p><div className="ref">{done.ref}</div>
      <p>{onlyQuotes ? 'Thanks. Sabi will contact you with your quote.' : 'Thanks. Sabi is checking your payment. You will see it change to Paid in My orders.'}</p>
      <Link className="btn" to="/orders">See my orders</Link>
    </div></section>
  )

  if (!t.lines.length) return <section className="band"><div className="wrap narrow"><h1>Your order</h1><p>Your order is empty.</p><Link className="btn" to="/">Choose services</Link></div></section>

  async function place() {
    setErr('')
    if (!onlyQuotes) {
      if (!method) { setErr('Choose how you want to pay.'); return }
      if (!txn.trim()) { setErr(method === 'card' ? 'Enter the receipt number from your card payment.' : 'Enter the transaction ID from your payment SMS.'); return }
      if (method !== 'card' && !payer.trim()) { setErr('Enter the number you paid from.'); return }
    }
    if (!address.trim()) { setErr('Enter your town or site address.'); return }
    setBusy(true)
    const { data, error } = await supabase.rpc('place_order', {
      p_items: cart, p_method: onlyQuotes ? null : method, p_txn: onlyQuotes ? null : txn,
      p_payer: onlyQuotes ? null : payer, p_address: address, p_notes: notes,
    })
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setCart([]); setDone({ ref: (data as { ref: string }[])[0].ref })
  }

  const code = method === 'orange' ? settings?.orange_code : settings?.afri_code
  const ussd = method === 'orange' ? settings?.orange_ussd : settings?.afri_ussd
  const dial = method && method !== 'card' && code ? payLink(ussd, code, t.today * rate, method === 'orange' ? ORANGE_REFERENCE : null) : null
  return (
    <section className="band"><div className="wrap two">
      <div>
        <h1>Your order</h1>
        <div className="items">{t.lines.map(({ s, o, qty, today }) => (
          <div className="item" key={o.id}>
            <div><b>{s.name}</b><br /><span className="note">{o.name}{s.per_person ? ` · ${qty} people` : ''}</span></div>
            <div className="right"><b>{o.is_quote ? 'Free quote' : nle(today, rate)}</b></div>
            <button className="linkbtn rm" onClick={() => setCart(cart.filter(l => l.option_id !== o.id))}>Remove</button>
          </div>))}</div>
        <div className="sum">
          <div className="big"><span>Pay today</span><span>{nle(t.today, rate)} <small className="muted">({usd(t.today)})</small></span></div>
          {t.balance > 0 && <div><span>Balance on completion</span><span>{nle(t.balance, rate)}</span></div>}
          {t.monthly > 0 && <div><span>Then monthly</span><span>{nle(t.monthly, rate)}/mo</span></div>}
          {t.quotes > 0 && <p className="note">Quote items are free to request. We send the price before any work.</p>}
        </div>
      </div>

      <div className="form">
        {!session ? <>
          <h2>Sign in to continue</h2>
          <p className="muted">Create a free account with your phone number or email. Your order stays saved.</p>
          <button className="btn" onClick={() => nav('/login?next=/checkout')}>Sign in or create account</button>
        </> : <>
          <h2>{onlyQuotes ? 'Request your quote' : 'Pay'}</h2>
          {profile && <p className="muted">Ordering as {profile.full_name || profile.phone || profile.email}{profile.business ? ` (${profile.business})` : ''}</p>}
          <label className="f"><span className="req">Town or site address</span><input value={address} onChange={e => setAddress(e.target.value)} placeholder={profile?.location || 'e.g. Wilberforce, Freetown'} /></label>
          <label className="f">Anything we should know?<textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
          {!onlyQuotes && <>
            <div className="mgrid" role="radiogroup" aria-label="Payment method">
              {([['orange', 'Orange Money', '#FF7900', 'OM', 'Pay from your Orange Money wallet'], ['afrimoney', 'Afrimoney', '#7B2D8E', 'AM', 'Pay from your Afrimoney wallet'], ['card', 'Debit or credit card', '#1395B9', 'VISA', 'Visa or Mastercard, charged as ' + usd(t.today)]] as const)
                .map(([v, n, c, b, sub]) => (
                  <label className="m" key={v}><input type="radio" name="method" checked={method === v} onChange={() => { setMethod(v); setTxn('') }} />
                    <span className="badge" style={{ background: c }}>{b}</span><span><b>{n}</b><br /><span className="note">{sub}</span></span></label>))}
            </div>
            {method && method !== 'card' && <div className="box">
              <b>Pay {nle(t.today, rate)} with {method === 'orange' ? 'Orange Money' : 'Afrimoney'}</b>
              <p className="note">Paid to Gen X Music (Sabi's parent company), merchant code <b>{code || '…'}</b>. Pay from your own {method === 'orange' ? 'Orange Money' : 'Afrimoney'} account: agents can't pay a merchant code.</p>
              {dial ? <>
                <a className="btn blue" href={dial.href}>Tap to pay: {dial.code}</a>
                <p className="note">On a computer or iPhone that doesn't dial, type <b>{dial.code}</b> on your phone. <button type="button" className="linkbtn" onClick={() => navigator.clipboard?.writeText(dial.code).catch(() => {})}>Copy code</button></p>
                <ol className="how">{dial.menu && <li>The merchant menu opens. Type:</li>}{dial.steps.map(x => <li key={x}>{x}</li>)}<li>You'll get an SMS with a transaction ID. Enter it below with the number you paid from.</li></ol>
              </> : <p className="note">Mobile money is being set up. Please ask Sabi on WhatsApp.</p>}
              <label className="f"><span className="req">Transaction ID</span><input value={txn} onChange={e => setTxn(e.target.value)} placeholder="From your payment SMS" /></label>
              <label className="f"><span className="req">Number you paid from</span><input type="tel" value={payer} onChange={e => setPayer(e.target.value)} placeholder={profile?.phone || ''} /></label>
            </div>}
            {method === 'card' && <div className="box">
              <b>Pay {usd(t.today)} by card</b>
              <ol className="how"><li>Open our secure card page.</li><li>Enter <b>{usd(t.today)}</b> as the amount and pay.</li><li>Enter the receipt number from your confirmation below.</li></ol>
              {settings?.card_link ? <a className="btn blue" href={settings.card_link} target="_blank" rel="noopener noreferrer">Open card payment page</a> : <p className="note">Card payments are being set up. Please use mobile money for now.</p>}
              <label className="f"><span className="req">Card receipt number</span><input value={txn} onChange={e => setTxn(e.target.value)} /></label>
            </div>}
          </>}
          {err && <p className="err">{err}</p>}
          <button className="btn" disabled={busy} onClick={place}>{busy ? 'Sending…' : onlyQuotes ? 'Send quote request' : 'I have paid: send my order'}</button>
        </>}
      </div>
    </div></section>
  )
}
