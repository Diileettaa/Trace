import type { FragmentsModel } from '@thatopen/fragments'
import type { StoreyInfo, TradesState } from './types'

/** Applies the intersection of the selected storey and enabled trade layers. */
export async function applyBuildingVisibility(
  model: FragmentsModel,
  storeys: StoreyInfo[],
  selectedStoreyId: string | null,
  trades: TradesState,
  allLocalIds: number[],
) {
  try {
    const activeStorey = selectedStoreyId ? storeys.find((storey) => storey.id === selectedStoreyId) ?? null : null
    const storeyIds = activeStorey ? new Set(activeStorey.itemIds) : null
    const hiddenTradeIds = new Set<number>()
    for (const trade of Object.values(trades)) {
      if (!trade.enabled) for (const id of trade.itemIds) hiddenTradeIds.add(id)
    }

    const toShow: number[] = []
    const toHide: number[] = []
    for (const id of allLocalIds) {
      if ((!storeyIds || storeyIds.has(id)) && !hiddenTradeIds.has(id)) toShow.push(id)
      else toHide.push(id)
    }
    if (toHide.length) await model.setVisible(toHide, false)
    if (toShow.length) await model.setVisible(toShow, true)
    model.clearGhost()
  } catch (error) {
    console.warn('Could not apply building visibility:', error)
  }
}
