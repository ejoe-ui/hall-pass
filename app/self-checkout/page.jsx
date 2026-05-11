'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'
const REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Water', 'Errand', 'On Assignment', 'School Store', 'Other']

function TimerDisplay({ checkoutTime }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(checkoutTime).getTime()
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }, 1000)
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
  const [studentId, setStudentId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentPhoto, setStudentPhoto] = useState('')
  const [period, setPeriod] = useState('')
  const [reason, setReason] = useState('')
  const [passId, setPassId] = useState(null)
  const [checkoutTime, setCheckoutTime] = useState(null)
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [openPass, setOpenPass] = useState(null)
  const [teacherName, setTeacherName] = useState('Mr. Joe')
  const [teacherRoom, setTeacherRoom] = useState('27')

  useEffect(() => {
    loadSettings()
    const sid = searchParams.get('student')
    if (sid) setStudentIdInput(sid)
  }, [])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['active_checkout_code', 'kiosk_return_required'])
    if (data) {
      const codeRow = data.find(r => r.key === 'active_checkout_code')
      const kioskRow = data.find(r => r.key === 'kiosk_return_required')
      if (codeRow) setValidCodes([codeRow.value])
      if (kioskRow) setKioskReturnRequired(kioskRow.value !== 'false')
    }
    const { data: t } = await supabase.from('teachers').select('name, room').eq('is_active', true).limit(1).maybeSingle()
    if (t) { setTeacherName(t.name || 'Mr. Joe'); setTeacherRoom(t.room || '27') }
  }

  function handleCodeDigit(digit) {
    const next = enteredCode + digit
    setEnteredCode(next)
    if (next.length === 4) {
      if (validCodes.includes(next)) {
        setCodeError(false)
        if (studentIdInput) {
          lookupStudent(studentIdInput)
        } else {
          setStage('id')
        }
      } else {
        setCodeError(true)
        setTimeout(() => { setEnteredCode(''); setCodeError(false) }, 1000)
      }
    }
  }

  async function lookupStudent(id) {
    setLoading(true); setError('')
    const { data: studs } = await supabase.from('students').select('id, full_name, photo_file, period').eq('id', id)
    if (!studs || studs.length === 0) {
      setError('Student not found. Check your ID and try again.')
      setLoading(false); return
    }
    const stud = studs[0]
    setStudentId(stud.id)
    setStudentName(stud.full_name)
    setPeriod(stud.period)

    if (stud.photo_file) {
      const { data: photoData } = await supabase.storage.from('student-photos').createSignedUrl(stud.photo_file, 3600)
      if (photoData?.signedUrl) setStudentPhoto(photoData.signedUrl)
    }

    // Check for open pass
    const { data: openPasses } = await supabase.from('passes').select('*').eq('student_id', stud.id).is('time_in', null)
    if (openPasses && openPasses.length > 0) {
      setOpenPass(openPasses[0])
      setCheckoutTime(openPasses[0].time_out)
      setStage('checkin')
      setLoading(false)
      return
    }

    setStage('reason')
    setLoading(false)
  }

  async function handleCheckout() {
    if (!reason) return
    setLoading(true)
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('passes').insert({
      student_id: studentId, reason, room: teacherRoom,
      period, teacher_id: null, time_out: now,
    }).select().single()

    if (error) { setError('Could not create pass. Try again.'); setLoading(false); return }
    setPassId(data.id)
    setCheckoutTime(now)

    // Load weekly stats
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0,0,0,0)
    const { data: weekPasses } = await supabase.from('passes').select('*')
      .eq('student_id', studentId).gte('time_out', weekStart.toISOString())

    if (weekPasses) {
      const completed = weekPasses.filter(p => p.duration_minutes != null)
      const totalMins = completed.reduce((s, p) => s + p.duration_minutes, 0)
      const reasonCounts = {}
      weekPasses.forEach(p => {
        const r = p.reason?.split(' — ')[0] || p.reason || 'Other'
        reasonCounts[r] = (reasonCounts[r] || 0) + 1
      })
      const topReason = Object.entries(reasonCounts).sort((a,b) => b[1]-a[1])[0]
      setStats({
        weekCount: weekPasses.length,
        totalMins,
        avgMins: completed.length > 0 ? Math.round(totalMins / completed.length) : 0,
        topReason: topReason ? `${topReason[0]} (${topReason[1]}x)` : '—',
      })
    }

    setStage('done')
    setLoading(false)
  }

  async function handleCheckin() {
    if (!openPass) return
    setLoading(true)
    const mins = Math.floor((new Date() - new Date(openPass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', openPass.id)
    setStage('checkin-done')
    setLoading(false)
  }

  async function handleSelfReturn() {
    if (!passId) return
    setLoading(true)
    const { data: pass } = await supabase.from('passes').select('*').eq('id', passId).single()
    if (pass) {
      const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
      await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    }
    setStage('returned')
    setLoading(false)
  }

  function reset() {
    setStage('code'); setEnteredCode(''); setStudentId(''); setStudentIdInput('')
    setStudentName(''); setStudentPhoto(''); setPeriod(''); setReason('')
    setPassId(null); setCheckoutTime(null); setStats(null); setError(''); setOpenPass(null)
  }

  // PIN: Enter session code
  if (stage === 'code') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Self-Checkout</h1>
      <p className="text-gray-400 text-sm mb-6">Room {teacherRoom} · Enter today's session code</p>
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
  )

  // Enter student ID
  if (stage === 'id') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-14 h-14 object-contain mb-3" />
      <h1 className="text-xl font-bold mb-1" style={{ color: RHS_GREEN }}>Enter Your Student ID</h1>
      <p className="text-gray-400 text-sm mb-6">Type your ID number</p>
      <input type="number" placeholder="Student ID"
        value={studentIdInput} onChange={e => setStudentIdInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && lookupStudent(studentIdInput)}
        className="w-full max-w-xs p-4 text-xl text-center border-2 rounded-xl bg-white text-gray-800 mb-4"
        style={{ borderColor: RHS_GREEN }} autoFocus />
      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
      <button onClick={() => lookupStudent(studentIdInput)} disabled={!studentIdInput || loading}
        className="px-8 py-3 text-white font-bold rounded-xl disabled:opacity-40"
        style={{ backgroundColor: RHS_GREEN }}>
        {loading ? 'Looking up...' : 'Continue →'}
      </button>
    </div>
  )

  // Select reason
  if (stage === 'reason') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
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
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
        {REASONS.map(r => (
          <button key={r} onClick={() => setReason(r)}
            className="py-3 text-sm font-medium rounded-xl border-2 transition-colors"
            style={reason === r
              ? { backgroundColor: RHS_GREEN, color: 'white', borderColor: RHS_GREEN }
              : { backgroundColor: 'white', color: '#374151', borderColor: '#e5e7eb' }}>
            {r}
          </button>
        ))}
      </div>
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      <button onClick={handleCheckout} disabled={!reason || loading}
        className="px-8 py-4 text-white text-lg font-bold rounded-xl disabled:opacity-30"
        style={{ backgroundColor: RHS_GREEN }}>
        {loading ? 'Checking out...' : 'Check Out'}
      </button>
      <button onClick={reset} className="mt-4 text-sm text-gray-400">← Back</button>
    </div>
  )

  // Checked out — timer + stats
  if (stage === 'done') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>

      {/* Big timer */}
      {checkoutTime && <TimerDisplay checkoutTime={checkoutTime} />}

      <h2 className="text-xl font-bold text-white mb-1">{studentName}</h2>
      <p className="text-green-200 text-sm mb-6">Checked out → {reason}</p>

      {/* Stats */}
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

      {kioskReturnRequired ? (
        <div className="bg-white/20 rounded-xl p-4 w-full max-w-xs text-center">
          <p className="text-white text-sm font-medium">Return to the kiosk to check back in when you're done.</p>
        </div>
      ) : (
        <button onClick={handleSelfReturn} disabled={loading}
          className="w-full max-w-xs py-4 bg-white font-bold text-lg rounded-xl disabled:opacity-40"
          style={{ color: RHS_GREEN }}>
          {loading ? 'Checking in...' : "✅ I'm Back"}
        </button>
      )}
    </div>
  )

  // Self-returned
  if (stage === 'returned') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welcome back, {studentName}!</h2>
      <p className="text-gray-500 mb-8">You've been checked back in.</p>
      <button onClick={reset} className="px-6 py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>Done</button>
    </div>
  )

  // Open pass — check in
  if (stage === 'checkin') return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>

      {/* Big timer for existing pass */}
      {checkoutTime && <TimerDisplay checkoutTime={checkoutTime} />}

      <div className="text-4xl mb-3">👋</div>
      <h2 className="text-2xl font-semibold text-white mb-2">Welcome back, {studentName}!</h2>
      <p className="text-green-200 mb-1">You're currently checked out</p>
      <p className="text-green-300 text-sm mb-8">Reason: {openPass?.reason}</p>
      <div className="flex gap-3">
        <button onClick={handleCheckin} disabled={loading}
          className="px-6 py-3 bg-white font-bold rounded-xl disabled:opacity-40"
          style={{ color: RHS_GREEN }}>
          {loading ? 'Checking in...' : 'Check Back In'}
        </button>
        <button onClick={reset}
          className="px-6 py-3 border border-white/40 text-white rounded-xl">
          Cancel
        </button>
      </div>
    </div>
  )

  // Check-in done
  if (stage === 'checkin-done') return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <div className="text-5xl mb-4">✅</div>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">Checked back in!</h2>
      <p className="text-gray-500 mb-8">{studentName} is back in class.</p>
      <button onClick={reset} className="px-6 py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>Done</button>
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
