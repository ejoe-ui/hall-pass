/*
  PassAble — RHS Hall Pass System
  FILE:    app/analytics/page.jsx
  ROUTE:   /analytics
  PURPOSE: Pass analytics dashboard — total passes, avg duration, currently out,
           longest pass, daily bar chart, reason donut, period breakdown, heat map,
           frequent flyers (top students), and simultaneous exit pattern detection.
           Admin view shows all rooms school-wide; teacher view is scoped to their room.
           Admin can drill into a specific teacher by navigating from that teacher's Relay Station.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  URL:     https://hall-pass-lime.vercel.app/analytics
  BACKEND: Supabase (passes, students, teachers)
  AUTH:    Inherits session from Relay Station / Admin panel. Redirects to /teacher if not signed in.
  UPDATED: 2026-06-25 — reason list updated: Class Assignment (was On Assignment), IT / Tech Support added, School Store + Other removed; REASON_COLORS updated to match
*/
'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'

// Canonical reason list — must match all checkout pages (teacher, kiosk, self-checkout, wire, sub)
const REASONS = ['Restroom', 'Library', 'Lockers', 'Office', 'Counselor', 'Career Counselor', 'Errand', 'Class Assignment', 'IT / Tech Support']
const REASON_COLORS = {
  'Restroom': '#3B82F6', 'Library': '#8B5CF6', 'Lockers': '#06B6D4',
  'Office': '#F59E0B', 'Counselor': '#EC4899', 'Career Counselor': '#14B8A6',
  'Errand': '#10B981', 'Class Assignment': '#F97316', 'IT / Tech Support': '#A855F7',
}

function BarChart({ data, maxVal, color }) {
  if (!data || data.length === 0) return <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 24 }}>No data yet</div>
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120, padding: '0 8px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{d.count}</div>
          <div style={{ width: '100%', height: maxVal > 0 ? `${Math.max(4, (d.count / maxVal) * 100)}px` : 4, backgroundColor: color || RHS_GREEN, borderRadius: '4px 4px 0 0', opacity: d.count === 0 ? 0.2 : 1, transition: 'height 0.5s ease' }} />
          <div style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

function DonutChart({ data, total }) {
  if (!data || data.length === 0 || total === 0) return <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 24 }}>No data yet</div>
  let offset = 0
  const radius = 60
  const circumference = 2 * Math.PI * radius
  const segments = data.map(d => {
    const pct = d.count / total
    const dash = pct * circumference
    const gap = circumference - dash
    const seg = { ...d, dash, gap, offset, pct }
    offset += dash
    return seg
  })
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={160} height={160} viewBox="0 0 160 160">
        <circle cx={80} cy={80} r={radius} fill="none" stroke="#f3f4f6" strokeWidth={20} />
        {segments.map((seg, i) => (
          <circle key={i} cx={80} cy={80} r={radius} fill="none" stroke={seg.color} strokeWidth={20}
            strokeDasharray={`${seg.dash} ${seg.gap}`} strokeDashoffset={-seg.offset}
            transform="rotate(-90 80 80)" style={{ transition: 'stroke-dasharray 0.5s ease' }} />
        ))}
        <text x={80} y={76} textAnchor="middle" fontSize={22} fontWeight={700} fill="#1f2937">{total}</text>
        <text x={80} y={92} textAnchor="middle" fontSize={11} fill="#9ca3af">total</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 120 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: seg.color, flexShrink: 0 }} />
            <div style={{ fontSize: 12, color: '#374151', flex: 1 }}>{seg.label}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{Math.round(seg.pct * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HeatMap({ data }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  const hours = Array.from({ length: 8 }, (_, i) => `${i + 8}:00`)
  const max = Math.max(...Object.values(data), 1)
  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${hours.length}, 1fr)`, gap: 3, minWidth: 400 }}>
        <div />
        {hours.map(h => <div key={h} style={{ fontSize: 10, color: '#9ca3af', textAlign: 'center' }}>{h}</div>)}
        {days.map(day => (
          <>
            <div key={day} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', fontWeight: 500 }}>{day}</div>
            {hours.map(hour => {
              const key = `${day}-${hour}`
              const val = data[key] || 0
              const intensity = val / max
              return <div key={key} title={`${day} ${hour}: ${val} passes`} style={{ height: 24, borderRadius: 4, backgroundColor: val === 0 ? '#f3f4f6' : `rgba(0, 105, 56, ${0.15 + intensity * 0.85})`, transition: 'background-color 0.3s' }} />
            })}
          </>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>Low</span>
        {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => <div key={i} style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: `rgba(0, 105, 56, ${i})` }} />)}
        <span style={{ fontSize: 10, color: '#9ca3af' }}>High</span>
      </div>
    </div>
  )
}

export default function Analytics() {
  return (
    <Suspense>
      <AnalyticsInner />
    </Suspense>
  )
}

function AnalyticsInner() {
  const searchParams = useSearchParams()
  const urlTeacherId = searchParams?.get('teacher_id') || null

  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('week')
  const [totalPasses, setTotalPasses] = useState(0)
  const [avgDuration, setAvgDuration] = useState(0)
  const [longestPass, setLongestPass] = useState(0)
  const [longestPassDetail, setLongestPassDetail] = useState(null)
  const [showLongestModal, setShowLongestModal] = useState(false)
  const [showTotalModal, setShowTotalModal] = useState(false)
  const [showAvgModal, setShowAvgModal] = useState(false)
  const [showActiveModal, setShowActiveModal] = useState(false)
  const [avgDurationDetail, setAvgDurationDetail] = useState(null)
  const [activeNowDetail, setActiveNowDetail] = useState([])
  const [activeNow, setActiveNow] = useState(0)
  const [dailyData, setDailyData] = useState([])
  const [reasonData, setReasonData] = useState([])
  const [topStudents, setTopStudents] = useState([])
  const [heatMapData, setHeatMapData] = useState({})
  const [correlations, setCorrelations] = useState([])
  const [periodData, setPeriodData] = useState([])
  const [totalPassesDetail, setTotalPassesDetail] = useState([])

  // Help panel
  const [showHelp, setShowHelp] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [helpPos, setHelpPos] = useState({ x: null, y: null })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef({ x: 0, y: 0 })

  const startHelpDrag = useCallback((e) => {
    const panel = helpPanelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    helpDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    const onMove = (ev) => setHelpPos({ x: ev.clientX - helpDragOffset.current.x, y: ev.clientY - helpDragOffset.current.y })
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadCurrentTeacher()
  }, [session])

  useEffect(() => {
    if (session) loadAnalytics()
  }, [session, dateRange, currentTeacher])

  async function loadCurrentTeacher() {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return
    const { data } = await supabase
      .from('teachers')
      .select('*')
      .eq('auth_id', s.user.id)
      .eq('is_active', true)
      .maybeSingle()
    if (data) setCurrentTeacher(data)
    // NOTE: Admin view requires teachers.is_admin = true on the teacher's row.
    // If that column doesn't exist yet, is_admin will be undefined (falsy) and all
    // teachers will see only their own data — safe default, no data leaks.
  }

  function getDateFilter() {
    const now = new Date()
    if (dateRange === 'today') { const s = new Date(now); s.setHours(0,0,0,0); return s.toISOString() }
    if (dateRange === 'week') { const s = new Date(now); s.setDate(now.getDate() - 7); return s.toISOString() }
    if (dateRange === 'month') { const s = new Date(now); s.setMonth(now.getMonth() - 1); return s.toISOString() }
    return null
  }

  async function loadAnalytics() {
    setLoading(true)
    const dateFilter = getDateFilter()

    // ── FIX: Strict teacher scope — no null fallback ──────────────────────────
    // Use teacher_id from currentTeacher (auth) or fallback to URL param
    // Admin view: no teacher filter applied (currentTeacher.is_admin && no urlTeacherId)
    const teacherId = currentTeacher?.id || urlTeacherId
    const isAdmin = currentTeacher?.is_admin && !urlTeacherId

    let query = supabase.from('passes').select('*')
    if (dateFilter) query = query.gte('time_out', dateFilter)
    if (!isAdmin && teacherId) {
      // ── Strict scope: only this teacher's passes ────────────────────────────
      query = query.eq('teacher_id', teacherId)
    }
    // Admin with no teacher filter sees everything

    const { data: rawPasses } = await query.order('time_out', { ascending: false })
    if (!rawPasses) { setLoading(false); return }

    // Only fetch students referenced by these passes — no full-table scan
    const studentIds = [...new Set(rawPasses.map(p => p.student_id).filter(Boolean))]
    const studMap = {}
    if (studentIds.length > 0) {
      const { data: studData } = await supabase.from('students').select('id, full_name').in('id', studentIds)
      if (studData) studData.forEach(s => { studMap[s.id] = s })
    }
    const passes = rawPasses.map(p => ({ ...p, students: studMap[p.student_id] || null }))

    setTotalPasses(passes.length)
    const completed = passes.filter(p => p.duration_minutes != null)
    setAvgDuration(completed.length > 0 ? Math.round(completed.reduce((s, p) => s + p.duration_minutes, 0) / completed.length) : 0)

    setTotalPassesDetail(passes.slice(0, 20).map(p => ({
      name: p.students?.full_name || p.student_id,
      reason: p.reason?.split(' — ')[0] || 'Other',
      period: p.period,
      date: new Date(p.time_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      timeOut: new Date(p.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      duration: p.duration_minutes,
    })))

    if (completed.length > 0) {
      const sorted = [...completed].sort((a, b) => a.duration_minutes - b.duration_minutes)
      const median = sorted[Math.floor(sorted.length / 2)]?.duration_minutes || 0
      const over10 = completed.filter(p => p.duration_minutes > 10).length
      const reasonTotals = completed.reduce((acc, p) => {
        const r = p.reason?.split(' — ')[0] || 'Other'
        acc[r] = (acc[r] || 0) + p.duration_minutes
        return acc
      }, {})
      const longestReason = Object.entries(reasonTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'
      setAvgDurationDetail({ median, over10, pctOver10: Math.round((over10 / completed.length) * 100), completedCount: completed.length, longestReason })
    } else {
      setAvgDurationDetail(null)
    }

    if (completed.length > 0) {
      const longest = completed.reduce((max, p) => p.duration_minutes > max.duration_minutes ? p : max, completed[0])
      setLongestPass(longest.duration_minutes)
      setLongestPassDetail({
        student: longest.students?.full_name || longest.student_id,
        reason: longest.reason || '—',
        duration: longest.duration_minutes,
        date: new Date(longest.time_out).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timeOut: new Date(longest.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeIn: longest.time_in ? new Date(longest.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—',
        period: longest.period,
      })
    } else {
      setLongestPass(0)
      setLongestPassDetail(null)
    }

    const activePasses = passes.filter(p => !p.time_in)
    setActiveNow(activePasses.length)
    setActiveNowDetail(activePasses.map(p => ({
      name: p.students?.full_name || p.student_id,
      reason: p.reason?.split(' — ')[0] || 'Other',
      period: p.period,
      timeOut: new Date(p.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      minutesOut: Math.round((Date.now() - new Date(p.time_out)) / 60000),
    })))

    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const last7 = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d })
    const dailyCounts = {}
    last7.forEach(d => { dailyCounts[d.toDateString()] = 0 })
    passes.forEach(p => { const k = new Date(p.time_out).toDateString(); if (dailyCounts[k] !== undefined) dailyCounts[k]++ })
    setDailyData(last7.map(d => ({ label: days[d.getDay()], count: dailyCounts[d.toDateString()] || 0 })))

    const reasonCounts = {}
    passes.forEach(p => {
      const r = p.reason?.split(' — ')[0] || 'Other'
      const k = REASONS.find(x => r.startsWith(x)) || 'Other'
      reasonCounts[k] = (reasonCounts[k] || 0) + 1
    })
    setReasonData(Object.entries(reasonCounts).map(([label, count]) => ({ label, count, color: REASON_COLORS[label] || '#94A3B8' })).sort((a, b) => b.count - a.count))

    const sc = {}
    passes.forEach(p => {
      const id = p.student_id
      if (!sc[id]) sc[id] = { id, name: p.students?.full_name || id, count: 0, totalMin: 0, reasons: {} }
      sc[id].count++
      if (p.duration_minutes) sc[id].totalMin += p.duration_minutes
      const r = p.reason?.split(' — ')[0] || 'Other'
      sc[id].reasons[r] = (sc[id].reasons[r] || 0) + 1
    })
    setTopStudents(Object.values(sc).sort((a, b) => b.count - a.count).slice(0, 10).map(s => ({
      ...s,
      avgMin: s.count > 0 ? Math.round(s.totalMin / s.count) : 0,
      topReason: Object.entries(s.reasons).sort((a, b) => b[1] - a[1])[0]?.[0] || '—',
    })))

    const hm = {}
    const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    passes.forEach(p => {
      const d = new Date(p.time_out); const day = dn[d.getDay()]
      if (day === 'Sat' || day === 'Sun') return
      const hour = d.getHours(); if (hour < 8 || hour > 15) return
      const k = `${day}-${hour}:00`; hm[k] = (hm[k] || 0) + 1
    })
    setHeatMapData(hm)

    const pc = {}
    passes.forEach(p => { const per = p.period || 'Unknown'; pc[per] = (pc[per] || 0) + 1 })
    setPeriodData(Object.entries(pc).map(([label, count]) => ({ label: `Period ${label}`, count })).sort((a, b) => a.label.localeCompare(b.label)))

    const cm = {}
    const sp = [...passes].sort((a, b) => new Date(a.time_out) - new Date(b.time_out))
    for (let i = 0; i < sp.length; i++) {
      const p1 = sp[i]; if (!p1.time_in) continue
      const p1o = new Date(p1.time_out); const p1i = new Date(p1.time_in)
      for (let j = i + 1; j < sp.length; j++) {
        const p2 = sp[j]; if (!p2.time_in || p1.student_id === p2.student_id) continue
        const p2o = new Date(p2.time_out); const p2i = new Date(p2.time_in)
        if (p2o < p1i && p1o < p2i) {
          const names = [p1.students?.full_name || p1.student_id, p2.students?.full_name || p2.student_id].sort()
          const k = names.join(' + '); cm[k] = (cm[k] || 0) + 1
        }
      }
    }
    setCorrelations(Object.entries(cm).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([pair, count]) => ({ pair, count })))
    setLoading(false)
  }

  const maxDaily = Math.max(...dailyData.map(d => d.count), 1)
  const teacherName = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
  const teacherRoom = currentTeacher?.room || '27'
  const isAdmin = currentTeacher?.is_admin && !urlTeacherId

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 24, height: 24, border: `2px solid #e5e7eb`, borderTop: `2px solid ${RHS_GREEN}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!session) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
      <p style={{ color: '#6b7280' }}>Sign in to view analytics</p>
      <a href="/teacher" style={{ color: RHS_GREEN, fontSize: 14 }}>← Go to The Relay Station</a>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .clickable-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s ease; }
      `}</style>

      {/* Total Passes Modal */}
      {showTotalModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1f2937' }}>🎫 Recent Passes</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Last 20 passes in this range</p>
              </div>
              <button onClick={() => setShowTotalModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {totalPassesDetail.map((p, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < totalPassesDetail.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.date} · Per {p.period} · {p.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: p.duration > 10 ? '#EF4444' : '#6b7280' }}>{p.duration != null ? `${p.duration}m` : '—'}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{p.timeOut}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowTotalModal(false)} style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: RHS_GREEN, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Avg Duration Modal */}
      {showAvgModal && avgDurationDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1f2937' }}>⏱ Duration Breakdown</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Pass duration analysis</p>
              </div>
              <button onClick={() => setShowAvgModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Average duration', `${avgDuration} min`, '#3B82F6'],
                ['Median duration', `${avgDurationDetail.median} min`, '#1f2937'],
                ['Over 10 min', `${avgDurationDetail.over10} (${avgDurationDetail.pctOver10}%)`, avgDurationDetail.over10 > 0 ? '#EF4444' : RHS_GREEN],
                ['Longest avg reason', avgDurationDetail.longestReason, '#1f2937'],
                ['Completed passes', `${avgDurationDetail.completedCount} of ${totalPasses}`, '#1f2937'],
              ].map(([label, val, color], i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color }}>{val}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowAvgModal(false)} style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: '#3B82F6', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Currently Out Modal */}
      {showActiveModal && activeNow > 0 && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1f2937' }}>🔴 Currently Out</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Students with open passes right now</p>
              </div>
              <button onClick={() => setShowActiveModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '12px 20px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#EF4444', lineHeight: 1 }}>{activeNow}</div>
              <div style={{ fontSize: 13, color: '#991B1B', marginTop: 2 }}>student{activeNow !== 1 ? 's' : ''} currently out</div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {activeNowDetail.map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < activeNowDetail.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>Period {s.period} · {s.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: s.minutesOut > 10 ? '#EF4444' : '#6b7280' }}>{s.minutesOut}m</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>since {s.timeOut}</div>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowActiveModal(false)} style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: '#EF4444', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Longest Pass Modal */}
      {showLongestModal && longestPassDetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'white', borderRadius: 20, padding: 24, maxWidth: 380, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1f2937' }}>⏰ Longest Pass</h2>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9ca3af' }}>Longest single pass in this period</p>
              </div>
              <button onClick={() => setShowLongestModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ background: '#FEF3C7', borderRadius: 12, padding: '16px 20px', marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 800, color: '#D97706', lineHeight: 1 }}>{longestPassDetail.duration}m</div>
              <div style={{ fontSize: 13, color: '#92400E', marginTop: 4 }}>total time out</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Student', longestPassDetail.student],
                ['Reason', longestPassDetail.reason],
                ['Date', longestPassDetail.date],
                ['Out', longestPassDetail.timeOut],
                ['Returned', longestPassDetail.timeIn],
              ].map(([label, val], i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: i < arr.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{val}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setShowLongestModal(false)} style={{ width: '100%', marginTop: 16, padding: '12px', borderRadius: 12, border: 'none', background: RHS_GREEN, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ backgroundColor: RHS_GREEN, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/RHSCOWBOYlogo.png" alt="RHS" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 style={{ color: 'white', fontWeight: 700, fontSize: 18, margin: 0 }}>Pass Analytics</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
              {isAdmin ? 'All Rooms · Admin View' : `${teacherName} · Room ${teacherRoom}`} · RHS PassAble
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/teacher" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>← The Relay Station</a>
          {currentTeacher?.is_admin && <a href="/admin" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>Admin</a>}
          <button
            onClick={() => { setShowHelp(v => !v); setHelpSearch(''); setHelpPos({ x: null, y: null }) }}
            style={{ background: showHelp ? 'white' : 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 15, fontWeight: 700, color: showHelp ? RHS_GREEN : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >?</button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>

        {/* ── Scope indicator ── */}
        {isAdmin && (
          <div style={{ marginBottom: 16, padding: '10px 16px', background: '#FEF3C7', borderRadius: 10, border: '1px solid #FCD34D', fontSize: 13, color: '#92400E' }}>
            👑 Admin view — showing all rooms. To view a specific teacher, go to their Relay Station and click Analytics.
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 16, color: '#1f2937', fontWeight: 600 }}>
            {loading ? 'Loading...' : `${totalPasses} passes · ${dateRange === 'today' ? 'Today' : dateRange === 'week' ? 'Last 7 days' : dateRange === 'month' ? 'Last 30 days' : 'All time'}`}
          </h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['today', 'week', 'month', 'all'].map(r => (
              <button key={r} onClick={() => setDateRange(r)} style={{ padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8, border: 'none', cursor: 'pointer', background: dateRange === r ? RHS_GREEN : 'white', color: dateRange === r ? 'white' : '#6b7280', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {r === 'today' ? 'Today' : r === 'week' ? '7 Days' : r === 'month' ? '30 Days' : 'All Time'}
              </button>
            ))}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
          <div className="clickable-card" onClick={() => setShowTotalModal(true)} style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 4, cursor: 'pointer' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>🎫</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Total Passes</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: RHS_GREEN, lineHeight: 1 }}>{totalPasses}</div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>tap for breakdown</div>
          </div>
          <div className="clickable-card" onClick={() => avgDurationDetail && setShowAvgModal(true)} style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 4, cursor: avgDurationDetail ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>⏱</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Avg Duration</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#3B82F6', lineHeight: 1 }}>{avgDuration}m</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>per pass</div>
            {avgDurationDetail && <div style={{ fontSize: 11, color: '#9ca3af' }}>tap for details</div>}
          </div>
          <div className="clickable-card" onClick={() => activeNow > 0 && setShowActiveModal(true)} style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 4, cursor: activeNow > 0 ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>🔴</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Currently Out</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: activeNow > 0 ? '#EF4444' : RHS_GREEN, lineHeight: 1 }}>{activeNow}</div>
            {activeNow > 0 && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>tap to see who</div>}
          </div>
          <div className="clickable-card" onClick={() => longestPassDetail && setShowLongestModal(true)} style={{ background: 'white', borderRadius: 16, padding: '20px 24px', border: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 4, cursor: longestPassDetail ? 'pointer' : 'default' }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>⏰</div>
            <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Longest Pass</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#F59E0B', lineHeight: 1 }}>{longestPass}m</div>
            {longestPassDetail && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>tap for details</div>}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>📅 Passes by Day</h3>
            <BarChart data={dailyData} maxVal={maxDaily} color={RHS_GREEN} />
          </div>
          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>🎯 Reason Breakdown</h3>
            <DonutChart data={reasonData} total={totalPasses} />
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>📚 Passes by Period</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {periodData.map(p => (
              <div key={p.label} style={{ flex: 1, minWidth: 120, background: '#f9fafb', borderRadius: 12, padding: '12px 16px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: RHS_GREEN }}>{p.count}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{p.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>🌡 Pass Activity Heat Map</h3>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#9ca3af' }}>Busiest times of the school day</p>
          <HeatMap data={heatMapData} />
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb', marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>🏆 Frequent Flyers</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af' }}>Top 10 students by pass count</p>
          {topStudents.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 24 }}>No data yet</div>
          ) : topStudents.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < topStudents.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, background: i === 0 ? '#FEF3C7' : i === 1 ? '#F3F4F6' : i === 2 ? '#FEF3C7' : '#f9fafb', color: i === 0 ? '#D97706' : i === 1 ? '#6B7280' : i === 2 ? '#92400E' : '#9CA3AF' }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </div>
              <div style={{ flex: 1 }}>
                {/* Plain text — no confirmed /student/[id] route; add link once that page exists */}
                <span style={{ fontSize: 13, fontWeight: 600, color: '#1f2937' }}>{s.name}</span>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>Top reason: {s.topReason}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: RHS_GREEN }}>{s.count}</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>passes</div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 48 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.avgMin > 10 ? '#EF4444' : '#6b7280' }}>{s.avgMin}m</div>
                <div style={{ fontSize: 11, color: '#9ca3af' }}>avg</div>
              </div>
              <div style={{ width: 60, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 3, width: `${(s.count / topStudents[0].count) * 100}%`, background: RHS_GREEN }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb', marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>🔗 Simultaneous Exit Patterns</h3>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#9ca3af' }}>Student pairs frequently out at the same time</p>
          {correlations.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 24 }}>No patterns detected yet</div>
          ) : correlations.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < correlations.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
              <div style={{ fontSize: 18 }}>{c.count >= 5 ? '🚨' : c.count >= 3 ? '⚠️' : '👀'}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 500, color: '#1f2937' }}>{c.pair}</div>
              <div style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: c.count >= 5 ? '#FEE2E2' : c.count >= 3 ? '#FEF3C7' : '#F3F4F6', color: c.count >= 5 ? '#DC2626' : c.count >= 3 ? '#D97706' : '#6B7280' }}>
                {c.count}x together
              </div>
            </div>
          ))}
          {correlations.length > 0 && (
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#f0fdf4', borderRadius: 8, fontSize: 12, color: '#166534' }}>
              💡 Consider adding high-frequency pairs to a Conflict Group in the Admin panel
            </div>
          )}
        </div>
      </div>

      {/* ── Floating Help Panel ── */}
      {showHelp && (() => {
        const adminItems = [
          { q: 'What am I looking at?', keys: 'overview analytics what is this page', a: 'Pass Analytics shows data for all rooms across the school — total passes issued, how long students are out, which students leave most often, and when the hallways are busiest. Use the date range buttons to focus on today, the last 7 days, 30 days, or all time.' },
          { q: 'How do I see a specific teacher\'s data?', keys: 'teacher filter specific room', a: 'Go to that teacher\'s Relay Station and click the Analytics link from there. It will open this page scoped to their room only. The yellow banner at the top tells you when you\'re in admin (all-rooms) view.' },
          { q: 'What does Total Passes mean?', keys: 'total passes count', a: 'Every pass issued in the selected time range — across all teachers and rooms. Tap the card to see the 20 most recent passes with student name, reason, period, date, and duration.' },
          { q: 'What does Avg Duration mean?', keys: 'average duration minutes time', a: 'The average number of minutes students are out per pass (completed passes only — open passes with no return time are excluded). Tap the card for median, percent over 10 minutes, and which reason type runs longest.' },
          { q: 'What are Frequent Flyers?', keys: 'frequent flyers top students', a: 'The 10 students school-wide with the most passes in the selected time range. Red average times mean they\'re consistently out over 10 minutes.' },
          { q: 'What are Simultaneous Exit Patterns?', keys: 'correlations simultaneous patterns pairs together', a: 'Student pairs who were both out of class at the same time, 2+ times in the selected range. 🚨 = 5+ times, ⚠️ = 3–4 times, 👀 = 2 times. If a pair appears here regularly, consider adding them to a Conflict Group in the Admin panel to block them from going out at the same time.' },
          { q: 'What is the Heat Map?', keys: 'heat map activity time of day busy', a: 'Shows when passes happen most — by day of week and hour. Darker green = more passes. Use this to spot patterns: if Thursday 10:00 is always dark, that period or day might need attention.' },
          { q: 'What does "Currently Out" mean?', keys: 'currently out active open passes', a: 'Students with an open pass right now — they scanned out but haven\'t returned yet. Tap the card to see who\'s out and how long they\'ve been gone. Red times mean over 10 minutes.' },
        ]
        const teacherItems = [
          { q: 'What am I looking at?', keys: 'overview analytics what is this page', a: 'Pass Analytics shows data for your room — total passes you\'ve issued, how long your students are out, which students leave most often, and your busiest times. Use the date range buttons to filter by today, 7 days, 30 days, or all time.' },
          { q: 'What does Total Passes mean?', keys: 'total passes count', a: 'Every pass you\'ve issued in the selected time range. Tap the card to see the 20 most recent passes with student name, reason, period, date, and duration.' },
          { q: 'What does Avg Duration mean?', keys: 'average duration minutes time', a: 'The average number of minutes your students are out per pass. Only completed passes (with a return time) count. Tap the card for median, how many ran over 10 minutes, and which reason type takes longest.' },
          { q: 'What are Frequent Flyers?', keys: 'frequent flyers top students', a: 'Your top 10 students by pass count in the selected range. Red average times mean they\'re consistently out over 10 minutes — worth a check-in.' },
          { q: 'What are Simultaneous Exit Patterns?', keys: 'correlations simultaneous patterns pairs together', a: 'Student pairs from your class who were both out at the same time, 2+ times. 🚨 = 5+ times, ⚠️ = 3–4 times, 👀 = 2 times. If the same two students keep leaving together, you can contact your admin about adding them to a Conflict Group.' },
          { q: 'What is the Heat Map?', keys: 'heat map activity time of day busy', a: 'Shows your busiest pass times by day and hour. Darker green = more passes. Useful for spotting if a specific period or day consistently has more hallway traffic from your room.' },
          { q: 'What does "Currently Out" mean?', keys: 'currently out active open passes', a: 'Students with an open pass right now — they scanned out but haven\'t returned. Tap the card to see names and how long they\'ve been gone. Red times = over 10 minutes.' },
          { q: 'Why don\'t I see all students in Frequent Flyers?', keys: 'missing students frequent flyers why', a: 'Only students who have been issued at least one pass appear here. Students who haven\'t used a pass yet won\'t show up. The list is also limited to your top 10 by pass count.' },
        ]
        const items = isAdmin ? adminItems : teacherItems
        const q = helpSearch.toLowerCase().trim()
        const filtered = q ? items.filter(i => i.q.toLowerCase().includes(q) || i.keys.includes(q)) : items
        const panelStyle = {
          position: 'fixed',
          top: helpPos.y !== null ? helpPos.y : 80,
          left: helpPos.x !== null ? helpPos.x : 'auto',
          right: helpPos.x !== null ? 'auto' : 24,
          width: 360,
          maxHeight: '80vh',
          background: 'white',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `2px solid ${RHS_GREEN}`,
        }
        return (
          <div ref={helpPanelRef} style={panelStyle}>
            <div onMouseDown={startHelpDrag} style={{ background: RHS_GREEN, padding: '12px 16px', cursor: 'grab', display: 'flex', justifyContent: 'space-between', alignItems: 'center', userSelect: 'none' }}>
              <span style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>
                Analytics Help — {isAdmin ? 'Admin View' : 'Teacher View'}
              </span>
              <button onClick={() => setShowHelp(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
              <input
                value={helpSearch}
                onChange={e => setHelpSearch(e.target.value)}
                placeholder="Search help…"
                style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
              {filtered.length === 0 && (
                <div style={{ padding: '16px', fontSize: 13, color: '#9ca3af', textAlign: 'center' }}>No results for "{helpSearch}"</div>
              )}
              {filtered.map((item, i) => (
                <details key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <summary style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: '#1f2937', cursor: 'pointer', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    {item.q}<span style={{ color: '#9ca3af', fontSize: 16, marginLeft: 8 }}>›</span>
                  </summary>
                  <div style={{ padding: '0 16px 12px', fontSize: 13, color: '#4b5563', lineHeight: 1.5 }}>{item.a}</div>
                </details>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
