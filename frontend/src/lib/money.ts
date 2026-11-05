const usdCents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const usdWhole = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Promotional product credits and program budget: integer USD cents from the backend. 50000 -> "$500.00". */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '—'
  return usdCents.format(cents / 100)
}

/** Declared funding and policy caps: whole USD (not cents). 2000000 -> "$2,000,000". */
export function formatUsd(dollars: number | null | undefined): string {
  if (dollars === null || dollars === undefined || !Number.isFinite(dollars)) return '—'
  return usdWhole.format(dollars)
}

/** Crustdata research credits are a separate unit from product credits and are labeled as such. */
export function formatResearchCredits(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return `${plain.format(value)} research credit${value === 1 ? '' : 's'}`
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  return plain.format(value)
}
