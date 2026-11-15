// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
export type LayerId =
  | 'architecture'
  | 'sanitary'
  | 'hvac'
  | 'electrical'
  | 'dimensions';

export type ScaleOption = '1:200' | '1:100' | '1:50' | '1:20';

export type VerificationStatus = 'Installed' | 'In Progress' | 'Issue Reported';

export interface FixtureVerification {
  id: string;
  code: string;
  label: string;
  roomCode: string;
  status: VerificationStatus;
  verified: boolean;
  author?: string;
  capturedAt?: string;
  note: string;
  photoDataUrl: string;
  photoLabel: string;
  manufacturer: string;
  modelSpec: string;
  dimensions3D: {
    leftWall: string;
    rightWall: string;
    frontClearance: string;
    rearRoughIn: string;
    seatHeight: string;
  };
  position: { x: number; y: number; w: number; h: number };
}

export interface QueryScenario {
  id: string;
  prompt: string;
  shortLabel: string;
  responseTime: string;
  roomCode: string;
  roomName: string;
  roomArea: string;
  roomDimensions: string;
  foundCount: number;
  overallStatus: VerificationStatus;
  recommendedScale: ScaleOption;
  requiredLayers: LayerId[];
  roomHighlight: { x: number; y: number; w: number; h: number };
  targetIds: string[];
  aiSummary: string;
  followUpQuestions: {
    id: string;
    question: string;
    answer: string;
  }[];
}

export const LAYER_GUIDE: {
  id: LayerId;
  label: string;
  code: string;
}[] = [
  { id: 'architecture', label: 'Architecture & Walls', code: 'AR-01' },
  { id: 'sanitary', label: 'Sanitary & Plumbing', code: 'SAN-02' },
  { id: 'hvac', label: 'Ventilation (HVAC)', code: 'TGA-LUF' },
  { id: 'electrical', label: 'Electrical & Lighting', code: 'ELT-04' },
  { id: 'dimensions', label: 'Dimension Chains', code: 'DIM-05' },
];

export const INITIAL_FIXTURES: Record<string, FixtureVerification> = {
  'wc-01': {
    id: 'wc-01',
    code: 'WC-208.1',
    label: 'Standard Wall-Hung WC (Stall 01)',
    roomCode: 'R 2.08',
    status: 'Installed',
    verified: true,
    author: 'M. Lindqvist',
    capturedAt: 'Nov 09, 2026 · 11:18',
    note: 'Villeroy & Boch Subway 3.0 bowl installed on tiled pre-wall with brushed stainless dual-flush plate.',
    photoDataUrl: '/gigi/wc_installed_standard_1794668063424.jpg',
    photoLabel: 'Installed Standard WC · Tiled Stall 01',
    manufacturer: 'Villeroy & Boch / Geberit',
    modelSpec: 'Subway 3.0 Rimless + Duofix Sigma 112 cm',
    dimensions3D: {
      leftWall: '420 mm to partition',
      rightWall: '450 mm to divider',
      frontClearance: '780 mm to stall door',
      rearRoughIn: '180 mm concealed pre-wall',
      seatHeight: '410 mm AFF',
    },
    position: { x: 676, y: 120, w: 30, h: 36 },
  },
  'wc-02': {
    id: 'wc-02',
    code: 'WC-208.2',
    label: 'Standard Wall-Hung WC (Stall 02 · Rough-In)',
    roomCode: 'R 2.08',
    status: 'In Progress',
    verified: false,
    note: 'Unverified: Only Geberit concealed cistern frame, threaded bolts & DN 100 waste pipe stub-out installed.',
    photoDataUrl: '/gigi/wc_rough_in_pipes_1794668065164.jpg',
    photoLabel: 'Rough-In Connections Only (Pre-Wall Open)',
    manufacturer: 'Geberit (Carrier Installed)',
    modelSpec: 'Duofix Sigma 112 cm · DN 100 / DN 20 Connections',
    dimensions3D: {
      leftWall: '450 mm to stall divider',
      rightWall: '450 mm to masonry shaft',
      frontClearance: '810 mm to corridor door',
      rearRoughIn: '180 mm carrier wall',
      seatHeight: '410 mm AFF (target)',
    },
    position: { x: 726, y: 120, w: 30, h: 36 },
  },
  'wc-03': {
    id: 'wc-03',
    code: 'WC-208.3',
    label: 'Accessible WC (DIN 18040)',
    roomCode: 'R 2.08',
    status: 'Issue Reported',
    verified: true,
    author: 'K. Korhonen',
    capturedAt: 'Nov 12, 2026 · 15:40',
    note: 'Flagged: Accessible toilet & grab rails installed, but left wheelchair transfer zone measures 865 mm (35 mm short of 900 mm DIN 18040).',
    photoDataUrl: '/gigi/wc_installed_accessible_1794668064308.jpg',
    photoLabel: 'Installed Accessible WC + Folding Grab Rails',
    manufacturer: 'Laufen / Hewi',
    modelSpec: 'Pro Liberty Extended 700 mm + Hewi 801 Grab Rails',
    dimensions3D: {
      leftWall: '865 mm transfer zone (35 mm short)',
      rightWall: '280 mm to shaft wall',
      frontClearance: '1,500 mm turning circle',
      rearRoughIn: '210 mm reinforced frame',
      seatHeight: '480 mm AFF (Accessible)',
    },
    position: { x: 782, y: 158, w: 38, h: 34 },
  },
  'bsk-204': {
    id: 'bsk-204',
    code: 'BSK-204',
    label: 'Fire Damper EI 90 · Main Supply',
    roomCode: 'C 2.01',
    status: 'Installed',
    verified: true,
    author: 'M. Lindqvist',
    capturedAt: 'Oct 28, 2026 · 14:22',
    note: 'Belimo actuator wired to fire alarm loop; hanger brackets anchored to concrete slab.',
    photoDataUrl: '/gigi/site_photo_hvac_duct_1794662437069.jpg',
    photoLabel: 'Installed HVAC Fire Damper & Hangers',
    manufacturer: 'Trox / Belimo',
    modelSpec: 'FK-EU 600×350 + BFL24-T Actuator',
    dimensions3D: {
      leftWall: '1,120 mm east of Grid C',
      rightWall: '420 mm from corridor partition',
      frontClearance: '2,490 mm clear beneath hanger',
      rearRoughIn: '2,840 mm soffit axis',
      seatHeight: '600 × 350 mm duct',
    },
    position: { x: 486, y: 318, w: 58, h: 36 },
  },
  'bsk-208': {
    id: 'bsk-208',
    code: 'BSK-208',
    label: 'Fire Damper EI 90 · East Branch',
    roomCode: 'C 2.01',
    status: 'In Progress',
    verified: false,
    note: 'Unverified: Duct sleeve grouted; actuator wiring scheduled next week.',
    photoDataUrl: '/gigi/site_photo_hvac_duct_1794662437069.jpg',
    photoLabel: 'Unverified East Branch Damper',
    manufacturer: 'Trox / Belimo',
    modelSpec: 'FK-EU 500×300 + BFL24-T Actuator',
    dimensions3D: {
      leftWall: '640 mm west of Shaft S-02',
      rightWall: '380 mm from south drywall',
      frontClearance: '2,520 mm clear headroom',
      rearRoughIn: '2,840 mm soffit axis',
      seatHeight: '500 × 300 mm duct',
    },
    position: { x: 760, y: 318, w: 54, h: 36 },
  },
  'door-t204': {
    id: 'door-t204',
    code: 'T-2.04',
    label: 'Acoustic Fire Door T30-RS',
    roomCode: 'R 2.04',
    status: 'Installed',
    verified: true,
    author: 'A. Virtanen',
    capturedAt: 'Nov 10, 2026 · 09:15',
    note: 'Frame grouted, intumescent smoke seals verified, closer torque adjusted.',
    photoDataUrl: '/gigi/site_photo_fire_damper_1794662438641.jpg',
    photoLabel: 'Fire Compartment Penetration & Frame',
    manufacturer: 'Schörghuber / Dormakaba',
    modelSpec: 'T30-RS 1010×2135 mm · 42 dB · TS 93 Closer',
    dimensions3D: {
      leftWall: '240 mm structural reveal',
      rightWall: '1,380 mm to corner return',
      frontClearance: '1,200 mm corridor swing',
      rearRoughIn: '150 mm partition depth',
      seatHeight: '2,135 mm clear leaf height',
    },
    position: { x: 356, y: 360, w: 48, h: 42 },
  },
};

export const QUERY_SCENARIOS: QueryScenario[] = [
  {
    id: 'wc-count',
    prompt: 'How many toilet bowls are on the 2nd floor?',
    shortLabel: '2nd Floor Toilets',
    responseTime: '1.2s',
    roomCode: 'R 2.08',
    roomName: 'WC Core North',
    roomArea: '28.4 m²',
    roomDimensions: 'L 6.40m × B 4.44m × H 2.85m',
    foundCount: 3,
    overallStatus: 'Issue Reported',
    recommendedScale: '1:50',
    requiredLayers: ['architecture', 'sanitary', 'dimensions'],
    roomHighlight: { x: 646, y: 92, w: 220, h: 170 },
    targetIds: ['wc-01', 'wc-02', 'wc-03'],
    aiSummary:
      'Found 3 wall-hung toilet bowls in R 2.08 (Level 02). WC-208.1 (standard) and WC-208.3 (accessible) are installed with distinct photo logs. WC-208.2 (marked red) is unverified—only plumbing rough-in connections are mounted.',
    followUpQuestions: [
      {
        id: 'wc-manufacturers',
        question: 'Which manufacturers were commissioned for this sanitary package?',
        answer:
          'Tender Lot LV-420: Villeroy & Boch Subway 3.0 bowls on Geberit Duofix Sigma frames for standard stalls (WC-208.1 & .2), and Laufen Pro Liberty (700 mm) with Hewi 801 folding grab rails for Accessible WC-208.3.',
      },
      {
        id: 'wc-issue',
        question: 'Why is an issue alert flagged on WC-208.3?',
        answer:
          'Issue Log #ISS-208-C (K. Korhonen, Nov 12): Left wheelchair transfer zone measured 865 mm instead of the required 900 mm minimum (DIN 18040-1). Frame offset correction of 35 mm is scheduled prior to handover.',
      },
    ],
  },
  {
    id: 'hvac-dampers',
    prompt: 'Where are the EI 90 fire dampers on Level 02?',
    shortLabel: 'Fire Dampers',
    responseTime: '1.4s',
    roomCode: 'C 2.01',
    roomName: 'Spine Corridor',
    roomArea: '64.0 m²',
    roomDimensions: 'L 26.6m × B 2.40m × H 2.84m',
    foundCount: 2,
    overallStatus: 'In Progress',
    recommendedScale: '1:100',
    requiredLayers: ['architecture', 'hvac', 'dimensions'],
    roomHighlight: { x: 185, y: 296, w: 720, h: 72 },
    targetIds: ['bsk-204', 'bsk-208'],
    aiSummary:
      'Located 2 motorized EI 90 fire dampers (BSK-204 & BSK-208) along Corridor C 2.01. BSK-204 is installed and photo-verified; BSK-208 (red) awaits actuator wiring and verification.',
    followUpQuestions: [
      {
        id: 'hvac-trade',
        question: 'Which trade dependency is blocking BSK-208?',
        answer:
          'Electrical Trade (Lot ELT-04) terminates the 24V Belimo fire-loop bus on Nov 18 before Acoustic Ceiling closure on Nov 21.',
      },
    ],
  },
  {
    id: 'fire-doors',
    prompt: 'Inspect acoustic fire door T-2.04 at Studio West.',
    shortLabel: 'Fire Door T-2.04',
    responseTime: '1.1s',
    roomCode: 'R 2.04',
    roomName: 'Studio West',
    roomArea: '86.5 m²',
    roomDimensions: 'L 11.2m × B 7.72m × H 3.10m',
    foundCount: 1,
    overallStatus: 'Installed',
    recommendedScale: '1:50',
    requiredLayers: ['architecture', 'electrical', 'dimensions'],
    roomHighlight: { x: 112, y: 368, w: 325, h: 248 },
    targetIds: ['door-t204'],
    aiSummary:
      'Door T-2.04 (1010 × 2135 mm, T30-RS fire & 42 dB acoustic) is installed and verified at Studio West R 2.04 with compliant 1,200 mm corridor clearance.',
    followUpQuestions: [
      {
        id: 'door-hardware',
        question: 'Show commissioned door hardware & access spec?',
        answer:
          'Hardware Set HW-04: Schörghuber T30-RS leaf with Dormakaba TS 93 cam-action closer and EN 1125 panic lock.',
      },
    ],
  },
];
