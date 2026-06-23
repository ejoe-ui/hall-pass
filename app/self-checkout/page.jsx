/*
  PassAble — RHS Hall Pass System
  FILE:    app/self-checkout/page.jsx
  ROUTE:   /self-checkout
  PURPOSE: Student-facing self-checkout — enter session code, look up by ID or QR scan,
           select reason (with same conditional inputs as kiosk), check out / check in.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, passes, settings)
  UPDATED: 2026-06-22 — green header; code fallback chain; numeric keypad on ID screen;
           opt-in QR scanner; full reason inputs (On Assignment, Errand, Other);
           fixed photo bucket (lifetouch-raw); kiosk-return polling → green thank-you screen
*/

'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'

const REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Lockers', 'Errand', 'On Assignment', 'Career Counselor', 'School Store', 'Other']

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Joe', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

// ── QR / barcode scanner (opt-in) ────────────────────────────────────────────
function QRScanner({ onScan }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let stream, interval
    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (videoRef.current) videoRef.current.srcObject = stream
        if (!('BarcodeDetector' in window)) return
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        interval = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return
          try {
            const codes = await detector.detect(videoRef.current)
            if (codes.length > 0) {
              const val = codes[0].rawValue
              onScan(val)
            }
          } catch (e) {}
        }, 500)
      } catch (e) {}
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
      if (interval) clearInterval(interval)
    }
  }, [])

  return (
    <div className="relative w-full max-w-xs mx-auto rounded-2xl overflow-hidden border-2" style={{ borderColor: RHS_GREEN }}>
      <video ref={videoRef} autoPlay playsInline muted className="w-full" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 border-2 border-white rounded-xl opacity-60" />
      </div>
    </div>
  )
}

// ── Elapsed timer on checkout screen ─────────────────────────────────────────
function TimerDisplay({ checkoutTime }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(checkoutTime).getTime()
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [checkoutTime])
  const mins = Math.floor(elapsed / 60)
  const secs = elapsed % 60
  const isOver10 = mins >= 10
  return (
    <div style={{ textAlign: 'center', marginBottom: 24 }}>
      <div style={{
        fontSize: 96, fontWeight: 900, fontFamily: 'monospace', lineHeight: 1,
        color: isOver10 ? '#EF4444' : 'white',
        textShadow: isOver10 ? '0 0 30px rgba(239,68,68,0.5)' : '0 0 30px rgba(255,255,255,0.3)',
        transition: 'color 0.5s'
      }}>
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 14, color: isOver10 ? '#FCA5A5' : 'rgba(255,255,255,0.7)', marginTop: 4 }}>
        {isOver10 ? '⚠ Time to wrap up and head back' : 'Time out of class'}
      </div>
    </div>
  )
}

function SelfCheckoutInner() {
  const searchParams = useSearchParams()
  const [stage, setStage] = useState('code')
  const [validCodes, setValidCodes] = useState([])
  const [enteredCode, setEnteredCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [studentIdInput, setStudentIdInput] = useState('')
  const [showQR, setShowQR] = useState(false)
  const [studentId, setStudentId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentPhoto, setStudentPhoto] = useState('')
  const [period, setPeriod] = useState('')
  const [reason, setReason] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [errandTeacher, setErrandTeacher] = useState('')
  const [purposeText, setPurposeText] = useState('')
  const [otherText, setOtherText] = useState('')
  const [passId, setPassId] = useState(null)
  const [checkoutTime, setCheckoutTime] = useState(null)
  const [checkoutReason, setCheckoutReason] = useState('')
  const [returnedDuration, setReturnedDuration] = useState(null)
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openPass, setOpenPass] = useState(null)
  const [teacherName, setTeacherName] = useState('Teacher')
  const [teacherRoom, setTeacherRoom] = useState('27')
  const [teacherId, setTeacherId] = useState(null)

  useEffect(() => {
    loadSettings()
    const sid = searchParams.get('student')
    if (sid) setStudentIdInput(sid)
  }, [])

  // Poll for kiosk check-in while student is on the red "done" screen
  useEffect(() => {
    if (stage !== 'done' || !passId) return
    const interval = setInterval(async () => {
      const { data: pass } = await supabase.from('passes').select('time_in, time_out, duration_minutes').eq('id', passId).single()
      if (pass?.time_in) {
        clearInterval(interval)
        const mins = pass.duration_minutes ?? Math.floor((new Date(pass.time_in) - new Date(pass.time_out)) / 60000)
        setReturnedDuration(mins)
        try { document.exitFullscreen?.() } catch(e) {}
        if (window._passableUnload) { window.removeEventListener('beforeunload', window._passableUnload); delete window._passableUnload }
        setStage('kiosk-returned')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [stage, passId])

  async function loadSettings() {
    const { data: settingsData } = await supabase
      .from('settings').select('key, value')
      .in('key', ['kiosk_return_required'])

    const kioskRow = settingsData?.find(r => r.key === 'kiosk_return_required')
    if (kioskRow) setKioskReturnRequired(kioskRow.value !== 'false')

    let room = searchParams.get('room') || '27'
    let teacher = null

    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: t } = await supabase.from('teachers')
        .select('id, name, room, unlock_code, session_code').eq('auth_id', session.user.id).eq('is_active', true).maybeSingle()
      if (t) teacher = t
    }
    if (!teacher) {
      const { data: t } = await supabase.from('teachers')
        .select('id, name, room, unlock_code, session_code').eq('room', room).eq('is_active', true).maybeSingle()
      if (t) teacher = t
    }
    if (teacher) {
      setTeacherName(teacher.name || 'Teacher')
      setTeacherRoom(teacher.room || room)
      setTeacherId(teacher.id || null)
      room = teacher.room || room
    }

    // Fallback chain: teacher session_code (per-class) → unlock_code → room doubled
    const codes = [teacher?.session_code, teacher?.unlock_code, `${room}${room}`].filter(Boolean)
    setValidCodes(codes)
  }

  function handleCodeDigit(digit) {
    const next = enteredCode + digit
    setEnteredCode(next)
    if (next.length === 4) {
      if (validCodes.includes(next)) {
        setCodeError(false)
        studentIdInput ? lookupStudent(studentIdInput) : setStage('id')
      } else {
        setCodeError(true)
        setTimeout(() => { setEnteredCode(''); setCodeError(false) }, 1000)
      }
    }
  }

  function handleIdDigit(digit) {
    if (digit === '⌫') { setStudentIdInput(v => v.slice(0, -1)); return }
    setStudentIdInput(v => v + digit)
  }

  function handleReasonSelect(r) {
    setReason(r); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText(''); setOtherText('')
  }

  async function lookupStudent(id) {
    setLoading(true); setError('')
    const { data: studs } = await supabase.from('students')
      .select('id, full_name, photo_file, photo_url, period').eq('id', id)

    if (!studs || studs.length === 0) {
      setError('Student not found. Check your ID and try again.')
      setLoading(false); return
    }

    const stud = studs[0]
    setStudentId(stud.id)
    setStudentName(stud.full_name)
    setPeriod(stud.period)

    if (stud.photo_url) {
      setStudentPhoto(stud.photo_url)
    } else if (stud.photo_file) {
      const { data: photoData } = await supabase.storage
        .from('lifetouch-raw').createSignedUrl(stud.photo_file, 3600)
      if (photoData?.signedUrl) setStudentPhoto(photoData.signedUrl)
    }

    const { data: openPasses } = await supabase.from('passes')
      .select('*').eq('student_id', stud.id).is('time_in', null)
    if (openPasses?.length > 0) {
      setOpenPass(openPasses[0]); setCheckoutTime(openPasses[0].time_out)
      setStage('checkin'); setLoading(false); return
    }

    setStage('reason'); setLoading(false)
  }

  async function handleCheckout() {
    if (!reason) return
    setLoading(true)
    let finalReason = reason
    if (reason === 'On Assignment' && assignedTeacher)
      finalReason = purposeText.trim() ? `On Assignment — ${assignedTeacher} — ${purposeText.trim()}` : `On Assignment — ${assignedTeacher}`
    else if (reason === 'Errand' && errandTeacher)
      finalReason = purposeText.trim() ? `Errand — ${errandTeacher} — ${purposeText.trim()}` : `Errand — ${errandTeacher}`
    else if (reason === 'Errand' && purposeText.trim())
      finalReason = `Errand — ${purposeText.trim()}`
    else if (reason === 'Other' && otherText)
      finalReason = `Other — ${otherText}`

    const now = new Date().toISOString()
    const { data, error: insertError } = await supabase.from('passes').insert({
      student_id: studentId, reason: finalReason, room: teacherRoom,
      period, teacher_id: teacherId, time_out: now,
    }).select().single()

    if (insertError) { setError('Could not create pass. Try again.'); setLoading(false); return }
    setPassId(data.id); setCheckoutTime(now); setCheckoutReason(finalReason)

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0,0,0,0)
    const { data: weekPasses } = await supabase.from('passes')
      .select('*').eq('student_id', studentId).gte('time_out', weekStart.toISOString())
    if (weekPasses) {
      const completed = weekPasses.filter(p => p.duration_minutes != null)
      const totalMins = completed.reduce((s, p) => s + p.duration_minutes, 0)
      const reasonCounts = {}
      weekPasses.forEach(p => {
        const r = p.reason?.split(' — ')[0] || p.reason || 'Other'
        reasonCounts[r] = (reasonCounts[r] || 0) + 1
      })
      const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]
      setStats({
        weekCount: weekPasses.length, totalMins,
        avgMins: completed.length > 0 ? Math.round(totalMins / completed.length) : 0,
        topReason: topReason ? `${topReason[0]} (${topReason[1]}x)` : '—',
      })
    }
    setStage('done'); setLoading(false)
    // Go fullscreen and warn on tab close
    try { document.documentElement.requestFullscreen?.() } catch(e) {}
    window._passableUnload = () => 'Please check back in at the classroom kiosk before leaving.'
    window.addEventListener('beforeunload', window._passableUnload)
  }

  async function handleCheckin() {
    if (!openPass) return
    setLoading(true)
    const mins = Math.floor((new Date() - new Date(openPass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', openPass.id)
    setStage('checkin-done'); setLoading(false)
  }

  async function handleSelfReturn() {
    if (!passId) return
    setLoading(true)
    const { data: pass } = await supabase.from('passes').select('*').eq('id', passId).single()
    if (pass) {
      const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
      await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    }
    setStage('returned'); setLoading(false)
  }

  function reset() {
    try { document.exitFullscreen?.() } catch(e) {}
    if (window._passableUnload) { window.removeEventListener('beforeunload', window._passableUnload); delete window._passableUnload }
    setStage('code'); setEnteredCode(''); setStudentId(''); setStudentIdInput('')
    setStudentName(''); setStudentPhoto(''); setPeriod(''); setReason('')
    setAssignedTeacher(''); setErrandTeacher(''); setPurposeText(''); setOtherText('')
    setPassId(null); setCheckoutTime(null); setCheckoutReason(''); setReturnedDuration(null)
    setStats(null); setError(''); setOpenPass(null)
    setShowQR(false)
  }

  const checkoutDisabled = !reason ||
    (reason === 'On Assignment' && !assignedTeacher) ||
    (reason === 'Errand' && !errandTeacher && !purposeText.trim()) ||
    (reason === 'Other' && !otherText.trim())

  const Header = () => (
    <div className="w-full px-4 py-3 flex items-center gap-3" style={{ backgroundColor: RHS_GREEN }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain"
        style={{ filter: 'brightness(0) invert(1)' }} />
      <div>
        <p className="text-white font-bold text-sm leading-tight">RHS PassAble</p>
        <p className="text-green-200 text-xs leading-tight">Self-Checkout · Room {teacherRoom}</p>
      </div>
    </div>
  )

  // ── Code entry ────────────────────────────────────────────────────────────
  if (stage === 'code') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
        <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Self-Checkout</h1>
        <p className="text-gray-400 text-sm mb-6">Enter today's session code</p>
        <div className={`text-4xl tracking-widest mb-6 font-mono ${codeError ? 'text-red-500' : 'text-gray-800'}`}>
          {enteredCode.length > 0 ? '●'.repeat(enteredCode.length) : '○○○○'}
        </div>
        <div className="grid grid-cols-3 gap-3 w-56 mb-4">
          {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
            <button key={i}
              onClick={() => d === '⌫' ? setEnteredCode(c => c.slice(0,-1)) : d !== '' && handleCodeDigit(String(d))}
              className="h-14 text-xl font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50 disabled:opacity-0"
              style={{ borderColor: '#e5e7eb', color: RHS_GREEN }} disabled={d === ''}>
              {d}
            </button>
          ))}
        </div>
        {codeError && <p className="text-red-500 text-sm">Incorrect code — try again</p>}
      </div>
    </div>
  )

  // ── Student ID entry ──────────────────────────────────────────────────────
  if (stage === 'id') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: RHS_GREEN }}>Enter Your Student ID</h1>
        <p className="text-gray-400 text-sm mb-4">Type or tap your ID number</p>

        {showQR ? (
          <div className="w-full max-w-xs mb-4">
            <QRScanner onScan={id => { setShowQR(false); lookupStudent(id) }} />
            <button onClick={() => setShowQR(false)} className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600">
              ← Use keypad instead
            </button>
          </div>
        ) : (
          <>
            {/* Text input for keyboard users */}
            <input type="number" placeholder="Student ID"
              value={studentIdInput} onChange={e => setStudentIdInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && studentIdInput && lookupStudent(studentIdInput)}
              className="w-full max-w-xs p-4 text-xl text-center border-2 rounded-xl bg-white text-gray-800 mb-4"
              style={{ borderColor: RHS_GREEN }} />

            {/* Numeric keypad for touchscreen */}
            <div className="grid grid-cols-3 gap-3 w-56 mb-4">
              {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
                <button key={i}
                  onClick={() => d !== '' && handleIdDigit(d === '⌫' ? '⌫' : String(d))}
                  className="h-14 text-xl font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50 disabled:opacity-0"
                  style={{ borderColor: '#e5e7eb', color: RHS_GREEN }} disabled={d === ''}>
                  {d}
                </button>
              ))}
            </div>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

            <button onClick={() => lookupStudent(studentIdInput)} disabled={!studentIdInput || loading}
              className="px-8 py-3 text-white font-bold rounded-xl disabled:opacity-40 mb-4"
              style={{ backgroundColor: RHS_GREEN }}>
              {loading ? 'Looking up...' : 'Continue →'}
            </button>

            <button onClick={() => setShowQR(true)}
              className="text-sm hover:opacity-70" style={{ color: RHS_GREEN }}>
              📷 Scan QR badge instead
            </button>
          </>
        )}
      </div>
    </div>
  )

  // ── Reason selection ──────────────────────────────────────────────────────
  if (stage === 'reason') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-6">
        <div className="flex items-center gap-4 mb-6">
          {studentPhoto
            ? <img src={studentPhoto} alt="" className="w-16 h-16 rounded-full object-cover border-2" style={{ borderColor: RHS_GREEN }} />
            : <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                {studentName.split(' ').map(n => n[0]).slice(0,2).join('')}
              </div>
          }
          <div>
            <h1 className="text-xl font-bold text-gray-800">{studentName}</h1>
            <p className="text-gray-400 text-sm">Where are you going?</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-4">
          {REASONS.map(r => (
            <button key={r} onClick={() => handleReasonSelect(r)}
              className="py-3 text-sm font-medium rounded-xl border-2 transition-colors"
              style={reason === r
                ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
                : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
              {r}
            </button>
          ))}
        </div>

        {reason === 'On Assignment' && (
          <div className="w-full max-w-xs flex flex-col gap-2 mb-4">
            <select value={assignedTeacher} onChange={e => setAssignedTeacher(e.target.value)}
              className="w-full p-3 text-base border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
              <option value="">— Select a teacher —</option>
              {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" placeholder="Purpose (e.g. picking up worksheets)"
              value={purposeText} onChange={e => setPurposeText(e.target.value)}
              className="w-full p-3 text-base border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
          </div>
        )}
        {reason === 'Errand' && (
          <div className="w-full max-w-xs flex flex-col gap-2 mb-4">
            <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)}
              className="w-full p-3 text-base border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
              <option value="">— Select a teacher (optional) —</option>
              {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" placeholder="Purpose (e.g. returning equipment)"
              value={purposeText} onChange={e => setPurposeText(e.target.value)}
              className="w-full p-3 text-base border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
          </div>
        )}
        {reason === 'Other' && (
          <div className="w-full max-w-xs mb-4">
            <input type="text" placeholder="Where are you going?"
              value={otherText} onChange={e => setOtherText(e.target.value)}
              className="w-full p-3 text-base border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} autoFocus />
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <button onClick={handleCheckout} disabled={checkoutDisabled || loading}
          className="px-8 py-4 text-white text-lg font-bold rounded-xl disabled:opacity-30"
          style={{ backgroundColor: RHS_GREEN }}>
          {loading ? 'Checking out...' : 'Check Out'}
        </button>
        <button onClick={reset} className="mt-4 text-sm text-gray-400">← Back</button>
      </div>
    </div>
  )

  // ── Checked out ───────────────────────────────────────────────────────────
  if (stage === 'done') return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #b91c1c 0%, #7f1d1d 100%)' }}>
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {checkoutTime && <TimerDisplay checkoutTime={checkoutTime} />}
        <h2 className="text-xl font-bold text-white mb-1">{studentName}</h2>
        <p className="text-red-200 text-sm mb-6">Checked out → {reason}</p>
        {stats && (
          <div className="bg-white rounded-2xl p-5 w-full max-w-xs mb-6 shadow-xl">
            <h3 className="text-sm font-bold text-gray-700 mb-3">📊 Your Stats This Week</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black" style={{ color: RHS_GREEN }}>{stats.weekCount}</div>
                <div className="text-xs text-gray-500 mt-0.5">passes this week</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black" style={{ color: RHS_GREEN }}>{stats.totalMins}m</div>
                <div className="text-xs text-gray-500 mt-0.5">total minutes out</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-black" style={{ color: RHS_GREEN }}>{stats.avgMins}m</div>
                <div className="text-xs text-gray-500 mt-0.5">avg per pass</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-xs font-bold text-gray-700 mt-1 leading-tight">{stats.topReason}</div>
                <div className="text-xs text-gray-500 mt-0.5">top reason</div>
              </div>
            </div>
          </div>
        )}
        <div className="w-full max-w-xs mb-4 p-3 rounded-xl text-center text-sm font-medium text-white bg-white/20">
          📍 When you return, check back in at the classroom kiosk before closing this page.
        </div>
        {kioskReturnRequired ? (
          <div className="bg-white/20 rounded-xl p-4 w-full max-w-xs text-center">
            <p className="text-white text-sm font-medium">If the kiosk is not available, ask your teacher or sub to check you back in.</p>
          </div>
        ) : (
          <button onClick={handleSelfReturn} disabled={loading}
            className="w-full max-w-xs py-4 bg-white font-bold text-lg rounded-xl disabled:opacity-40"
            style={{ color: RHS_GREEN }}>
            {loading ? 'Checking in...' : "✅ I'm Back"}
          </button>
        )}
      </div>
    </div>
  )

  // ── Kiosk checked them back in ────────────────────────────────────────────
  if (stage === 'kiosk-returned') return (
    <div className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #006938 0%, #004a26 100%)' }}>
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl mb-6">✅</div>
        <h2 className="text-3xl font-bold text-white mb-2">Thanks for checking back in!</h2>
        <p className="text-green-200 text-lg mb-1">
          You were out for <span className="font-bold text-white">{returnedDuration} minute{returnedDuration !== 1 ? 's' : ''}</span>
        </p>
        {checkoutReason && (
          <p className="text-green-300 text-sm mb-8">Activity: {checkoutReason}</p>
        )}
        <div className="bg-white/20 rounded-2xl px-8 py-5 max-w-xs">
          <p className="text-white font-medium text-base">You may close this tab or window.</p>
        </div>
      </div>
    </div>
  )

  // ── Self-returned ─────────────────────────────────────────────────────────
  if (stage === 'returned') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welcome back, {studentName}!</h2>
        <p className="text-gray-500 mb-8">You've been checked back in.</p>
        <button onClick={reset} className="px-6 py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>Done</button>
      </div>
    </div>
  )

  // ── Already checked out → check in ───────────────────────────────────────
  if (stage === 'checkin') return (
    <div className="min-h-screen flex flex-col"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {checkoutTime && <TimerDisplay checkoutTime={checkoutTime} />}
        <div className="text-4xl mb-3">👋</div>
        <h2 className="text-2xl font-semibold text-white mb-2">Welcome back, {studentName}!</h2>
        <p className="text-green-200 mb-1">You're currently checked out</p>
        <p className="text-green-300 text-sm mb-8">Reason: {openPass?.reason}</p>
        <div className="flex gap-3">
          <button onClick={handleCheckin} disabled={loading}
            className="px-6 py-3 bg-white font-bold rounded-xl disabled:opacity-40" style={{ color: RHS_GREEN }}>
            {loading ? 'Checking in...' : 'Check Back In'}
          </button>
          <button onClick={reset} className="px-6 py-3 border border-white/40 text-white rounded-xl">Cancel</button>
        </div>
      </div>
    </div>
  )

  // ── Check-in confirmed ────────────────────────────────────────────────────
  if (stage === 'checkin-done') return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Checked back in!</h2>
        <p className="text-gray-500 mb-8">{studentName} is back in class.</p>
        <button onClick={reset} className="px-6 py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>Done</button>
      </div>
    </div>
  )

  return null
}

export default function SelfCheckout() {
  return (
    <Suspense>
      <SelfCheckoutInner />
    </Suspense>
  )
}
