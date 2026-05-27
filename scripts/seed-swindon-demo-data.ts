/**
 * Fictional scenario definitions for Swindon Care Demo Agency seed.
 * All names, addresses, and clinical details are invented for testing only.
 */

import type { ConfidentialityLevel } from "../src/lib/care-plan-data";
import type { CqcCategory, CqcEvidenceStatus, CqcRiskLevel } from "../src/lib/cqc-evidence-data";

export const AGENCY_NAME = "Swindon Care Demo Agency";
export const LEGACY_AGENCY_NAME = "Swindon Community Care Demo";
export const EMAIL_DOMAIN = "swindon.care-route.demo";
export const DEMO_VISIT_TAG = "[DEMO_VISIT_SEED]";
export const DEMO_CLIENT_TAG = "[DEMO_CLIENT]";
export const DEMO_CQC_TAG = "[DEMO_CQC_SEED]";

export type CarePlanTraffic = "green" | "amber" | "red";

export type VisitScenarioKind =
  | "completed_good"
  | "late"
  | "missed"
  | "no_notes"
  | "medication_concern"
  | "nutrition_concern"
  | "double_up_gap"
  | "in_progress"
  | "scheduled_future";

export type DemoStaff = {
  key: string;
  full_name: string;
  email: string;
  role: "owner" | "manager" | "carer";
  phone: string;
  payroll_number?: string;
  notes: string;
};

export const DEMO_STAFF: DemoStaff[] = [
  {
    key: "brian-admin",
    full_name: "Brian Demo Admin",
    email: `brian.demo.admin@${EMAIL_DOMAIN}`,
    role: "owner",
    phone: "01793000001",
    notes: "[DEMO_STAFF] Demo owner profile label — maps to DEMO_SEED_OWNER_USER_ID membership.",
  },
  {
    key: "sarah-coordinator",
    full_name: "Sarah Coordinator",
    email: `sarah.coordinator@${EMAIL_DOMAIN}`,
    role: "manager",
    phone: "01793000002",
    payroll_number: "SW-DEMO-MGR-01",
    notes: "[DEMO_STAFF] Coordinator (manager role on carer record; no separate auth user).",
  },
  {
    key: "amara-williams",
    full_name: "Amara Williams",
    email: `amara.williams@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000101",
    payroll_number: "SW-DEMO-C-01",
    notes: "[DEMO_STAFF]",
  },
  {
    key: "james-patel",
    full_name: "James Patel",
    email: `james.patel@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000102",
    payroll_number: "SW-DEMO-C-02",
    notes: "[DEMO_STAFF]",
  },
  {
    key: "chloe-evans",
    full_name: "Chloe Evans",
    email: `chloe.evans@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000103",
    payroll_number: "SW-DEMO-C-03",
    notes: "[DEMO_STAFF]",
  },
  {
    key: "david-morgan",
    full_name: "David Morgan",
    email: `david.morgan@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000104",
    payroll_number: "SW-DEMO-C-04",
    notes: "[DEMO_STAFF]",
  },
  {
    key: "grace-taylor",
    full_name: "Grace Taylor",
    email: `grace.taylor@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000105",
    payroll_number: "SW-DEMO-C-05",
    notes: "[DEMO_STAFF]",
  },
  {
    key: "mohammed-ali",
    full_name: "Mohammed Ali",
    email: `mohammed.ali@${EMAIL_DOMAIN}`,
    role: "carer",
    phone: "01793000106",
    payroll_number: "SW-DEMO-C-06",
    notes: "[DEMO_STAFF]",
  },
];

export type DemoClient = {
  slug: string;
  full_name: string;
  preferred_name: string;
  approximate_age: number;
  address: string;
  postcode: string;
  lat: number;
  lng: number;
  emergency_contact: string;
  care_type: string;
  risk_level: "low" | "medium" | "high";
  requires_double_up: boolean;
  funding_type: "private" | "local_authority";
  care_plan_traffic: CarePlanTraffic;
  scenario_summary: string;
  primary_carer_key: string;
  visits: Array<{
    day_offset: number;
    window: "morning" | "lunch" | "tea" | "bedtime";
    scenario: VisitScenarioKind;
    carer_key?: string;
    secondary_carer_key?: string;
    visit_type: string;
  }>;
};

export const DEMO_CLIENTS: DemoClient[] = [
  {
    slug: "margaret-ellis",
    full_name: "Margaret Ellis",
    preferred_name: "Maggie",
    approximate_age: 82,
    address: "14 Old Town Road, Swindon",
    postcode: "SN1 1JN",
    lat: 51.5569,
    lng: -1.7801,
    emergency_contact: "Daughter — Helen Ellis (fictional) 01793 111 201",
    care_type: "Morning personal care, medication prompt, mobility",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "private",
    care_plan_traffic: "green",
    scenario_summary: "Low mobility, walking frame, active up-to-date care plan.",
    primary_carer_key: "amara-williams",
    visits: [
      { day_offset: -1, window: "morning", scenario: "completed_good", visit_type: "personal care" },
      { day_offset: 0, window: "morning", scenario: "completed_good", visit_type: "medication prompt" },
      { day_offset: 1, window: "morning", scenario: "scheduled_future", visit_type: "personal care" },
      { day_offset: 7, window: "morning", scenario: "scheduled_future", visit_type: "medication prompt" },
    ],
  },
  {
    slug: "arthur-bennett",
    full_name: "Arthur Bennett",
    preferred_name: "Arthur",
    approximate_age: 78,
    address: "8 Rodbourne Grove, Swindon",
    postcode: "SN2 2DA",
    lat: 51.5762,
    lng: -1.8012,
    emergency_contact: "Wife — Jean Bennett (fictional) 01793 111 202",
    care_type: "Dementia support, communication-led care",
    risk_level: "high",
    requires_double_up: false,
    funding_type: "local_authority",
    care_plan_traffic: "red",
    scenario_summary: "Dementia, high fall risk, overdue review, confidential note.",
    primary_carer_key: "james-patel",
    visits: [
      { day_offset: -1, window: "morning", scenario: "missed", visit_type: "welfare check" },
      { day_offset: 0, window: "tea", scenario: "late", visit_type: "companionship" },
      { day_offset: 7, window: "morning", scenario: "scheduled_future", visit_type: "personal care" },
    ],
  },
  {
    slug: "priya-shah",
    full_name: "Priya Shah",
    preferred_name: "Priya",
    approximate_age: 71,
    address: "22 Stratton Street, Swindon",
    postcode: "SN3 4BD",
    lat: 51.5621,
    lng: -1.7534,
    emergency_contact: "Son — Raj Shah (fictional) 01793 111 203",
    care_type: "Diabetes support, nutrition monitoring",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "local_authority",
    care_plan_traffic: "amber",
    scenario_summary: "Diabetes, hydration monitoring, medication prompts.",
    primary_carer_key: "chloe-evans",
    visits: [
      { day_offset: -1, window: "lunch", scenario: "nutrition_concern", visit_type: "meal prep" },
      { day_offset: 0, window: "lunch", scenario: "late", visit_type: "medication prompt" },
      { day_offset: 1, window: "lunch", scenario: "scheduled_future", visit_type: "meal prep" },
    ],
  },
  {
    slug: "george-williams",
    full_name: "George Williams",
    preferred_name: "George",
    approximate_age: 69,
    address: "5 Haydon Wick Lane, Swindon",
    postcode: "SN25 1TX",
    lat: 51.6012,
    lng: -1.8256,
    emergency_contact: "Sister — Mary Williams (fictional) 01793 111 204",
    care_type: "Post-hospital reablement",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "local_authority",
    care_plan_traffic: "green",
    scenario_summary: "Reablement after discharge, recently reviewed plan.",
    primary_carer_key: "david-morgan",
    visits: [
      { day_offset: -1, window: "morning", scenario: "completed_good", visit_type: "reablement" },
      { day_offset: 0, window: "morning", scenario: "in_progress", visit_type: "mobility support" },
      { day_offset: 0, window: "tea", scenario: "scheduled_future", visit_type: "reablement" },
      { day_offset: 1, window: "morning", scenario: "scheduled_future", visit_type: "mobility support" },
    ],
  },
  {
    slug: "eileen-carter",
    full_name: "Eileen Carter",
    preferred_name: "Eileen",
    approximate_age: 86,
    address: "3 Wroughton Close, Swindon",
    postcode: "SN4 0QJ",
    lat: 51.5123,
    lng: -1.8023,
    emergency_contact: "Family liaison — Carter family (fictional) 01793 111 205",
    care_type: "End-of-life comfort support",
    risk_level: "high",
    requires_double_up: false,
    funding_type: "private",
    care_plan_traffic: "red",
    scenario_summary: "EOL comfort, restricted family/confidential sections.",
    primary_carer_key: "grace-taylor",
    visits: [
      { day_offset: 0, window: "tea", scenario: "completed_good", visit_type: "companionship" },
      { day_offset: 1, window: "bedtime", scenario: "scheduled_future", visit_type: "personal care" },
    ],
  },
  {
    slug: "frank-thompson",
    full_name: "Frank Thompson",
    preferred_name: "Frank",
    approximate_age: 74,
    address: "19 West Swindon Way, Swindon",
    postcode: "SN5 8WE",
    lat: 51.5678,
    lng: -1.8234,
    emergency_contact: "Neighbour — Pat Mills (fictional) 01793 111 206",
    care_type: "Welfare checks, social isolation",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "private",
    care_plan_traffic: "amber",
    scenario_summary: "Isolation, occasional refusals, responsive care evidence.",
    primary_carer_key: "mohammed-ali",
    visits: [
      { day_offset: -1, window: "tea", scenario: "no_notes", visit_type: "welfare check" },
      { day_offset: 0, window: "lunch", scenario: "medication_concern", visit_type: "medication prompt" },
    ],
  },
  {
    slug: "linda-morris",
    full_name: "Linda Morris",
    preferred_name: "Linda",
    approximate_age: 80,
    address: "7 Covingham Drive, Swindon",
    postcode: "SN3 5AA",
    lat: 51.5712,
    lng: -1.7412,
    emergency_contact: "Daughter — Sue Morris (fictional) 01793 111 207",
    care_type: "Medication prompt, personal care",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "local_authority",
    care_plan_traffic: "amber",
    scenario_summary: "Completed visit missing documentation (compliance gap).",
    primary_carer_key: "amara-williams",
    visits: [
      { day_offset: -1, window: "morning", scenario: "no_notes", visit_type: "medication prompt" },
      { day_offset: 0, window: "morning", scenario: "completed_good", visit_type: "personal care" },
    ],
  },
  {
    slug: "ahmed-khan",
    full_name: "Ahmed Khan",
    preferred_name: "Ahmed",
    approximate_age: 76,
    address: "11 Nythe Lane, Swindon",
    postcode: "SN3 2JH",
    lat: 51.5654,
    lng: -1.7298,
    emergency_contact: "Son — Omar Khan (fictional) 01793 111 208",
    care_type: "Double-up mobility transfer",
    risk_level: "high",
    requires_double_up: true,
    funding_type: "local_authority",
    care_plan_traffic: "red",
    scenario_summary: "Double-up required; rota gap with single carer checked in.",
    primary_carer_key: "james-patel",
    visits: [
      { day_offset: 0, window: "morning", scenario: "double_up_gap", visit_type: "bed transfer", secondary_carer_key: "david-morgan" },
      { day_offset: 1, window: "morning", scenario: "scheduled_future", visit_type: "mobility support", secondary_carer_key: "david-morgan" },
    ],
  },
  {
    slug: "joan-phillips",
    full_name: "Joan Phillips",
    preferred_name: "Joan",
    approximate_age: 83,
    address: "2 Eldene Court, Swindon",
    postcode: "SN3 3LR",
    lat: 51.5598,
    lng: -1.7156,
    emergency_contact: "Niece — Emma Phillips (fictional) 01793 111 209",
    care_type: "Nutrition and appetite monitoring",
    risk_level: "medium",
    requires_double_up: false,
    funding_type: "private",
    care_plan_traffic: "amber",
    scenario_summary: "Incomplete nutrition section on care plan.",
    primary_carer_key: "chloe-evans",
    visits: [
      { day_offset: 0, window: "lunch", scenario: "scheduled_future", visit_type: "meal prep" },
      { day_offset: -1, window: "lunch", scenario: "nutrition_concern", visit_type: "meal prep" },
    ],
  },
  {
    slug: "robert-green",
    full_name: "Robert Green",
    preferred_name: "Bob",
    approximate_age: 79,
    address: "16 Liden Walk, Swindon",
    postcode: "SN3 6NL",
    lat: 51.5534,
    lng: -1.7098,
    emergency_contact: "Wife — Anne Green (fictional) 01793 111 210",
    care_type: "Stable low-risk domiciliary package",
    risk_level: "low",
    requires_double_up: false,
    funding_type: "private",
    care_plan_traffic: "green",
    scenario_summary: "Gold-standard complete records for demos.",
    primary_carer_key: "mohammed-ali",
    visits: [
      { day_offset: -1, window: "morning", scenario: "completed_good", visit_type: "welfare check" },
      { day_offset: 0, window: "morning", scenario: "completed_good", visit_type: "personal care" },
      { day_offset: 1, window: "morning", scenario: "scheduled_future", visit_type: "welfare check" },
      { day_offset: 7, window: "morning", scenario: "scheduled_future", visit_type: "personal care" },
    ],
  },
];

export const CALL_WINDOWS = {
  morning: { startH: 7, startM: 0, defaultLen: 30 },
  lunch: { startH: 11, startM: 30, defaultLen: 45 },
  tea: { startH: 15, startM: 30, defaultLen: 30 },
  bedtime: { startH: 19, startM: 0, defaultLen: 45 },
} as const;

export type CqcSeedItem = {
  slug: string;
  category: CqcCategory;
  title: string;
  description: string;
  client_slug?: string;
  status: CqcEvidenceStatus;
  risk: CqcRiskLevel;
  due_date_offset: number;
  owner: string;
};

export const DEMO_CQC_ITEMS: CqcSeedItem[] = [
  {
    slug: "safe-missed-visit",
    category: "safe",
    title: "Missed visit investigation — Arthur Bennett",
    description: "Fictional: welfare check missed yesterday; manager follow-up required.",
    client_slug: "arthur-bennett",
    status: "open",
    risk: "high",
    due_date_offset: -3,
    owner: "Sarah Coordinator",
  },
  {
    slug: "safe-medication-refusal",
    category: "safe",
    title: "Medication prompt refusal follow-up",
    description: "Fictional: Frank Thompson declined morning medication — GP contact logged.",
    client_slug: "frank-thompson",
    status: "in_review",
    risk: "medium",
    due_date_offset: 0,
    owner: "Sarah Coordinator",
  },
  {
    slug: "safe-double-up",
    category: "safe",
    title: "Double-up moving & handling risk",
    description: "Fictional: Ahmed Khan transfer visit — second carer not on assignment.",
    client_slug: "ahmed-khan",
    status: "open",
    risk: "high",
    due_date_offset: 2,
    owner: "Brian Demo Admin",
  },
  {
    slug: "effective-diabetes",
    category: "effective",
    title: "Diabetes nutrition monitoring",
    description: "Fictional: Priya Shah meal intake charting and dietitian referral.",
    client_slug: "priya-shah",
    status: "in_review",
    risk: "medium",
    due_date_offset: 5,
    owner: "Sarah Coordinator",
  },
  {
    slug: "effective-reablement",
    category: "effective",
    title: "Post-hospital reablement plan reviewed",
    description: "Fictional: George Williams goals updated after OT visit.",
    client_slug: "george-williams",
    status: "complete",
    risk: "low",
    due_date_offset: -7,
    owner: "Sarah Coordinator",
  },
  {
    slug: "effective-review-overdue",
    category: "effective",
    title: "Care plan review overdue — Arthur Bennett",
    description: "Fictional: dementia care plan annual review past due.",
    client_slug: "arthur-bennett",
    status: "open",
    risk: "high",
    due_date_offset: -14,
    owner: "Sarah Coordinator",
  },
  {
    slug: "caring-preferences",
    category: "caring",
    title: "Service user preference recorded",
    description: "Fictional: Margaret Ellis prefers morning wash before breakfast.",
    client_slug: "margaret-ellis",
    status: "complete",
    risk: "low",
    due_date_offset: -2,
    owner: "Amara Williams",
  },
  {
    slug: "caring-communication",
    category: "caring",
    title: "Communication needs documented",
    description: "Fictional: Arthur Bennett — speak slowly, one question at a time.",
    client_slug: "arthur-bennett",
    status: "complete",
    risk: "low",
    due_date_offset: -1,
    owner: "James Patel",
  },
  {
    slug: "responsive-refusal",
    category: "responsive",
    title: "Refusal of care follow-up",
    description: "Fictional: Frank Thompson declined personal care — welfare call arranged.",
    client_slug: "frank-thompson",
    status: "open",
    risk: "medium",
    due_date_offset: 3,
    owner: "Mohammed Ali",
  },
  {
    slug: "responsive-discharge",
    category: "responsive",
    title: "Visit frequency after hospital discharge",
    description: "Fictional: George Williams increased calls for 4 weeks post discharge.",
    client_slug: "george-williams",
    status: "in_review",
    risk: "low",
    due_date_offset: 6,
    owner: "David Morgan",
  },
  {
    slug: "wellled-notes-audit",
    category: "well_led",
    title: "Missing visit note audit",
    description: "Fictional: Linda Morris visit completed without documentation.",
    client_slug: "linda-morris",
    status: "open",
    risk: "medium",
    due_date_offset: 1,
    owner: "Sarah Coordinator",
  },
  {
    slug: "wellled-rota-capacity",
    category: "well_led",
    title: "Staff rota capacity review",
    description: "Fictional: weekend cover gaps in Swindon demo rota.",
    status: "in_review",
    risk: "medium",
    due_date_offset: 4,
    owner: "Brian Demo Admin",
  },
  {
    slug: "wellled-confidentiality",
    category: "well_led",
    title: "Confidentiality access review",
    description: "Fictional: quarterly check that restricted care plan sections are enforced.",
    status: "open",
    risk: "low",
    due_date_offset: 10,
    owner: "Brian Demo Admin",
  },
];

export const CARE_PLAN_SECTION_BODIES: Record<string, string> = {
  personal_details: "Preferred name and routines recorded (demo).",
  important_contacts: "Emergency contacts on file — fictional numbers only.",
  medical_conditions: "See risk summary; GP details fictional.",
  medication_support: "Prompt and observe; chart refusals.",
  mobility: "Equipment and transfer plan documented.",
  personal_care: "Dignity-led personal care preferences.",
  nutrition_hydration: "Meal/fluid intake monitoring where required.",
  communication_needs: "Plain language; allow extra time.",
  risks_hazards: "Falls, skin integrity, infection control.",
  preferences_routines: "Morning/evening routines respected.",
  emergency_instructions: "Call 999 for emergency; office out-of-hours fictional.",
  confidential_notes: "RESTRICTED (demo): safeguarding-style note — fictional content only.",
};

export function reviewDatesForTraffic(
  traffic: CarePlanTraffic,
  todayIso: string
): {
  review_due_date: string;
  last_reviewed_at: string | null;
  confidentiality_level: ConfidentialityLevel;
  incomplete_section_keys: string[];
} {
  const today = new Date(`${todayIso}T12:00:00Z`);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  switch (traffic) {
    case "green":
      return {
        review_due_date: addDays(90),
        last_reviewed_at: new Date(today.getTime() - 14 * 86400000).toISOString(),
        confidentiality_level: "standard",
        incomplete_section_keys: [],
      };
    case "amber":
      return {
        review_due_date: addDays(7),
        last_reviewed_at: new Date(today.getTime() - 120 * 86400000).toISOString(),
        confidentiality_level: "standard",
        incomplete_section_keys: ["nutrition_hydration"],
      };
    case "red":
      return {
        review_due_date: addDays(-21),
        last_reviewed_at: new Date(today.getTime() - 400 * 86400000).toISOString(),
        confidentiality_level: "restricted",
        incomplete_section_keys: ["risks_hazards"],
      };
  }
}

export const VISIT_NOTE_BY_SCENARIO: Partial<Record<VisitScenarioKind, string>> = {
  completed_good:
    "[Demo note] Visit completed as planned. Client comfortable. No concerns.",
  medication_concern:
    "[Demo note] Medication prompt refused — client stated felt unwell. Coordinator informed (fictional).",
  nutrition_concern:
    "[Demo note] Poor appetite noted; fluids below target. Nutrition chart updated (fictional).",
};
