/*
  PassAble — RHS Hall Pass System
  FILE:    app/student/[id]/page.jsx
  ROUTE:   /student/[id]
  PURPOSE: Student profile — pass history, stats, NFC enrollment.
           Shows student's actual teacher (from student_periods) on the card,
           not the logged-in teacher's info.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students, student_periods, teachers, passes tables)
  UPDATED: 2026-06-21
*/

'use client'
import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

const REASON_COLORS = {
  'Restroom': '#3B82F6',
  'Library': '#8B5CF6',
  'Office': '#F59E0B',
  'Counselor': '#EC4899',
  'Water': '#06B6D4',
  'Errand': '#10B981',
  'On Assignment': '#F97316',
  'School Store': '#6366F1',
  'Other': '#94A3B8',
}

function getReasonColor(reason) {
  const base = reason?.split(' — ')[0] || 'Other'
  return REASON_COLORS[base] || '#94A3B8'
}

function getReasonBase(reason) {
  return reason?.split(' — ')[0] || 'Other'
}

function fmt(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

function getSemesterStart() {
  const now = new Date()
  const month = now.getMonth()
  const year = now.getFullYear()
  if (month >= 7) return new Date(year, 7, 1)
  return new Date(year, 0, 1)
}

function normalizeUid(uid) {
  const clean = uid.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  return clean.slice(-6)
}

const NFC_BASE_URL = 'https://ejoe-ui.github.io/rhs-flipboard/mobile.html'

function NFCEnrollment({ student, onEnrolled }) {
  const [mode, setMode] = useState('idle')
  const [capturedUid, setCapturedUid] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const inputRef = useRef(null)
  const bufferRef = useRef('')
  const timerRef = useRef(null)

  const hasCard = !!student?.nfc_uid

  useEffect(() => {
    if (mode !== 'listening') return
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [mode])

  function handleKeyDown(e) {
    if (mode !== 'listening') return
    if (e.key === 'Enter') {
      const raw = bufferRef.current.trim()
      bufferRef.current = ''
      clearTimeout(timerRef.current)
      if (raw.length >= 4) {
        const uid = normalizeUid(raw)
        setCapturedUid(uid)
        setMode('confirm')
      } else {
        setErrorMsg('UID too short — tap the card again')
        setMode('error')
      }
      return
    }
    bufferRef.current += e.key
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => { bufferRef.current = '' }, 500)
  }

  async function saveUid() {
    setSaving(true)
    const { data: existing } = await supabase
      .from('students')
      .select('id, full_name')
      .eq('nfc_uid', capturedUid)
      .neq('id', student.id)
      .single()

    if (existing) {
      setErrorMsg(`This card is already assigned to ${existing.full_name}`)
      setMode('error')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('students')
      .update({ nfc_uid: capturedUid })
      .eq('id', student.id)

    setSaving(false)
    if (error) {
      setErrorMsg('Save failed — try again')
      setMode('error')
    } else {
      setMode('success')
      onEnrolled(capturedUid)
    }
  }

  async function removeCard() {
    const { error } = await supabase
      .from('students')
      .update({ nfc_uid: null })
      .eq('id', student.id)
    if (!error) onEnrolled(null)
  }

  function startListening() {
    bufferRef.current = ''
    setCapturedUid('')
    setErrorMsg('')
    setMode('listening')
  }

  function cancel() {
    bufferRef.current = ''
    clearTimeout(timerRef.current)
    setMode('idle')
  }

  const nfcUrl = (uid) => `${NFC_BASE_URL}?uid=${uid}`

  return (
    <div style={{
      marginTop: 16, padding: '14px 16px',
      background: '#f9fafb',
      border: `1px solid ${hasCard ? '#d1fae5' : '#e5e7eb'}`,
      borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    }}>
      <input
        ref={inputRef}
        onKeyDown={handleKeyDown}
        readOnly
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none' }}
        tabIndex={-1}
      />

      <div style={{ fontSize: 20 }}>
        {mode === 'success' ? '✅' : hasCard ? '📲' : '🏷️'}
      </div>

      <div style={{ flex: 1 }}>
        {mode === 'idle' && hasCard && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#166534' }}>NFC Card Enrolled</p>
            <p style={{ margin: '2px 0 0', fontSize: 10, color: '#6b7280', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {nfcUrl(student.nfc_uid)}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(nfcUrl(student.nfc_uid))}
              style={{ marginTop: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer' }}>
              📋 Copy URL
            </button>
          </>
        )}

        {mode === 'idle' && !hasCard && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#374151' }}>No NFC Card</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>Assign a sticker to this student</p>
          </>
        )}

        {mode === 'listening' && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: RHS_GREEN }}>👂 Tap the NFC sticker now...</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280' }}>Hold sticker to reader — will capture automatically</p>
          </>
        )}

        {mode === 'confirm' && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#374151' }}>Card detected — save this UID?</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280', fontFamily: 'monospace' }}>{capturedUid}</p>
          </>
        )}

        {mode === 'success' && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#166534' }}>Enrolled! Write this URL to the sticker:</p>
            <p style={{ margin: '4px 0 2px', fontSize: 10, color: '#6b7280', fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.5 }}>
              {nfcUrl(capturedUid)}
            </p>
            <button
              onClick={() => navigator.clipboard.writeText(nfcUrl(capturedUid))}
              style={{ marginTop: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, cursor: 'pointer' }}>
              📋 Copy URL
            </button>
            <p style={{ margin: '4px 0 0', fontSize: 10, color: '#9ca3af' }}>Paste into NFC Tools for Desktop → Write → URL</p>
          </>
        )}

        {mode === 'error' && (
          <>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#dc2626' }}>Error</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#dc2626' }}>{errorMsg}</p>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        {mode === 'idle' && (
          <>
            <button onClick={startListening} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: RHS_GREEN, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {hasCard ? 'Re-enroll' : 'Enroll Card'}
            </button>
            {hasCard && (
              <button onClick={removeCard} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, background: 'white', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, cursor: 'pointer' }}>
                Remove
              </button>
            )}
          </>
        )}
        {mode === 'listening' && (
          <button onClick={cancel} style={{ padding: '7px 14px', fontSize: 12, background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>
            Cancel
          </button>
        )}
        {mode === 'confirm' && (
          <>
            <button onClick={saveUid} disabled={saving} style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: RHS_GREEN, color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={startListening} style={{ padding: '7px 14px', fontSize: 12, background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>
              Retry
            </button>
          </>
        )}
        {(mode === 'success' || mode === 'error') && (
          <button onClick={() => setMode('idle')} style={{ padding: '7px 14px', fontSize: 12, background: 'white', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer' }}>
            Done
          </button>
        )}
      </div>
    </div>
  )
}

function StudentDetailInner() {
  const { id } = useParams()
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [studentTeachers, setStudentTeachers] = useState([]) // [{period, room, teacherName}]
  const [student, setStudent] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('semester')

  // Floating help panel
  const [showHelp, setShowHelp] = useState(false)
  const [helpPos, setHelpPos] = useState({ x: null, y: null })
  const helpRef = useRef()
  const dragOffset = useRef(null)

  const onHelpMouseDown = useCallback((e) => {
    if (e.target.closest('a, button')) return
    dragOffset.current = {
      x: e.clientX - helpRef.current.getBoundingClientRect().left,
      y: e.clientY - helpRef.current.getBoundingClientRect().top,
    }
    const onMove = (mv) => {
      setHelpPos({ x: mv.clientX - dragOffset.current.x, y: mv.clientY - dragOffset.current.y })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => { loadData() }, [id, timeRange])

  async function loadData() {
    setLoading(true)

    // Load viewer first — needed to know whether to filter passes
    let viewer = null
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data } = await supabase
        .from('teachers').select('*')
        .eq('auth_id', session.user.id).eq('is_active', true).maybeSingle()
      viewer = data
      if (data) setCurrentTeacher(data)
    }

    const { data: studentData } = await supabase
      .from('students').select('*').eq('id', id).single()
    if (studentData) {
      setStudent(studentData)
      // Load photo if available
      if (studentData.photo_file) {
        const { data } = supabase.storage.from('student-photos').getPublicUrl(studentData.photo_file)
        if (data?.publicUrl) setPhotoUrl(`${data.publicUrl}?t=${Date.now()}`)
      }
      // Load all of the student's classes + teachers via student_periods
      const { data: periodRows } = await supabase
        .from('student_periods')
        .select('room, period')
        .eq('student_id', studentData.id)
        .order('period')
      if (periodRows && periodRows.length > 0) {
        const rooms = [...new Set(periodRows.map(p => p.room))]
        const { data: teacherRows } = await supabase
          .from('teachers')
          .select('name, room')
          .in('room', rooms)
        const teacherByRoom = Object.fromEntries((teacherRows || []).map(t => [String(t.room), t]))
        const entries = periodRows.map(p => ({
          period: p.period,
          room: p.room,
          teacherName: teacherByRoom[String(p.room)]?.name?.split(' ').pop() || `Rm ${p.room}`
        }))
        setStudentTeachers(entries)
      }
    }

    // Teachers see only passes from their own class; admins see all
    let query = supabase.from('passes').select('*').eq('student_id', id).order('time_out', { ascending: false })
    if (viewer && !viewer.is_admin) {
      query = query.eq('room', viewer.room)
    }

    if (timeRange === 'semester') {
      query = query.gte('time_out', getSemesterStart().toISOString())
    } else if (timeRange === 'month') {
      const start = new Date(); start.setMonth(start.getMonth() - 1)
      query = query.gte('time_out', start.toISOString())
    } else if (timeRange === 'week') {
      const start = new Date(); start.setDate(start.getDate() - 7)
      query = query.gte('time_out', start.toISOString())
    }

    const { data: passData } = await query
    if (passData) setPasses(passData)
    setLoading(false)
  }

  function exportCSV() {
    const headers = ['Date', 'Reason', 'Time Out', 'Time In', 'Duration (min)', 'Period', 'Status']
    const rows = passes.map(p => [
      fmtDate(p.time_out), p.reason, fmt(p.time_out), fmt(p.time_in),
      p.duration_minutes || '', p.period, p.time_in ? 'Returned' : 'Out'
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${student?.full_name?.replace(/\s+/g, '-') || 'student'}-passes.csv`
    a.click()
  }

  const completed = passes.filter(p => p.duration_minutes != null)
  const totalPasses = passes.length
  const avgDuration = completed.length > 0
    ? Math.round(completed.reduce((sum, p) => sum + p.duration_minutes, 0) / completed.length) : 0
  const totalMinutes = completed.reduce((sum, p) => sum + p.duration_minutes, 0)
  const longestPass = completed.length > 0 ? Math.max(...completed.map(p => p.duration_minutes)) : 0
  const overLimitCount = completed.filter(p => p.duration_minutes > 10).length

  const reasonCounts = {}
  passes.forEach(p => {
    const base = getReasonBase(p.reason)
    reasonCounts[base] = (reasonCounts[base] || 0) + 1
  })
  const reasonList = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count, pct: Math.round((count / totalPasses) * 100) }))

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0 }
  passes.forEach(p => {
    const day = dayNames[new Date(p.time_out).getDay()]
    if (dayCounts[day] !== undefined) dayCounts[day]++
  })
  const maxDay = Math.max(...Object.values(dayCounts), 1)

  // Header shows logged-in teacher; student card shows student's actual teacher
  const teacherRoom = currentTeacher?.room || '—'
  const teacherName = currentTeacher?.name || 'RHS PassAble'

  // nothing needed — using studentTeachers array directly

  // Build period label from teacher's config or fallback
  function getPeriodLabel(period) {
    if (currentTeacher?.period_labels?.[period]) return currentTeacher.period_labels[period]
    const defaults = { '1': 'Per 1&2', '4': 'Per 4&5', '6': 'Per 6&7' }
    return defaults[period] || (period ? `Period ${period}` : '')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ width: 24, height: 24, border: `2px solid #e5e7eb`, borderTop: `2px solid ${RHS_GREEN}`, borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    </div>
  )

  if (!student) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <p style={{ color: '#9ca3af' }}>Student not found.</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 15mm; size: letter; }
        }
      `}</style>

      {/* Header — shows logged-in teacher */}
      <div style={{ backgroundColor: RHS_GREEN, padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/RHSCOWBOYlogo.png" alt="RHS" style={{ width: 32, height: 32, objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 style={{ color: 'white', fontWeight: 700, fontSize: 18, margin: 0 }}>Student Profile</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>
              {currentTeacher?.is_admin ? 'Admin View' : `Room ${teacherRoom} · ${teacherName}`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/analytics" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>← Analytics</a>
          <a href="/log" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>Pass Log</a>
          <button
            onClick={() => { setShowHelp(v => !v); setHelpPos({ x: null, y: null }) }}
            title="Help"
            style={{
              width: 28, height: 28, borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.6)',
              background: showHelp ? 'white' : 'transparent',
              color: showHelp ? RHS_GREEN : 'white',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >?</button>
        </div>
      </div>

      {/* Floating draggable help panel */}
      {showHelp && (
        <div
          ref={helpRef}
          onMouseDown={onHelpMouseDown}
          className="no-print"
          style={{
            position: 'fixed',
            top: helpPos.y !== null ? helpPos.y : 80,
            left: helpPos.x !== null ? helpPos.x : 'calc(100% - 380px)',
            width: 340,
            maxHeight: '80vh',
            overflowY: 'auto',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            border: '1px solid #e5e7eb',
            zIndex: 1000,
            cursor: 'grab',
            userSelect: 'none',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', borderBottom: '1px solid #f3f4f6',
            background: '#f9fafb', borderRadius: '16px 16px 0 0',
          }}>
            <p style={{ fontWeight: 700, fontSize: 13, color: '#374151', margin: 0 }}>Student Profile — {currentTeacher?.is_admin ? 'Admin' : 'Teacher'} Help</p>
            <button onClick={() => setShowHelp(false)}
              style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(currentTeacher?.is_admin ? [
              {
                q: 'What does this profile show?',
                a: 'Everything PassAble knows about this student — all pass history across every class and teacher combined, school-wide stats, which periods and teachers they\'re enrolled with, and NFC card status.'
              },
              {
                q: 'What do the pass stats mean?',
                a: 'All stats are school-wide — Total Passes, Avg Duration, Total Time Out, Over 10 Min, and Longest Pass are calculated across every class this student is enrolled in, not just one room.'
              },
              {
                q: 'Can I edit this student\'s info?',
                a: 'Not from here. To update a student\'s name, Student ID, or photo, go to Manage Students. Changes made there apply school-wide immediately.'
              },
              {
                q: 'How do I assign an NFC card or sticker?',
                a: 'Click Enroll Card, then tap or scan the student\'s NFC card or sticker when prompted. The card links to this student and works at any kiosk school-wide. Enrolling again replaces any existing card.'
              },
              {
                q: 'Can I export this student\'s data?',
                a: 'Yes — Export CSV downloads their full pass history as a spreadsheet, and Print / PDF gives you a printable summary. Both reflect whatever time filter you have selected (7 Days, 30 Days, etc.).'
              },
            ] : [
              {
                q: 'Why do I see all of this student\'s teachers?',
                a: 'Knowing a student\'s full schedule helps with intervention planning. If a student is leaving class too often, you can reach out to their other teachers to get the full picture before meeting with the student or their counselor.'
              },
              {
                q: 'Why does pass history only show my class?',
                a: 'Pass history is filtered to your class only — you see passes this student took while in your room. Admin sees all classes combined. This keeps things focused and protects student privacy across classrooms.'
              },
              {
                q: 'What do the pass stats mean?',
                a: 'Total Passes is how many times this student left your class. Avg Duration is their average time out. Total Time Out is cumulative time away. Over 10 Min counts passes that ran long. Longest Pass is the single longest on record.'
              },
              {
                q: 'How do I assign an NFC card or sticker?',
                a: 'Click Enroll Card, then tap or scan the student\'s NFC card or sticker when prompted. The card links to this student and works at any kiosk. If they already have one, enrolling again replaces it. Note: this requires an NFC card reader — not all teachers will have one. See your admin for details; readers are reasonably priced.'
              },
              {
                q: 'Can I export this student\'s data?',
                a: 'Yes — Export CSV downloads their pass history as a spreadsheet, and Print / PDF gives you a printable summary. Both use whatever time filter you have selected (7 Days, 30 Days, etc.).'
              },
            ]).map((item, i) => (
              <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 12px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{item.q}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>

        {/* Student header card */}
        <div style={{ background: 'white', borderRadius: 16, padding: 24, border: '1px solid #e5e7eb', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>

            {/* Avatar — photo if available, initials fallback */}
            <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', flexShrink: 0, background: RHS_GREEN, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {photoUrl
                ? <img src={photoUrl} alt={student.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: 22, fontWeight: 700, color: 'white' }}>
                    {student.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </span>
              }
            </div>

            <div style={{ flex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1f2937' }}>{student.full_name}</h2>
              {/* All enrolled classes — useful for interventions across teachers */}
              {studentTeachers.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px', marginTop: 8 }}>
                  {studentTeachers.map((t, i) => (
                    <span key={i} style={{
                      fontSize: 12, color: '#374151', background: '#f3f4f6',
                      borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap'
                    }}>
                      P{t.period} · {t.teacherName}
                    </span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#9ca3af' }}>No class enrollment found</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }} className="no-print">
              <button onClick={exportCSV} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', color: '#374151', cursor: 'pointer' }}>
                Export CSV
              </button>
              <button onClick={() => window.print()} style={{ padding: '8px 16px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, background: 'white', color: '#374151', cursor: 'pointer' }}>
                Print / PDF
              </button>
            </div>
          </div>

          <NFCEnrollment
            student={student}
            onEnrolled={(uid) => setStudent(s => ({ ...s, nfc_uid: uid }))}
          />
        </div>

        {/* Time range toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }} className="no-print">
          {[['week', '7 Days'], ['month', '30 Days'], ['semester', 'This Semester'], ['all', 'All Time']].map(([val, label]) => (
            <button key={val} onClick={() => setTimeRange(val)} style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 500, borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: timeRange === val ? RHS_GREEN : 'white',
              color: timeRange === val ? 'white' : '#6b7280',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}>{label}</button>
          ))}
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { icon: '🎫', label: 'Total Passes', value: totalPasses, color: RHS_GREEN },
            { icon: '⏱', label: 'Avg Duration', value: `${avgDuration}m`, color: '#3B82F6' },
            { icon: '⏰', label: 'Total Time Out', value: `${totalMinutes}m`, color: '#F59E0B' },
            { icon: '🔴', label: 'Over 10 Min', value: overLimitCount, color: overLimitCount > 0 ? '#EF4444' : RHS_GREEN },
            { icon: '📏', label: 'Longest Pass', value: `${longestPass}m`, color: '#8B5CF6' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 12, padding: '16px 20px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500 }}>{s.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Reason breakdown + day pattern */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>🎯 By Reason</h3>
            {reasonList.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 13 }}>No passes yet</p>
            ) : reasonList.map((r, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{r.reason}</span>
                  <span style={{ fontSize: 13, color: '#6b7280' }}>{r.count} · {r.pct}%</span>
                </div>
                <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${r.pct}%`, background: getReasonColor(r.reason), borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #e5e7eb' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#1f2937' }}>📅 By Day of Week</h3>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
              {Object.entries(dayCounts).map(([day, count]) => (
                <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{count || ''}</div>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(4, (count / maxDay) * 80)}px`,
                    background: RHS_GREEN, borderRadius: '4px 4px 0 0',
                    opacity: count === 0 ? 0.15 : 1, transition: 'height 0.5s ease',
                  }} />
                  <div style={{ fontSize: 11, color: '#9ca3af' }}>{day}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Pass history */}
        <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e5e7eb', overflow: 'hidden', marginBottom: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1f2937' }}>📋 Pass History</h3>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9ca3af' }}>
                {currentTeacher && !currentTeacher.is_admin
                  ? `Your class only (Room ${currentTeacher.room})`
                  : 'All classes combined'}
              </p>
            </div>
            <span style={{ fontSize: 12, color: '#9ca3af' }}>{passes.length} passes</span>
          </div>
          {passes.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>No passes in this time range</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                  {['Date', 'Reason', 'Out', 'In', 'Duration', 'Period', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {passes.map((p, i) => (
                  <tr key={p.id} style={{ borderBottom: i < passes.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{fmtDate(p.time_out)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 500, background: `${getReasonColor(p.reason)}18`, color: getReasonColor(p.reason) }}>
                        {p.reason}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{fmt(p.time_out)}</td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{fmt(p.time_in)}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: p.duration_minutes > 10 ? '#EF4444' : '#374151' }}>
                      {p.duration_minutes ? `${p.duration_minutes}m` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#6b7280' }}>{getPeriodLabel(p.period)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      {p.time_in
                        ? <span style={{ padding: '2px 8px', background: '#f0fdf4', color: '#166534', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Returned</span>
                        : <span style={{ padding: '2px 8px', background: '#fef2f2', color: '#dc2626', borderRadius: 6, fontSize: 12, fontWeight: 500 }}>Out</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}

export default function StudentDetail() {
  return (
    <Suspense>
      <StudentDetailInner />
    </Suspense>
  )
}
