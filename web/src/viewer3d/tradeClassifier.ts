import * as THREE from 'three'
import type { FragmentsModel } from '@thatopen/fragments'
import type { TradesState, TradeKey } from './types'

export type IfcClassItems = Record<string, number[]>

export const TRADE_COLORS: Record<TradeKey, string> = {
  plumbing: '#0756B9',
  hvac: '#C04B32',
  electrical: '#C18A00',
  structure: '#50585C',
  architecture: '#B8C0C3',
  furniture: '#754321',
}

export const ARCHITECTURE_OPACITY = 1

export const TRADE_DEFINITIONS: Record<TradeKey, { label: string; regex: RegExp; categories: string[] }> = {
  architecture: {
    label: 'Architecture',
    regex: /IFCWALL|IFCSLAB|IFCDOOR|IFCWINDOW|IFCSPACE|IFCROOF|IFCCOVERING|IFCSTAIR|IFCRAILING|IFCCURTAINWALL/i,
    categories: ['IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcDoor', 'IfcWindow', 'IfcSpace', 'IfcRoof', 'IfcCovering', 'IfcStair', 'IfcRailing', 'IfcCurtainWall'],
  },
  structure: {
    label: 'Structure',
    regex: /IFCCOLUMN|IFCBEAM|IFCMEMBER|IFCPLATE|IFCFOOTING|IFCPILE|IFCREINFORCINGBAR|IFCREINFORCINGMESH|IFCBUILDINGELEMENTPART/i,
    categories: ['IfcColumn', 'IfcBeam', 'IfcMember', 'IfcPlate', 'IfcFooting', 'IfcPile', 'IfcReinforcingBar', 'IfcReinforcingMesh', 'IfcBuildingElementPart'],
  },
  plumbing: {
    label: 'Plumbing',
    regex: /IFCPIPE[A-Z]*|IFCFLOWTERMINAL|IFCSANITARYTERMINAL|IFCVALVE|IFCPUMP/i,
    categories: ['IfcPipeSegment', 'IfcPipeFitting', 'IfcFlowTerminal', 'IfcSanitaryTerminal', 'IfcValve', 'IfcPump'],
  },
  hvac: {
    label: 'HVAC',
    regex: /IFCDUCT[A-Z]*|IFCAIRTERMINAL|IFCFAN|IFCAIRTOAIRHEATRECOVERY/i,
    categories: ['IfcDuctSegment', 'IfcDuctFitting', 'IfcDuctSilencer', 'IfcAirTerminal', 'IfcFan', 'IfcAirToAirHeatRecovery'],
  },
  electrical: {
    label: 'Electrical',
    regex: /IFCCABLE[A-Z]*|IFCLIGHTFIXTURE|IFCOUTLET|IFCSWITCHINGDEVICE|IFCELECTRICDISTRIBUTIONBOARD/i,
    categories: ['IfcCableSegment', 'IfcCableCarrierSegment', 'IfcLightFixture', 'IfcOutlet', 'IfcSwitchingDevice', 'IfcElectricDistributionBoard'],
  },
  furniture: {
    label: 'Furniture',
    regex: /IFCFURNISHINGELEMENT|IFCFURNITURE/i,
    categories: ['IfcFurnishingElement', 'IfcFurniture'],
  },
}

function emptyTrade(key: TradeKey): TradesState[TradeKey] {
  const definition = TRADE_DEFINITIONS[key]
  return { key, label: definition.label, categories: definition.categories, itemIds: [], count: 0, enabled: true }
}

export function createInitialTrades(): TradesState {
  return {
    architecture: emptyTrade('architecture'),
    structure: emptyTrade('structure'),
    plumbing: emptyTrade('plumbing'),
    hvac: emptyTrade('hvac'),
    electrical: emptyTrade('electrical'),
    furniture: emptyTrade('furniture'),
  }
}

export async function loadIfcClassItems(model: FragmentsModel): Promise<IfcClassItems> {
  const byClass = await model.getItemsOfCategories([/.+/]).catch(() => ({}))
  const hasItems = Object.values(byClass).some((ids) => ids.length > 0)
  if (hasItems) return byClass

  // Some fragment versions do not expand a catch-all category regex. Retry the known IFC classes explicitly.
  const classNames = [...new Set(Object.values(TRADE_DEFINITIONS).flatMap((trade) => trade.categories))]
  const exact = await Promise.all(classNames.map((name) =>
    model.getItemsOfCategories([new RegExp(`^${name}$`, 'i')]).catch(() => ({})),
  ))
  return exact.reduce<IfcClassItems>((merged, result) => Object.assign(merged, result), {})
}

export function classifyModelTrades(_model: FragmentsModel, byClass: IfcClassItems): TradesState {
  const state = createInitialTrades()
  const keys = Object.keys(TRADE_DEFINITIONS) as TradeKey[]
  const classes = Object.entries(byClass).map(([name, ids]) => [name, [...new Set(ids)]] as const)
  console.groupCollapsed(`[IFC explorer] ${classes.length} IFC classes after model load`)
  for (const [name, ids] of classes) console.info(`${name}: ${ids.length}`)
  console.groupEnd()

  keys.forEach((key) => {
    const ids = [...new Set(classes.filter(([name]) => TRADE_DEFINITIONS[key].regex.test(name)).flatMap(([, localIds]) => localIds))]
    console.info(`[IFC explorer] ${TRADE_DEFINITIONS[key].label}: ${ids.length} elements`)
    state[key].itemIds = ids
    state[key].count = ids.length
  })
  return state
}

export function allModelLocalIds(byClass: IfcClassItems): number[] {
  return [...new Set(Object.values(byClass).flat())]
}

export async function applyTradeColors(model: FragmentsModel, trades: TradesState): Promise<void> {
  await Promise.all(Object.values(trades).map(async (trade) => {
    if (!trade.itemIds.length) return
    await model.setColor(trade.itemIds, new THREE.Color(TRADE_COLORS[trade.key as TradeKey]))
    if (trade.key === 'architecture') await model.setOpacity(trade.itemIds, ARCHITECTURE_OPACITY)
    else await model.setOpacity(trade.itemIds, 1)
  }))
}
