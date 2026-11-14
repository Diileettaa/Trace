import type { FragmentsModel } from '@thatopen/fragments'
import type { TradesState, TradeKey } from './types'

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
    electrical: emptyTrade('electrical'),
    furniture: emptyTrade('furniture'),
  }
}

export async function classifyModelTrades(model: FragmentsModel): Promise<TradesState> {
  const state = createInitialTrades()
  const keys = Object.keys(TRADE_DEFINITIONS) as TradeKey[]
  const results = await Promise.all(keys.map((key) => model.getItemsOfCategories([TRADE_DEFINITIONS[key].regex]).catch(() => ({}))))
  keys.forEach((key, index) => {
    const ids = [...new Set(Object.values(results[index]).flat())]
    state[key].itemIds = ids
    state[key].count = ids.length
  })
  return state
}
