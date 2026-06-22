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
import { useState, useEffect, useRef, Suspense } from 'react'
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
  const [studentTeacher, setStudentTeacher] = useState(null) // the student's actual teacher
  const [student, setStudent] = useState(null)
  const [photoUrl, setPhotoUrl] = useState(null)
  const [passes, setPasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState('semester')

  // Load logged-in teacher (for header + pass log context)
  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (data) setCurrentTeacher(data)
    }
    loadTeacher()
  }, [])

  useEffect(() => { loadData() }, [id, timeRange])

  async function loadData() {
    setLoading(true)

    const { data: studentData } = await supabase
      .from('students').select('*').eq('id', id).single()
    if (studentData) {
      setStudent(studentData)
      // Load photo if available
      if (studentData.photo_file) {
        const { data } = supabase.storage.from('student-photos').getPublicUrl(studentData.photo_file)
        if (data?.publicUrl) setPhotoUrl(`${data.publicUrl}?t=${Date.now()}`)
      }
      // Load student's actual teacher via student_periods → teachers
      const { data: periodData } = await supabase
        .from('student_periods')
        .select('room, period')
        .eq('student_id', studentData.id)
        .limit(1)
        .maybeSingle()
      if (periodData?.room) {
        const { data: teacherData } = await supabase
          .from('teachers')
          .select('name, room')
          .eq('room', periodData.room)
          .maybeSingle()
        if (teacherData) setStudentTeacher(teacherData)
      }
    }

    let query = supabase.from('passes').select('*').eq('student_id', id).order('time_out', { ascending: false })

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

  // Student's actual teacher info for the student card
  const studentRoom = studentTeacher?.room || student?.teacher_room || '—'
  const studentTeacherName = studentTeacher?.name
    ? studentTeacher.name.split(' ').pop()
    : null

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
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, margin: 0 }}>Room {teacherRoom} · {teacherName}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <a href="/analytics" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>← Analytics</a>
          <a href="/log" style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, textDecoration: 'none' }}>Pass Log</a>
        </div>
      </div>

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
              {/* Show student's ACTUAL teacher/room, not the logged-in teacher */}
              <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6b7280' }}>
                {student.period ? `Period ${student.period}` : ''}
                {studentRoom !== '—' ? ` · Room ${studentRoom}` : ''}
                {studentTeacherName ? ` · ${studentTeacherName}` : ''}
              </p>
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
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1f2937' }}>📋 Pass History</h3>
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
