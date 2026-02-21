"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentAgencyId } from "@/lib/agency";
import { revalidatePath } from "next/cache";

export async function createClientAction(formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get("name") as string)?.trim();
  const address = (formData.get("address") as string)?.trim() || null;
  const postcode = (formData.get("postcode") as string)?.trim() || null;
  const notes = (formData.get("notes") as string)?.trim() || null;
  const requiresDoubleUp = formData.get("requires_double_up") === "on";
  const fundingType = (formData.get("funding_type") as string)?.trim() || "private";
  if (fundingType !== "private" && fundingType !== "local_authority") {
    return { error: "Invalid funding type." };
  }

  const agencyId = await getCurrentAgencyId();
  if (!agencyId) {
    return { error: "You must be signed in to create a client." };
  }

  if (!name) {
    return { error: "Name is required." };
  }

  const { data, error } = await supabase.rpc("insert_client", {
    p_agency_id: agencyId,
    p_name: name,
    p_address: address,
    p_postcode: postcode,
    p_notes: notes,
    p_requires_double_up: requiresDoubleUp,
    p_latitude: null,
    p_longitude: null,
    p_funding_type: fundingType,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/clients");
  revalidatePath("/dashboard");

  const clientId = typeof data === "object" && data !== null ? (data as { id?: string }).id : null;
  return { error: null, clientId, postcode };
}
