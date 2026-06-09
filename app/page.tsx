import { redirect } from 'next/navigation'
import { getLiveSessionUser } from '@/lib/auth'
import { accessFor, TOOL } from '@/lib/access'
import { buildQueue, recentDecisions, type QueueItem, type DecisionRow } from '@/lib/engagement'
import EngagementMonitor from './engagement-client'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const live = await getLiveSessionUser()
  if (!live) redirect('https://clubf1.tech/login?next=https://engagement.clubf1.tech/')
  const access = accessFor(live, TOOL)
  if (!access) redirect('https://clubf1.tech/')

  let items: QueueItem[] = []
  let decisions: DecisionRow[] = []
  let hasMembers = false
  let hasConfig = false
  let tablesMissing = false
  try {
    const q = await buildQueue()
    items = q.items; hasMembers = q.hasMembers; hasConfig = q.hasConfig
    decisions = await recentDecisions(20)
  } catch {
    tablesMissing = true // schema not created yet
  }

  return (
    <EngagementMonitor
      items={items}
      decisions={decisions}
      hasMembers={hasMembers}
      hasConfig={hasConfig}
      tablesMissing={tablesMissing}
      isAdmin={access === 'admin'}
      userEmail={live.email}
    />
  )
}
