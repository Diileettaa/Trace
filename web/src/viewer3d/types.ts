import type * as THREE from 'three'

export interface StoreyInfo {
  id: string
  localId: number
  name: string
  elevation: number
  displayElevation?: number
  itemIds: number[]
  box: THREE.Box3
}

export type TradeKey = 'architecture' | 'structure' | 'plumbing' | 'electrical' | 'furniture'

export interface TradeConfig {
  key: TradeKey
  label: string
  categories: string[]
  itemIds: number[]
  count: number
  enabled: boolean
}

export interface TradesState {
  architecture: TradeConfig
  structure: TradeConfig
  plumbing: TradeConfig
  electrical: TradeConfig
  furniture: TradeConfig
}
