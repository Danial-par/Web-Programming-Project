import { config } from "./config";

function getApiOrigin(): string {
  try {
    return new URL(config.apiBaseUrl).origin;
  } catch {
    // If apiBaseUrl isn't a fully qualified URL, fall back to a best-effort guess.
    return config.apiBaseUrl.replace(/\/api\/?$/, "");
  }
}

/**
 * Resolve a possibly-relative media URL (e.g. `/media/...`) to an absolute URL.
 *
 * The backend usually returns absolute URLs because serializers receive `request`.
 * But resolving defensively makes the frontend robust across deployments.
 */
export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Already absolute
  if (/^(https?:)?\/\//i.test(trimmed) || /^data:/i.test(trimmed) || /^blob:/i.test(trimmed)) {
    return trimmed;
  }

  const origin = getApiOrigin();
  if (trimmed.startsWith("/")) return `${origin}${trimmed}`;
  return `${origin}/${trimmed}`;
}