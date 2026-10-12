/** Nominal AUSD display. Sandbox exchange values are equivalents, not conversions. */
export function formatAusd(cents: number): string {
  return `${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} AUSD`;
}
