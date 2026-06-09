'use client'
import { useState, useMemo, useTransition, type CSSProperties, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { QueueItem, DecisionRow } from '@/lib/engagement'
import { UI } from '@/lib/theme'
import { importCsv, decide, draft } from './actions'

const ACCENT = '#C15A35'
const LEVEL_COLOR: Record<string, string> = { High: '#8B3A2E', Medium: '#9A6A0F', Low: '#3A5A40' }
const REASONS = ['', 'Contacted directly', 'Not appropriate right now', 'Already engaged', 'Incorrect data', 'Other']

function fmt(s: string | null) {
  if (!s) return '—'
  const d = new Date(s); return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
function daysSince(s: string | null): number | null {
  if (!s) return null
  const d = new Date(s).getTime(); if (isNaN(d)) return null
  return (Date.now() - d) / 86400000
}

export default function EngagementMonitor({ items, decisions, hasMembers, hasConfig, tablesMissing, isAdmin, userEmail }: {
  items: QueueItem[]; decisions: DecisionRow[]; hasMembers: boolean; hasConfig: boolean; tablesMissing: boolean; isAdmin: boolean; userEmail: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [level, setLevel] = useState('All')
  const [minScore, setMinScore] = useState(0)
  const [cooldown, setCooldown] = useState(0)
  const [sortBy, setSortBy] = useState('risk-desc')
  const [showImport, setShowImport] = useState(!hasMembers || !hasConfig)
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Record<string, string>>({})
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const card: CSSProperties = { background: UI.surface, border: `1px solid ${UI.border}`, borderRadius: UI.radius, boxShadow: UI.shadow }
  const input: CSSProperties = { background: UI.surface, border: `1px solid ${UI.borderStrong}`, borderRadius: UI.radiusSm, padding: '8px 11px', color: UI.text, fontSize: 13, outline: 'none' }
  const btn = (v: 'solid' | 'ghost' | 'skip' = 'ghost'): CSSProperties => ({
    padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: pending ? 'default' : 'pointer',
    border: `1px solid ${v === 'skip' ? UI.borderStrong : v === 'solid' ? ACCENT : UI.borderStrong}`,
    background: v === 'solid' ? ACCENT : UI.surface, color: v === 'solid' ? '#fff' : UI.text,
  })

  const initialMsg = (it: QueueItem) => (it.suggested?.message ?? '').replaceAll('[First Name]', it.firstName)
  const msgOf = (it: QueueItem) => edited[it.memberNumber] ?? initialMsg(it)

  const filtered = useMemo(() => {
    let r = items.filter(it => {
      if (level !== 'All' && it.level !== level) return false
      if (it.score < minScore) return false
      if (cooldown > 0) { const ds = daysSince(it.lastApprovedAt); if (ds !== null && ds < cooldown) return false }
      if (search.trim()) { const q = search.toLowerCase(); if (!it.name.toLowerCase().includes(q) && !it.memberNumber.includes(q)) return false }
      return true
    })
    r = [...r].sort((a, b) => {
      if (sortBy === 'risk-asc') return a.score - b.score
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      return b.score - a.score
    })
    return r
  }, [items, level, minScore, cooldown, search, sortBy])

  const counts = useMemo(() => ({
    total: items.length,
    High: items.filter(i => i.level === 'High').length,
    Medium: items.filter(i => i.level === 'Medium').length,
    Low: items.filter(i => i.level === 'Low').length,
  }), [items])

  const onFile = (kind: 'members' | 'weights' | 'templates') => async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setImportMsg(null); setErr(null)
    const text = await file.text()
    startTransition(async () => {
      const r = await importCsv(kind, text)
      if (!r.ok) { setErr(`${kind} import: ${r.error}`); return }
      setImportMsg(`Imported ${r.count} ${kind} row(s).`)
      router.refresh()
    })
  }

  const act = (it: QueueItem, decision: 'approved' | 'skipped') => {
    setErr(null); setBusy(it.memberNumber)
    startTransition(async () => {
      const r = await decide({
        memberNumber: it.memberNumber, condition: it.suggested?.condition ?? null, version: it.suggested?.version ?? null,
        message: msgOf(it), decision, reason: reasons[it.memberNumber],
      })
      setBusy(null)
      if (!r.ok) { setErr(r.error); return }
      setDone(d => ({ ...d, [it.memberNumber]: decision }))
      router.refresh()
    })
  }

  const aiDraft = (it: QueueItem) => {
    setErr(null); setBusy(it.memberNumber)
    startTransition(async () => {
      const r = await draft({ firstName: it.firstName, baseMessage: msgOf(it), tags: it.matchedTags.map(t => t.tag), condition: it.suggested?.condition ?? null })
      setBusy(null)
      if (!r.ok) { setErr(r.error); return }
      setEdited(m => ({ ...m, [it.memberNumber]: r.text }))
    })
  }

  return (
    <div style={{ minHeight: '100vh', background: UI.bg }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px', background: UI.surface, borderBottom: `1px solid ${UI.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fahrenheit-one-logo.png" alt="Fahrenheit One" style={{ height: 26, width: 'auto' }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: UI.text }}>Engagement Monitor</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <a href="https://clubf1.tech/" style={{ fontSize: 13, color: UI.textMuted, textDecoration: 'none' }}>← Hub</a>
          <span style={{ fontSize: 13, color: UI.text }}>{userEmail}</span>
          <a href="https://clubf1.tech/logout" style={{ padding: '7px 12px', background: UI.surface, border: `1px solid ${UI.borderStrong}`, borderRadius: 9, color: UI.textMuted, fontSize: 12.5, textDecoration: 'none' }}>Sign out</a>
        </div>
      </header>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 32px' }}>
        {err && <div style={{ marginBottom: 16, padding: '10px 12px', background: '#FFF1EF', border: `1px solid ${ACCENT}`, borderRadius: UI.radiusSm, fontSize: 12.5, color: '#8B3A2E' }}>{err}</div>}

        {tablesMissing ? (
          <div style={{ ...card, padding: 32 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Setup required</div>
            <p style={{ fontSize: 14, color: UI.textMuted, lineHeight: 1.6 }}>Run <code>supabase-schema-engagement.sql</code> in your Supabase SQL Editor to create the tables, then reload and import your CSVs.</p>
          </div>
        ) : (
          <>
            {/* Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 18 }}>
              {([['Members', counts.total, UI.text], ['High risk', counts.High, LEVEL_COLOR.High], ['Medium', counts.Medium, LEVEL_COLOR.Medium], ['Low', counts.Low, LEVEL_COLOR.Low]] as const).map(([label, n, color]) => (
                <div key={label} style={{ ...card, padding: '16px 18px' }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: UI.textFaint }}>{label}</div>
                  <div style={{ fontSize: 28, fontWeight: 600, color, marginTop: 6 }}>{n}</div>
                </div>
              ))}
            </div>

            {/* Import (admin) */}
            {isAdmin && (
              <div style={{ ...card, padding: 18, marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setShowImport(s => !s)}>
                  <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: UI.textFaint }}>Data import (CSV) {showImport ? '▾' : '▸'}</div>
                  {(!hasMembers || !hasConfig) && <span style={{ fontSize: 11, color: ACCENT }}>{!hasConfig ? 'Import weights + templates to start' : !hasMembers ? 'Import members to start' : ''}</span>}
                </div>
                {showImport && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginTop: 14 }}>
                    {([['members', 'Members (Sample_Members.csv)'], ['weights', 'Tag weights (Tag_Weighting.csv)'], ['templates', 'SMS templates (SMS Messages.csv)']] as const).map(([kind, label]) => (
                      <label key={kind} style={{ display: 'block', fontSize: 12, color: UI.textMuted }}>
                        {label}
                        <input type="file" accept=".csv" onChange={onFile(kind)} disabled={pending} style={{ display: 'block', marginTop: 6, fontSize: 12 }} />
                      </label>
                    ))}
                  </div>
                )}
                {importMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: LEVEL_COLOR.Low }}>{importMsg}</div>}
              </div>
            )}

            {/* Filters */}
            <div style={{ ...card, padding: 14, marginBottom: 18, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <input placeholder="Search name / number…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...input, flex: '1 1 200px' }} />
              <select value={level} onChange={e => setLevel(e.target.value)} style={input}><option>All</option><option>High</option><option>Medium</option><option>Low</option></select>
              <label style={{ fontSize: 12, color: UI.textMuted }}>Min score <input type="number" min={0} max={200} value={minScore} onChange={e => setMinScore(+e.target.value || 0)} style={{ ...input, width: 70, marginLeft: 6 }} /></label>
              <label style={{ fontSize: 12, color: UI.textMuted }}>Cooldown days <input type="number" min={0} value={cooldown} onChange={e => setCooldown(+e.target.value || 0)} style={{ ...input, width: 64, marginLeft: 6 }} /></label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={input}>
                <option value="risk-desc">Risk: high → low</option><option value="risk-asc">Risk: low → high</option><option value="name">Name A–Z</option>
              </select>
            </div>

            {/* Queue */}
            {!hasMembers ? (
              <div style={{ ...card, padding: 28, textAlign: 'center', color: UI.textFaint }}>No members yet — import a members CSV above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: UI.textFaint }}>Review queue · {filtered.length}</div>
                {filtered.map(it => {
                  const c = LEVEL_COLOR[it.level]
                  const d = done[it.memberNumber]
                  return (
                    <div key={it.memberNumber} style={{ ...card, padding: 20, opacity: d ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 15.5, fontWeight: 600, color: UI.text }}>{it.name} <span style={{ fontSize: 12, color: UI.textFaint, fontWeight: 400 }}>#{it.memberNumber}</span></div>
                          <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {it.matchedTags.map((t, i) => (
                              <span key={i} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: UI.surfaceAlt, border: `1px solid ${UI.border}`, color: t.points > 0 ? '#8B3A2E' : t.points < 0 ? '#3A5A40' : UI.textMuted }}>
                                {t.tag} <b>{t.points > 0 ? `+${t.points}` : t.points}</b>
                              </span>
                            ))}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 26, fontWeight: 700, color: c }}>{it.score}</div>
                          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: c, fontWeight: 600 }}>{it.level} risk</div>
                          {it.lastApprovedAt && <div style={{ fontSize: 10, color: UI.textFaint, marginTop: 4 }}>last SMS {fmt(it.lastApprovedAt)}</div>}
                        </div>
                      </div>

                      {d ? (
                        <div style={{ marginTop: 14, fontSize: 13, color: LEVEL_COLOR.Low }}>✓ {d === 'approved' ? 'Approved & logged' : 'Skipped'}</div>
                      ) : (
                        <>
                          <textarea value={msgOf(it)} onChange={e => setEdited(m => ({ ...m, [it.memberNumber]: e.target.value }))}
                            style={{ ...input, width: '100%', minHeight: 64, marginTop: 14, resize: 'vertical' }} />
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
                            <button onClick={() => aiDraft(it)} disabled={pending} style={btn('ghost')}>{busy === it.memberNumber && pending ? '…' : '✨ Draft with AI'}</button>
                            <select value={reasons[it.memberNumber] ?? ''} onChange={e => setReasons(r => ({ ...r, [it.memberNumber]: e.target.value }))} style={{ ...input, padding: '6px 8px' }}>
                              {REASONS.map(r => <option key={r} value={r}>{r || 'Reason (optional)'}</option>)}
                            </select>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => act(it, 'skipped')} disabled={pending} style={btn('skip')}>Skip</button>
                            <button onClick={() => act(it, 'approved')} disabled={pending} style={btn('solid')}>✓ Approve &amp; log</button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Recent decisions */}
            {decisions.length > 0 && (
              <div style={{ ...card, padding: 20, marginTop: 22 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: UI.textFaint, marginBottom: 12 }}>Recent decisions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {decisions.map(d => (
                    <div key={d.id} style={{ display: 'flex', gap: 12, fontSize: 12.5, color: UI.textMuted, borderBottom: `1px solid ${UI.border}`, paddingBottom: 8 }}>
                      <span style={{ fontWeight: 700, color: d.decision === 'approved' ? LEVEL_COLOR.Low : UI.textFaint, width: 70 }}>{d.decision}</span>
                      <span style={{ width: 70 }}>#{d.member_number}</span>
                      <span style={{ flex: 1, color: UI.text }}>{d.message}</span>
                      <span style={{ width: 110, textAlign: 'right' }}>{fmt(d.decided_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
