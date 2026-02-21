export function formatWorkflowLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseIdList(raw: string): number[] {
  const values = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => Number(part))
    .filter((value) => Number.isInteger(value) && value > 0);

  return Array.from(new Set(values));
}

export function hasRoleKeyword(roles: string[] | undefined, keywords: string[]): boolean {
  if (!roles || roles.length === 0) return false;
  const normalizedRoles = roles.map((role) => role.toLowerCase());
  return keywords.some((keyword) => normalizedRoles.some((role) => role.includes(keyword.toLowerCase())));
}
