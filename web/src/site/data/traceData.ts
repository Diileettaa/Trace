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

export interface ProductPlan {
  id: string;
  category: 'individual' | 'business';
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number; // ~30% off
  ctaLabel: string;
  highlighted?: boolean;
  features: string[];
}

export interface ComparisonCategory {
  category: string;
  rows: {
    feature: string;
    draft: string | boolean;
    sketch: string | boolean;
    pro: string | boolean;
  }[];
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

export const FACT_SLIDES: FactSlide[] = [
  {
    id: 'speed-18s',
    indexLabel: '01 · Speed & Precision',
    kicker: 'Targeted AI LoD Indexing',
    headline: '1.8s average per drawing query.',
    subheadline:
      'Trace. scans dense 1:50 execution plans, dynamically adjusts scale from 1:200 down to 1:20 detail, and highlights exact fixtures in amber or red.',
    imageUrl: '/gigi/site_photo_hvac_duct_1794662437069.jpg',
    imageAlt: 'Galvanized HVAC ductwork and ceiling MEP coordination on a construction site',
    facts: [
      { value: '1.8s', label: 'Average grounded response across multi-sheet sets' },
      { value: '92% Less', label: 'Inference compute via targeted region crop' },
      { value: '1:200 → 1:20', label: 'Automatic Level-of-Detail plan scaling' },
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
      'Stop flipping between floorplans, MEP schedules, permits, and defect emails. Verify installations in 3D with wall clearances and dated site photos in seconds.',
    imageUrl: '/gigi/hero_architectural_site_1794662440229.jpg',
    imageAlt: 'Nordic timber and concrete commercial atrium under construction',
    facts: [
      { value: '4.2 hrs', label: 'Saved per execution plan & site engineer daily' },
      { value: '2D → 3D', label: 'Instant building & interior room cutaways' },
      { value: 'Zero Guesswork', label: 'Hover >1s for timestamped as-built photos' },
    ],
    ctaLabel: 'Open Demo Version',
    ctaTarget: 'demo',
  },
  {
    id: 'annual-30',
    indexLabel: '03 · Yearly Subscription',
    kicker: 'Flexible Stoa Licensing',
    headline: 'Save up to 30% with a Yearly Subscription.',
    subheadline:
      'Choose modular plans from Trace Draft, Sketch, and Pro—or equip full project organizations with Trace Studio, Site, and Masterplan.',
    imageUrl: '/gigi/wc_installed_standard_1794668063424.jpg',
    imageAlt: 'Completed commercial tiled interior restroom verified with Trace.',
    facts: [
      { value: 'Up to 30%', label: 'Discount on yearly individual & business subscriptions' },
      { value: '6 Editions', label: 'Tailored for solo architects up to general contractors' },
      { value: 'Native App', label: 'Downloadable for macOS, Windows, iPad & Mobile' },
    ],
    ctaLabel: 'Explore All Plans',
    ctaTarget: 'plans',
  },
  {
    id: 'education-free',
    indexLabel: '04 · University & Education',
    kicker: 'Trace Campus Edition',
    headline: 'University & Student Access — Completely FREE.',
    subheadline:
      'Students receive full Trace Pro & 3D verification access at €0 when their university holds an academic license—plus live BIM seminars, site-coordination workshops, and certification.',
    imageUrl: '/gigi/campus_architecture_studio_1794662440156.jpg',
    imageAlt: 'Architecture and engineering students reviewing technical blueprints around a studio table',
    facts: [
      { value: '€0 / Free', label: 'For students at licensed partner universities' },
      { value: 'Live Seminars', label: 'Weekly workshops on 1:50 MEP & interior coordination' },
      { value: 'Full Suite', label: 'Includes 3D spatial checks & photo verification labs' },
    ],
    ctaLabel: 'Open Education Portal',
    ctaTarget: 'education',
  },
];

export const PRODUCT_PLANS: ProductPlan[] = [
  // Individual / Core Suite
  {
    id: 'draft',
    category: 'individual',
    name: 'Trace Draft',
    tagline: 'Essential 2D drawing search & AI scale LoD',
    description:
      'Search across vector PDF, DWG, and DXF floorplans with 1.8s amber highlights, dynamic 1:200–1:20 detail scaling, and layer toggles.',
    monthlyPrice: 29,
    annualPrice: 20, // ~31% off
    ctaLabel: 'Select Trace Draft',
    features: [
      'Natural-language search across PDF, DWG & DXF',
      'AI Scale LoD switching (1:200 to 1:20)',
      'Trade layer toggles & highlighted Maßketten',
      'Chat History & multi-floor switcher',
    ],
  },
  {
    id: 'sketch',
    category: 'individual',
    name: 'Trace Sketch',
    tagline: '2D-to-3D spatial inspection & site photo memory',
    description:
      'Everything in Draft plus whole-building 3D isometry, realistic room interior 3D with wall clearances, and dated as-built site photo pinning.',
    monthlyPrice: 49,
    annualPrice: 34, // ~30% off
    ctaLabel: 'Select Trace Sketch',
    features: [
      'Everything in Trace Draft',
      'Whole-building 3D isometry & 3D room cutaways',
      'Exact wall-to-fixture clearance dimensions',
      'Hover >1s site photo log & unverified red alerts',
    ],
  },
  {
    id: 'pro',
    category: 'individual',
    name: 'Trace Pro',
    tagline: 'Complete individual powerhouse: Plans, 3D, Docs & Flows',
    description:
      'Unify drawings, 3D spatial checks, site photos, permits, invoices, defect claims, and parallel trade workflows in one native desktop & mobile app.',
    monthlyPrice: 79,
    annualPrice: 55, // ~30% off
    highlighted: true,
    ctaLabel: 'Subscribe to Trace Pro',
    features: [
      'Everything in Trace Sketch',
      'Building permits, invoices & defect claim linking',
      'Proactive AI follow-up specs & manufacturer lookup',
      'Native macOS, Windows, iPad & Mobile sync',
    ],
  },
  // Business Suite
  {
    id: 'studio',
    category: 'business',
    name: 'Trace Studio',
    tagline: 'For interior architects & engineering design studios',
    description:
      'Shared project libraries, multi-author revision tracking, and collaborative 3D clash & clearance verification across studio teams.',
    monthlyPrice: 139,
    annualPrice: 97, // ~30% off
    ctaLabel: 'Choose Trace Studio',
    features: [
      '5 team seats included + shared chat history',
      'Multi-discipline drawing revision comparison',
      'Manufacturer & tender specification audit trail',
      'Priority inference speed across large sets',
    ],
  },
  {
    id: 'site',
    category: 'business',
    name: 'Trace Site',
    tagline: 'For site managers, MEP leads & field inspection teams',
    description:
      'Built for active construction sites with offline iPad/mobile caching, unlimited photo verifications, red-flag defect routing, and trade schedules.',
    monthlyPrice: 199,
    annualPrice: 139, // ~30% off
    highlighted: true,
    ctaLabel: 'Choose Trace Site',
    features: [
      '10 field & office seats + unlimited site photos',
      'Red unverified alerts & DIN/EN clearance checks',
      'Parallel trade handover & dependency tracking',
      'Offline field companion for iOS & iPadOS',
    ],
  },
  {
    id: 'masterplan',
    category: 'business',
    name: 'Trace Masterplan',
    tagline: 'Enterprise deployment for general contractors & Stoa partners',
    description:
      'Organization-wide rollout across dozens of active sites with custom ERP/financial connectors, SSO, dedicated onboarding, and SLA.',
    monthlyPrice: 390,
    annualPrice: 273, // 30% off
    ctaLabel: 'Choose Trace Masterplan',
    features: [
      'Unlimited projects & custom seat pools',
      'Invoice, payment transfer & claim ERP sync',
      'On-premise / private EU cloud indexing option',
      'Dedicated Stoa solutions architect & training',
    ],
  },
];

export const COMPARISON_TABLE: ComparisonCategory[] = [
  {
    category: 'Drawing Intelligence & AI Scale LoD',
    rows: [
      {
        feature: 'Multi-room execution plan search (1.8s avg.)',
        draft: true,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Dynamic AI LoD scaling (1:200, 1:100, 1:50, 1:20)',
        draft: true,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Trade layer guide (Hide/Show HVAC, Electrical, Sanitary)',
        draft: true,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Persistent multi-chat History & Floor Switcher',
        draft: true,
        sketch: true,
        pro: true,
      },
    ],
  },
  {
    category: '3D Spatial & On-Site Photo Grounding',
    rows: [
      {
        feature: 'Whole-building 3D isometry over floorplan',
        draft: false,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Realistic 3D interior room cutaways & wall clearances',
        draft: false,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Hover >1s dated site photos & red unverified flags',
        draft: false,
        sketch: true,
        pro: true,
      },
      {
        feature: 'Unlimited site photo uploads & status updates',
        draft: false,
        sketch: '250 / project',
        pro: 'Unlimited',
      },
    ],
  },
  {
    category: 'Documents, Financials & Trade Flows',
    rows: [
      {
        feature: 'Permits, invoices, transfers & defect claim search',
        draft: false,
        sketch: false,
        pro: true,
      },
      {
        feature: 'Proactive AI follow-up specs & manufacturer lookup',
        draft: false,
        sketch: false,
        pro: true,
      },
      {
        feature: 'Native Desktop & Mobile App (macOS, Win, iPad, iOS)',
        draft: true,
        sketch: true,
        pro: true,
      },
    ],
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
    topic: 'Getting Started',
    question: 'Is Trace. a web tool or a downloadable native application?',
    answer:
      'Trace. is a downloadable native application for macOS, Windows, iPadOS, and iOS—built so site teams can inspect heavy CAD/BIM sets with local caching even in concrete basements with weak reception.',
  },
  {
    id: 'qa-2',
    topic: 'AI & Scale LoD',
    question: 'How does Trace. keep inference costs 92% lower than general AI models?',
    answer:
      'Instead of sending entire 1:50 execution sheets to a large model on every question, Trace. indexes vector geometry, grid axes, and text once, then runs targeted verification strictly on the matched room or detail crop.',
  },
  {
    id: 'qa-3',
    topic: 'Field Verification',
    question: 'How does the red unverified status and on-site photo memory work?',
    answer:
      'Any fixture without an attached field photo is automatically flagged in red on both the 2D plan and 3D model. Once an engineer uploads a photo via “Verify on Site”, Trace. stamps the date, author, and coordinate permanently.',
  },
  {
    id: 'qa-4',
    topic: 'Education',
    question: 'How do students get Trace. completely FREE?',
    answer:
      'When your university signs a Trace Campus institutional agreement, every student with a verified university email unlocks Trace Pro for free—including access to weekly BIM & MEP seminars and certification.',
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
    title: 'Reading & Verifying Complex 1:50 MEP & Interior Plans',
    duration: '90 min · Interactive Seminar',
    summary:
      'Learn how to cross-check architectural floorplans against ventilation, sanitary rough-ins, and acoustic doors without missing clashes.',
  },
  {
    number: '02.',
    title: '3D Spatial Dimensioning & Pre-Closure Photo Documentation',
    duration: '120 min · Field Workshop',
    summary:
      'Practice pinning dated as-built photos onto exact CAD coordinates before drywall closes—eliminating costly defect disputes.',
  },
  {
    number: '03.',
    title: 'Trade Sequencing, Permits & Sustainable Material Audits',
    duration: '90 min · Certification Track',
    summary:
      'Coordinate parallel trades, trace variation invoices back to approved drawings, and earn the official Stoa Trace. Verified Certificate.',
  },
];
