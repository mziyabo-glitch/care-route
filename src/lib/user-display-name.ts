/** Keys stored in Supabase Auth `user_metadata` (via server updateUser only). */
export const USER_DISPLAY_NAME_KEY = "display_name";

export function metaString(
  meta: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Value for profile form — prefers explicit display_name. */
export function getDisplayNameFromMetadata(
  meta: Record<string, unknown> | undefined
): string {
  const m = meta ?? {};
  const display = metaString(m, USER_DISPLAY_NAME_KEY);
  if (display) return display;
  const first = metaString(m, "first_name", "given_name");
  const last = metaString(m, "last_name", "family_name");
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  const full = metaString(m, "full_name", "name");
  if (full) return full;
  return "";
}

/** First name or short name for dashboard greeting. */
export function resolveUserGreetingName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): string {
  const meta = user.user_metadata ?? {};
  const display = metaString(meta, USER_DISPLAY_NAME_KEY);
  if (display) {
    const parts = display.split(/\s+/).filter(Boolean);
    return parts[0] ?? display;
  }
  const first = metaString(meta, "first_name", "given_name");
  const last = metaString(meta, "last_name", "family_name");
  const full = metaString(meta, "full_name", "name");

  if (first && last) return first;
  if (first) return first;
  if (full) {
    const parts = full.split(/\s+/).filter(Boolean);
    return parts[0] ?? full;
  }
  if (!user.email) return "there";
  const local = user.email.split("@")[0] ?? "";
  const bit = local.split(/[.+_-]/)[0];
  if (!bit) return "there";
  return bit.charAt(0).toUpperCase() + bit.slice(1).toLowerCase();
}

/** Parse a single display name field into metadata fields for updateUser. */
export function displayNameToMetadata(displayName: string): Record<string, string> {
  const trimmed = displayName.trim();
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? trimmed;
  const last = parts.length > 1 ? parts.slice(1).join(" ") : "";
  const out: Record<string, string> = {
    [USER_DISPLAY_NAME_KEY]: trimmed,
    full_name: trimmed,
    first_name: first,
  };
  if (last) out.last_name = last;
  return out;
}
