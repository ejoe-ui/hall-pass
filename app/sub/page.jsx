/*
  PassAble — RHS Hall Pass System
  FILE:    app/sub/page.jsx
  ROUTE:   /sub
  URL:     https://hall-pass-lime.vercel.app/sub
  PURPOSE: Substitute teacher dashboard — PIN entry matches against per-teacher sub_code,
           hall pass checkout/return, self-checkout mode with room-specific session code.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, student_periods, passes, settings, pass_notifications)
  AUTH:    4-digit sub_code stored per-teacher in teachers.sub_code
  UPDATED: 2026-06-25 — updated reason list (Class Assignment, IT / Tech Support, removed Other + School Store); added teacher destination picker + pass_notifications for Class Assignment + Errand
*/

'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const RHS_GREEN = '#006938'
const TIME_LIMIT = 10
const REASONS = ['Restroom', 'Library', 'Lockers', 'Office', 'Counselor', 'Career Counselor', 'Errand', 'Class Assignment', 'IT / Tech Support']
const SHARED_DEST_REASONS = ['Office', 'Counselor', 'Career Counselor', 'IT / Tech Support']

export default function Sub() {
  const [unlocked, setUnlocked] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [allTeachers, setAllTeachers] = useState([])
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [teacherName, setTeacherName] = useState('')
  const [teacherRoom, setTeacherRoom] = useState('')
  const [teacherPeriods, setTeacherPeriods] = useState([])
  const [activePeriod, setActivePeriod] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [todayPasses, setTodayPasses] = useState([])
  const [students, setStudents] = useState({})
  const [allStudents, setAllStudents] = useState([])
  const [photoUrls, setPhotoUrls] = useState({})
  const [passCountMap, setPassCountMap] = useState({})
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState(null)  // { id, name } for Class Assignment
  const [errandTeacher, setErrandTeacher] = useState(null)       // { id, name } for Errand (optional)
  const [purposeText, setPurposeText] = useState('')
  const [now, setNow] = useState(Date.now())
  const [checkoutMode, setCheckoutMode] = useState('manual')
  const [selfCheckoutCode, setSelfCheckoutCode] = useState('')
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [kioskReturnSaved, setKioskReturnSaved] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [helpPos, setHelpPos] = useState({ x: 0, y: 80 })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef({ x: 0, y: 0 })
  const [selectedStudentPreview, setSelectedStudentPreview] = useState(null)

  useEffect(() => {
    if (showHelp) setHelpPos({ x: Math.max(0, window.innerWidth - 440), y: 80 })
  }, [showHelp])

  function startHelpDrag(e) {
    if (e.button !== 0) return
    const rect = helpPanelRef.current.getBoundingClientRect()
    helpDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    function onMove(e) {
      setHelpPos({
        x: Math.max(0, Math.min(window.innerWidth - 400, e.clientX - helpDragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - helpDragOffset.current.y)),
      })
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => { loadTeachers() }, [])

  useEffect(() => {
    if (!activePeriod || !currentTeacher) return
    loadData()
    const timer = setInterval(() => { setNow(Date.now()); loadData() }, 30000)
    return () => clearInterval(timer)
  }, [activePeriod, currentTeacher])

  // ── Load all active teachers for sub code matching ─────────────────────────
  async function loadTeachers() {
    const { data: teachers } = await supabase.from('teachers')
      .select('id, name, room, sub_code, session_code, periods, period_labels')
      .eq('is_active', true)
    if (teachers) setAllTeachers(teachers)

    const { data: settings } = await supabase.from('settings').select('key, value')
      .in('key', ['kiosk_return_required'])
    if (settings) {
      const kioskRow = settings.find(r => r.key === 'kiosk_return_required')
      if (kioskRow) setKioskReturnRequired(kioskRow.value !== 'false')
    }
  }

  // ── PIN entry — matches against teachers.sub_code ─────────────────────────
  function handlePin(digit) {
    const next = codeInput + digit
    setCodeInput(next)
    if (next.length === 4) {
      const matched = allTeachers.find(t => t.sub_code && t.sub_code === next)
      if (matched) {
        setCurrentTeacher(matched)
        setTeacherName(matched.name || '')
        setTeacherRoom(matched.room || '27')
        setSelfCheckoutCode(matched.session_code || '')
        // Build period list from teacher's own periods/period_labels
        if (matched.periods?.length) {
          setTeacherPeriods(
            matched.periods.sort().map(p => ({
              value: p,
              label: matched.period_labels?.[p] || `Period ${p}`,
            }))
          )
        } else {
          setTeacherPeriods([
            { value: '1', label: 'Periods 1 & 2' },
            { value: '4', label: 'Periods 4 & 5' },
            { value: '6', label: 'Periods 6 & 7' },
          ])
        }
        setUnlocked(true)
        setCodeError(false)
      } else {
        setCodeError(true)
        setTimeout(() => { setCodeInput(''); setCodeError(false) }, 1000)
      }
    }
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  async function loadData() {
    if (!currentTeacher) return
    const room = currentTeacher.room || '27'

    const { data: passes } = await supabase.from('passes').select('*')
      .is('time_in', null).eq('period', activePeriod).eq('teacher_id', currentTeacher.id)
      .order('time_out')

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { data: today } = await supabase.from('passes').select('*')
      .eq('period', activePeriod).eq('teacher_id', currentTeacher.id)
      .gte('time_out', todayStart.toISOString()).not('time_in', 'is', null)
      .order('time_out', { ascending: false })

    // Use student_periods table (same as teacher dashboard)
    const { data: spRows } = await supabase.from('student_periods')
      .select('student_id').eq('period', activePeriod).eq('room', room)
    const studentIds = spRows?.map(r => r.student_id) || []
    const { data: studs } = studentIds.length > 0
      ? await supabase.from('students').select('id, full_name, photo_file, photo_url').in('id', studentIds).order('first_name')
      : { data: [] }

    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const { data: recentPasses } = await supabase.from('passes').select('student_id')
      .eq('period', activePeriod).eq('teacher_id', currentTeacher.id)
      .gte('time_out', thirtyDaysAgo.toISOString())

    if (passes) setActivePasses(passes)
    if (today) setTodayPasses(today)
    if (studs) {
      setAllStudents(studs)
      const map = {}; studs.forEach(s => map[s.id] = s); setStudents(map)
      const urls = {}
      for (const s of studs) {
        if (s.photo_url) {
          urls[s.id] = s.photo_url
        } else if (s.photo_file) {
          const { data } = await supabase.storage.from('lifetouch-raw').createSignedUrl(s.photo_file, 3600)
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

  // ── Pass actions ───────────────────────────────────────────────────────────
  async function handleReturn(passId) {
    const pass = activePasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    loadData()
  }

  async function handleCheckout() {
    if (!selected || !reason) return
    if (reason === 'Class Assignment' && !assignedTeacher) return

    let finalReason = reason
    let destNote = null
    let destTeacherId = null

    if (reason === 'Class Assignment' && assignedTeacher) {
      finalReason = purposeText.trim()
        ? `Class Assignment — ${assignedTeacher.name} — ${purposeText.trim()}`
        : `Class Assignment — ${assignedTeacher.name}`
      destNote = assignedTeacher.name
      destTeacherId = assignedTeacher.id
    } else if (reason === 'Errand' && errandTeacher) {
      finalReason = purposeText.trim()
        ? `Errand — ${errandTeacher.name} — ${purposeText.trim()}`
        : `Errand — ${errandTeacher.name}`
      destNote = errandTeacher.name
      destTeacherId = errandTeacher.id
    } else if (reason === 'Errand' && purposeText.trim()) {
      finalReason = `Errand — ${purposeText.trim()}`
    } else if (SHARED_DEST_REASONS.includes(reason) && purposeText.trim()) {
      finalReason = `${reason} — ${purposeText.trim()}`
      destNote = reason
    } else if (SHARED_DEST_REASONS.includes(reason)) {
      destNote = reason
    }

    const { data: passData } = await supabase.from('passes').insert({
      student_id: selected, reason: finalReason, room: teacherRoom,
      period: activePeriod, teacher_id: currentTeacher?.id || null,
      destination_teacher_id: destTeacherId,
      destination_note: destNote,
    }).select().single()

    // Fire notification to receiving teacher
    const destTeacher = assignedTeacher || errandTeacher
    if (destTeacher && passData?.id && destTeacherId) {
      const { data: toTeacher } = await supabase
        .from('teachers').select('id, name, receive_notifications')
        .eq('id', destTeacherId).maybeSingle()
      if (toTeacher && toTeacher.receive_notifications !== false) {
        const studentName = allStudents.find(s => s.id === selected)?.full_name || 'Student'
        await supabase.from('pass_notifications').insert({
          pass_id: passData.id,
          from_teacher_id: currentTeacher?.id || null,
          to_teacher_id: toTeacher.id,
          from_teacher_name: `Sub (${teacherName || 'Sub'})`,
          to_teacher_name: toTeacher.name,
          from_room: teacherRoom || '',
          student_id: selected,
          student_name: studentName,
          reason: finalReason,
          status: 'pending',
        })
      }
    }

    setSelected(''); setReason(''); setAssignedTeacher(null); setErrandTeacher(null); setPurposeText('')
    setSelectedStudentPreview(null)
    loadData()
  }

  // ── Self-checkout code — writes to teachers.session_code ──────────────────
  async function generateCheckoutCode() {
    const newCode = Math.floor(1000 + Math.random() * 9000).toString()
    setSelfCheckoutCode(newCode)
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ session_code: newCode }).eq('id', currentTeacher.id)
    }
  }

  async function saveKioskReturn(val) {
    await supabase.from('settings').upsert({ key: 'kiosk_return_required', value: val ? 'true' : 'false' })
    setKioskReturnRequired(val)
    setKioskReturnSaved(true)
    setTimeout(() => setKioskReturnSaved(false), 2000)
  }

  function handleStudentSelect(id) {
    setSelected(id)
    setSelectedStudentPreview(id ? allStudents.find(s => s.id === id) || null : null)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
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
  const periodLabel = teacherPeriods.find(p => p.value === activePeriod)?.label || `Period ${activePeriod}`

  // ── PIN screen ─────────────────────────────────────────────────────────────
  if (!unlocked) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Substitute Login</h1>
      <p className="text-gray-400 text-sm mb-6">Enter your substitute code</p>
      <div className={`text-4xl tracking-widest mb-6 font-mono ${codeError ? 'text-red-500' : 'text-gray-800'}`}>
        {codeInput.length > 0 ? '●'.repeat(codeInput.length) : '○○○○'}
      </div>
      <div className="grid grid-cols-3 gap-3 w-56 mb-4">
        {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
          <button key={i}
            onClick={() => d === '⌫' ? setCodeInput(c => c.slice(0,-1)) : d !== '' && handlePin(String(d))}
            className="h-14 text-xl font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50 disabled:opacity-0"
            style={{ borderColor: '#e5e7eb', color: RHS_GREEN }} disabled={d === ''}>
            {d}
          </button>
        ))}
      </div>
      {codeError && <p className="text-red-500 text-sm mb-3">Incorrect code — try again</p>}
      <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Home</a>
    </div>
  )

  // ── Period picker ──────────────────────────────────────────────────────────
  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Substitute Dashboard</h1>
      <p className="text-gray-400 text-sm mb-1">Room {teacherRoom} · {teacherName}</p>
      <p className="text-gray-400 text-sm mb-8">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {teacherPeriods.map(p => (
          <button key={p.value} onClick={() => setActivePeriod(p.value)}
            className="py-4 text-lg font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50"
            style={{ borderColor: RHS_GREEN, color: RHS_GREEN }}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )

  // ── Main dashboard ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Help panel — draggable, no backdrop */}
      {showHelp && (
        <div
          ref={helpPanelRef}
          className="bg-white rounded-2xl shadow-2xl flex flex-col"
          style={{ position: 'fixed', left: helpPos.x, top: helpPos.y, width: 400, maxHeight: '85vh', zIndex: 9999, border: '1px solid #e5e7eb' }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 border-b border-gray-100 rounded-t-2xl select-none"
            style={{ cursor: 'grab', backgroundColor: '#f9fafb' }}
            onMouseDown={startHelpDrag}
          >
            <div className="flex items-center gap-2">
              <span className="text-gray-300 text-sm">⠿</span>
              <h2 className="text-sm font-semibold text-gray-800">Sub Dashboard Help</h2>
            </div>
            <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
          </div>
            <div className="overflow-y-auto px-6 py-4 flex flex-col gap-4 text-sm text-gray-700">

              {[
                {
                  q: 'How do I check out a student?',
                  a: 'Use Manual Checkout at the bottom of the page. Pick the student\'s name and a reason from the dropdowns, then hit Send. They\'ll appear in the Students Out list immediately.',
                },
                {
                  q: 'How do I check a student back in?',
                  a: `Click Return next to their name in the Students Out list. If the kiosk is set up at the classroom door, students can also scan themselves back in there.`,
                },
                {
                  q: 'What does the timer color mean?',
                  a: `Green = under 7 min, yellow = getting long, red = over ${TIME_LIMIT} min. A student showing red has been out too long — consider sending someone to check on them.`,
                },
                {
                  q: 'What are the 🚨 High and ⚠️ Frequent badges?',
                  a: 'These flag students with high pass counts over the last 30 days. High = 10+ passes, Frequent = 5+. Just a heads-up — you can still let them go.',
                },
                {
                  q: 'What\'s Self-Checkout Mode?',
                  a: `Students go to hall-pass-lime.vercel.app/self-checkout?room=${teacherRoom} on their Chromebook and enter the session code shown. They check themselves out from their own device. When they return, they scan back in at the classroom kiosk.`,
                },
                {
                  q: 'What does "Kiosk return required" mean?',
                  a: 'When ON, students must scan at the classroom kiosk to check back in. When OFF, they see an "I\'m Back" button on their device instead. Leave it ON unless the kiosk isn\'t working.',
                },
                {
                  q: 'How do I switch periods?',
                  a: 'Tap ← Period in the top-right of the header to go back to the period picker.',
                },
                {
                  q: 'Something isn\'t working.',
                  a: `Contact ${teacherName} or check with the front office. This is a sub-only view — settings changes require the regular teacher login.`,
                },
              ].map(item => (
                <details key={item.q} className="border-b border-gray-100 last:border-0 pb-3">
                  <summary className="font-semibold text-gray-800 cursor-pointer py-1 list-none flex justify-between items-center">
                    {item.q}<span className="text-gray-400 text-base ml-2 flex-shrink-0">›</span>
                  </summary>
                  <p className="mt-2 text-gray-500 text-sm leading-relaxed">{item.a}</p>
                </details>
              ))}

            </div>
            <div className="px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowHelp(false)}
                className="w-full py-2.5 text-sm font-semibold rounded-xl text-white"
                style={{ backgroundColor: RHS_GREEN }}>Got it</button>
            </div>
        </div>
      )}

      {/* Header */}
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
          <button onClick={() => setShowHelp(true)} className="text-sm text-green-200 hover:text-white">? Help</button>
          <button onClick={() => setActivePeriod(null)} className="text-sm text-green-200 hover:text-white">← Period</button>
          <a href="/" className="text-sm text-green-200 hover:text-white">Home</a>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {/* Stat cards */}
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

        {/* Today's history */}
        {showHistory && todayPasses.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Today's Completed Passes</span>
            </div>
            {todayPasses.map(pass => (
              <div key={pass.id} className="flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-800">{students[pass.student_id]?.full_name}</span>
                  <span className="text-xs text-gray-400 ml-2">{pass.reason}</span>
                </div>
                <div className="text-xs text-gray-400">{pass.duration_minutes}m</div>
                <div className="text-xs text-gray-400">{new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        )}

        {/* Active passes + checkout */}
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
                    : <span className="text-xs font-medium text-white flex items-center justify-center w-full h-full"
                        style={{ backgroundColor: RHS_GREEN }}>
                        {student?.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
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
                  <div className="text-xs text-gray-400">
                    {pass.reason} · out at {new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
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

          {/* Checkout mode toggle */}
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

          {/* Manual checkout */}
          {checkoutMode === 'manual' && (
            <div className="px-4 pb-4 bg-gray-50 rounded-b-xl">
              <div className="text-xs font-medium text-gray-500 mb-2">Check out a student</div>
              {selectedStudentPreview && (
                <div className="flex items-center gap-3 mb-3 p-2 bg-white rounded-xl border border-gray-200">
                  <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                    {photoUrls[selectedStudentPreview.id]
                      ? <img src={photoUrls[selectedStudentPreview.id]} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: RHS_GREEN }}>
                          {selectedStudentPreview.full_name?.split(' ').map(n => n[0]).slice(0, 2).join('')}
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
                <select value={reason} onChange={e => { setReason(e.target.value); setAssignedTeacher(null); setErrandTeacher(null); setPurposeText('') }}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Reason —</option>
                  {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={handleCheckout} disabled={!selected || !reason || (reason === 'Class Assignment' && !assignedTeacher)}
                  className="px-4 py-2 text-sm rounded-lg disabled:opacity-30 font-medium text-white"
                  style={{ backgroundColor: RHS_GREEN }}>
                  Send
                </button>
              </div>
              {reason === 'Class Assignment' && (
                <div className="flex gap-2 mb-3">
                  <select value={assignedTeacher?.id || ''} onChange={e => { const t = allTeachers.find(x => x.id === e.target.value) || null; setAssignedTeacher(t ? { id: t.id, name: t.name } : null) }}
                    className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                    <option value="">— Select a teacher (required) —</option>
                    {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.room ? ` · Rm ${t.room}` : ''}</option>)}
                  </select>
                  <input type="text" placeholder="Purpose (optional)" value={purposeText} onChange={e => setPurposeText(e.target.value)}
                    className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                </div>
              )}
              {reason === 'Errand' && (
                <div className="flex gap-2 mb-3">
                  <select value={errandTeacher?.id || ''} onChange={e => { const t = allTeachers.find(x => x.id === e.target.value) || null; setErrandTeacher(t ? { id: t.id, name: t.name } : null) }}
                    className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                    <option value="">— Select a teacher (optional) —</option>
                    {allTeachers.map(t => <option key={t.id} value={t.id}>{t.name}{t.room ? ` · Rm ${t.room}` : ''}</option>)}
                  </select>
                  <input type="text" placeholder="Purpose (optional)" value={purposeText} onChange={e => setPurposeText(e.target.value)}
                    className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                </div>
              )}
              {SHARED_DEST_REASONS.includes(reason) && (
                <div className="mb-3">
                  <input type="text" placeholder="Note (optional)" value={purposeText} onChange={e => setPurposeText(e.target.value)}
                    className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                </div>
              )}
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

          {/* Self-checkout mode */}
          {checkoutMode === 'self' && (
            <div className="px-4 pb-4 bg-gray-50 rounded-b-xl">
              <div className="text-center py-4">
                <div className="text-5xl font-black tracking-widest text-gray-800 mb-2 font-mono">
                  {selfCheckoutCode || '—'}
                </div>
                <div className="text-sm text-gray-500 mb-1">Session code — share with students</div>
                <div className="text-xs font-mono font-semibold mb-3" style={{ color: RHS_GREEN }}>
                  hall-pass-lime.vercel.app/self-checkout?room={teacherRoom}
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
                  {kioskReturnRequired ? 'Students must scan at kiosk to return' : 'Students see an "I\'m Back" button'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          ⚠ Substitute view only — settings and QR management are not available. Contact {teacherName} for code changes.
        </div>

      </div>
    </div>
  )
}
