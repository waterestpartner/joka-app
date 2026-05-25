/**
 * Normalize a phone number to a canonical 0XXXXXXXXX format.
 *
 * Algorithm (must match dispatch system exactly):
 *  1. null / blank → return null
 *  2. Full-width digits (０-９) → half-width (0-9)
 *  3. Remove all non-digit chars, but keep the very first '+' if present
 *  4. If starts with "+886" or "886" → strip prefix, prepend "0"
 *  5. If now starts with "00" → collapse to single "0"
 *  6. Validate: must be /^0\d{8,9}$/ (9–10 digits, starts with 0) → else null
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input == null) return null

  // Step 1: blank check (after trimming)
  let s = input.trim()
  if (!s) return null

  // Step 2: full-width digits → half-width
  s = s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))

  // Step 3: keep at most one leading '+', remove all other non-digit chars
  const hasLeadingPlus = s.startsWith('+')
  s = s.replace(/\D/g, '') // strip everything non-digit
  if (hasLeadingPlus) s = '+' + s

  // Step 4: strip Taiwan country code prefix and prepend '0'
  if (s.startsWith('+886')) {
    s = '0' + s.slice(4) // '+886...' → '0...'
  } else if (s.startsWith('886')) {
    s = '0' + s.slice(3) // '886...' → '0...'
  }

  // Step 5: collapse leading double-zero (e.g. "+886 0912..." → "00912..." → "0912...")
  if (s.startsWith('00')) {
    s = s.replace(/^0+/, '0')
  }

  // Step 6: validate — must be 0 + 8 or 9 more digits (total 9–10 chars)
  if (!/^0\d{8,9}$/.test(s)) return null

  return s
}
