import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

export const supabase = createClient(url, key, { auth: { persistSession: true, detectSessionInUrl: true } })

export type Settings = {
  nle_per_usd: number; rate_date: string; deposit_pct: number
  whatsapp: string | null; email: string | null
  orange_code: string | null; afri_code: string | null; orange_ussd: string; afri_ussd: string
  card_link: string | null
}
export type Option = {
  id: string; service_id: string; name: string; subtitle: string | null
  price_usd: number; monthly_usd: number; is_quote: boolean; active: boolean; sort: number
}
export type Service = {
  id: string; category: Category; name: string; description: string | null
  per_person: boolean; active: boolean; sort: number; service_options: Option[]
}
export type Category = 'digital' | 'ai' | 'security' | 'support' | 'training' | 'projects'
export type Profile = {
  id: string; full_name: string | null; business: string | null; email: string | null
  phone: string | null; location: string | null; role: 'customer' | 'staff' | 'admin'; created_at: string
}
export type OrderStatus = 'quote_requested' | 'payment_submitted' | 'paid' | 'rejected' | 'in_progress' | 'completed' | 'cancelled'
export type Order = {
  id: string; ref: string; customer_id: string; status: OrderStatus; method: 'orange' | 'afrimoney' | 'card' | null
  txn_id: string | null; payer_number: string | null; nle_per_usd: number
  pay_today_usd: number; balance_usd: number; monthly_usd: number
  address: string | null; notes: string | null; admin_note: string | null; created_at: string; reviewed_at: string | null
  order_items: { id: string; service_name: string; option_name: string; qty: number; price_usd: number; monthly_usd: number; is_quote: boolean }[]
  profiles?: Pick<Profile, 'full_name' | 'business' | 'email' | 'phone'> | null
}

export const CATEGORIES: Record<Category, string> = {
  digital: 'Digital basics', ai: 'AI on WhatsApp', security: 'Security',
  support: 'Support plans', training: 'Training', projects: 'Data and projects',
}
export const STATUS: Record<OrderStatus, string> = {
  quote_requested: 'Quote requested', payment_submitted: 'Checking payment', paid: 'Paid',
  rejected: 'Payment not found', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}
export const METHOD = { orange: 'Orange Money', afrimoney: 'Afrimoney', card: 'Card' } as const

export const usd = (n: number) => 'US$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const nle = (n: number, rate: number) => 'NLe' + Math.round(Number(n) * rate).toLocaleString('en-US')
export const day = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** A Sierra Leone number typed any common way -> +232XXXXXXXX (other countries kept as typed, with +) */
export function intlPhone(p: string) {
  const d = p.replace(/\D/g, '').replace(/^00/, '')
  if (d.startsWith('232') && d.length === 11) return '+' + d
  if (d.length === 9 && d.startsWith('0')) return '+232' + d.slice(1)
  if (d.length === 8) return '+232' + d
  if (d.length >= 10 && d.length <= 15) return '+' + d
  return ''
}

export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message || String(e || '')
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Couldn't reach Sabi. Check your internet and try again."
  if (/Invalid login credentials/i.test(m)) return 'That email or password is wrong.'
  if (/row-level security|permission denied/i.test(m)) return "You don't have permission to do that."
  if (/duplicate key|orders_one_use_per_txn/.test(m)) return 'That transaction ID has already been used.'
  return m || 'Something went wrong'
}
