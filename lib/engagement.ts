import { createServerSupabase } from './supabase-server'

export type MatchedTag = { tag: string; points: number; category: string }
export type Suggested = { category: string; condition: string; version: string; message: string } | null

export type QueueItem = {
  memberNumber: string
  name: string
  firstName: string
  tags: { attendance: string; membership: string; goal: string; bookings: string; offset: string }
  score: number
  level: 'High' | 'Medium' | 'Low'
  matchedTags: MatchedTag[]
  suggested: Suggested
  lastApprovedAt: string | null
}

export type DecisionRow = {
  id: string; member_number: string; condition: string | null; version: string | null
  message: string | null; decision: string; reason: string | null; decided_by: string | null; decided_at: string
}

// member column → category label used for risk + SMS lookup
const COLS: [keyof QueueItem['tags'], string][] = [
  ['attendance', 'Attendance'], ['membership', 'Membership'],
  ['goal', 'Goal'], ['bookings', 'Bookings'], ['offset', 'Offset'],
]

function riskLevel(score: number): 'High' | 'Medium' | 'Low' {
  return score >= 70 ? 'High' : score >= 30 ? 'Medium' : 'Low'
}

// Port of get_next_sms_message: highest-impact tag → lowest unsent version.
function suggest(matched: MatchedTag[], templates: Record<string, Record<string, Record<string, string>>>, sent: Set<string>): Suggested {
  if (!matched.length) return null
  const top = matched.reduce((a, b) => (Math.abs(b.points) > Math.abs(a.points) ? b : a))
  const category = `${top.category}-Based Tags`
  const condition = top.tag
  const byVersion = templates[category]?.[condition]
  if (byVersion) {
    const versions = Object.keys(byVersion).sort()
    const unsent = versions.find(v => !sent.has(`${condition}|${v}`))
    const version = unsent ?? versions[0] // all sent → rotate back to first
    if (version) return { category, condition, version, message: byVersion[version] }
  }
  // fallback: same condition under any category
  for (const cat of Object.keys(templates)) {
    const bv = templates[cat]?.[condition]
    if (bv) { const v = Object.keys(bv).sort()[0]; return { category: cat, condition, version: v, message: bv[v] } }
  }
  return null
}

export async function buildQueue(): Promise<{ items: QueueItem[]; hasMembers: boolean; hasConfig: boolean }> {
  const sb = createServerSupabase()
  const [membersRes, weightsRes, templatesRes, msgsRes] = await Promise.all([
    sb.from('em_members').select('*'),
    sb.from('em_tag_weights').select('tag, risk_points'),
    sb.from('em_sms_templates').select('category, condition, version, message'),
    sb.from('em_messages').select('member_number, condition, version, decision, decided_at').eq('decision', 'approved'),
  ])

  // If the core tables are missing, surface it so the page shows "Setup required".
  if (membersRes.error || weightsRes.error || templatesRes.error) {
    throw new Error(membersRes.error?.message || weightsRes.error?.message || templatesRes.error?.message || 'query failed')
  }

  const weights: Record<string, number> = {}
  for (const w of weightsRes.data ?? []) weights[(w as any).tag] = Number((w as any).risk_points) || 0

  const templates: Record<string, Record<string, Record<string, string>>> = {}
  for (const t of templatesRes.data ?? []) {
    const { category, condition, version, message } = t as any
    ;(templates[category] ??= {})[condition] ??= {}
    templates[category][condition][version] = message
  }

  // sent versions + last approved time per member
  const sentByMember: Record<string, Set<string>> = {}
  const lastApproved: Record<string, string> = {}
  for (const m of msgsRes.data ?? []) {
    const r = m as any
    ;(sentByMember[r.member_number] ??= new Set()).add(`${r.condition}|${r.version}`)
    if (!lastApproved[r.member_number] || r.decided_at > lastApproved[r.member_number]) lastApproved[r.member_number] = r.decided_at
  }

  const items: QueueItem[] = (membersRes.data ?? []).map((row: any) => {
    const tags = {
      attendance: row.attendance_tag ?? '', membership: row.membership_tag ?? '',
      goal: row.goal_tag ?? '', bookings: row.bookings_tag ?? '', offset: row.offset_tag ?? '',
    }
    let score = 0
    const matchedTags: MatchedTag[] = []
    for (const [col, cat] of COLS) {
      const tag = (tags[col] ?? '').trim()
      if (tag && tag in weights) {
        score += weights[tag]
        matchedTags.push({ tag, points: weights[tag], category: cat })
      }
    }
    score = Math.max(0, Math.round(score))
    return {
      memberNumber: String(row.member_number),
      name: row.member_name,
      firstName: String(row.member_name || '').trim().split(/\s+/)[0] || 'there',
      tags, score, level: riskLevel(score), matchedTags,
      suggested: suggest(matchedTags, templates, sentByMember[String(row.member_number)] ?? new Set()),
      lastApprovedAt: lastApproved[String(row.member_number)] ?? null,
    }
  })

  items.sort((a, b) => b.score - a.score)
  return {
    items,
    hasMembers: (membersRes.data ?? []).length > 0,
    hasConfig: (weightsRes.data ?? []).length > 0 && (templatesRes.data ?? []).length > 0,
  }
}

export async function recentDecisions(limit = 20): Promise<DecisionRow[]> {
  const sb = createServerSupabase()
  const { data } = await sb.from('em_messages').select('*').order('decided_at', { ascending: false }).limit(limit)
  return (data ?? []) as DecisionRow[]
}

export async function memberHistory(memberNumber: string): Promise<DecisionRow[]> {
  const sb = createServerSupabase()
  const { data } = await sb.from('em_messages').select('*').eq('member_number', memberNumber).order('decided_at', { ascending: false })
  return (data ?? []) as DecisionRow[]
}

export type DayActivity = { date: string; reviews: number; approved: number; skipped: number }
export type Totals = { reviews: number; approved: number; skipped: number }
export type Analytics = { daily: DayActivity[]; last7: Totals; prev7: Totals }

// Real manager analytics from the decision log (last 30 days).
export async function getAnalytics(): Promise<Analytics> {
  const sb = createServerSupabase()
  const since = new Date(Date.now() - 30 * 86400000).toISOString()
  const { data } = await sb.from('em_messages').select('decision, decided_at').gte('decided_at', since)

  // last 30 calendar days, zero-filled
  const days: Record<string, DayActivity> = {}
  const order: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    days[d] = { date: d, reviews: 0, approved: 0, skipped: 0 }
    order.push(d)
  }
  for (const m of data ?? []) {
    const day = String((m as any).decided_at).slice(0, 10)
    const bucket = days[day]
    if (!bucket) continue
    bucket.reviews++
    if ((m as any).decision === 'approved') bucket.approved++
    else bucket.skipped++
  }
  const daily = order.map(d => days[d])
  const sum = (slice: DayActivity[]): Totals => slice.reduce(
    (t, d) => ({ reviews: t.reviews + d.reviews, approved: t.approved + d.approved, skipped: t.skipped + d.skipped }),
    { reviews: 0, approved: 0, skipped: 0 },
  )
  return { daily, last7: sum(daily.slice(-7)), prev7: sum(daily.slice(-14, -7)) }
}
