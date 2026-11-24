import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile, type Service, type Settings } from './supabase'

type Ctx = {
  session: Session | null; profile: Profile | null; ready: boolean; reloadProfile: () => Promise<void>
  services: Service[]; settings: Settings | null; reloadCatalogue: () => Promise<void>
  picked: string[]; setPicked: (ids: string[]) => void
}
const C = createContext<Ctx>(null as unknown as Ctx)
export const useApp = () => useContext(C)

function loadPicked(): string[] { try { const v = JSON.parse(localStorage.getItem('sabiPicked') || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string') : [] } catch { return [] } }

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)
  const [services, setServices] = useState<Service[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [picked, setPickedState] = useState<string[]>(loadPicked)

  const setPicked = (ids: string[]) => { setPickedState(ids); try { localStorage.setItem('sabiPicked', JSON.stringify(ids)) } catch { /* private mode */ } }

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

  const value = useMemo(() => ({ session, profile, ready, reloadProfile, services, settings, reloadCatalogue, picked, setPicked }),
    [session, profile, ready, services, settings, picked])
  return <C.Provider value={value}>{children}</C.Provider>
}
