import type { Role } from './types'

export interface DemoItem {
  id: string
  label: string
  badge: string
  path: string
  question: string
  role?: Role
  space?: { id: string; name: string } | null
}

/**
 * 5 Golden Path Demo Scenarios for judges and presentations.
 * Paths and questions can be adjusted as needed by Diletta.
 */
export const DEMO_ITEMS: DemoItem[] = [
  {
    id: 'png-count',
    label: '1. 2D Counting · Toilet bowls on floor plan',
    badge: 'PNG Count',
    path: 'data/cubicasa5k/high_quality-108.png',
    question: 'How many toilet bowls (WC seats) are drawn on this floor plan?',
    role: '',
  },
  {
    id: 'inventory',
    label: '2. All Elements · Full scan & numbering',
    badge: 'Full Inventory',
    path: 'data/cubicasa5k/high_quality-108.png',
    question: 'Scan and number all architectural elements in this drawing.',
    role: 'architect',
  },
  {
    id: 'ifc-count',
    label: '3. 3D IFC Count · Sanitary fixtures in BIM',
    badge: 'IFC Count',
    path: 'data/ifc_models/bsc-clinic_clinic-plumbing.ifc',
    question: "How many sanitary fixtures are there in the model 'Medical-Dental Clinic - plumbing'?",
    role: 'plumber',
  },
  {
    id: 'ifc-area',
    label: '4. 3D IFC Area · Floor area & space breakdown',
    badge: 'IFC Area',
    path: 'data/ifc_bench/ac20_arc.ifc',
    question: 'What are the building footprint area, total floor area, and total number of rooms/spaces?',
    role: 'architect',
  },
  {
    id: 'room-collab',
    label: '5. Room Board · Trade notice & room inspection',
    badge: 'Room Board',
    path: 'data/cubicasa5k/high_quality-108.png',
    question: 'Conduit inspection needed for this room before closing gypsum wall.',
    role: 'electrician',
    space: { id: 'room-1', name: 'Master Bedroom' },
  },
]
