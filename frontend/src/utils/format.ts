/**
 * Formatting helpers used across public pages.
 * Keep these helpers dependency-free so they work in all environments.
 */

export function formatNumber(value: number | null | undefined, locale?: string): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

/**
 * Reward amounts are returned in Rial by the backend.
 * We format as a plain number + suffix (IRR) to avoid inconsistent currency symbols.
 */
export function formatRial(amount: number | null | undefined, locale?: string): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return `${formatNumber(amount, locale)} IRR`;
}

export function formatDateTime(value: string | null | undefined, locale?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
