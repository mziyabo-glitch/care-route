/**
 * Swindon Community Care Demo — idempotent-ish seed using the service role key.
 *
 * SAFETY:
 * - Requires ALLOW_DEMO_SEED=true
 * - Targets NEXT_PUBLIC_SUPABASE_URL (printed at start)
 * - Never deletes non-demo visits (only visits with DEMO_VISIT_SEED in notes)
 * - Requires DEMO_SEED_OWNER_USER_ID — your existing Supabase Auth user UUID (agency owner membership)
 *
 * VISIT COVERAGE:
 * - Rolling month: today-14 days through today+16 days (~31 days)
 * - Target ~868 visits (28/day) spread across 30 carers / 40 clients
 * - Status mix: ~45% completed, ~10% completed-late, ~8% completed-no-notes,
 *   ~7% missed, ~30% future scheduled; some in_progress
 * - Double-up: ~20% via visit_assignments secondary carer
 * - 4 call windows per day: morning 07:00-10:30, lunch 11:30-14:00, tea 15:30-18:30, bedtime 19:00-22:30
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

const VISIT_TYPES = [
  "personal care",
  "medication prompt",
  "breakfast support",
  "meal prep",
  "welfare check",
  "companionship",
  "domestic support",
  "continence support",
  "mobility support",
  "bed transfer",
  "reablement",
  "shopping support",
];

/** 4 call windows: morning, lunch, tea, bedtime */
const CALL_WINDOWS = [
  { name: "morning",  startH: 7,  startM: 0,  endH: 10, endM: 30, defaultLen: 30 },
  { name: "lunch",    startH: 11, startM: 30, endH: 14, endM: 0,  defaultLen: 45 },
  { name: "tea",      startH: 15, startM: 30, endH: 18, endM: 30, defaultLen: 30 },
  { name: "bedtime",  startH: 19, startM: 0,  endH: 22, endM: 30, defaultLen: 45 },
];

type Counts = {
  carersReusedOrCreated: number;
  clientsReusedOrCreated: number;
  visitsDeletedThenCreated: number;
  carePlansReusedOrCreated: number;
  sectionsCreated: number;
  notesCreated: number;
  fundersReusedOrCreated: number;
  completedOnTime: number;
  completedLate: number;
  completedNoNotes: number;
  missed: number;
  inProgress: number;
  futureScheduled: number;
  doubleUps: number;
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

/** Deterministic pseudo-random based on seed integer */
function prng(seed: number): number {
  let s = seed ^ 0xdeadbeef;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = s ^ (s >>> 16);
  return (s >>> 0) / 0x100000000;
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
    // Always bump created_at to now() so this membership sorts first (newest DESC)
    // and getCurrentAgencyId() resolves to the demo agency on next login.
    const { error: bumpErr } = await client
      .from("agency_members")
      .update({ role: "owner", created_at: new Date().toISOString() })
      .eq("id", hit.id as string);
    if (bumpErr) throw bumpErr;
    return { role: "owner", created: false };
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
  const doubleUpIdx = new Set([2, 7, 12, 18, 25, 31, 36]);

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
  // Fetch in batches to avoid hitting row limits
  let offset = 0;
  const batchSize = 500;
  while (true) {
    const { data: rows, error: qe } = await client
      .from("visits")
      .select("id")
      .eq("agency_id", agencyId)
      .ilike("notes", `%${DEMO_TAG}%`)
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

/**
 * Determine cohort for a visit based on its date offset from today.
 * dayOffset: negative = past, 0 = today, positive = future.
 * Uses deterministic prng(seed) to assign status within target proportions.
 *
 * Target proportions for past/today visits:
 *   45% completed on-time, 10% completed-late, 8% completed-no-notes,
 *   7% missed, remainder in_progress (small, ~2%) or completed
 * Future visits: all scheduled
 *
 * Returns cohort label; callers map to status.
 */
type VisitCohort =
  | "completed_ontime"
  | "completed_late"
  | "completed_nonotes"
  | "missed"
  | "in_progress"
  | "scheduled";

function assignCohort(dayOffset: number, seed: number): VisitCohort {
  if (dayOffset > 0) return "scheduled";
  // Today: keep some as in_progress (currently mid-visit feel), a few scheduled
  if (dayOffset === 0) {
    const r = prng(seed);
    if (r < 0.40) return "completed_ontime";
    if (r < 0.50) return "completed_late";
    if (r < 0.57) return "completed_nonotes";
    if (r < 0.64) return "missed";
    if (r < 0.72) return "in_progress";
    return "scheduled";
  }
  // Past days
  const r = prng(seed);
  if (r < 0.45) return "completed_ontime";
  if (r < 0.55) return "completed_late";
  if (r < 0.63) return "completed_nonotes";
  if (r < 0.70) return "missed";
  if (r < 0.72) return "in_progress";
  return "completed_ontime"; // remainder goes to completed
}

async function createVisitsAndActuals(
  client: SupabaseClient,
  agencyId: string,
  carerIds: string[],
  clientIds: string[],
  ownerUserId: string,
  counts: Counts
): Promise<{ visitIds: string[]; noNotesVisitIds: string[]; completedVisitIds: string[] }> {
  const today = startOfUkDayUtc(new Date());
  const PAST_DAYS = 14;
  const FUTURE_DAYS = 16;
  const TOTAL_DAYS = PAST_DAYS + 1 + FUTURE_DAYS; // 31
  const NUM_CARERS = carerIds.length; // 30
  const NUM_CLIENTS = clientIds.length; // 40
  const NUM_WINDOWS = CALL_WINDOWS.length; // 4
  // 7 visits per carer per day × 4 windows gives 7 slots; we spread 868 visits over 31 days
  // Strategy: for each (day, window, slot) tuple assign a carer and client deterministically

  const visitIds: string[] = [];
  const noNotesVisitIds: string[] = [];
  const completedVisitIds: string[] = [];

  // We want ~868 visits: 28 per day × 31 days
  // Each day × 4 windows × 7 slots = 28 visits/day
  const SLOTS_PER_WINDOW = 7;

  let visitSeq = 0; // global sequence for prng seeding

  for (let dayIdx = 0; dayIdx < TOTAL_DAYS; dayIdx++) {
    const dayOffset = dayIdx - PAST_DAYS; // -14..0..+16
    const visitDate = new Date(today.getTime() + dayOffset * 86400 * 1000);

    for (let winIdx = 0; winIdx < NUM_WINDOWS; winIdx++) {
      const win = CALL_WINDOWS[winIdx]!;

      for (let slot = 0; slot < SLOTS_PER_WINDOW; slot++) {
        visitSeq++;
        const seed = visitSeq * 31337 + dayIdx * 997 + winIdx * 17 + slot;

        // Assign carer and client deterministically but spread well
        const carerIdx = (slot * NUM_WINDOWS + winIdx + dayIdx * 3) % NUM_CARERS;
        const clientIdx = (visitSeq * 7 + dayIdx * 11) % NUM_CLIENTS;
        const primaryId = carerIds[carerIdx]!;
        const clientId = clientIds[clientIdx]!;

        // Stagger start times within window, spread across window width
        const windowDurMin =
          (win.endH * 60 + win.endM) - (win.startH * 60 + win.startM);
        const staggerMin = Math.floor(prng(seed + 1) * (windowDurMin - 60));
        const startMin = win.startH * 60 + win.startM + staggerMin;
        const startH = Math.floor(startMin / 60);
        const startMm = startMin % 60;

        // Duration: 15, 30, 45 or 60 min
        const durOptions = [15, 30, 45, 60];
        const durIdx = Math.floor(prng(seed + 2) * durOptions.length);
        const durationMin = durOptions[durIdx] ?? win.defaultLen;

        const startTime = new Date(visitDate);
        startTime.setUTCHours(startH, startMm, 0, 0);
        const endTime = new Date(startTime.getTime() + durationMin * 60 * 1000);

        // Double-up: ~20% probability
        const isDoubleUp = prng(seed + 3) < 0.20;
        const secondaryIdx = isDoubleUp
          ? (carerIdx + 1 + Math.floor(prng(seed + 4) * 5)) % NUM_CARERS
          : null;
        const secondaryId = secondaryIdx !== null ? carerIds[secondaryIdx]! : null;

        // Visit type from list
        const visitTypeIdx = Math.floor(prng(seed + 5) * VISIT_TYPES.length);
        const visitType = VISIT_TYPES[visitTypeIdx]!;

        // Double-up reason if applicable
        const doubleUpReasons = [
          "Double-up: personal care (2 carers)",
          "Double-up: mobility support",
          "Double-up: evening bed transfer",
          "Double-up: medication + moving assistance",
          "Double-up: continence support",
        ];
        const doubleUpNote = isDoubleUp
          ? ` | ${doubleUpReasons[Math.floor(prng(seed + 6) * doubleUpReasons.length)]!}`
          : "";

        // Mileage on ~20% of visits
        const mileage_miles =
          prng(seed + 7) < 0.20 ? parseFloat((2.0 + prng(seed + 8) * 8.0).toFixed(1)) : null;

        const cohort = assignCohort(dayOffset, seed + 9);
        let status: "scheduled" | "completed" | "missed" | "in_progress";
        switch (cohort) {
          case "completed_ontime":
          case "completed_late":
          case "completed_nonotes":
            status = "completed";
            break;
          case "missed":
            status = "missed";
            break;
          case "in_progress":
            status = "in_progress";
            break;
          default:
            status = "scheduled";
        }

        const note =
          `${DEMO_TAG} day=${dayOffset} win=${win.name} slot=${slot} type=${visitType}${doubleUpNote}`;

        const { data: vrow, error: ve } = await client
          .from("visits")
          .insert({
            agency_id: agencyId,
            client_id: clientId,
            carer_id: primaryId,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            status,
            notes: note,
            mileage_miles,
          })
          .select("id")
          .single();
        if (ve) throw ve;
        const vid = vrow!.id as string;
        visitIds.push(vid);

        // visit_assignments
        const assigns: Array<{
          agency_id: string;
          visit_id: string;
          carer_id: string;
          role: "primary" | "secondary";
        }> = [{ agency_id: agencyId, visit_id: vid, carer_id: primaryId, role: "primary" }];
        if (secondaryId && secondaryId !== primaryId) {
          assigns.push({ agency_id: agencyId, visit_id: vid, carer_id: secondaryId, role: "secondary" });
          counts.doubleUps++;
        }
        const { error: ae } = await client.from("visit_assignments").insert(assigns);
        if (ae) throw ae;

        // Actuals for completed visits
        if (cohort === "completed_ontime") {
          // Check in 1–5 min early/on-time, check out ~planned end
          const earlyMs = Math.floor(prng(seed + 10) * 5 * 60 * 1000);
          const ci = new Date(startTime.getTime() + earlyMs);
          const co = new Date(endTime.getTime() - Math.floor(prng(seed + 11) * 3 * 60 * 1000));
          const loc = LOCATIONS[clientIdx % LOCATIONS.length]!;
          const { error: acte } = await client.from("visit_actuals").insert({
            visit_id: vid,
            agency_id: agencyId,
            check_in_at: ci.toISOString(),
            check_out_at: co.toISOString(),
            check_in_source: "carer",
            check_out_source: "carer",
            break_minutes: prng(seed + 12) < 0.15 ? 10 : 0,
            check_in_latitude: loc.lat + prng(seed + 13) * 0.002 - 0.001,
            check_in_longitude: loc.lng + prng(seed + 14) * 0.002 - 0.001,
            check_out_latitude: loc.lat + prng(seed + 15) * 0.002 - 0.001,
            check_out_longitude: loc.lng + prng(seed + 16) * 0.002 - 0.001,
          });
          if (acte) throw acte;
          completedVisitIds.push(vid);
          counts.completedOnTime++;
        } else if (cohort === "completed_late") {
          // Check in 10–45 min late, check out around planned end (slightly extended)
          const lateMs = (10 + Math.floor(prng(seed + 10) * 35)) * 60 * 1000;
          const ci = new Date(startTime.getTime() + lateMs);
          const co = new Date(endTime.getTime() + Math.floor(prng(seed + 11) * 10 * 60 * 1000));
          const loc = LOCATIONS[clientIdx % LOCATIONS.length]!;
          const { error: acte } = await client.from("visit_actuals").insert({
            visit_id: vid,
            agency_id: agencyId,
            check_in_at: ci.toISOString(),
            check_out_at: co.toISOString(),
            check_in_source: "carer",
            check_out_source: "carer",
            break_minutes: 0,
            check_in_latitude: loc.lat + prng(seed + 13) * 0.002 - 0.001,
            check_in_longitude: loc.lng + prng(seed + 14) * 0.002 - 0.001,
            check_out_latitude: loc.lat + prng(seed + 15) * 0.002 - 0.001,
            check_out_longitude: loc.lng + prng(seed + 16) * 0.002 - 0.001,
          });
          if (acte) throw acte;
          completedVisitIds.push(vid);
          counts.completedLate++;
        } else if (cohort === "completed_nonotes") {
          // Normal actual but no care note will be added
          const ci = new Date(startTime.getTime() + Math.floor(prng(seed + 10) * 5 * 60 * 1000));
          const co = new Date(endTime.getTime() - Math.floor(prng(seed + 11) * 2 * 60 * 1000));
          const loc = LOCATIONS[clientIdx % LOCATIONS.length]!;
          const { error: acte } = await client.from("visit_actuals").insert({
            visit_id: vid,
            agency_id: agencyId,
            check_in_at: ci.toISOString(),
            check_out_at: co.toISOString(),
            check_in_source: "carer",
            check_out_source: "carer",
            break_minutes: 0,
            check_in_latitude: loc.lat + prng(seed + 13) * 0.002 - 0.001,
            check_in_longitude: loc.lng + prng(seed + 14) * 0.002 - 0.001,
            check_out_latitude: loc.lat + prng(seed + 15) * 0.002 - 0.001,
            check_out_longitude: loc.lng + prng(seed + 16) * 0.002 - 0.001,
          });
          if (acte) throw acte;
          noNotesVisitIds.push(vid);
          counts.completedNoNotes++;
        } else if (cohort === "in_progress") {
          // Checked in but not checked out
          const ci = new Date(startTime.getTime() + Math.floor(prng(seed + 10) * 5 * 60 * 1000));
          const loc = LOCATIONS[clientIdx % LOCATIONS.length]!;
          await client.from("visit_actuals").insert({
            visit_id: vid,
            agency_id: agencyId,
            check_in_at: ci.toISOString(),
            check_out_at: null,
            check_in_source: "carer",
            check_out_source: null,
            break_minutes: 0,
            check_in_latitude: loc.lat + prng(seed + 13) * 0.002 - 0.001,
            check_in_longitude: loc.lng + prng(seed + 14) * 0.002 - 0.001,
          });
          counts.inProgress++;
        } else if (cohort === "missed") {
          counts.missed++;
        } else {
          counts.futureScheduled++;
        }

        counts.visitsDeletedThenCreated++;

        // Risk score (non-fatal if RPC absent)
        await client.from("visit_risk_scores").delete().eq("visit_id", vid);
        await client.rpc("calculate_visit_risk", { p_visit_id: vid });
      }
    }
  }

  return { visitIds, noNotesVisitIds, completedVisitIds };
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

const DEMO_NOTE_TEMPLATES = [
  "Client settled and comfortable throughout visit. Assisted with {type}, went well.",
  "Arrived and completed {type}. Client in good spirits. Handover notes passed to coordinator.",
  "Visit completed as planned — {type}. Client engaged positively. No concerns raised.",
  "Completed {type}. Client appeared well. Family member present for part of visit.",
  "Provided {type} support. Client requested slight adjustment to routine; coordinator informed.",
  "All tasks completed. {type} — client cooperative. Medication taken as prescribed.",
  "Visit outcome: {type} completed satisfactorily. No incidents to report.",
  "Supported client with {type}. Client tired but comfortable. Advised to rest afterwards.",
];

async function addVisitNotes(
  client: SupabaseClient,
  agencyId: string,
  completedVisitIds: string[],
  noNotesVisitIds: Set<string>,
  ownerUserId: string,
  carerIds: string[],
  counts: Counts
): Promise<void> {
  const noteTypes = ["general", "handover", "clinical", null] as const;

  for (let i = 0; i < completedVisitIds.length; i++) {
    const vid = completedVisitIds[i]!;
    // Skip if this visit is in the no-notes cohort
    if (noNotesVisitIds.has(vid)) continue;
    // Also skip ~5% randomly for extra compliance gaps
    if (prng(i * 7919 + 1) < 0.05) continue;

    const noteTypeIdx = i % noteTypes.length;
    const note_type = noteTypes[noteTypeIdx] ?? null;
    const templateIdx = i % DEMO_NOTE_TEMPLATES.length;
    const template = DEMO_NOTE_TEMPLATES[templateIdx]!;
    const visitTypeIdx = i % VISIT_TYPES.length;
    const visitType = VISIT_TYPES[visitTypeIdx]!;
    const body = `[Demo note] ${template.replace("{type}", visitType)}`;
    const authorId = carerIds[i % carerIds.length] ?? ownerUserId;

    const { error } = await client.from("visit_care_notes").insert({
      agency_id: agencyId,
      visit_id: vid,
      author_id: ownerUserId,
      body,
      note_type,
    });
    if (!error) counts.notesCreated++;

    // Suppress unused variable warning
    void authorId;
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

  const today = startOfUkDayUtc(new Date());
  const rangeStart = new Date(today.getTime() - 14 * 86400 * 1000);
  const rangeEnd = new Date(today.getTime() + 16 * 86400 * 1000);

  console.log("Target:", url);
  console.log("Demo agency:", AGENCY_NAME);
  console.log("Owner user:", ownerId);
  console.log("Demo email domain:", EMAIL_DOMAIN);
  console.log(
    `Rolling month: ${rangeStart.toISOString().slice(0, 10)} → ${rangeEnd.toISOString().slice(0, 10)} (31 days)`
  );

  const supaClient = createClient(url, key, { auth: { persistSession: false } });

  const counts: Counts = {
    carersReusedOrCreated: 0,
    clientsReusedOrCreated: 0,
    visitsDeletedThenCreated: 0,
    carePlansReusedOrCreated: 0,
    sectionsCreated: 0,
    notesCreated: 0,
    fundersReusedOrCreated: 0,
    completedOnTime: 0,
    completedLate: 0,
    completedNoNotes: 0,
    missed: 0,
    inProgress: 0,
    futureScheduled: 0,
    doubleUps: 0,
  };

  const agencyId = await resolveAgency(supaClient, ownerId);
  const membership = await ensureMembership(supaClient, agencyId, ownerId);

  const carerIds = await upsertDemoCarers(supaClient, agencyId, counts);
  const clientIds = await upsertDemoClients(supaClient, agencyId, counts);

  await ensureBillingPrereqs(supaClient, agencyId, clientIds, counts);

  console.log("\nRefreshing demo visits (deletes visits tagged DEMO only)...");
  await deleteDemoVisits(supaClient, agencyId);

  console.log("Generating rolling month visits...");
  const { visitIds, noNotesVisitIds, completedVisitIds } = await createVisitsAndActuals(
    supaClient, agencyId, carerIds, clientIds, ownerId, counts
  );

  await upsertCarePlans(supaClient, agencyId, clientIds, ownerId, counts);

  const noNotesSet = new Set(noNotesVisitIds);
  await addVisitNotes(supaClient, agencyId, completedVisitIds, noNotesSet, ownerId, carerIds, counts);

  const bootstrap = await verifyBootstrap(supaClient, ownerId, agencyId);
  bootstrap.membershipCreated = membership.created;

  const totalCompleted = counts.completedOnTime + counts.completedLate + counts.completedNoNotes;

  console.log("\n--- Seed summary ---");
  console.log(`Date range:    ${rangeStart.toISOString().slice(0, 10)} → ${rangeEnd.toISOString().slice(0, 10)}`);
  console.log(`Agency id:     ${agencyId}`);
  console.log(`Carers:        ${carerIds.length} total (${counts.carersReusedOrCreated} new this run)`);
  console.log(`Clients:       ${clientIds.length} total (${counts.clientsReusedOrCreated} new this run)`);
  console.log(`\nVisits total:  ${counts.visitsDeletedThenCreated}`);
  console.log(`  completed (on-time):    ${counts.completedOnTime}  (~${pct(counts.completedOnTime, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  completed (late):       ${counts.completedLate}  (~${pct(counts.completedLate, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  completed (no-notes):   ${counts.completedNoNotes}  (~${pct(counts.completedNoNotes, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  total completed:        ${totalCompleted}  (~${pct(totalCompleted, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  missed/no-show:         ${counts.missed}  (~${pct(counts.missed, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  in_progress:            ${counts.inProgress}  (~${pct(counts.inProgress, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  future scheduled:       ${counts.futureScheduled}  (~${pct(counts.futureScheduled, counts.visitsDeletedThenCreated)}%)`);
  console.log(`  double-ups:             ${counts.doubleUps}  (~${pct(counts.doubleUps, counts.visitsDeletedThenCreated)}%)`);
  console.log(`\nValid statuses used: scheduled, in_progress, completed, missed`);
  console.log(`Note: 'cancelled' is not a valid status in schema (mapped to missed).`);
  console.log(`\nCare plans (new this run): ${counts.carePlansReusedOrCreated}`);
  console.log(`Section rows inserted:     ${counts.sectionsCreated}`);
  console.log(`Visit care notes inserted: ${counts.notesCreated}`);
  console.log(`Funders created:           ${counts.fundersReusedOrCreated}`);
  console.log(`Total visit IDs:           ${visitIds.length}`);

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

  console.log(
    `\nAfter seed, getCurrentAgencyId() will resolve to: ${bootstrap.resolvedAgencyId === bootstrap.agencyId ? bootstrap.agencyName : `OTHER — ${bootstrap.resolvedAgencyId} (NOT the demo agency — rerun seed)`}`
  );

  console.log("\nManual steps:");
  console.log("- Sign out then sign back in to pick up the refreshed membership timestamp.");
  console.log("- Log into the app as the account with DEMO_SEED_OWNER_USER_ID.");
  console.log(`- Payroll UI: generate timesheet for ${rangeStart.toISOString().slice(0, 10)} → ${rangeEnd.toISOString().slice(0, 10)}.`);
  console.log("- Compliance: expects missed visits + completed visits without care notes.");
  console.log("- Visit Map: managers; geocoded clients in SN* postcodes, GPS actuals on completed.");
  console.log("- Rota: view any week within the date range to see dense scheduled/completed slots.");
}

function pct(n: number, total: number): string {
  if (total === 0) return "0";
  return Math.round((n / total) * 100).toString();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
