/*
  PassAble — RHS Hall Pass System
  FILE:    app/teacher/mobile/page.jsx
  ROUTE:   /teacher/mobile
  PURPOSE: Mobile-optimized pass management for teachers on the go (PE, CTE,
           portables, gym, etc.). Check students out, see who's out, check back
           in, approve pending holds. No settings, no QR codes, no print passes.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, passes, pass_holds, do_not_let_out)
  AUTH:    Same Supabase password auth as the main teacher dashboard.
  UPDATED: 2026-06-22 — initial build
*/
'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

const REASONS = [
  { label: 'Restroom', emoji: '🚻' },
  { label: 'Office',   emoji: '🏫' },
  { label: 'Counselor',emoji: '💬' },
  { label: 'Nurse',    emoji: '🩺' },
  { label: 'Library',  emoji: '📚' },
  { label: 'Lockers',  emoji: '🔐' },
  { label: 'Errand',   emoji: '📋' },
  { label: 'Other',    emoji: '📝' },
]

const PERIODS = ['1','2','3','4','5','6','7']

// ── Lightweight schedule for auto-detection (regular schedule only) ────────────
const REGULAR_PERIODS = [
  { id:'1', start:'08:10', end:'09:02' },
  { id:'2', start:'09:06', end:'09:56' },
  { id:'3', start:'10:15', end:'11:05' },
  { id:'4', start:'11:09', end:'11:59' },
  { id:'5', start:'12:37', end:'13:27' },
  { id:'6', start:'13:31', end:'14:21' },
  { id:'7', start:'14:25', end:'15:15' },
]

function t2m(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
function nowMins() { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }

function autoDetectPeriod() {
  const m = nowMins()
  return REGULAR_PERIODS.find(p => m >= t2m(p.start) && m < t2m(p.end))?.id || null
}

function elapsed(timeOut) {
  return Math.floor((Date.now() - new Date(timeOut).getTime()) / 60000)
}

function getPhotoUrl(student) {
  if (student?.photo_url) return student.photo_url
  if (student?.photo_file) return supabase.storage.from('student-photos').getPublicUrl(student.photo_file).data.publicUrl
  return null
}

// ── Main component ────────────────────────────────────────────────────────────
function MobilePageInner() {
  // ── Auth state ───────────────────────────────────────────────────────────
  const [session, setSession]           = useState(null)
  const [authLoading, setAuthLoading]   = useState(true)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [teacherLoading, setTeacherLoading] = useState(false)
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [authError, setAuthError]       = useState('')
  const [signingIn, setSigningIn]       = useState(false)

  // ── Period / room ────────────────────────────────────────────────────────
  const [activePeriod, setActivePeriod] = useState(null)
  const [selectedRoom, setSelectedRoom] = useState(null)

  // ── Data ─────────────────────────────────────────────────────────────────
  const [activePasses, setActivePasses] = useState([])
  const [students, setStudents]         = useState({}) // id → student
  const [allStudents, setAllStudents]   = useState([])
  const [heldPasses, setHeldPasses]     = useState([])
  const [dnloList, setDnloList]         = useState([])
  const [, setTick]                     = useState(0)   // forces elapsed re-render

  // ── Checkout sheet ───────────────────────────────────────────────────────
  const [showSheet, setShowSheet]           = useState(false)
  const [sheetView, setSheetView]           = useState('students') // 'students' | 'destination'
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentSearch, setStudentSearch]   = useState('')
  const [checkingOut, setCheckingOut]       = useState(false)
  const [checkingIn, setCheckingIn]         = useState(null) // passId

  const searchRef = useRef(null)

  // ── Auth effects ─────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadCurrentTeacher()
    else { setCurrentTeacher(null); setTeacherLoading(false) }
  }, [session])

  useEffect(() => {
    if (!currentTeacher) return
    const rooms = (currentTeacher.room || '27').split(',').map(r => r.trim()).filter(Boolean)
    const saved = sessionStorage.getItem(`passable_room_${currentTeacher.id}`)
    setSelectedRoom(rooms.includes(saved) ? saved : rooms[0])
    const detected = autoDetectPeriod()
    if (detected) setActivePeriod(detected)
  }, [currentTeacher?.id])

  // ── Data loading ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activePeriod || !currentTeacher) return
    loadData()
    const timer = setInterval(() => { setTick(t => t + 1); loadData() }, 15000)
    return () => clearInterval(timer)
  }, [activePeriod, currentTeacher, selectedRoom])

  // Elapsed time display refreshes every 30s
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  async function loadCurrentTeacher() {
    setTeacherLoading(true)
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) { setTeacherLoading(false); return }
    const { data } = await supabase.from('teachers').select('*').eq('auth_id', s.user.id).eq('is_active', true).maybeSingle()
    if (data) setCurrentTeacher(data)
    setTeacherLoading(false)
  }

  async function handleSignIn(e) {
    e.preventDefault()
    setSigningIn(true); setAuthError('')
    if (!email.endsWith('@rjusd.org') && !email.endsWith('@demo.passable.app')) {
      setAuthError('Only @rjusd.org accounts are allowed.')
      setSigningIn(false); return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Invalid email or passcode.')
    setSigningIn(false)
  }

  async function loadData() {
    if (!activePeriod || !currentTeacher) return
    const room = selectedRoom || currentTeacher.room?.split(',')[0]?.trim() || '27'

    const [passRes, spRes, holdsRes, dnloRes] = await Promise.all([
      supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod).eq('teacher_id', currentTeacher.id).order('time_out'),
      supabase.from('student_periods').select('student_id').eq('period', activePeriod).eq('room', room),
      supabase.from('pass_holds').select('*').eq('period', activePeriod).order('created_at'),
      supabase.from('do_not_let_out').select('student_id').eq('active', true),
    ])

    if (passRes.data) setActivePasses(passRes.data)
    if (holdsRes.data) setHeldPasses(holdsRes.data)
    if (dnloRes.data) setDnloList(dnloRes.data.map(d => d.student_id))

    const studentIds = spRes.data?.map(r => r.student_id) || []
    if (studentIds.length > 0) {
      const { data: studs } = await supabase.from('students')
        .select('id, full_name, first_name, last_name, photo_url, photo_file')
        .in('id', studentIds).order('first_name')
      if (studs) {
        const map = {}
        studs.forEach(s => { map[s.id] = s })
        setStudents(map)
        setAllStudents(studs)
      }
    } else {
      setStudents({}); setAllStudents([])
    }
  }

  // ── Pass actions ─────────────────────────────────────────────────────────
  async function handleCheckOut(reason) {
    if (!selectedStudent || !activePeriod) return
    setCheckingOut(true)
    const room = selectedRoom || currentTeacher.room?.split(',')[0]?.trim() || '27'
    await supabase.from('passes').insert({
      student_id: selectedStudent.id,
      reason,
      room,
      period: activePeriod,
      teacher_id: currentTeacher.id,
      time_out: new Date().toISOString(),
    })
    setCheckingOut(false)
    closeSheet()
    loadData()
  }

  async function handleCheckIn(passId) {
    setCheckingIn(passId)
    const pass = activePasses.find(p => p.id === passId)
    const mins = Math.floor((Date.now() - new Date(pass.time_out).getTime()) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    setCheckingIn(null)
    loadData()
  }

  async function handleApproveHold(hold) {
    const room = selectedRoom || currentTeacher.room?.split(',')[0]?.trim() || '27'
    await supabase.from('pass_holds').delete().eq('id', hold.id)
    await supabase.from('passes').insert({
      student_id: hold.student_id,
      reason: hold.reason,
      room,
      period: hold.period,
      teacher_id: currentTeacher.id,
      time_out: new Date().toISOString(),
    })
    loadData()
  }

  async function handleDenyHold(holdId) {
    await supabase.from('pass_holds').delete().eq('id', holdId)
    loadData()
  }

  function openSheet() {
    setShowSheet(true); setSheetView('students')
    setSelectedStudent(null); setStudentSearch('')
    setTimeout(() => searchRef.current?.focus(), 100)
  }

  function closeSheet() {
    setShowSheet(false); setSheetView('students')
    setSelectedStudent(null); setStudentSearch('')
  }

  // ── Render: loading ───────────────────────────────────────────────────────
  if (authLoading || (session && teacherLoading)) return (
    <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
      <div style={{ width: 32, height: 32, border: `3px solid ${RHS_GREEN}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  // ── Render: login ─────────────────────────────────────────────────────────
  if (!session || !currentTeacher) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', padding: '24px 20px' }}>
      <div style={{ width: 56, height: 56, background: RHS_GREEN, borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, fontSize: 28 }}>🎫</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>PassAble Mobile</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 32px' }}>Sign in to manage passes</p>
      <form onSubmit={handleSignIn} style={{ width: '100%', maxWidth: 380, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          placeholder="School email (@rjusd.org)"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ padding: '15px 16px', fontSize: 16, border: '2px solid #e5e7eb', borderRadius: 12, outline: 'none', background: 'white', boxSizing: 'border-box' }}
        />
        <input
          type="password"
          placeholder="Passcode"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ padding: '15px 16px', fontSize: 16, border: '2px solid #e5e7eb', borderRadius: 12, outline: 'none', background: 'white', boxSizing: 'border-box' }}
        />
        {authError && <p style={{ color: '#dc2626', fontSize: 14, margin: 0 }}>{authError}</p>}
        <button
          type="submit"
          disabled={signingIn || !email || !password}
          style={{ padding: '15px 16px', fontSize: 16, fontWeight: 700, color: 'white', background: RHS_GREEN, border: 'none', borderRadius: 12, cursor: 'pointer', opacity: (signingIn || !email || !password) ? 0.5 : 1, marginTop: 4 }}
        >
          {signingIn ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
      <a href="/teacher" style={{ marginTop: 24, fontSize: 13, color: '#9ca3af', textDecoration: 'none' }}>← Full teacher dashboard</a>
    </div>
  )

  // ── Derived values ────────────────────────────────────────────────────────
  const teacherRooms = (currentTeacher.room || '27').split(',').map(r => r.trim()).filter(Boolean)
  const room = selectedRoom || teacherRooms[0] || '27'
  const outPasses = activePasses.map(p => ({ ...p, student: students[p.student_id] }))
  const alreadyOut = new Set(activePasses.map(p => p.student_id))
  const availableStudents = allStudents.filter(s =>
    !alreadyOut.has(s.id) &&
    (studentSearch === '' || s.full_name.toLowerCase().includes(studentSearch.toLowerCase()))
  )

  // ── Render: main UI ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: '#f3f4f6', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* ── Sticky header ── */}
      <div style={{ background: RHS_GREEN, color: 'white', padding: '14px 16px 10px', position: 'sticky', top: 0, zIndex: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Rm {room} · {currentTeacher.name?.split(' ')[0]}</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 1 }}>PassAble Mobile</div>
          </div>
          <button onClick={() => supabase.auth.signOut()}
            style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', background: 'transparent', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>

        {/* Multi-room picker */}
        {teacherRooms.length > 1 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {teacherRooms.map(r => (
              <button key={r}
                onClick={() => { setSelectedRoom(r); sessionStorage.setItem(`passable_room_${currentTeacher.id}`, r) }}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer', background: room === r ? 'white' : 'rgba(255,255,255,0.2)', color: room === r ? RHS_GREEN : 'rgba(255,255,255,0.85)' }}>
                Rm {r}
              </button>
            ))}
          </div>
        )}

        {/* Period pills */}
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
          {PERIODS.map(p => (
            <button key={p}
              onClick={() => setActivePeriod(p)}
              style={{ flexShrink: 0, fontSize: 13, padding: '5px 13px', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer', background: activePeriod === p ? 'white' : 'rgba(255,255,255,0.2)', color: activePeriod === p ? RHS_GREEN : 'rgba(255,255,255,0.85)' }}>
              P{p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, padding: 16, paddingBottom: 100 }}>

        {/* No period selected */}
        {!activePeriod && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9ca3af' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👆</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Tap a period above to start</div>
          </div>
        )}

        {/* ── Pending holds ── */}
        {activePeriod && heldPasses.length > 0 && (
          <section style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              ⏳ Pending Approval ({heldPasses.length})
            </div>
            {heldPasses.map(hold => {
              const s = students[hold.student_id]
              const photo = getPhotoUrl(s)
              return (
                <div key={hold.id} style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: 14, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {photo
                      ? <img src={photo} alt="" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fde68a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
                    }
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{s?.full_name || 'Student'}</div>
                      <div style={{ fontSize: 13, color: '#92400e' }}>{hold.reason}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => handleApproveHold(hold)}
                      style={{ flex: 1, padding: '12px 0', fontWeight: 700, fontSize: 15, background: RHS_GREEN, color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                      ✓ Approve
                    </button>
                    <button onClick={() => handleDenyHold(hold.id)}
                      style={{ flex: 1, padding: '12px 0', fontWeight: 700, fontSize: 15, background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: 10, cursor: 'pointer' }}>
                      ✗ Deny
                    </button>
                  </div>
                </div>
              )
            })}
          </section>
        )}

        {/* ── Currently out ── */}
        {activePeriod && (
          <section>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
              Currently Out {outPasses.length > 0 ? `(${outPasses.length})` : ''}
            </div>

            {outPasses.length === 0 ? (
              <div style={{ background: 'white', borderRadius: 14, padding: '28px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                No students currently out
              </div>
            ) : (
              outPasses.map(p => {
                const mins = elapsed(p.time_out)
                const isLong = mins >= 10
                const photo = getPhotoUrl(p.student)
                return (
                  <div key={p.id}
                    style={{ background: 'white', borderRadius: 14, padding: 14, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12, border: isLong ? '2px solid #fca5a5' : '1px solid #e5e7eb' }}>
                    {photo
                      ? <img src={photo} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                      : <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>👤</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.student?.full_name || 'Unknown'}</div>
                      <div style={{ fontSize: 13, color: isLong ? '#dc2626' : '#6b7280', fontWeight: isLong ? 600 : 400 }}>{p.reason} · {mins}m ago {isLong ? '⚠️' : ''}</div>
                    </div>
                    <button onClick={() => handleCheckIn(p.id)}
                      disabled={checkingIn === p.id}
                      style={{ padding: '10px 16px', fontWeight: 700, fontSize: 14, background: checkingIn === p.id ? '#e5e7eb' : '#dcfce7', color: checkingIn === p.id ? '#9ca3af' : '#16a34a', border: 'none', borderRadius: 10, cursor: 'pointer', flexShrink: 0 }}>
                      {checkingIn === p.id ? '…' : '✓ Back'}
                    </button>
                  </div>
                )
              })
            )}
          </section>
        )}
      </div>

      {/* ── Fixed bottom checkout button ── */}
      {activePeriod && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '12px 16px env(safe-area-inset-bottom)', background: 'white', borderTop: '1px solid #e5e7eb', zIndex: 20 }}>
          <button onClick={openSheet}
            style={{ width: '100%', padding: '16px 0', fontSize: 17, fontWeight: 800, color: 'white', background: RHS_GREEN, border: 'none', borderRadius: 14, cursor: 'pointer' }}>
            + Check Out Student
          </button>
        </div>
      )}

      {/* ── Bottom sheet (checkout flow) ── */}
      {showSheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          {/* Backdrop */}
          <div onClick={closeSheet} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />

          {/* Sheet */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'white', borderRadius: '22px 22px 0 0', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
              <div style={{ width: 40, height: 4, background: '#e5e7eb', borderRadius: 2 }} />
            </div>

            {/* ── View: student picker ── */}
            {sheetView === 'students' && (
              <>
                <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', marginBottom: 10 }}>Select Student</div>
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Search by name…"
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    style={{ width: '100%', padding: '11px 14px', fontSize: 16, border: '2px solid #e5e7eb', borderRadius: 10, outline: 'none', background: '#f9fafb', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
                  {availableStudents.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, padding: '32px 0' }}>
                      {studentSearch ? 'No students match that name' : allStudents.length === 0 ? 'No students loaded for this period' : 'All students are currently out'}
                    </div>
                  )}
                  {availableStudents.map(s => {
                    const isDnlo = dnloList.includes(s.id)
                    const photo = getPhotoUrl(s)
                    return (
                      <button key={s.id}
                        onClick={() => { setSelectedStudent(s); setSheetView('destination') }}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', textAlign: 'left' }}>
                        {photo
                          ? <img src={photo} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          : <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>👤</div>
                        }
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 600, color: isDnlo ? '#dc2626' : '#111827' }}>
                            {s.full_name} {isDnlo ? '⛔' : ''}
                          </div>
                          {isDnlo && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 1 }}>Do Not Let Out</div>}
                        </div>
                        <span style={{ color: '#d1d5db', fontSize: 20, fontWeight: 300 }}>›</span>
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {/* ── View: destination picker ── */}
            {sheetView === 'destination' && selectedStudent && (
              <>
                <div style={{ padding: '4px 16px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setSheetView('students')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: RHS_GREEN, fontWeight: 700, fontSize: 14, padding: '4px 0', flexShrink: 0 }}>
                    ← Back
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedStudent.full_name}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>Where are they going?</div>
                  </div>
                </div>

                {dnloList.includes(selectedStudent.id) && (
                  <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 10, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                    ⛔ Do Not Let Out — selecting a destination will override and log this action
                  </div>
                )}

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {REASONS.map(({ label, emoji }) => (
                      <button key={label}
                        onClick={() => handleCheckOut(label)}
                        disabled={checkingOut}
                        style={{ padding: '20px 12px', fontSize: 15, fontWeight: 700, color: checkingOut ? '#9ca3af' : '#111827', background: checkingOut ? '#f9fafb' : '#f3f4f6', border: '2px solid #e5e7eb', borderRadius: 14, cursor: checkingOut ? 'default' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, transition: 'background 0.1s' }}>
                        <span style={{ fontSize: 28 }}>{emoji}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeacherMobilePage() {
  return (
    <Suspense fallback={
      <div style={{ height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #006938', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <MobilePageInner />
    </Suspense>
  )
}
