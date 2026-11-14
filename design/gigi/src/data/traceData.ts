export interface FieldPhotoLog {
  id: string;
  imageUrl: string;
  caption: string;
  author: string;
  role: string;
  capturedAt: string;
  coordinateRef: string;
}

export interface VerificationScenario {
  id: string;
  shortLabel: string;
  query: string;
  answer: string;
  responseTime: string;
  drawingSheet: string;
  gridRef: string;
  trade: string;
  elementCode: string;
  dimensions: {
    label: string;
    value: string;
  }[];
  highlightBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  photoLogs: FieldPhotoLog[];
}

export interface PlanTier {
  id: 'drawings' | 'docs' | 'complete';
  name: string;
  audience: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  ctaLabel: string;
  highlighted?: boolean;
  includesHeading: string;
  highlights: string[];
}

export interface ComparisonCategory {
  category: string;
  rows: {
    feature: string;
    drawings: string | boolean;
    docs: string | boolean;
    complete: string | boolean;
  }[];
}

export const VERIFICATION_SCENARIOS: VerificationScenario[] = [
  {
    id: 'hvac-damper',
    shortLabel: 'HVAC Damper & Clearance',
    query: 'What is the soffit clearance and fire damper spec at Grid B4–C4?',
    answer:
      'Supply duct SD-204 (600 × 350 mm) runs at +2,840 mm AFF with a Belimo EI 90 motorized fire damper located 1,120 mm east of Grid B4. Minimum ceiling clearance beneath hanger bracket is 2,490 mm.',
    responseTime: '1.3s',
    drawingSheet: 'M-204 · Level 02 HVAC & Ceiling Coordination',
    gridRef: 'Grid B4–C4',
    trade: 'MEP / HVAC',
    elementCode: 'FD-204-E',
    dimensions: [
      { label: 'Soffit Clearance', value: '2,840 mm' },
      { label: 'Duct Section', value: '600 × 350 mm' },
      { label: 'Offset from B4', value: '1,120 mm' },
      { label: 'Fire Rating', value: 'EI 90 (EN 1366)' },
    ],
    highlightBox: { x: 205, y: 112, width: 110, height: 66 },
    photoLogs: [
      {
        id: 'log-1',
        imageUrl: '/src/assets/images/site_photo_hvac_duct_1794662437069.jpg',
        caption: 'Damper actuator & threaded rod hangers installed prior to acoustic ceiling grid.',
        author: 'Mikko Lindqvist',
        role: 'Site MEP Lead',
        capturedAt: 'Oct 28, 2026 · 14:22',
        coordinateRef: 'B4-C4 / +2,840 mm',
      },
    ],
  },
  {
    id: 'fire-collar',
    shortLabel: 'Shaft Wall Firestop',
    query: 'Verify firestop collar rating and conduit sleeve height on Shaft Wall S-02.',
    answer:
      'Shaft penetration P-18 requires an EI 120 intumescent collar (Ø 110 mm galvanized steel sleeve) centered at +1,450 mm AFF through the double-layer 125 mm gypsum acoustic partition.',
    responseTime: '1.6s',
    drawingSheet: 'A-412 · Core Shafts & Fire Compartmentation',
    gridRef: 'Grid C2 / Wall S-02',
    trade: 'Fire Protection & Drywall',
    elementCode: 'FS-110-S02',
    dimensions: [
      { label: 'Center Elevation', value: '1,450 mm AFF' },
      { label: 'Collar Diameter', value: 'Ø 110 mm' },
      { label: 'Wall Thickness', value: '125 mm Shaft' },
      { label: 'Compartment Class', value: 'EI 120' },
    ],
    highlightBox: { x: 288, y: 184, width: 96, height: 64 },
    photoLogs: [
      {
        id: 'log-2',
        imageUrl: '/src/assets/images/site_photo_fire_damper_1794662438641.jpg',
        caption: 'Intumescent collar & sealant cured on Shaft S-02 before drywall closure.',
        author: 'Katri Korhonen',
        role: 'Fire Safety Inspector',
        capturedAt: 'Nov 03, 2026 · 09:45',
        coordinateRef: 'C2 / +1,450 mm',
      },
    ],
  },
];

export const PLAN_TIERS: PlanTier[] = [
  {
    id: 'drawings',
    name: 'Trace Drawings',
    audience: 'For architects, interior designers & site engineers',
    description:
      'Search across floorplans, sections, and BIM models. Verify answers in 1–2 seconds with clickable 3D spatial context and dated site photos.',
    monthlyPrice: 49,
    annualPrice: 39,
    ctaLabel: 'Start Drawings Plan',
    includesHeading: 'Spatial drawing intelligence',
    highlights: [
      'Instant natural-language search across PDF, DWG, DXF & IFC',
      '1–2s amber target highlight directly on source drawings',
      'Click-to-3D model inspection with exact clearances & offsets',
      'On-site photo pinning with automatic date & author stamp',
    ],
  },
  {
    id: 'docs',
    name: 'Trace Docs & Flow',
    audience: 'For project managers, quantity surveyors & trade leads',
    description:
      'Keep permits, invoices, defect claims, payment approvals, and parallel trade schedules synchronized in one verifiable timeline.',
    monthlyPrice: 59,
    annualPrice: 49,
    ctaLabel: 'Start Docs & Flow',
    includesHeading: 'Documents & trade sequencing',
    highlights: [
      'Cross-search building permits, RFIs, invoices & bank transfers',
      'Defect claim & variation order tracking linked to cost codes',
      'Parallel trade schedules & handover dependency timelines',
      'Multilingual document translation (EN, FI, DE, SV)',
    ],
  },
  {
    id: 'complete',
    name: 'Trace Complete',
    audience: 'For general contractors & full project teams',
    description:
      'Every drawing, 3D model, site photo, permit, invoice, and trade workflow connected in a single verified source of truth.',
    monthlyPrice: 99,
    annualPrice: 79,
    ctaLabel: 'Subscribe to Complete',
    highlighted: true,
    includesHeading: 'Everything in Drawings + Docs & Flow',
    highlights: [
      'Unified search across plans, 3D models, permits & financials',
      'Link site defects & claim invoices directly to 3D coordinates',
      'Unlimited as-built photo memory pins across all project phases',
      'Shared team workspace, audit export & priority inference speed',
    ],
  },
];

export const COMPARISON_TABLE: ComparisonCategory[] = [
  {
    category: 'Drawings, 3D Spatial & Field Memory',
    rows: [
      {
        feature: 'Drawing formats (Vector PDF, DWG, DXF, IFC)',
        drawings: true,
        docs: false,
        complete: true,
      },
      {
        feature: '1–2s source region highlight on drawing',
        drawings: true,
        docs: false,
        complete: true,
      },
      {
        feature: 'Click highlight to open 3D model with dimensions',
        drawings: true,
        docs: false,
        complete: true,
      },
      {
        feature: 'On-site photo pinning (auto timestamp & author)',
        drawings: 'Up to 500 / project',
        docs: false,
        complete: 'Unlimited',
      },
    ],
  },
  {
    category: 'Project Documents & Financials',
    rows: [
      {
        feature: 'Building permits, regulations & inspection logs',
        drawings: false,
        docs: true,
        complete: true,
      },
      {
        feature: 'Invoices, payment transfers & cost code matching',
        drawings: false,
        docs: true,
        complete: true,
      },
      {
        feature: 'Defect claims & subcontractor warranty records',
        drawings: false,
        docs: true,
        complete: true,
      },
      {
        feature: 'Claim-to-drawing & photo evidence linking',
        drawings: false,
        docs: false,
        complete: true,
      },
    ],
  },
  {
    category: 'Trade Workflows & Efficiency',
    rows: [
      {
        feature: 'Parallel trade schedules & dependency sequencing',
        drawings: false,
        docs: true,
        complete: true,
      },
      {
        feature: 'Multilingual query & source verification (EN/FI/DE/SV)',
        drawings: true,
        docs: true,
        complete: true,
      },
      {
        feature: 'Targeted region indexing (low inference footprint)',
        drawings: true,
        docs: true,
        complete: true,
      },
      {
        feature: 'Team audit export & role permissions',
        drawings: 'Up to 3 seats',
        docs: 'Up to 5 seats',
        complete: 'Unlimited seats',
      },
    ],
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
    title: 'Reading & Verifying Complex MEP & Interior Drawings',
    duration: '90 min · Interactive Lab',
    summary:
      'Learn how to cross-check architectural floorplans against ventilation, acoustic shaft, and lighting schedules without missing hidden clashes.',
  },
  {
    number: '02.',
    title: '3D Spatial Dimensioning & Pre-Closure Documentation',
    duration: '120 min · Site Simulation',
    summary:
      'Practice pinning dated as-built site photos onto exact CAD/BIM coordinates before drywall and soffits close—eliminating costly rework disputes.',
  },
  {
    number: '03.',
    title: 'Trade Sequencing, Permits & Sustainable Material Audits',
    duration: '90 min · Certification Track',
    summary:
      'Coordinate parallel trades, trace variation invoices back to approved drawings, and earn the official Trace. Verified Studio Certificate.',
  },
];
