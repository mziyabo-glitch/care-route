/**
 * Swindon Care Demo Agency — scenario-based idempotent seed (service role).
 *
 * SAFETY:
 * - Requires ALLOW_DEMO_SEED=true
 * - Targets NEXT_PUBLIC_SUPABASE_URL (printed at start)
 * - Deletes only visits whose notes contain [DEMO_VISIT_SEED]
 * - Requires DEMO_SEED_OWNER_USER_ID — your Supabase Auth user (agency owner)
 *
 * Covers: 10 named service users, care plans (green/amber/red), CQC evidence,
 * visit scenarios (yesterday → +7 days), confidentiality, payroll/billing actuals.
 */

import "dotenv-flow/config";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CARE_PLAN_SECTION_TEMPLATES } from "../src/lib/care-plan-data";
import {
  AGENCY_NAME,
  CALL_WINDOWS,
  CARE_PLAN_SECTION_BODIES,
  DEMO_CLIENTS,
  DEMO_CQC_ITEMS,
  DEMO_CQC_TAG,
  DEMO_STAFF,
  DEMO_VISIT_TAG,
  LEGACY_AGENCY_NAME,
  reviewDatesForTraffic,
  VISIT_NOTE_BY_SCENARIO,
  type DemoClient,
  type VisitScenarioKind,
} from "./seed-swindon-demo-data";

type Counts = {
  agencyRenamed: boolean;
  staffReusedOrCreated: number;
  clientsReusedOrCreated: number;
  visitsDeletedThenCreated: number;
  carePlansReusedOrCreated: number;
  sectionsCreated: number;
  notesCreated: number;
  cqcItemsReusedOrCreated: number;
  fundersReusedOrCreated: number;
  completedOnTime: number;
  completedLate: number;
  completedNoNotes: number;
  missed: number;
  inProgress: number;
  futureScheduled: number;
  doubleUps: number;
  doubleUpGaps: number;
};

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v?.trim()) {
    console.error(`Missing env: ${key}`);
    process.exit(1);
  }
  return v.trim();
}

function startOfUkDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysIso(base: Date, offset: number): string {
  const d = new Date(base.getTime() + offset * 86400000);
  return d.toISOString().slice(0, 10);
}

function clientNotesTag(slug: string): string {
  return `[DEMO_CLIENT] slug=${slug}`;
}

async function resolveAgency(client: SupabaseClient, ownerUserId: string): Promise<{ id: string; renamed: boolean }> {
  const { data: byNew } = await client
    .from("agencies")
    .select("id, owner_id, created_by, name")
    .eq("name", AGENCY_NAME)
    .maybeSingle();

  if (byNew?.id) {
    const agencyId = byNew.id as string;
    const needsOwner =
      (byNew as { owner_id?: string | null }).owner_id !== ownerUserId ||
      (byNew as { created_by?: string | null }).created_by !== ownerUserId;
    if (needsOwner) {
      const { error } = await client
        .from("agencies")
        .update({ owner_id: ownerUserId, created_by: ownerUserId })
        .eq("id", agencyId);
      if (error) throw error;
    }
    return { id: agencyId, renamed: false };
  }

  const { data: byLegacy } = await client
    .from("agencies")
    .select("id, owner_id, created_by, name")
    .eq("name", LEGACY_AGENCY_NAME)
    .maybeSingle();

  if (byLegacy?.id) {
    const agencyId = byLegacy.id as string;
    const { error } = await client
      .from("agencies")
      .update({
        name: AGENCY_NAME,
        owner_id: ownerUserId,
        created_by: ownerUserId,
      })
      .eq("id", agencyId);
    if (error) throw error;
    return { id: agencyId, renamed: true };
  }

  const { data: ins, error } = await client
    .from("agencies")
    .insert({
      name: AGENCY_NAME,
      created_by: ownerUserId,
      owner_id: ownerUserId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: ins!.id as string, renamed: false };
}

async function ensureMembership(
  client: SupabaseClient,
  agencyId: string,
  userId: string
): Promise<{ created: boolean }> {
  const { data: hit } = await client
    .from("agency_members")
    .select("id, role")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (hit?.id) {
    const { error } = await client
      .from("agency_members")
      .update({ role: "owner", created_at: new Date().toISOString() })
      .eq("id", hit.id as string);
    if (error) throw error;
    return { created: false };
  }

  const { error } = await client.from("agency_members").insert({
    agency_id: agencyId,
    user_id: userId,
    role: "owner",
  });
  if (error) throw error;
  return { created: true };
}

async function upsertStaff(
  client: SupabaseClient,
  agencyId: string,
  counts: Counts
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const person of DEMO_STAFF) {
    if (person.role === "owner") {
      ids.set(person.key, "__owner__");
      continue;
    }

    const { data: prev } = await client
      .from("carers")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", person.email)
      .maybeSingle();

    const carerRole = person.role === "manager" ? "manager" : "carer";

    if (prev?.id) {
      await client
        .from("carers")
        .update({
          full_name: person.full_name,
          name: person.full_name,
          phone: person.phone,
          role: carerRole,
          active: true,
          payroll_number: person.payroll_number ?? null,
          notes: person.notes,
        })
        .eq("id", prev.id as string);
      ids.set(person.key, prev.id as string);
      continue;
    }

    const { data, error } = await client
      .from("carers")
      .insert({
        agency_id: agencyId,
        full_name: person.full_name,
        name: person.full_name,
        email: person.email,
        phone: person.phone,
        role: carerRole,
        active: true,
        payroll_number: person.payroll_number ?? null,
        notes: person.notes,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.set(person.key, data!.id as string);
    counts.staffReusedOrCreated++;
  }

  return ids;
}

async function upsertClients(
  client: SupabaseClient,
  agencyId: string,
  counts: Counts
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const c of DEMO_CLIENTS) {
    const tag = clientNotesTag(c.slug);
    const { data: prev } = await client
      .from("clients")
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("notes", `%slug=${c.slug}%`)
      .maybeSingle();

    const notes = `${tag} ${DEMO_VISIT_TAG} ${c.scenario_summary} Preferred: ${c.preferred_name}. Age ~${c.approximate_age}. Emergency: ${c.emergency_contact}. Care: ${c.care_type}. Risk: ${c.risk_level}.`;

    const row = {
      full_name: c.full_name,
      name: c.full_name,
      address: c.address,
      postcode: c.postcode,
      notes,
      requires_double_up: c.requires_double_up,
      latitude: c.lat,
      longitude: c.lng,
      geocoded_at: new Date().toISOString(),
      funding_type: c.funding_type,
    };

    if (prev?.id) {
      const { error } = await client.from("clients").update(row).eq("id", prev.id as string);
      if (error) throw error;
      ids.set(c.slug, prev.id as string);
      continue;
    }

    const { data, error } = await client
      .from("clients")
      .insert({ agency_id: agencyId, ...row })
      .select("id")
      .single();
    if (error) throw error;
    ids.set(c.slug, data!.id as string);
    counts.clientsReusedOrCreated++;
  }

  return ids;
}

async function ensureBillingPrereqs(
  client: SupabaseClient,
  agencyId: string,
  clientIds: Map<string, string>,
  counts: Counts
): Promise<void> {
  const { data: f } = await client
    .from("funders")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("name", "Swindon Demo LA")
    .maybeSingle();

  let funderId = f?.id as string | undefined;
  if (!funderId) {
    const { data: ins, error } = await client
      .from("funders")
      .insert({
        agency_id: agencyId,
        name: "Swindon Demo LA",
        type: "local_authority",
      })
      .select("id")
      .single();
    if (error) throw error;
    funderId = ins!.id as string;
    counts.fundersReusedOrCreated++;
  }

  const { data: rateHit } = await client
    .from("funder_rates")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("funder_id", funderId)
    .limit(1)
    .maybeSingle();

  if (!rateHit) {
    const { error } = await client.from("funder_rates").insert([
      {
        agency_id: agencyId,
        funder_id: funderId,
        rate_type: "standard",
        hourly_rate: 22.5,
        mileage_rate: 0.45,
        effective_from: "2026-01-01",
      },
      {
        agency_id: agencyId,
        funder_id: funderId,
        rate_type: "evening",
        hourly_rate: 26.0,
        mileage_rate: 0.45,
        effective_from: "2026-01-01",
      },
    ]);
    if (error) throw error;
  }

  for (const c of DEMO_CLIENTS) {
    if (c.funding_type !== "local_authority") continue;
    const cid = clientIds.get(c.slug);
    if (!cid) continue;
    const { data: cf } = await client
      .from("client_funders")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("client_id", cid)
      .maybeSingle();
    if (cf) continue;
    await client.from("client_funders").insert({
      agency_id: agencyId,
      client_id: cid,
      funder_id: funderId,
      active: true,
    });
  }
}

async function deleteDemoVisits(client: SupabaseClient, agencyId: string): Promise<void> {
  let offset = 0;
  const batchSize = 200;
  while (true) {
    const { data: rows, error: qe } = await client
      .from("visits")
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("notes", `%${DEMO_VISIT_TAG}%`)
      .range(offset, offset + batchSize - 1);
    if (qe) throw qe;
    const ids = (rows ?? []).map((r) => r.id as string);
    if (ids.length === 0) break;
    const { error } = await client.from("visits").delete().in("id", ids);
    if (error) throw error;
    if (ids.length < batchSize) break;
    offset += batchSize;
  }
}

function buildVisitTimes(
  today: Date,
  dayOffset: number,
  window: keyof typeof CALL_WINDOWS,
  durationMin: number
): { start: Date; end: Date } {
  const win = CALL_WINDOWS[window];
  const visitDate = new Date(today.getTime() + dayOffset * 86400000);
  const start = new Date(visitDate);
  start.setUTCHours(win.startH, win.startM + 15, 0, 0);
  const end = new Date(start.getTime() + durationMin * 60 * 1000);
  return { start, end };
}

async function createScenarioVisit(
  client: SupabaseClient,
  agencyId: string,
  ownerUserId: string,
  today: Date,
  demoClient: DemoClient,
  clientId: string,
  carerIds: Map<string, string>,
  spec: DemoClient["visits"][number],
  counts: Counts
): Promise<{ visitId: string; scenario: VisitScenarioKind; clientSlug: string }> {
  const primaryKey = spec.carer_key ?? demoClient.primary_carer_key;
  const primaryId = carerIds.get(primaryKey);
  if (!primaryId) throw new Error(`Missing carer: ${primaryKey}`);

  const durationMin = CALL_WINDOWS[spec.window].defaultLen;
  let { start, end } = buildVisitTimes(today, spec.day_offset, spec.window, durationMin);

  const scenario = spec.scenario;
  let status: "scheduled" | "completed" | "missed" | "in_progress" = "scheduled";
  let skipSecondary = false;

  switch (scenario) {
    case "completed_good":
    case "no_notes":
    case "medication_concern":
    case "nutrition_concern":
      status = "completed";
      break;
    case "missed":
      status = "missed";
      break;
    case "late":
      status = "scheduled";
      break;
    case "in_progress":
    case "double_up_gap":
      status = scenario === "double_up_gap" ? "in_progress" : "in_progress";
      if (scenario === "double_up_gap") skipSecondary = true;
      break;
    case "scheduled_future":
      status = "scheduled";
      break;
  }

  if (spec.day_offset === 0 && scenario === "in_progress") {
    const minutesAgo = 25;
    const checkInAnchor = new Date(Date.now() - minutesAgo * 60 * 1000);
    start = new Date(checkInAnchor.getTime() - 3 * 60 * 1000);
    end = new Date(start.getTime() + durationMin * 60 * 1000);
  }

  if (spec.day_offset === 0 && scenario === "double_up_gap") {
    const minutesAgo = 18;
    const checkInAnchor = new Date(Date.now() - minutesAgo * 60 * 1000);
    start = new Date(checkInAnchor.getTime() - 2 * 60 * 1000);
    end = new Date(start.getTime() + durationMin * 60 * 1000);
  }

  if (spec.day_offset === 0 && scenario === "late") {
    start = new Date(Date.now() - 75 * 60 * 1000);
    end = new Date(start.getTime() + durationMin * 60 * 1000);
  }

  const note = `${DEMO_VISIT_TAG} slug=${demoClient.slug} scenario=${scenario} win=${spec.window} day=${spec.day_offset} type=${spec.visit_type}`;

  const { data: vrow, error: ve } = await client
    .from("visits")
    .insert({
      agency_id: agencyId,
      client_id: clientId,
      carer_id: primaryId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status,
      notes: note,
      mileage_miles: spec.day_offset <= 0 ? 3.2 : null,
    })
    .select("id")
    .single();
  if (ve) throw ve;
  const visitId = vrow!.id as string;
  counts.visitsDeletedThenCreated++;

  const assigns: Array<{
    agency_id: string;
    visit_id: string;
    carer_id: string;
    role: "primary" | "secondary";
  }> = [{ agency_id: agencyId, visit_id: visitId, carer_id: primaryId, role: "primary" }];

  const secondaryKey = spec.secondary_carer_key;
  if (secondaryKey && !skipSecondary) {
    const secondaryId = carerIds.get(secondaryKey);
    if (secondaryId && secondaryId !== primaryId) {
      assigns.push({ agency_id: agencyId, visit_id: visitId, carer_id: secondaryId, role: "secondary" });
      counts.doubleUps++;
    }
  }

  const { error: ae } = await client.from("visit_assignments").insert(assigns);
  if (ae) throw ae;

  const loc = { lat: demoClient.lat, lng: demoClient.lng };

  if (status === "completed") {
    const lateMs = scenario === "completed_good" ? 0 : 0;
    const ci = new Date(start.getTime() + lateMs + 2 * 60 * 1000);
    const co = new Date(end.getTime() - 1 * 60 * 1000);
    await client.from("visit_actuals").insert({
      visit_id: visitId,
      agency_id: agencyId,
      check_in_at: ci.toISOString(),
      check_out_at: co.toISOString(),
      check_in_source: "carer",
      check_out_source: "carer",
      break_minutes: 0,
      check_in_latitude: loc.lat + 0.0005,
      check_in_longitude: loc.lng - 0.0003,
      check_out_latitude: loc.lat + 0.0004,
      check_out_longitude: loc.lng - 0.0002,
    });

    if (scenario === "no_notes") {
      counts.completedNoNotes++;
    } else {
      counts.completedOnTime++;
      const body =
        VISIT_NOTE_BY_SCENARIO[scenario] ??
        `[Demo note] ${spec.visit_type} completed for ${demoClient.preferred_name}. No concerns.`;
      const { error: ne } = await client.from("visit_care_notes").insert({
        agency_id: agencyId,
        visit_id: visitId,
        author_id: ownerUserId,
        body,
        note_type: scenario === "medication_concern" ? "clinical" : "general",
      });
      if (!ne) counts.notesCreated++;
    }
  } else if (status === "in_progress") {
    const ci = new Date(start.getTime() + 2 * 60 * 1000);
    await client.from("visit_actuals").insert({
      visit_id: visitId,
      agency_id: agencyId,
      check_in_at: ci.toISOString(),
      check_out_at: null,
      check_in_source: "carer",
      check_out_source: null,
      break_minutes: 0,
      check_in_latitude: loc.lat + 0.0005,
      check_in_longitude: loc.lng - 0.0003,
    });
    counts.inProgress++;
    if (scenario === "double_up_gap") counts.doubleUpGaps++;
  } else if (status === "missed") {
    counts.missed++;
  } else if (scenario === "late") {
    counts.completedLate++;
  } else {
    counts.futureScheduled++;
  }

  await client.from("visit_risk_scores").delete().eq("visit_id", visitId);
  await client.rpc("calculate_visit_risk", { p_visit_id: visitId });

  return { visitId, scenario, clientSlug: demoClient.slug };
}

async function seedScenarioVisits(
  client: SupabaseClient,
  agencyId: string,
  ownerUserId: string,
  clientIds: Map<string, string>,
  carerIds: Map<string, string>,
  counts: Counts
): Promise<Map<string, string>> {
  const today = startOfUkDayUtc(new Date());
  const visitBySlug = new Map<string, string>();

  for (const demoClient of DEMO_CLIENTS) {
    const clientId = clientIds.get(demoClient.slug);
    if (!clientId) continue;

    for (const spec of demoClient.visits) {
      const { visitId, scenario } = await createScenarioVisit(
        client,
        agencyId,
        ownerUserId,
        today,
        demoClient,
        clientId,
        carerIds,
        spec,
        counts
      );
      if (spec.day_offset === -1 && scenario === "missed") {
        visitBySlug.set(`${demoClient.slug}:missed`, visitId);
      }
      if (spec.day_offset === 0) {
        visitBySlug.set(`${demoClient.slug}:today`, visitId);
      }
    }
  }

  return visitBySlug;
}

async function upsertCarePlans(
  client: SupabaseClient,
  agencyId: string,
  clientIds: Map<string, string>,
  ownerUserId: string,
  todayIso: string,
  counts: Counts
): Promise<Map<string, string>> {
  const planIds = new Map<string, string>();

  for (const demoClient of DEMO_CLIENTS) {
    const clientId = clientIds.get(demoClient.slug);
    if (!clientId) continue;

    const reviewMeta = reviewDatesForTraffic(demoClient.care_plan_traffic, todayIso);

    const { data: existing } = await client
      .from("care_plans")
      .select("id, status")
      .eq("agency_id", agencyId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();

    let planId = existing?.id as string | undefined;

    if (!planId) {
      const { data: ins, error } = await client
        .from("care_plans")
        .insert({
          agency_id: agencyId,
          client_id: clientId,
          status: "active",
          version: 1,
          effective_from: todayIso,
          created_by: ownerUserId,
          review_due_date: reviewMeta.review_due_date,
          last_reviewed_at: reviewMeta.last_reviewed_at,
          last_reviewed_by: ownerUserId,
          confidentiality_level: reviewMeta.confidentiality_level,
        })
        .select("id")
        .single();
      if (error) throw error;
      planId = ins!.id as string;
      counts.carePlansReusedOrCreated++;
    } else {
      await client
        .from("care_plans")
        .update({
          review_due_date: reviewMeta.review_due_date,
          last_reviewed_at: reviewMeta.last_reviewed_at,
          last_reviewed_by: ownerUserId,
          confidentiality_level: reviewMeta.confidentiality_level,
        })
        .eq("id", planId);
    }

    planIds.set(demoClient.slug, planId);

    const { data: existingSections } = await client
      .from("care_plan_sections")
      .select("id, section_key")
      .eq("care_plan_id", planId);

    const haveKeys = new Set(
      (existingSections ?? []).map((s) => (s as { section_key?: string }).section_key).filter(Boolean)
    );

    for (const t of DEFAULT_CARE_PLAN_SECTION_TEMPLATES) {
      const incomplete = reviewMeta.incomplete_section_keys.includes(t.section_key);
      const body = incomplete
        ? "(Demo) Section incomplete — manager to complete."
        : (CARE_PLAN_SECTION_BODIES[t.section_key] ??
          `(Demo) ${t.title} — fictional content for ${demoClient.preferred_name}.`);

      const confidentiality_level =
        t.section_key === "confidential_notes"
          ? "restricted"
          : demoClient.care_plan_traffic === "red" && t.section_key === "risks_hazards"
            ? "restricted"
            : (t.confidentiality_level ?? "standard");

      if (haveKeys.has(t.section_key)) {
        await client
          .from("care_plan_sections")
          .update({ body, confidentiality_level })
          .eq("care_plan_id", planId)
          .eq("section_key", t.section_key);
        continue;
      }

      const { error: se } = await client.from("care_plan_sections").insert({
        agency_id: agencyId,
        care_plan_id: planId,
        sort_order: t.sort_order,
        title: t.title,
        body,
        section_key: t.section_key,
        confidentiality_level,
      });
      if (se) throw se;
      counts.sectionsCreated++;
    }
  }

  return planIds;
}

async function upsertCqcEvidence(
  client: SupabaseClient,
  agencyId: string,
  ownerUserId: string,
  clientIds: Map<string, string>,
  planIds: Map<string, string>,
  visitIds: Map<string, string>,
  today: Date,
  counts: Counts
): Promise<void> {
  for (const item of DEMO_CQC_ITEMS) {
    const tag = `${DEMO_CQC_TAG} slug=${item.slug}`;
    const { data: prev } = await client
      .from("cqc_evidence_items")
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("description", `%slug=${item.slug}%`)
      .maybeSingle();

    const clientId = item.client_slug ? (clientIds.get(item.client_slug) ?? null) : null;
    const carePlanId = item.client_slug ? (planIds.get(item.client_slug) ?? null) : null;
    const visitId =
      item.client_slug === "arthur-bennett"
        ? (visitIds.get("arthur-bennett:missed") ?? null)
        : item.client_slug === "linda-morris"
          ? null
          : null;

    const row = {
      agency_id: agencyId,
      category: item.category,
      title: item.title,
      description: `${item.description} ${tag}`,
      client_id: clientId,
      visit_id: visitId,
      care_plan_id: carePlanId,
      status: item.status,
      risk: item.risk,
      due_date: addDaysIso(today, item.due_date_offset),
      owner: item.owner,
      created_by: ownerUserId,
      updated_at: new Date().toISOString(),
    };

    if (prev?.id) {
      await client.from("cqc_evidence_items").update(row).eq("id", prev.id as string);
      continue;
    }

    const { error } = await client.from("cqc_evidence_items").insert(row);
    if (error) throw error;
    counts.cqcItemsReusedOrCreated++;
  }
}

async function verifyBootstrap(
  client: SupabaseClient,
  ownerUserId: string,
  demoAgencyId: string
): Promise<{ resolvedAgencyId: string | null; agencyName: string }> {
  const { data: agency } = await client
    .from("agencies")
    .select("name")
    .eq("id", demoAgencyId)
    .single();

  const { data: allMembers } = await client
    .from("agency_members")
    .select("agency_id, created_at")
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false });

  return {
    resolvedAgencyId: allMembers?.[0]?.agency_id ?? null,
    agencyName: (agency?.name as string) ?? AGENCY_NAME,
  };
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error("Refused: set ALLOW_DEMO_SEED=true to run demo seed.");
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ownerId = requireEnv("DEMO_SEED_OWNER_USER_ID");

  const today = startOfUkDayUtc(new Date());
  const todayIso = today.toISOString().slice(0, 10);

  console.log("Target:", url);
  console.log("Demo agency:", AGENCY_NAME);
  console.log("Owner user:", ownerId);
  console.log(`Visit window: yesterday → +7 days (anchor ${todayIso})`);

  const supa = createClient(url, key, { auth: { persistSession: false } });

  const counts: Counts = {
    agencyRenamed: false,
    staffReusedOrCreated: 0,
    clientsReusedOrCreated: 0,
    visitsDeletedThenCreated: 0,
    carePlansReusedOrCreated: 0,
    sectionsCreated: 0,
    notesCreated: 0,
    cqcItemsReusedOrCreated: 0,
    fundersReusedOrCreated: 0,
    completedOnTime: 0,
    completedLate: 0,
    completedNoNotes: 0,
    missed: 0,
    inProgress: 0,
    futureScheduled: 0,
    doubleUps: 0,
    doubleUpGaps: 0,
  };

  const { id: agencyId, renamed } = await resolveAgency(supa, ownerId);
  counts.agencyRenamed = renamed;
  const membership = await ensureMembership(supa, agencyId, ownerId);

  const carerIds = await upsertStaff(supa, agencyId, counts);
  const clientIds = await upsertClients(supa, agencyId, counts);
  await ensureBillingPrereqs(supa, agencyId, clientIds, counts);

  console.log("\nRefreshing demo visits (DEMO_VISIT_SEED tag only)...");
  await deleteDemoVisits(supa, agencyId);

  console.log("Seeding scenario visits...");
  const visitIds = await seedScenarioVisits(supa, agencyId, ownerId, clientIds, carerIds, counts);

  console.log("Seeding care plans...");
  const planIds = await upsertCarePlans(supa, agencyId, clientIds, ownerId, todayIso, counts);

  console.log("Seeding CQC evidence items...");
  await upsertCqcEvidence(supa, agencyId, ownerId, clientIds, planIds, visitIds, today, counts);

  const bootstrap = await verifyBootstrap(supa, ownerId, agencyId);

  console.log("\n--- Seed summary ---");
  console.log(`Agency id:        ${agencyId}${counts.agencyRenamed ? " (renamed from legacy)" : ""}`);
  console.log(`Staff (carers):   ${DEMO_STAFF.filter((s) => s.role !== "owner").length} (${counts.staffReusedOrCreated} new)`);
  console.log(`Clients:          ${DEMO_CLIENTS.length} (${counts.clientsReusedOrCreated} new)`);
  console.log(`Visits:           ${counts.visitsDeletedThenCreated}`);
  console.log(`  completed+notes: ${counts.completedOnTime}`);
  console.log(`  no-notes:        ${counts.completedNoNotes}`);
  console.log(`  missed:          ${counts.missed}`);
  console.log(`  in_progress:     ${counts.inProgress}`);
  console.log(`  late (today):    ${counts.completedLate}`);
  console.log(`  scheduled:       ${counts.futureScheduled}`);
  console.log(`  double-ups:      ${counts.doubleUps}`);
  console.log(`  double-up gaps:  ${counts.doubleUpGaps}`);
  console.log(`Care plans:       ${DEMO_CLIENTS.length} (${counts.carePlansReusedOrCreated} new)`);
  console.log(`Sections added:   ${counts.sectionsCreated}`);
  console.log(`Visit notes:      ${counts.notesCreated}`);
  console.log(`CQC items:        ${DEMO_CQC_ITEMS.length} (${counts.cqcItemsReusedOrCreated} new)`);

  console.log("\n--- Bootstrap ---");
  console.log("Membership:", membership.created ? "inserted" : "updated bump");
  console.log(
    "Resolved agency:",
    bootstrap.resolvedAgencyId === agencyId ? bootstrap.agencyName : `OTHER ${bootstrap.resolvedAgencyId}`
  );

  console.log("\nManual steps:");
  console.log("- Sign out/in after seed.");
  console.log("- Login as DEMO_SEED_OWNER_USER_ID (Brian Demo Admin label in docs).");
  console.log("- Dashboard: late/missed/no-notes/in-progress/double-up gap scenarios.");
  console.log("- Compliance: CQC 5 questions + overdue care plan reviews (Arthur, Eileen, Ahmed).");
  console.log("- Care plans: green=Robert/Margaret/George; amber=Priya/Frank/Linda/Joan; red=Arthur/Eileen/Ahmed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
