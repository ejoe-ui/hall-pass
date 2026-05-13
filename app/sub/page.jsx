'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'
const TIME_LIMIT = 10
const REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Lockers', 'Errand', 'On Assignment', 'School Store', 'Other']
const PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function Sub() {
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [subCode, setSubCode] = useState('')
  const [teacherName, setTeacherName] = useState('Mr. Joe')
  const [teacherRoom, setTeacherRoom] = useState('27')
  const [activePeriod, setActivePeriod] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [todayPasses, setTodayPasses] = useState([])
  const [students, setStudents] = useState({})
  const [allStudents, setAllStudents] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})
  const [passCountMap, setPassCountMap] = useState({})
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [now, setNow] = useState(Date.now())
  const [checkoutMode, setCheckoutMode] = useState('manual')
  const [selfCheckoutCode, setSelfCheckoutCode] = useState('')
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [kioskReturnSaved, setKioskReturnSaved] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [selectedStudentPreview, setSelectedStudentPreview] = useState(null)

  useEffect(() => { loadSettings() }, [])

  useEffect(() => {
    if (!activePeriod) return
    loadData()
    const timer = setInterval(() => { setNow(Date.now()); loadData() }, 30000)
    return () => clearInterval(timer)
  }, [activePeriod])

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['sub_code', 'kiosk_return_required', 'active_checkout_code'])
    if (data) {
      const subRow = data.find(r => r.key === 'sub_code')
      const kioskRow = data.find(r => r.key === 'kiosk_return_required')
      const checkoutRow = data.find(r => r.key === 'active_checkout_code')
      if (subRow) setSubCode(subRow.value)
      if (kioskRow) setKioskReturnRequired(kioskRow.value !== 'false')
      if (checkoutRow) setSelfCheckoutCode(checkoutRow.value)
    }

    const { data: teacherData } = await supabase.from('teachers')
      .select('name, room').eq('is_active', true).limit(1).maybeSingle()
    if (teacherData) {
      setTeacherName(teacherData.name || 'Mr. Joe')
      setTeacherRoom(teacherData.room || '27')
    }
  }

  async function generateCheckoutCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString()
    setSelfCheckoutCode(code)
    await supabase.from('settings').update({ value: code }).eq('key', 'active_checkout_code')
  }

  async function saveKioskReturn(val) {
    await supabase.from('settings').upsert({ key: 'kiosk_return_required', value: val ? 'true' : 'false' })
    setKioskReturnRequired(val)
    setKioskReturnSaved(true)
    setTimeout(() => setKioskReturnSaved(false), 2000)
  }

  function handlePin(digit) {
    const next = code + digit
    setCode(next)
    if (next.length === 4) {
      if (subCode && next === subCode) {
        setUnlocked(true); setCodeError(false)
      } else {
        setCodeError(true)
        setTimeout(() => { setCode(''); setCodeError(false) }, 1000)
      }
    }
  }

  async function loadData() {
    const { data: passes } = await supabase
      .from('passes').select('*').is('time_in', null)
      .eq('period', activePeriod).order('time_out')

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { data: today } = await supabase
      .from('passes').select('*')
      .eq('period', activePeriod)
      .gte('time_out', todayStart.toISOString())
      .not('time_in', 'is', null)
      .order('time_out', { ascending: false })

    const { data: studs } = await supabase
      .from('students').select('id, full_name, photo_file')
      .eq('period', activePeriod).order('first_name')

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: recentPasses } = await supabase
      .from('passes').select('student_id')
      .eq('period', activePeriod)
      .gte('time_out', thirtyDaysAgo.toISOString())

    if (passes) setActivePasses(passes)
    if (today) setTodayPasses(today)

    if (studs) {
      setAllStudents(studs)
      const map = {}
      studs.forEach(s => map[s.id] = s)
      setStudents(map)

      const urls = {}
      for (const s of studs) {
        if (s.photo_file) {
          const { data } = await supabase.storage.from('student-photos').createSignedUrl(s.photo_file, 3600)
          if (data?.signedUrl) urls[s.id] = data.signedUrl
        }
      }
      setPhotoUrls(urls)
    }

    if (recentPasses) {
      const counts = {}
      recentPasses.forEach(p => { counts[p.student_id] = (counts[p.student_id] || 0) + 1 })
      setPassCountMap(counts)
    }
  }

  async function handleReturn(passId) {
    const pass = activePasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    loadData()
  }

  async function handleCheckout() {
    if (!selected || !reason) return
    await supabase.from('passes').insert({
      student_id: selected, reason, room: teacherRoom, period: activePeriod, teacher_id: null,
    })
    setSelected(''); setReason(''); setSelectedStudentPreview(null)
    loadData()
  }

  function handleStudentSelect(id) {
    setSelected(id)
    setSelectedStudentPreview(id ? allStudents.find(s => s.id === id) || null : null)
  }

  function elapsed(timeOut) { return Math.floor((now - new Date(timeOut)) / 60000) }
  function elapsedColor(mins) {
    if (mins >= TIME_LIMIT) return '#EF4444'
    if (mins >= TIME_LIMIT * 0.7) return '#F59E0B'
    return RHS_GREEN
  }

  function getFrequentFlyerBadge(studentId) {
    const count = passCountMap[studentId] || 0
    if (count >= 10) return { label: '🚨 High', color: '#FEE2E2', text: '#DC2626' }
    if (count >= 5) return { label: '⚠️ Frequent', color: '#FEF3C7', text: '#D97706' }
    return null
  }

  const overLimit = activePasses.filter(p => elapsed(p.time_out) >= TIME_LIMIT)
  const periodLabel = PERIODS.find(p => p.value === activePeriod)?.label

  if (!unlocked) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Substitute Login</h1>
      <p className="text-gray-400 text-sm mb-6">Room {teacherRoom} · {teacherName}</p>
      <p className="text-gray-500 mb-4">Enter substitute code</p>
      <div className={`text-4xl tracking-widest mb-6 font-mono ${codeError ? 'text-red-500' : 'text-gray-800'}`}>
        {code.length > 0 ? '●'.repeat(code.length) : '○○○○'}
      </div>
      <div className="grid grid-cols-3 gap-3 w-56 mb-6">
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
          <button key={i} onClick={() => d === '⌫' ? setCode(c => c.slice(0,-1)) : d !== '' && handlePin(String(d))}
            className="h-14 text-xl font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50 disabled:opacity-0"
            style={{ borderColor: '#e5e7eb', color: RHS_GREEN }} disabled={d === ''}>
            {d}
          </button>
        ))}
      </div>
      <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</a>
    </div>
  )

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Substitute Dashboard</h1>
      <p className="text-gray-400 text-sm mb-8">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => { setActivePeriod(p.value); generateCheckoutCode() }}
            className="py-4 text-lg font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50"
            style={{ borderColor: RHS_GREEN, color: RHS_GREEN }}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Substitute Dashboard</h1>
            <p className="text-green-200 text-xs">Room {teacherRoom} · {periodLabel} · {teacherName}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button onClick={() => setShowHistory(h => !h)} className="text-sm text-green-200 hover:text-white">
            {showHistory ? 'Hide History' : "Today's History"}
          </button>
          <button onClick={() => setActivePeriod(null)} className="text-sm text-green-200 hover:text-white">← Period</button>
          <a href="/" className="text-sm text-green-200 hover:text-white">Home</a>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {/* Stat Cards */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Currently Out', value: activePasses.length, color: activePasses.length > 0 ? '#EF4444' : RHS_GREEN },
            { label: `Over ${TIME_LIMIT} min`, value: overLimit.length, color: overLimit.length > 0 ? '#EF4444' : RHS_GREEN },
            { label: 'Out Today', value: todayPasses.length + activePasses.length, color: '#6b7280' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">{m.label}</div>
              <div className="text-2xl font-semibold" style={{ color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Today's History */}
        {showHistory && todayPasses.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Today's Completed Passes</span>
            </div>
            {todayPasses.map((pass, i) => (
              <div key={pass.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{students[pass.student_id]?.full_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{pass.reason}</span>
                </div>
                <div className="text-xs text-gray-400">{pass.duration_minutes}m</div>
                <div className="text-xs text-gray-400">{new Date(pass.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
              </div>
            ))}
          </div>
        )}

        {/* Active Passes + Checkout */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students Out</span>
            <button onClick={loadData} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
          </div>

          {activePasses.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">All students are in the classroom</div>
          ) : activePasses.map(pass => {
            const mins = elapsed(pass.time_out)
            const student = students[pass.student_id]
            const badge = getFrequentFlyerBadge(pass.student_id)
            return (
              <div key={pass.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100 flex items-center justify-center border-2"
                  style={{ borderColor: elapsedColor(mins) }}>
                  {photoUrls[pass.student_id]
                    ? <img src={photoUrls[pass.student_id]} alt="" className="w-full h-full object-cover" />
                    : <span className="text-xs font-medium text-white" style={{ backgroundColor: RHS_GREEN, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {student?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                      </span>
                  }
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{student?.full_name}</span>
                    {badge && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: badge.color, color: badge.text }}>{badge.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{pass.reason} · out at {new Date(pass.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                <span className="text-sm font-medium w-10 text-right" style={{ color: elapsedColor(mins) }}>{mins}m</span>
                <button onClick={() => handleReturn(pass.id)}
                  className="text-xs px-3 py-1.5 rounded-lg text-white"
                  style={{ backgroundColor: RHS_GREEN }}>
                  Return
                </button>
              </div>
            )
          })}

          {/* Checkout Mode Toggle */}
          <div className="px-4 pt-3 pb-1 border-t border-gray-100 bg-gray-50">
            <div className="flex gap-2 mb-3">
              <button onClick={() => setCheckoutMode('manual')}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                style={{ background: checkoutMode === 'manual' ? RHS_GREEN : 'white', color: checkoutMode === 'manual' ? 'white' : '#6b7280', borderColor: checkoutMode === 'manual' ? RHS_GREEN : '#d1d5db' }}>
                Manual Checkout
              </button>
              <button onClick={() => setCheckoutMode('self')}
                className="flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
                style={{ background: checkoutMode === 'self' ? RHS_GREEN : 'white', color: checkoutMode === 'self' ? 'white' : '#6b7280', borderColor: checkoutMode === 'self' ? RHS_GREEN : '#d1d5db' }}>
                Self-Checkout Mode
              </button>
            </div>
          </div>

          {/* Manual Checkout */}
          {checkoutMode === 'manual' && (
            <div className="px-4 pb-4 bg-gray-50 rounded-b-xl">
              <div className="text-xs font-medium text-gray-500 mb-2">Check out a student</div>

              {selectedStudentPreview && (
                <div className="flex items-center gap-3 mb-3 p-2 bg-white rounded-xl border border-gray-200">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    {photoUrls[selectedStudentPreview.id]
                      ? <img src={photoUrls[selectedStudentPreview.id]} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                          {selectedStudentPreview.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                        </div>
                    }
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-800">{selectedStudentPreview.full_name}</div>
                    {getFrequentFlyerBadge(selectedStudentPreview.id) && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: getFrequentFlyerBadge(selectedStudentPreview.id).color, color: getFrequentFlyerBadge(selectedStudentPreview.id).text }}>
                        {getFrequentFlyerBadge(selectedStudentPreview.id).label} · {passCountMap[selectedStudentPreview.id] || 0} passes (30 days)
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 mb-3">
                <select value={selected} onChange={e => handleStudentSelect(e.target.value)}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Student —</option>
                  {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
                <select value={reason} onChange={e => setReason(e.target.value)}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Reason —</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={handleCheckout} disabled={!selected || !reason}
                  className="px-4 py-2 text-sm rounded-lg disabled:opacity-30 font-medium text-white"
                  style={{ backgroundColor: RHS_GREEN }}>
                  Send
                </button>
              </div>

              {/* Kiosk return toggle — visible in manual mode too */}
              <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                <span className="text-xs text-gray-600">Kiosk return required:</span>
                <button onClick={() => saveKioskReturn(!kioskReturnRequired)}
                  className="px-3 py-1 rounded-full text-xs font-semibold"
                  style={{ background: kioskReturnRequired ? RHS_GREEN : '#e5e7eb', color: kioskReturnRequired ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>
                  {kioskReturnRequired ? 'ON' : 'OFF'}
                </button>
                {kioskReturnSaved && <span className="text-xs" style={{ color: RHS_GREEN }}>✓ Saved</span>}
                <span className="text-xs text-gray-400">
                  {kioskReturnRequired ? '— students must scan at kiosk' : '— students see "I\'m Back" button'}
                </span>
              </div>
            </div>
          )}

          {/* Self-Checkout Mode */}
          {checkoutMode === 'self' && (
            <div className="px-4 pb-4 bg-gray-50 rounded-b-xl">
              <div className="text-center py-4">
                <div className="text-5xl font-black tracking-widest text-gray-800 mb-2 font-mono">{selfCheckoutCode || '—'}</div>
                <div className="text-sm text-gray-500 mb-1">Session code — share with students</div>
                <div className="text-xs text-gray-400 mb-3">
                  Students go to <span className="font-mono font-semibold">hall-pass-lime.vercel.app/self-checkout</span>
                </div>
                <button onClick={generateCheckoutCode}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 mb-3">
                  🔄 Generate New Code
                </button>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-xs text-gray-600">Kiosk return required:</span>
                  <button onClick={() => saveKioskReturn(!kioskReturnRequired)}
                    className="px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: kioskReturnRequired ? RHS_GREEN : '#e5e7eb', color: kioskReturnRequired ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>
                    {kioskReturnRequired ? 'ON' : 'OFF'}
                  </button>
                  {kioskReturnSaved && <span className="text-xs" style={{ color: RHS_GREEN }}>✓ Saved</span>}
                </div>
                <div className="text-xs text-gray-400 mt-2">
                  {kioskReturnRequired ? 'Students must scan at kiosk to return' : "Students see an \"I'm Back\" button"}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          ⚠ Substitute view only — settings and QR management are not available. Contact {teacherName} for PIN changes.
        </div>
      </div>
    </div>
  )
}
