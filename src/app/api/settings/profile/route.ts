import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  displayNameToMetadata,
  getDisplayNameFromMetadata,
} from "@/lib/user-display-name";
import { mapSettingsSaveError } from "@/lib/settings-errors";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!displayName || displayName.length > 120) {
    return NextResponse.json(
      { error: "Display name must be between 1 and 120 characters" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.auth.updateUser({
    data: displayNameToMetadata(displayName),
  });

  if (error) {
    return NextResponse.json(
      { error: mapSettingsSaveError(error.message) },
      { status: 400 }
    );
  }

  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;

  return NextResponse.json({
    displayName: getDisplayNameFromMetadata(meta),
    email: data.user?.email ?? user.email,
  });
}
