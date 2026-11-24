// Daily exchange-rate update: fetches the US$ -> leone (SLE) market rate and hands it to
// apply_market_rate, which adds Sabi's margin and holds back sudden jumps for an admin to check.
// Run daily by pg_cron (see migration 0004). Safe to call any time: it only reads a public rate.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SOURCE = 'open.er-api.com'

Deno.serve(async () => {
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD')
    const j = await r.json() as { result?: string; rates?: Record<string, number> }
    const market = j?.rates?.SLE
    if (j?.result !== 'success' || !market) throw new Error('No SLE rate in the response')
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data, error } = await db.rpc('apply_market_rate', { p_market: market, p_source: SOURCE })
    if (error) throw error
    console.log('update-rate', market, data)
    return new Response(JSON.stringify({ market, result: data }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('update-rate failed', e)
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
