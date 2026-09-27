export type RepairStatus = '未完成' | '已完成'

export interface RepairDeviation {
  batchId: string
  batchNo: string
  foundAt: string
  text: string
}

export interface RepairOrder {
  id: string
  draftId: string
  blockId: string
  status: RepairStatus
  openedAt: string
  carverId: string
  repairMethod: string
  workHours: number
  finishedAt: string
  deviations: RepairDeviation[]
}
