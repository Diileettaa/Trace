export interface FactSlide {
  id: string;
  indexLabel: string;
  kicker: string;
  headline: string;
  subheadline: string;
  imageUrl: string;
  imageAlt: string;
  facts: {
    value: string;
    label: string;
  }[];
  ctaLabel: string;
  ctaTarget: 'demo' | 'plans' | 'education';
}

export type PlanCategory = 'individual' | 'business' | 'university';
export type PlanSegment = 'individual' | 'business' | 'enterprise' | 'university';
export type BillingCycle = 'weekly' | 'monthly' | 'yearly';

export interface ProductPlan {
  id: string;
  segment: PlanSegment;
  category: PlanCategory;
  name: string;
  target: string;
  badge?: string;
  tagline: string;
  description: string;
  priceUnit?: string;
  weeklyPrice: number | null;
  monthlyPrice: number | null;
  yearlyPerMonthPrice: number | null;
  yearlyTotalPrice: number | null;
  universityStudentPricing?: {
    perStudentId: number;
    requiresRegisteredUniversity: boolean;
    fallbackNote: string;
  };
  enterprisePricing?: {
    platformFeePerMonth: number;
    perSeatPerMonth: number;
    minimumSeats: number;
    maximumSeats: number;
    contract: string;
    payment: string;
    premiumSlaPercent: number;
  };
  extraSeatPerMonth?: number;
  seats: string;
  tokensPerMonth: string;
  sheetsPerMonth: string;
  cloudStorage: string;
  includesPlanName?: string;
  ctaLabel: string;
  highlighted?: boolean;
  features: string[];
}

export interface IncludedCoreItem {
  name: string;
  description: string;
}

export interface TokenPackOption {
  id: string;
  label: string;
  tokens: number;
  price: number;
  badge?: string;
}

export interface CloudStorageTier {
  id: string;
  label: string;
  addedStorage: string;
  monthlyPrice: number;
  badge?: string;
}

export interface AddOnItem {
  id: string;
  name: string;
  description?: string;
  price: string;
  availableOn: string;
  tokenPacks?: TokenPackOption[];
  tiers?: CloudStorageTier[];
}

export interface EducationEventItem {
  id: string;
  title: string;
  format: 'Online' | 'On-Site';
  location: string;
  date: string;
  duration: string;
  category: 'Seminar' | 'Workshop' | 'Training' | 'Event';
  description: string;
}

export type MatrixValue = 'yes' | 'no' | 'add-on';
export type MatrixPlanId = 'sketch' | 'pro' | 'studio' | 'site' | 'masterplan' | 'academy';

export interface FeatureMatrixRow {
  feature: string;
  values: Record<MatrixPlanId, MatrixValue>;
}

export interface UserCaseItem {
  id: string;
  project: string;
  company: string;
  location: string;
  scope: string;
  metric: string;
  summary: string;
}

export interface SupportQAItem {
  id: string;
  question: string;
  answer: string;
  topic: string;
}

export const PRODUCT_META = {
  name: 'Trace',
  tagline:
    'Answers natural-language questions about construction drawings – and shows where each answer comes from.',
  currency: 'EUR',
  pricesExcludeVat: true,
  billingOptions: ['weekly', 'monthly', 'yearly'] as BillingCycle[],
  billingNote:
    'Yearly saves up to 30%. Weekly and monthly can be cancelled any week or month.',
};

export const TOKEN_PACK_OPTIONS: TokenPackOption[] = [
  {
    id: 'tokens-250',
    label: '250 Tokens',
    tokens: 250,
    price: 10,
  },
  {
    id: 'tokens-500',
    label: '500 Tokens',
    tokens: 500,
    price: 16,
    badge: 'Save 20%',
  },
  {
    id: 'tokens-1500',
    label: '1,500 Tokens',
    tokens: 1500,
    price: 38,
    badge: 'Best value',
  },
];

export const CLOUD_STORAGE_TIERS: CloudStorageTier[] = [
  {
    id: 'cloud-50',
    label: '+50 GB Cloud+',
    addedStorage: '+50 GB expansion',
    monthlyPrice: 5,
    badge: 'Starter',
  },
  {
    id: 'cloud-250',
    label: '+250 GB Cloud+',
    addedStorage: '+250 GB expansion',
    monthlyPrice: 19,
    badge: 'Save 24%',
  },
  {
    id: 'cloud-1000',
    label: '+1 TB Cloud+',
    addedStorage: '+1,000 GB expansion',
    monthlyPrice: 59,
    badge: 'Save 41%',
  },
];

export const INCLUDED_IN_EVERY_PLAN: IncludedCoreItem[] = [
  {
    name: 'Geometry Core',
    description: 'Reads the drawing; most answers need no language model.',
  },
  {
    name: 'Double Check',
    description: 'A second model verifies AI answers.',
  },
  {
    name: 'Proof Lens',
    description: 'Shows exactly where in the drawing the answer comes from.',
  },
  {
    name: 'Trace Cloud',
    description: 'EU hosting, encryption, daily backups (3 GB in Sketch; 10 GB per seat on paid & Academy plans).',
  },
];

export const FACT_SLIDES: FactSlide[] = [
  {
    id: 'speed-18s',
    indexLabel: '01 · Speed & Proof Lens',
    kicker: 'Geometry Core + Double Check',
    headline: '1.8s average per drawing query.',
    subheadline:
      'Trace answers natural-language questions about construction drawings – and shows where each answer comes from using Proof Lens and Double Check verification.',
    imageUrl: '/src/assets/images/drawing_proof_lens_1794687950946.jpg',
    imageAlt: 'Detailed architectural floorplan blueprints with warm amber highlight marker and brass scale ruler',
    facts: [
      { value: '1.8s', label: 'Average grounded response via Geometry Core' },
      { value: 'Double Check', label: 'A second model verifies every AI answer' },
      { value: 'Proof Lens', label: 'Marks the exact source region in the drawing' },
    ],
    ctaLabel: 'Watch Demo Loop',
    ctaTarget: 'demo',
  },
  {
    id: 'time-42h',
    indexLabel: '02 · Productivity',
    kicker: 'Get the work done. Faster.',
    headline: 'Save an average of 4.2 hours per plan.',
    subheadline:
      'Stop flipping between PDFs, scans, DXF, and IFC files. Verify installations in 3D with wall clearances, Proof Reports, and dated site photos in seconds.',
    imageUrl: '/src/assets/images/hero_architectural_site_1794662440229.jpg',
    imageAlt: 'Nordic timber and concrete commercial atrium under construction with engineers on site',
    facts: [
      { value: '4.2 hrs', label: 'Saved per execution plan & site engineer daily' },
      { value: 'PDF · DXF · IFC', label: 'Plus scans & images with EU Trace Cloud' },
      { value: 'Zero Guesswork', label: 'Hover >1s for timestamped as-built photos' },
    ],
    ctaLabel: 'Open Demo Version',
    ctaTarget: 'demo',
  },
  {
    id: 'billing-flexible',
    indexLabel: '03 · Individual & Business',
    kicker: 'Weekly · Monthly · Yearly Save up to 30%',
    headline: 'Yearly Save up to 30%. Cancel weekly or monthly anytime.',
    subheadline:
      'Start free with Trace Sketch, upgrade to Trace Pro (€39/mo · €468/yr), or equip teams and construction sites with Trace Studio, Trace Site, and Trace Masterplan.',
    imageUrl: '/src/assets/images/studio_plans_team_1794687951470.jpg',
    imageAlt: 'Architects and construction project lead reviewing CAD floorplans on laptop and tablet in a studio',
    facts: [
      { value: 'Save up to 30%', label: 'On yearly Individual & Business plans' },
      { value: '10 GB / Seat', label: 'Included on paid plans · Expandable via Cloud+' },
      { value: '€0 Free', label: 'Trace Sketch starter (3 GB) with Proof Lens' },
    ],
    ctaLabel: 'Explore All Plans',
    ctaTarget: 'plans',
  },
  {
    id: 'education-campus',
    indexLabel: '04 · University & Academy',
    kicker: 'Trace Academy · Student Access',
    headline: '€0 per Student ID at registered universities.',
    subheadline:
      'Students at registered partner universities unlock Trace Academy for €0 per student ID instead of €49/mo. If your university is not registered yet, use an Individual plan (Sketch or Pro).',
    imageUrl: '/src/assets/images/campus_architecture_studio_1794662440156.jpg',
    imageAlt: 'Architecture and engineering students reviewing technical blueprints around a university studio table',
    facts: [
      { value: '€0 / Student ID', label: 'Instead of €49/mo at registered universities' },
      { value: '100 Tokens / mo', label: '10 sheets/mo & 10 GB Trace Cloud for 1 student' },
      { value: 'Individual Fallback', label: 'Unregistered universities use Trace Sketch or Pro' },
    ],
    ctaLabel: 'Verify Trace Academy',
    ctaTarget: 'education',
  },
];

export const PRODUCT_PLANS: ProductPlan[] = [
  // 1. Individual
  {
    id: 'sketch',
    segment: 'individual',
    category: 'individual',
    name: 'Trace Sketch',
    target: 'Anyone trying Trace',
    badge: 'Free',
    tagline: 'Anyone trying Trace',
    description:
      'Includes Geometry Core, Double Check, Proof Lens, and 3 GB EU-hosted Trace Cloud with PDF and image upload.',
    weeklyPrice: null,
    monthlyPrice: 0,
    yearlyPerMonthPrice: 0,
    yearlyTotalPrice: 0,
    seats: '1',
    tokensPerMonth: '20',
    sheetsPerMonth: '1',
    cloudStorage: '3 GB',
    ctaLabel: 'Start Free with Sketch',
    features: ['Proof Lens', 'PDF and image upload'],
  },
  {
    id: 'pro',
    segment: 'individual',
    category: 'individual',
    name: 'Trace Pro',
    target: 'Architects and planners',
    badge: 'Most popular',
    tagline: 'Architects and planners',
    description:
      'Full format support (PDF, scans, DXF, IFC), client-ready Proof Reports, optional Token Packs & Cloud+ upgrades, and a 14-day free trial.',
    weeklyPrice: 14,
    monthlyPrice: 49,
    yearlyPerMonthPrice: 39,
    yearlyTotalPrice: 468,
    seats: '1',
    tokensPerMonth: '500',
    sheetsPerMonth: '8',
    cloudStorage: '10 GB (expandable)',
    includesPlanName: 'Trace Sketch',
    highlighted: true,
    ctaLabel: 'Start 14-Day Free Trial',
    features: [
      'All file formats (PDF, scans, DXF, IFC)',
      'Proof Report for clients',
      'Token Packs & Cloud+ storage upgrades',
      '14-day free trial',
    ],
  },

  // 2. Business
  {
    id: 'studio',
    segment: 'business',
    category: 'business',
    name: 'Trace Studio',
    target: 'Architecture and engineering offices',
    badge: 'Best value',
    tagline: 'Architecture and engineering offices',
    description:
      'Collaborative Team Spaces with roles and comments, a shared office Token pool, and 10 GB per seat (expandable via Cloud+).',
    priceUnit: 'per seat',
    weeklyPrice: 42,
    monthlyPrice: 149,
    yearlyPerMonthPrice: 119,
    yearlyTotalPrice: 1428,
    seats: '2–20',
    tokensPerMonth: '2,000 per seat',
    sheetsPerMonth: '20 per seat',
    cloudStorage: '10 GB per seat (expandable)',
    includesPlanName: 'Trace Pro',
    highlighted: true,
    ctaLabel: 'Start 14-Day Free Trial',
    features: [
      'Team Spaces (shared projects, roles, comments)',
      'Shared Token pool across the office',
      '14-day free trial',
    ],
  },
  {
    id: 'site',
    segment: 'business',
    category: 'business',
    name: 'Trace Site',
    target: 'Contractors, one licence per construction project',
    tagline: 'Contractors, one licence per construction project',
    description:
      'Built for construction projects with 5 seats included (€79/mo per extra seat), 10 GB per seat, Paper Trail audit log, and site team onboarding.',
    priceUnit: 'per project',
    weeklyPrice: null,
    monthlyPrice: 590,
    yearlyPerMonthPrice: 490,
    yearlyTotalPrice: 5880,
    extraSeatPerMonth: 79,
    seats: '5 included',
    tokensPerMonth: '2,000 per seat',
    sheetsPerMonth: '100 per project',
    cloudStorage: '10 GB per seat (expandable)',
    includesPlanName: 'Trace Studio',
    ctaLabel: 'Choose Trace Site',
    features: [
      'Paper Trail (archive and audit log)',
      'Billing to the project budget',
      'Onboarding for the site team',
    ],
  },
  {
    id: 'masterplan',
    segment: 'enterprise',
    category: 'business',
    name: 'Trace Masterplan',
    target: 'Large construction companies (20–50 seats)',
    badge: 'Enterprise',
    tagline: 'Large construction companies',
    description:
      'Enterprise Shield (SSO, admin console, 99.5% SLA), EU data residency, and Trace Connect API & MCP on an annual invoice contract. Optional Premium SLA (99.9% uptime, +10%).',
    weeklyPrice: null,
    monthlyPrice: null,
    yearlyPerMonthPrice: null,
    yearlyTotalPrice: null,
    enterprisePricing: {
      platformFeePerMonth: 1500,
      perSeatPerMonth: 79,
      minimumSeats: 20,
      maximumSeats: 50,
      contract: 'yearly',
      payment: 'invoice',
      premiumSlaPercent: 10,
    },
    seats: '20–50 seats',
    tokensPerMonth: '3,000 per seat, shared company-wide',
    sheetsPerMonth: 'fair use',
    cloudStorage: '10 GB per seat (expandable)',
    includesPlanName: 'Trace Site',
    ctaLabel: 'Configure Masterplan',
    features: [
      'Enterprise Shield (SSO, admin console, 99.5% SLA)',
      'Configurable Add-on: Premium SLA (99.9% uptime, +10%)',
      'EU data residency',
      'Trace Connect API and MCP (e.g. for Stoa)',
      '50+ seats available via custom enterprise agreement',
    ],
  },

  // 3. University
  {
    id: 'academy',
    segment: 'university',
    category: 'university',
    name: 'Trace Academy',
    target: '1 student with valid student ID (registered universities only)',
    badge: '€0 / Student ID',
    tagline: '1 student · Registered universities only',
    description:
      '€0 per student ID — exclusively available if your university has registered for Trace Academy. Otherwise, students must use an Individual plan (Trace Sketch or Trace Pro).',
    priceUnit: 'per student ID',
    weeklyPrice: null,
    monthlyPrice: 0,
    yearlyPerMonthPrice: 0,
    yearlyTotalPrice: 0,
    universityStudentPricing: {
      perStudentId: 0,
      requiresRegisteredUniversity: true,
      fallbackNote:
        'Only possible if your university is registered; otherwise an Individual plan (Trace Sketch or Pro) is required.',
    },
    seats: '1 student (valid student ID)',
    tokensPerMonth: '100',
    sheetsPerMonth: '10',
    cloudStorage: '10 GB (expandable)',
    ctaLabel: 'Verify Trace Academy',
    highlighted: true,
    features: [
      '€0 per student ID when your university is registered',
      'Unregistered university → requires Individual plan (Sketch or Pro)',
      'All file formats (PDF, scans, DXF, IFC) & Proof Report',
      'Team Spaces for shared university course projects',
    ],
  },
];

export const ADD_ONS: AddOnItem[] = [
  {
    id: 'token-pack',
    name: 'Token Pack',
    description: 'Select a Token Pack to top up your drawing queries on any paid plan.',
    price: '€10 / €16 / €38 (excl. VAT)',
    availableOn: 'All paid plans',
    tokenPacks: TOKEN_PACK_OPTIONS,
  },
  {
    id: 'cloud-plus',
    name: 'Cloud+ Storage Expansion',
    description:
      'Paid plans include 10 GB per seat (3 GB in Sketch). Select a storage tier to expand EU-hosted encrypted Trace Cloud capacity.',
    price: 'From €5 / month (+50 GB to +1 TB)',
    availableOn: 'All paid plans',
    tiers: CLOUD_STORAGE_TIERS,
  },
];

export const FEATURE_MATRIX_GROUPS: {
  category: string;
  colSpan: number;
}[] = [
  { category: 'Individual', colSpan: 2 },
  { category: 'Business', colSpan: 3 },
  { category: 'University', colSpan: 1 },
];

export const FEATURE_MATRIX_COLUMNS: {
  id: MatrixPlanId;
  label: string;
  category: 'Individual' | 'Business' | 'University';
  highlighted?: boolean;
}[] = [
  { id: 'sketch', label: 'Sketch', category: 'Individual' },
  { id: 'pro', label: 'Pro', category: 'Individual', highlighted: true },
  { id: 'studio', label: 'Studio', category: 'Business' },
  { id: 'site', label: 'Site', category: 'Business' },
  { id: 'masterplan', label: 'Masterplan', category: 'Business' },
  { id: 'academy', label: 'Academy', category: 'University' },
];

export const FEATURE_MATRIX_ROWS: FeatureMatrixRow[] = [
  {
    feature: 'Geometry Core, Double Check, Proof Lens',
    values: {
      sketch: 'yes',
      pro: 'yes',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'yes',
    },
  },
  {
    feature: 'Trace Cloud (3 GB Sketch · 10 GB / seat paid & Academy)',
    values: {
      sketch: 'yes',
      pro: 'yes',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'yes',
    },
  },
  {
    feature: 'All file formats (PDF, scans, DXF, IFC)',
    values: {
      sketch: 'no',
      pro: 'yes',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'yes',
    },
  },
  {
    feature: 'Proof Report',
    values: {
      sketch: 'no',
      pro: 'yes',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'yes',
    },
  },
  {
    feature: 'Token Packs and Cloud+',
    values: {
      sketch: 'no',
      pro: 'yes',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'no',
    },
  },
  {
    feature: 'Team Spaces',
    values: {
      sketch: 'no',
      pro: 'no',
      studio: 'yes',
      site: 'yes',
      masterplan: 'yes',
      academy: 'yes',
    },
  },
  {
    feature: 'Paper Trail (audit log)',
    values: {
      sketch: 'no',
      pro: 'no',
      studio: 'no',
      site: 'yes',
      masterplan: 'yes',
      academy: 'no',
    },
  },
  {
    feature: 'Enterprise Shield (SSO, 99.5% SLA)',
    values: {
      sketch: 'no',
      pro: 'no',
      studio: 'no',
      site: 'no',
      masterplan: 'yes',
      academy: 'no',
    },
  },
  {
    feature: 'Trace Connect API and MCP',
    values: {
      sketch: 'no',
      pro: 'no',
      studio: 'no',
      site: 'no',
      masterplan: 'yes',
      academy: 'no',
    },
  },
  {
    feature: 'Premium SLA (99.9% uptime, +10%)',
    values: {
      sketch: 'no',
      pro: 'no',
      studio: 'no',
      site: 'no',
      masterplan: 'add-on',
      academy: 'no',
    },
  },
];

export const EDUCATION_EVENTS: EducationEventItem[] = [
  {
    id: 'evt-mep-online',
    title: 'Reading & Verifying Complex 1:50 MEP & Interior Plans',
    format: 'Online',
    location: 'Live Webinar · Zoom',
    date: '26 Nov 2026 · 17:00 CET',
    duration: '90 min',
    category: 'Seminar',
    description:
      'Cross-check architectural floorplans against ventilation, sanitary rough-ins, and acoustic doors using Geometry Core and Proof Lens.',
  },
  {
    id: 'evt-helsinki-onsite',
    title: '3D Spatial Dimensioning & Pre-Closure Site Photo Lab',
    format: 'On-Site',
    location: 'Helsinki · Stoa Studio Hub',
    date: '03 Dec 2026 · 14:00 EET',
    duration: '120 min',
    category: 'Workshop',
    description:
      'Hands-on field training: pin dated as-built photos onto CAD coordinates before drywall closes and verify DIN/EN clearances.',
  },
  {
    id: 'evt-munich-onsite',
    title: 'IFC, DXF & Proof Report Certification Training',
    format: 'On-Site',
    location: 'Munich · TUM Architecture Lab',
    date: '10 Dec 2026 · 15:30 CET',
    duration: '120 min',
    category: 'Training',
    description:
      'Prepare client-ready Proof Reports, coordinate parallel trade handovers, and audit variation claims directly from verified drawings.',
  },
  {
    id: 'evt-nordic-symposium',
    title: 'Trace. & Stoa Winter Construction Intelligence Forum',
    format: 'Online',
    location: 'Online Livestream · Q&A',
    date: '17 Dec 2026 · 16:00 CET',
    duration: '75 min',
    category: 'Event',
    description:
      'Case studies from Nordic general contractors and academic research teams presenting real field workflows with Trace.',
  },
];

export const USER_CASES: UserCaseItem[] = [
  {
    id: 'uc-kamppi',
    project: 'Kamppi Mixed-Use Complex',
    company: 'SRV & Nordic Interior Partners',
    location: 'Helsinki, Finland',
    scope: '18,400 m² · 6 Levels · MEP & Interior Fit-Out',
    metric: '4.2 hrs saved / plan',
    summary:
      'Site engineers cross-verified 420+ fire dampers and sanitary rough-ins prior to drywall closure, cutting inspection rework claims by 68%.',
  },
  {
    id: 'uc-tampere',
    project: 'Tampere MedTech Campus',
    company: 'Sweco Finland & A-Insinöörit',
    location: 'Tampere, Finland',
    scope: '24,000 m² · Cleanroom & Shaft Coordination',
    metric: '1.8s avg. query',
    summary:
      'Replaced manual binder lookups across multilingual Finnish/English execution sets with clickable 3D clearances and dated field photo memory.',
  },
  {
    id: 'uc-munich',
    project: 'Isar Quarter Timber Office',
    company: 'Studio Werk & Bauer MEP',
    location: 'Munich, Germany',
    scope: '11,200 m² · Hybrid Timber & Technical Trades',
    metric: '100% photo-verified',
    summary:
      'Interior architects and MEP leads tracked parallel trade handovers and DIN 18040 accessibility tolerances directly on iPad on site.',
  },
];

export const PARTNER_FIRMS = [
  'SRV Rakennus',
  'Sweco Nordic',
  'YIT Construction',
  'Skanska Finland',
  'Tengbom Interiors',
  'A-Insinöörit',
];

export const SUPPORT_QA: SupportQAItem[] = [
  {
    id: 'qa-1',
    topic: 'Cloud Storage & Cloud+',
    question: 'How much cloud storage is included and how can I expand it?',
    answer:
      'Trace Sketch includes 3 GB of EU-hosted Trace Cloud. Trace Pro and Trace Academy include 10 GB, and multi-seat Business plans (Studio, Site, Masterplan) include 10 GB per seat. You can expand capacity anytime via Cloud+: +50 GB for €5/mo, +250 GB for €19/mo, or +1 TB for €59/mo.',
  },
  {
    id: 'qa-2',
    topic: 'Geometry Core & Double Check',
    question: 'How do Geometry Core, Double Check, and Proof Lens work together?',
    answer:
      'Included in every plan: Geometry Core reads the drawing directly so most answers need no language model; Double Check uses a second model to verify AI answers; and Proof Lens marks exactly where in the drawing each answer comes from.',
  },
  {
    id: 'qa-3',
    topic: 'Billing & Yearly Savings',
    question: 'How do Weekly, Monthly, and Yearly billing cycles work?',
    answer:
      'Yearly saves up to 30% across Individual and Business plans and displays both the monthly rate and annual total. Weekly and monthly subscriptions can be cancelled any week or month (in Business, only Trace Studio offers weekly billing). All listed prices exclude VAT.',
  },
  {
    id: 'qa-4',
    topic: 'University & Trace Academy',
    question: 'How does Trace Academy (€0 per student ID) work?',
    answer:
      'Trace Academy gives 1 student with a valid student ID €0 access (100 Tokens/mo, 10 sheets/mo, 10 GB Trace Cloud) instead of €49/mo — exclusively when their university is registered with Trace Academy. If your university is not registered, students must use an Individual plan (Trace Sketch or Trace Pro).',
  },
];

export const PARTNER_UNIVERSITIES = [
  { name: 'Aalto University', domain: 'aalto.fi', city: 'Espoo', activeSeats: '1,420' },
  { name: 'Tampere University', domain: 'tuni.fi', city: 'Tampere', activeSeats: '890' },
  { name: 'ETH Zurich', domain: 'ethz.ch', city: 'Zurich', activeSeats: '1,150' },
  { name: 'TU Munich', domain: 'tum.de', city: 'Munich', activeSeats: '1,340' },
  { name: 'KTH Royal Institute', domain: 'kth.se', city: 'Stockholm', activeSeats: '960' },
];

export const CAMPUS_WORKSHOPS = [
  {
    number: '01.',
    title: '1 Student Account · €0 per Student ID',
    duration: '100 Tokens & 10 Sheets / month',
    summary:
      'Verified students at registered universities receive a personal Trace Academy seat with Geometry Core, Double Check, Proof Lens, and Proof Reports.',
  },
  {
    number: '02.',
    title: 'All Formats & 10 GB Trace Cloud',
    duration: 'PDF, scans, DXF, IFC · 10 GB',
    summary:
      'Inspect architectural and MEP drawings across vector and scanned formats with 10 GB EU-hosted storage (expandable via Cloud+ if needed).',
  },
  {
    number: '03.',
    title: 'Team Spaces & University Registration',
    duration: 'Registered Universities Only',
    summary:
      'Collaborate in shared studio Team Spaces. Note: €0 access requires university registration; otherwise students use Trace Sketch or Trace Pro.',
  },
];
