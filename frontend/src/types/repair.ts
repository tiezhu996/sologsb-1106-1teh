export type RepairStatus = '未完成' | '已完成'

export interface RepairDeviation {
  batchId: string
  batchNo: string
  printedAt: string
  note: string
}

export interface RepairOrder {
  id: string
  draftId: string
  blockId: string
  status: RepairStatus
  deviations: RepairDeviation[]
  repairBy: string
  repairMethod: string
  laborHours: number
  createdAt: string
  completedAt: string
}
