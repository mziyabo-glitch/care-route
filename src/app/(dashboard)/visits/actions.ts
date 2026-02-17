"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createVisitAction(agencyId: string, formData: FormData) {
  const supabase = await createClient();
  const clientId = formData.get("client_id") as string;
  const carerId = formData.get("carer_id") as string;
  const scheduledAt = formData.get("scheduled_at") as string;
  const notes = (formData.get("notes") as string)?.trim() || null;

  if (!clientId || !carerId || !scheduledAt) {
    return { error: "Client, carer, and date/time are required." };
  }

  const { error } = await supabase.from("visits").insert({
    agency_id: agencyId,
    client_id: clientId,
    carer_id: carerId,
    scheduled_at: scheduledAt,
    notes,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/visits");
  revalidatePath("/dashboard");
  return { error: null };
}
