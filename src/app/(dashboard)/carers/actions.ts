"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createCarerAction(agencyId: string, formData: FormData) {
  const supabase = await createClient();
  const name = (formData.get("name") as string)?.trim();
  const email = (formData.get("email") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!name) {
    return { error: "Name is required." };
  }

  const { error } = await supabase.from("carers").insert({
    agency_id: agencyId,
    name,
    email: email || null,
    phone: phone || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/carers");
  revalidatePath("/dashboard");
  return { error: null };
}
