import DraftList from '../pages/DraftList.svelte'
import BlockBoard from '../pages/BlockBoard.svelte'
import NodeTimeline from '../pages/NodeTimeline.svelte'
import BatchList from '../pages/BatchList.svelte'
import RepairList from '../pages/RepairList.svelte'
import CarverList from '../pages/CarverList.svelte'

export const routes = {
  '/drafts': DraftList,
  '/drafts/:id/blocks': BlockBoard,
  '/blocks/:id/nodes': NodeTimeline,
  '/batches': BatchList,
  '/repairs': RepairList,
  '/carvers': CarverList,
  '*': DraftList,
}

export default routes
