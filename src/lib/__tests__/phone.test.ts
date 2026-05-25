import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../phone'

// Canonical test vectors from the spec — dispatch system uses the same vectors
describe('normalizePhone', () => {
  // ── Required spec vectors ──────────────────────────────────────────────────
  it('strips dashes from mobile number', () => {
    expect(normalizePhone('0912-345-678')).toBe('0912345678')
  })

  it('strips +886 country code', () => {
    expect(normalizePhone('+886912345678')).toBe('0912345678')
  })

  it('strips parentheses', () => {
    expect(normalizePhone('(0912)345678')).toBe('0912345678')
  })

  it('handles +886 with leading 0 in local number (no double-zero)', () => {
    // "+886 0912 345 678" must NOT become "00912..."
    expect(normalizePhone('+886 0912 345 678')).toBe('0912345678')
  })

  it('handles +886 with area code (Kaohsiung landline)', () => {
    expect(normalizePhone('+886-7-1234567')).toBe('071234567')
  })

  it('strips bare 886 prefix', () => {
    expect(normalizePhone('886912345678')).toBe('0912345678')
  })

  it('converts full-width digits', () => {
    expect(normalizePhone('０９１２３４５６７８')).toBe('0912345678')
  })

  it('returns null for empty string', () => {
    expect(normalizePhone('')).toBeNull()
  })

  it('returns null for null', () => {
    expect(normalizePhone(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizePhone(undefined)).toBeNull()
  })

  it('returns null for non-numeric text', () => {
    expect(normalizePhone('無')).toBeNull()
  })

  // ── Edge cases ─────────────────────────────────────────────────────────────
  it('strips spaces from plain number', () => {
    expect(normalizePhone('0912 345 678')).toBe('0912345678')
  })

  it('handles +886 followed by area code with trailing 0 (Taipei landline)', () => {
    // +886-2-12345678 → 9 digits after stripping: "021234567" → wait: 886 + 2 + 12345678 = 11 chars
    // +886-2-12345678 → strip +886 → 0 + 212345678 → 0212345678 (10 digits) ✓
    expect(normalizePhone('+886-2-12345678')).toBe('0212345678')
  })

  it('returns null for too-short number', () => {
    expect(normalizePhone('091234')).toBeNull()
  })

  it('returns null for too-long number', () => {
    expect(normalizePhone('09123456789012')).toBeNull()
  })

  it('returns null for number not starting with 0 after normalization', () => {
    // a random foreign number
    expect(normalizePhone('+1-800-555-0123')).toBeNull()
  })

  it('is idempotent — already-normalized number is unchanged', () => {
    expect(normalizePhone('0912345678')).toBe('0912345678')
  })

  it('handles full-width digits mixed with +886', () => {
    expect(normalizePhone('+886９１２３４５６７８')).toBe('0912345678')
  })
})
