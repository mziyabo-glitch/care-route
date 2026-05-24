/**
 * Swindon Community Care Demo — idempotent-ish seed using the service role key.
 *
 * SAFETY:
 * - Requires ALLOW_DEMO_SEED=true
 * - Targets NEXT_PUBLIC_SUPABASE_URL (printed at start)
 * - Never deletes non-demo visits (only visits with DEMO_VISIT_SEED in notes)
 * - Requires DEMO_SEED_OWNER_USER_ID — your existing Supabase Auth user UUID (agency owner membership)
 */

import 'dotenv-flow/config';

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CARE_PLAN_SECTION_TEMPLATES,
} from "../src/lib/care-plan-data";

const AGENCY_NAME = "Swindon Community Care Demo";
const EMAIL_DOMAIN = "swindon.care-route.demo";
const DEMO_TAG = "[DEMO_VISIT_SEED]";

/** Postcode prefixes + nominal centre (Swindon area, ~reasonable for Visit Map demos). */
const LOCATIONS = [
  { area: "Old Town", postcode: "SN1 1JN", lat: 51.5569, lng: -1.7801 },
  { area: "Rodbourne", postcode: "SN2 2DA", lat: 51.5762, lng: -1.8012 },
  { area: "Stratton", postcode: "SN3 4BD", lat: 51.5621, lng: -1.7534 },
  { area: "Haydon Wick", postcode: "SN25 1TX", lat: 51.6012, lng: -1.8256 },
  { area: "Wroughton", postcode: "SN4 0QJ", lat: 51.5123, lng: -1.8023 },
  { area: "West Swindon", postcode: "SN5 8WE", lat: 51.5678, lng: -1.8234 },
  { area: "Covingham", postcode: "SN3 5AA", lat: 51.5712, lng: -1.7412 },
  { area: "Nythe", postcode: "SN3 2JH", lat: 51.5654, lng: -1.7298 },
  { area: "Eldene", postcode: "SN3 3LR", lat: 51.5598, lng: -1.7156 },
  { area: "Liden", postcode: "SN3 6NL", lat: 51.5534, lng: -1.7098 },
  { area: "Gorse Hill", postcode: "SN2 8BA", lat: 51.5645, lng: -1.7892 },
  { area: "Park North", postcode: "SN3 2JS", lat: 51.5689, lng: -1.7356 },
  { area: "Toothill", postcode: "SN5 8DE", lat: 51.5612, lng: -1.8356 },
  { area: "Freshbrook", postcode: "SN5 8PY", lat: 51.5567, lng: -1.8456 },
  { area: "Highworth", postcode: "SN6 7AA", lat: 51.6201, lng: -1.7102 },
];

type Counts = {
  carersReusedOrCreated: number;
  clientsReusedOrCreated: number;
  visitsDeletedThenCreated: number;
  carePlansReusedOrCreated: number;
  sectionsCreated: number;
  notesCreated: number;
  fundersReusedOrCreated: number;
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
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return new Date(Date.UTC(y, m, day));
}

async function resolveAgency(client: SupabaseClient, ownerUserId: string): Promise<string> {
  const { data: existing } = await client
    .from("agencies")
    .select("id, owner_id, created_by")
    .eq("name", AGENCY_NAME)
    .maybeSingle();

  if (existing?.id) {
    const agencyId = existing.id as string;
    const needsOwner =
      (existing as { owner_id?: string | null }).owner_id !== ownerUserId ||
      (existing as { created_by?: string | null }).created_by !== ownerUserId;
    if (needsOwner) {
      const { error: updErr } = await client
        .from("agencies")
        .update({ owner_id: ownerUserId, created_by: ownerUserId })
        .eq("id", agencyId);
      if (updErr) throw updErr;
    }
    return agencyId;
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
  return ins!.id as string;
}

async function ensureMembership(
  client: SupabaseClient,
  agencyId: string,
  userId: string
): Promise<{ role: string; created: boolean }> {
  const { data: hit } = await client
    .from("agency_members")
    .select("id, role")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (hit?.id) {
    const role = (hit as { role?: string }).role ?? "owner";
    if (role !== "owner") {
      const { error: roleErr } = await client
        .from("agency_members")
        .update({ role: "owner" })
        .eq("id", hit.id as string);
      if (roleErr) throw roleErr;
      return { role: "owner", created: false };
    }
    return { role, created: false };
  }

  const { error } = await client.from("agency_members").insert({
    agency_id: agencyId,
    user_id: userId,
    role: "owner",
  });
  if (error) throw error;
  return { role: "owner", created: true };
}

type BootstrapVerification = {
  ownerUserId: string;
  agencyId: string;
  agencyName: string;
  agencyOwnerId: string | null;
  membershipRole: string;
  membershipCreated: boolean;
  allMemberships: Array<{ agency_id: string; role: string; agency_name: string; created_at: string }>;
  resolvedAgencyId: string | null;
};

async function verifyBootstrap(
  client: SupabaseClient,
  ownerUserId: string,
  demoAgencyId: string
): Promise<BootstrapVerification> {
  const { data: agency, error: agencyErr } = await client
    .from("agencies")
    .select("id, name, owner_id")
    .eq("id", demoAgencyId)
    .single();
  if (agencyErr) throw agencyErr;

  const { data: membership, error: memErr } = await client
    .from("agency_members")
    .select("role, created_at")
    .eq("agency_id", demoAgencyId)
    .eq("user_id", ownerUserId)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!membership) {
    throw new Error(
      `Bootstrap check failed: no agency_members row for user ${ownerUserId} in demo agency ${demoAgencyId}`
    );
  }

  const { data: allMembers, error: allErr } = await client
    .from("agency_members")
    .select("agency_id, role, created_at, agencies(name)")
    .eq("user_id", ownerUserId)
    .order("created_at", { ascending: false });
  if (allErr) throw allErr;

  const allMemberships = (allMembers ?? []).map((row) => {
    const agencies = row.agencies as { name?: string } | { name?: string }[] | null;
    const name =
      agencies && typeof agencies === "object" && "name" in agencies
        ? String(agencies.name ?? "")
        : Array.isArray(agencies) && agencies[0]?.name
          ? String(agencies[0].name)
          : "";
    return {
      agency_id: row.agency_id as string,
      role: row.role as string,
      agency_name: name,
      created_at: row.created_at as string,
    };
  });

  const resolvedAgencyId = allMemberships[0]?.agency_id ?? null;

  return {
    ownerUserId,
    agencyId: demoAgencyId,
    agencyName: agency!.name as string,
    agencyOwnerId: (agency as { owner_id?: string | null }).owner_id ?? null,
    membershipRole: membership.role as string,
    membershipCreated: false,
    allMemberships,
    resolvedAgencyId,
  };
}

function carerEmail(idx: number) {
  return `demo-sw-carer-${idx}@${EMAIL_DOMAIN}`;
}

async function upsertDemoCarers(
  client: SupabaseClient,
  agencyId: string,
  counts: Counts
): Promise<string[]> {
  const ids: string[] = [];
  const firstnames = ["Alex", "Sam", "Jordan", "Taylor", "Casey", "Riley", "Morgan", "Jamie"];
  const surnames = ["Smith", "Jones", "Brown", "Wilson", "Taylor", "Evans", "Thomas", "Roberts"];

  for (let i = 1; i <= 30; i++) {
    const email = carerEmail(i);
    const { data: prev } = await client
      .from("carers")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("email", email)
      .maybeSingle();
    if (prev?.id) {
      ids.push(prev.id as string);
      continue;
    }
    const name = `Demo Carer ${i} (${firstnames[i % firstnames.length]} ${surnames[i % surnames.length]})`;
    const { data, error } = await client
      .from("carers")
      .insert({
        agency_id: agencyId,
        full_name: name,
        name,
        email,
        phone: `01793${String(100000 + i).slice(0, 6)}`,
        role: "carer",
        active: true,
        payroll_number: `SW-DEMO-${String(i).padStart(4, "0")}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data!.id as string);
    counts.carersReusedOrCreated++;
  }
  return ids;
}

async function upsertDemoClients(
  client: SupabaseClient,
  agencyId: string,
  counts: Counts
): Promise<string[]> {
  const ids: string[] = [];
  const doubleUpIdx = new Set([2, 7, 12, 18, 25, 31, 36]); // personal care / mobility etc.

  for (let i = 1; i <= 40; i++) {
    const loc = LOCATIONS[(i - 1) % LOCATIONS.length]!;
    const displayName = `Demo Client ${i} (${loc.area})`;
    const { data: prev } = await client
      .from("clients")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("full_name", displayName)
      .maybeSingle();
    if (prev?.id) {
      ids.push(prev.id as string);
      continue;
    }
    const funding = i % 3 === 0 ? "local_authority" : "private";
    const { data, error } = await client
      .from("clients")
      .insert({
        agency_id: agencyId,
        full_name: displayName,
        name: displayName,
        address: `${12 + (i % 8)} ${loc.area} Road, Swindon`,
        postcode: loc.postcode,
        notes: `Demo service user — ${loc.area}. ${DEMO_TAG}`,
        requires_double_up: doubleUpIdx.has(i),
        latitude: loc.lat + (i % 7) * 0.0008,
        longitude: loc.lng + (i % 5) * 0.0009,
        geocoded_at: new Date().toISOString(),
        funding_type: funding,
      })
      .select("id")
      .single();
    if (error) throw error;
    ids.push(data!.id as string);
    counts.clientsReusedOrCreated++;
  }
  return ids;
}

async function ensureBillingPrereqs(
  client: SupabaseClient,
  agencyId: string,
  clientIds: string[],
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

  const roles = ["carer", "senior", "nurse", "manager"] as const;
  for (const role of roles) {
    const { data: br } = await client
      .from("billing_rates")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("funder_id", funderId)
      .eq("role", role)
      .eq("rate_type", "hourly")
      .maybeSingle();
    if (br) continue;
    const { error: bre } = await client.from("billing_rates").insert({
      agency_id: agencyId,
      funder_id: funderId,
      role,
      rate_type: "hourly",
      amount: role === "senior" ? 24.5 : role === "nurse" ? 28.0 : 22.5,
      mileage_rate: 0.45,
    });
    if (bre) throw bre;
  }

  // Link LA-funded demo clients
  for (let i = 2; i < clientIds.length; i += 3) {
    const cid = clientIds[i];
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
  const { data: rows, error: qe } = await client
    .from("visits")
    .select("id")
    .eq("agency_id", agencyId)
    .ilike("notes", `%${DEMO_TAG}%`);
  if (qe) throw qe;
  const ids = (rows ?? []).map((r) => r.id as string);
  if (ids.length === 0) return;
  const { error } = await client.from("visits").delete().in("id", ids);
  if (error) throw error;
}

/** Unique (day, carer, slotIndex) layout to avoid insert_visit overlap errors. */
function visitScheduleIndex(n: number) {
  const slotsPerDay = 30 * 4; // 4 slots per carer per day (staggered)
  const day = Math.floor(n / slotsPerDay) % 14;
  const rem = n % slotsPerDay;
  const carerSlot = Math.floor(rem / 4);
  const carer = carerSlot % 30;
  const slotKind = rem % 4; // 0 morning 1 lunch 2 tea 3 evening
  return { day, carer, slotKind };
}

const SLOT_START = [
  { h: 7, m: 30, len: 30 },
  { h: 12, m: 0, len: 45 },
  { h: 16, m: 15, len: 30 },
  { h: 19, m: 30, len: 45 },
];

async function createVisitsAndActuals(
  client: SupabaseClient,
  agencyId: string,
  carerIds: string[],
  clientIds: string[],
  ownerUserId: string,
  counts: Counts
): Promise<string[]> {
  const base = startOfUkDayUtc(new Date());
  const visitIds: string[] = [];
  const totalVisits = 168; // fits in 14 * 30 * 4 grid with headroom

  const doubleUpVisitIndices = new Set([5, 15, 28, 41, 55, 68, 82, 95, 110, 125, 140, 155]);
  const completedIdx = new Set<number>();
  for (let k = 0; k < 48; k++) completedIdx.add(k * 3 + 1);
  const missedIdx = new Set([7, 44, 90, 132]);
  const inProgressIdx = new Set([12, 88]);

  for (let n = 0; n < totalVisits; n++) {
    const { day, carer, slotKind } = visitScheduleIndex(n);
    const slot = SLOT_START[slotKind]!;
    const start = new Date(base);
    start.setUTCDate(start.getUTCDate() + day);
    start.setUTCHours(slot.h, slot.m, 0, 0);
    let durationMin = slot.len;
    if (n % 11 === 0) durationMin = 15;
    else if (n % 13 === 0) durationMin = 60;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const primaryId = carerIds[carer]!;
    const clientId = clientIds[n % clientIds.length]!;
    let secondaryId: string | null = null;
    let note = `${DEMO_TAG} slot=${n} ${slotKind === 0 ? "morning" : slotKind === 1 ? "lunch" : slotKind === 2 ? "tea" : "bedtime"}`;

    if (doubleUpVisitIndices.has(n)) {
      secondaryId = carerIds[(carer + 1) % 30]!;
      const duoReasons = [
        "Double-up: personal care (2 carers)",
        "Double-up: mobility support",
        "Double-up: evening bed transfer",
        "Double-up: medication + moving assistance",
      ];
      note += ` | ${duoReasons[n % duoReasons.length]}`;
    }

    let status: "scheduled" | "completed" | "missed" | "in_progress" = "scheduled";
    if (missedIdx.has(n)) status = "missed";
    else if (inProgressIdx.has(n)) status = "in_progress";
    else if (completedIdx.has(n)) status = "completed";

    const mileage_miles = n % 5 === 0 ? 3.2 + (n % 7) * 0.4 : null;

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
        mileage_miles,
      })
      .select("id")
      .single();
    if (ve) throw ve;
    const vid = vrow!.id as string;
    visitIds.push(vid);

    const assigns: Array<{
      agency_id: string;
      visit_id: string;
      carer_id: string;
      role: "primary" | "secondary";
    }> = [{ agency_id: agencyId, visit_id: vid, carer_id: primaryId, role: "primary" }];
    if (secondaryId) {
      assigns.push({
        agency_id: agencyId,
        visit_id: vid,
        carer_id: secondaryId,
        role: "secondary",
      });
    }
    const { error: ae } = await client.from("visit_assignments").insert(assigns);
    if (ae) throw ae;

    if (status === "completed") {
      const ci = new Date(start.getTime() + 4 * 60 * 1000);
      const co = new Date(end.getTime() - 2 * 60 * 1000);
      const loc = LOCATIONS[n % LOCATIONS.length]!;
      const { error: acte } = await client.from("visit_actuals").insert({
        visit_id: vid,
        agency_id: agencyId,
        check_in_at: ci.toISOString(),
        check_out_at: co.toISOString(),
        check_in_source: "carer",
        check_out_source: "carer",
        break_minutes: n % 4 === 0 ? 10 : 0,
        check_in_latitude: loc.lat + 0.001,
        check_in_longitude: loc.lng + 0.001,
        check_out_latitude: loc.lat + 0.0005,
        check_out_longitude: loc.lng + 0.0005,
      });
      if (acte) throw acte;
    }

    if (status === "in_progress") {
      const ci = new Date(start.getTime() + 3 * 60 * 1000);
      await client.from("visit_actuals").insert({
        visit_id: vid,
        agency_id: agencyId,
        check_in_at: ci.toISOString(),
        check_out_at: null,
        check_in_source: "carer",
        check_out_source: null,
        break_minutes: 0,
      });
    }

    counts.visitsDeletedThenCreated++;

    await client.from("visit_risk_scores").delete().eq("visit_id", vid);
    const { error: riskErr } = await client.rpc("calculate_visit_risk", { p_visit_id: vid });
    if (riskErr) {
      // RPC may be absent on older DBs; non-fatal for seed
    }
  }

  return visitIds;
}

async function upsertCarePlans(
  client: SupabaseClient,
  agencyId: string,
  clientIds: string[],
  ownerUserId: string,
  counts: Counts
): Promise<void> {
  const subset = clientIds.slice(0, 35);
  for (const clientId of subset) {
    const { data: existing } = await client
      .from("care_plans")
      .select("id,status")
      .eq("agency_id", agencyId)
      .eq("client_id", clientId)
      .eq("status", "active")
      .maybeSingle();
    let planId = existing?.id as string | undefined;
    if (!planId) {
      const { data: anyPlan } = await client
        .from("care_plans")
        .select("id,status")
        .eq("agency_id", agencyId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (anyPlan && (anyPlan as { status?: string }).status !== "archived") {
        planId = anyPlan!.id as string;
      }
    }

    if (!planId) {
      const { data: ins, error } = await client
        .from("care_plans")
        .insert({
          agency_id: agencyId,
          client_id: clientId,
          status: "active",
          version: 1,
          effective_from: new Date().toISOString().slice(0, 10),
          created_by: ownerUserId,
        })
        .select("id")
        .single();
      if (error) throw error;
      planId = ins!.id as string;
      counts.carePlansReusedOrCreated++;
    }

    const { data: existingSections, error: cErr } = await client
      .from("care_plan_sections")
      .select("section_key")
      .eq("care_plan_id", planId);
    if (cErr) throw cErr;
    const haveKeys = new Set(
      (existingSections ?? [])
        .map((s) => (s as { section_key?: string }).section_key)
        .filter(Boolean)
    );

    for (const t of DEFAULT_CARE_PLAN_SECTION_TEMPLATES) {
      if (haveKeys.has(t.section_key)) continue;
      const { error: se } = await client.from("care_plan_sections").insert({
        agency_id: agencyId,
        care_plan_id: planId,
        sort_order: t.sort_order,
        title: t.title,
        body: `(Demo seed) Outline for ${t.title.toLowerCase()} — bespoke content to be filled by manager.`,
        section_key: t.section_key,
      });
      if (se) throw se;
      counts.sectionsCreated++;
    }
  }
}

async function addVisitNotes(
  client: SupabaseClient,
  agencyId: string,
  visitIds: string[],
  ownerUserId: string,
  counts: Counts
): Promise<void> {
  const targets = visitIds.slice(0, 25); // subset with notes + some without (compliance demo)
  for (let i = 0; i < targets.length; i++) {
    const vid = targets[i]!;
    if (i % 4 === 0) continue; // deliberate gap for missing-notes compliance
    const types = ["general", "handover", "clinical", null];
    const note_type = types[i % types.length];
    const { error } = await client.from("visit_care_notes").insert({
      agency_id: agencyId,
      visit_id: vid,
      author_id: ownerUserId,
      body: `[Demo note] Visit handover completed. Client settled. Type context: ${note_type ?? "general"}`,
      note_type,
    });
    if (!error) counts.notesCreated++;
  }
}

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "true") {
    console.error(
      'Refused: set ALLOW_DEMO_SEED=true to run demo seed against your Supabase project.'
    );
    process.exit(1);
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const ownerId = requireEnv("DEMO_SEED_OWNER_USER_ID");

  console.log("Target:", url);
  console.log("Demo agency:", AGENCY_NAME);
  console.log("Owner user:", ownerId);
  console.log("Demo email domain:", EMAIL_DOMAIN);

  const client = createClient(url, key, { auth: { persistSession: false } });

  const counts: Counts = {
    carersReusedOrCreated: 0,
    clientsReusedOrCreated: 0,
    visitsDeletedThenCreated: 0,
    carePlansReusedOrCreated: 0,
    sectionsCreated: 0,
    notesCreated: 0,
    fundersReusedOrCreated: 0,
  };

  const agencyId = await resolveAgency(client, ownerId);
  const membership = await ensureMembership(client, agencyId, ownerId);

  const carerIds = await upsertDemoCarers(client, agencyId, counts);
  const clientIds = await upsertDemoClients(client, agencyId, counts);

  await ensureBillingPrereqs(client, agencyId, clientIds, counts);

  console.log("\nRefreshing demo visits (deletes visits tagged DEMO only)...");
  await deleteDemoVisits(client, agencyId);

  const visitIds = await createVisitsAndActuals(client, agencyId, carerIds, clientIds, ownerId, counts);

  await upsertCarePlans(client, agencyId, clientIds, ownerId, counts);
  await addVisitNotes(client, agencyId, visitIds, ownerId, counts);

  const bootstrap = await verifyBootstrap(client, ownerId, agencyId);
  bootstrap.membershipCreated = membership.created;

  console.log("\n--- Seed summary ---");
  console.log("Agency id:", agencyId);
  console.log("Carers in agency:", carerIds.length, `(new this run: ${counts.carersReusedOrCreated})`);
  console.log("Clients in agency:", clientIds.length, `(new this run: ${counts.clientsReusedOrCreated})`);
  console.log("Visits created:", counts.visitsDeletedThenCreated);
  console.log("Care plans (new this run):", counts.carePlansReusedOrCreated);
  console.log("Section rows inserted:", counts.sectionsCreated);
  console.log("Visit care notes inserted:", counts.notesCreated);
  console.log("Funders created (first run):", counts.fundersReusedOrCreated);
  console.log("\nRisk scores: attempted calculate_visit_risk per visit (may no-op without superuser RPC).");

  console.log("\n--- Bootstrap verification (app login) ---");
  console.log("Owner user id:", bootstrap.ownerUserId);
  console.log("Demo agency:", bootstrap.agencyName, `(${bootstrap.agencyId})`);
  console.log("Agency owner_id:", bootstrap.agencyOwnerId);
  console.log("Membership role:", bootstrap.membershipRole, membership.created ? "(inserted this run)" : "(existing)");
  console.log(
    "App resolves agency (newest membership first):",
    bootstrap.resolvedAgencyId === bootstrap.agencyId
      ? "demo agency"
      : `OTHER — ${bootstrap.resolvedAgencyId}`,
  );
  if (bootstrap.allMemberships.length > 1) {
    console.log("\nAll memberships for owner (newest first):");
    for (const m of bootstrap.allMemberships) {
      const marker = m.agency_id === bootstrap.agencyId ? " <- demo" : "";
      console.log(`  - ${m.agency_name} (${m.agency_id}) role=${m.role}${marker}`);
    }
    if (bootstrap.resolvedAgencyId !== bootstrap.agencyId) {
      console.warn(
        "\nWARN: User has multiple agencies; app uses the newest membership. " +
          "If you still see the wrong agency, sign out/in or remove older memberships.",
      );
    }
  }

  console.log("\nManual steps:");
  console.log("- Log into the app as the account with DEMO_SEED_OWNER_USER_ID.");
  console.log("- Payroll UI: generate timesheet for UTC date range overlapping next 14 days.");
  console.log("- Compliance: expects missed visits + some completed without notes.");
  console.log("- Visit Map: managers; geocoded clients in SN* postcodes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
