'use server'

import { revalidatePath } from 'next/cache'
import { requireEngagementAccess } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase-server'
import { parseCSV, parseCSVObjects } from '@/lib/csv'
import { askClaude, MODELS } from '@/lib/anthropic'

export type Result = { ok: true; count?: number } | { ok: false; error: string }
export type DraftResult = { ok: true; text: string } | { ok: false; error: string }

export async function importCsv(kind: 'members' | 'weights' | 'templates', text: string): Promise<Result> {
  await requireEngagementAccess('admin')
  if (!text?.trim()) return { ok: false, error: 'Empty file' }
  const sb = createServerSupabase()

  try {
    if (kind === 'members') {
      const objs = parseCSVObjects(text)
      const rows = objs
        .filter(o => (o['Member Number'] || '').trim())
        .map(o => ({
          member_number: o['Member Number'].trim(),
          member_name: (o['Member Name'] || '').trim(),
          attendance_tag: o['Attendance-Based Tags'] || null,
          membership_tag: o['Membership-Based Tags'] || null,
          goal_tag: o['Goal-Based Tags'] || null,
          bookings_tag: o['Bookings-Based Tags'] || null,
          offset_tag: o['Offset-Based Tags'] || null,
          updated_at: new Date().toISOString(),
        }))
      if (!rows.length) return { ok: false, error: 'No member rows found' }
      await sb.from('em_members').delete().neq('member_number', '___none___')
      const { error } = await sb.from('em_members').insert(rows)
      if (error) return { ok: false, error: error.message }
      revalidatePath('/')
      return { ok: true, count: rows.length }
    }

    if (kind === 'weights') {
      const raw = parseCSV(text)
      const rows: { tag: string; category: string; risk_points: number }[] = []
      let category = ''
      for (const r of raw) {
        const a = (r[0] || '').trim(), b = (r[1] || '').trim()
        if (b.toLowerCase() === 'risk points') { category = a; continue } // section header
        if (!a || b === '') continue
        const pts = parseInt(b, 10)
        if (Number.isNaN(pts)) continue
        rows.push({ tag: a, category, risk_points: pts })
      }
      if (!rows.length) return { ok: false, error: 'No tag weights found' }
      await sb.from('em_tag_weights').delete().neq('tag', '___none___')
      const { error } = await sb.from('em_tag_weights').insert(rows)
      if (error) return { ok: false, error: error.message }
      revalidatePath('/')
      return { ok: true, count: rows.length }
    }

    // templates
    const objs = parseCSVObjects(text)
    const rows = objs
      .filter(o => (o['Category'] && o['Condition'] && o['Version'] && o['SMS Message']))
      .map(o => ({ category: o['Category'].trim(), condition: o['Condition'].trim(), version: o['Version'].trim(), message: o['SMS Message'].trim() }))
    if (!rows.length) return { ok: false, error: 'No SMS templates found' }
    await sb.from('em_sms_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error } = await sb.from('em_sms_templates').insert(rows)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/')
    return { ok: true, count: rows.length }
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'Import failed' }
  }
}

export async function decide(input: {
  memberNumber: string; condition: string | null; version: string | null
  message: string; decision: 'approved' | 'skipped'; reason?: string
}): Promise<Result> {
  const user = await requireEngagementAccess()
  const sb = createServerSupabase()
  const { error } = await sb.from('em_messages').insert({
    member_number: input.memberNumber,
    condition: input.condition,
    version: input.version,
    message: input.message,
    decision: input.decision,
    reason: input.reason || null,
    decided_by: user.email,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/')
  return { ok: true }
}

export async function draft(input: {
  firstName: string; baseMessage: string; tags: string[]; condition: string | null
}): Promise<DraftResult> {
  await requireEngagementAccess()
  try {
    const text = await askClaude({
      model: MODELS.chat,
      maxTokens: 300,
      system: 'You write warm, concise retention SMS messages for a premium gym (Fahrenheit One). One message, under ~300 characters, friendly and human, no emojis unless natural, no hashtags. Address the member by first name. Return ONLY the message text.',
      messages: [{
        role: 'user',
        content: `Member first name: ${input.firstName}\nEngagement situation: ${input.condition ?? 'general check-in'}\nCurrent tags: ${input.tags.join(', ') || 'none'}\nBase template to adapt: "${input.baseMessage}"\n\nRewrite this as a personalised SMS for ${input.firstName}.`,
      }],
    })
    return { ok: true, text: text.replace(/^["']|["']$/g, '').trim() }
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'Draft failed' }
  }
}
