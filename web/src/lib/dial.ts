/**
 * Tap-to-dial mobile money (same as SmarTix, codes tested Nov 19-20, 2026).
 * Afrimoney: one code with merchant code and amount filled in: *161*4*{code}*{amount}#.
 * Orange Money's one-line code drops the merchant code, so its button opens the merchant menu #144*4#
 * and the page lists what to type: merchant code, amount, reference, PIN.
 * Amounts are whole Leones, rounded up. Payments go to Gen X Music's merchant codes (shared with SmarTix);
 * the Orange reference "Sabi" tells Sabi payments apart.
 */
export const ORANGE_REFERENCE = 'Sabi'

export function payLink(template: string | null | undefined, merchantCode: string, amountNle: number, reference?: string | null) {
  const n = Math.ceil(Number(amountNle))
  if (!template || !(n > 0)) return null
  const code = template.replace('{code}', merchantCode).replace('{amount}', String(n))
  const menu = !template.includes('{amount}')
  const steps = menu
    ? [`Merchant code: ${merchantCode}`, `Amount: ${n}`, ...(reference ? [`Reference: ${reference}`] : []), 'Enter your PIN']
    : ['Enter your PIN']
  return { code, amount: n, href: 'tel:' + code.replace(/#/g, '%23'), menu, steps }
}
