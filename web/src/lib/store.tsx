import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Service, type Settings } from './supabase'

export type CartLine = { option_id: string; qty: number }
type Ctx = {
  session: Session | null; profile: Profile | null; ready: boolean; reloadProfile: () => Promise<void>
  services: Service[]; settings: Settings | null; reloadCatalogue: () => Promise<void>
  cart: CartLine[]; setCart: (c: CartLine[]) => void
}
const C = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(C)

function loadCart(): CartLine[] { try { return JSON.parse(localStorage.getItem('sabiCart') || '[]') } catch { return [] } }

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [cart, setCartState] = useState<CartLine[]>(loadCart)

  const setCart = (c: CartLine[]) => { setCartState(c); try { localStorage.setItem('sabiCart', JSON.stringify(c)) } catch { /* private mode */ } }

  async function reloadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
    setProfile(data as Profile | null)
  }
  async function reloadCatalogue() {
    const [s, st] = await Promise.all([
      supabase.from('services').select('*, service_options(*)').order('sort'),
      supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    ])
    const list = ((s.data ?? []) as Service[]).map(x => ({ ...x, service_options: [...x.service_options].sort((a, b) => a.sort - b.sort) }))
    setServices(list); setSettings(st.data as Settings | null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); await reloadProfile(); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setTimeout(reloadProfile, 0) })
    reloadCatalogue()
    return () => sub.subscription.unsubscribe()
  }, [])

  const value = useMemo(() => ({ session, profile, ready, reloadProfile, services, settings, reloadCatalogue, cart, setCart }),
    [session, profile, ready, services, settings, cart])
  return <C.Provider value={value}>{children}</C.Provider>
}

/** Works out what is due, the same way the database does (the database has the final say). */
export function priceCart(cart: CartLine[], services: Service[], depositPct: number) {
  let today = 0, balance = 0, monthly = 0, quotes = 0
  const lines = cart.flatMap(l => {
    for (const s of services) {
      const o = s.service_options.find(x => x.id === l.option_id)
      if (!o) continue
      const qty = s.per_person ? l.qty : 1
      if (o.is_quote) { quotes++; return [{ s, o, qty, today: 0 }] }
      const once = Number(o.price_usd) * qty
      const dep = s.per_person ? once : Math.round(once * depositPct) / 100
      today += dep + Number(o.monthly_usd); balance += once - dep; monthly += Number(o.monthly_usd)
      return [{ s, o, qty, today: dep + Number(o.monthly_usd) }]
    }
    return []
  })
  return { lines, today, balance, monthly, quotes }
}
