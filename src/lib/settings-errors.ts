/** Map Supabase/Postgres errors to user-facing settings messages. */
export function mapSettingsSaveError(message: string): string {
  const lower = message.toLowerCase();

  if (lower.includes("stack depth limit exceeded")) {
    return "Could not save right now due to a permissions issue. Please try again in a moment.";
  }

  if (lower.includes("not authenticated")) {
    return "Your session has expired. Sign in again and retry.";
  }

  if (lower.includes("insufficient permissions")) {
    return "You do not have permission to change the agency name.";
  }

  if (lower.includes("agency name must be")) {
    return message;
  }

  if (lower.includes("display name must be")) {
    return message;
  }

  if (lower.includes("agency not found")) {
    return "Agency not found. Refresh the page and try again.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("email rate limit")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  if (lower.includes("invalid") && lower.includes("json")) {
    return "Invalid request. Refresh the page and try again.";
  }

  return "Could not save. Please try again.";
}
