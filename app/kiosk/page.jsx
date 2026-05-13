'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'

const REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Lockers', 'Errand', 'On Assignment', 'School Store', 'Other']

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

const PASS_LIMIT = 3
const MAX_PIN_ATTEMPTS = 3
const LOCKOUT_SECONDS = 60

const PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

function StudentScanner({ onScan, deviceId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  useEffect(() => {
    let stream
    let interval
    async function start() {
      try {
        const constraints = deviceId
          ? { video: { deviceId: { exact: deviceId } } }
          : { video: { facingMode: 'user' } }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current) videoRef.current.srcObject = stream
        interval = setInterval(scan, 500)
      } catch (e) {}
    }
    async function scan() {
      if (!videoRef.current || !canvasRef.current) return
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0)
      try {
        const { BarcodeDetector } = window
        if (!BarcodeDetector) return
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const codes = await detector.detect(canvas)
        for (const code of codes) {
          const url = new URL(code.rawValue)
          const studentId = url.searchParams.get('student')
          if (studentId) onScan(studentId)
        }
      } catch (e) {}
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
      if (interval) clearInterval(interval)
    }
  }, [])
  return (
    <div className="relative w-48 h-36 rounded-xl overflow-hidden shadow-lg" style={{ border: `2px solid ${RHS_GREEN}` }}>
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-24 h-24 rounded-lg opacity-70" style={{ border: `2px solid ${RHS_GREEN}` }} />
      </div>
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 rounded-full px-1.5 py-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-white text-xs font-medium">LIVE</span>
      </div>
    </div>
  )
}

function QRScanner({ onUnlock, unlockCode, deviceId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  useEffect(() => {
    let stream
    let interval
    async function start() {
      try {
        const constraints = deviceId
          ? { video: { deviceId: { exact: deviceId } } }
          : { video: { facingMode: 'environment' } }
        stream = await navigator.mediaDevices.getUserMedia(constraints)
        if (videoRef.current) videoRef.current.srcObject = stream
        interval = setInterval(scan, 500)
      } catch (e) {}
    }
    async function scan() {
      if (!videoRef.current || !canvasRef.current) return
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      canvas.width = videoRef.current.videoWidth
      canvas.height = videoRef.current.videoHeight
      ctx.drawImage(videoRef.current, 0, 0)
      try {
        const { BarcodeDetector } = window
        if (!BarcodeDetector) return
        const detector = new BarcodeDetector({ formats: ['qr_code'] })
        const codes = await detector.detect(canvas)
        for (const code of codes) {
          if (code.rawValue.includes(unlockCode)) onUnlock()
        }
      } catch (e) {}
    }
    start()
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop())
      if (interval) clearInterval(interval)
    }
  }, [unlockCode, deviceId])
  return (
    <div className="relative w-48 h-36 rounded-xl overflow-hidden shadow-lg" style={{ border: `2px solid ${RHS_GREEN}` }}>
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      <canvas ref={canvasRef} className="hidden" />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-24 h-24 rounded-lg opacity-70" style={{ border: `2px solid ${RHS_GREEN}` }} />
      </div>
      <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/50 rounded-full px-1.5 py-0.5">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: RHS_GREEN }} />
        <span className="text-white text-xs font-medium">SCAN</span>
      </div>
    </div>
  )
}

function PassQRCode({ passId, studentName, reason, onDismiss }) {
  const [countdown, setCountdown] = useState(20)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const passUrl = `${window.location.origin}/pass/${passId}`

  useEffect(() => {
    QRCode.toDataURL(passUrl, { width: 200, margin: 1 })
      .then(url => setQrDataUrl(url))
      .catch(() => {})
  }, [passUrl])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(interval); onDismiss(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <div className="text-5xl mb-3">✓</div>
      <h2 className="text-2xl font-bold text-white mb-1">{studentName} is checked out</h2>
      <p className="text-green-200 text-sm mb-6">{reason}</p>
      <div className="bg-white rounded-2xl p-4 mb-4 shadow-xl flex flex-col items-center">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="Pass QR Code" className="w-48 h-48" />
          : <div className="w-48 h-48 flex items-center justify-center text-gray-300 text-xs">Generating...</div>
        }
        <p className="text-xs text-gray-500 mt-2 text-center">Scan for your live pass timer</p>
      </div>
      <p className="text-green-200 text-sm mb-4">Show this QR to your phone before you leave</p>
      <div className="flex flex-col items-center gap-2">
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
            <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
            <circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="4"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - countdown / 20)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s linear' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-white text-sm font-bold">{countdown}</span>
        </div>
        <button onClick={onDismiss} className="text-green-200 text-xs hover:text-white">
          Tap to dismiss
        </button>
      </div>
    </div>
  )
}

const QUEUE_KEY = 'hall_pass_offline_queue'
function loadQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }

// ─── NFC UID Normalization ────────────────────────────────────────────────────
function normalizeUid(uid) {
  const clean = uid.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  return clean.slice(-6)
}
// ─────────────────────────────────────────────────────────────────────────────

function KioskInner() {
  const searchParams = useSearchParams()
  const [activePeriod, setActivePeriod] = useState(null)
  const [unlocked, setUnlocked] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [pinAttempts, setPinAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(null)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)
  const [unlockCode, setUnlockCode] = useState('')
  const [pinCode, setPinCode] = useState('2727')
  const [students, setStudents] = useState([])
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [otherText, setOtherText] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [errandTeacher, setErrandTeacher] = useState('')
  const [purposeText, setPurposeText] = useState('')
  const [showLibraryAlert, setShowLibraryAlert] = useState(false)
  const [stage, setStage] = useState('select')
  const [message, setMessage] = useState(null)
  const [newPassId, setNewPassId] = useState(null)
  const [weekCount, setWeekCount] = useState(0)
  const [currentPass, setCurrentPass] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [offlineQueue, setOfflineQueue] = useState([])
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')

  // NFC HID buffer refs
  const nfcBufferRef = useRef('')
  const nfcTimerRef = useRef(null)
  // ── FIX: ref so NFC handler always reads current activePasses without stale closure ──
  const activePassesRef = useRef([])

  // Keep activePassesRef in sync with activePasses state
  useEffect(() => {
    activePassesRef.current = activePasses
  }, [activePasses])

  // Lockout countdown timer
  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null)
        setLockoutRemaining(0)
        setPinAttempts(0)
        clearInterval(interval)
      } else {
        setLockoutRemaining(remaining)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  useEffect(() => {
    const saved = localStorage.getItem('kiosk_camera')
    if (saved) setSelectedCamera(saved)
    async function getCameras() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true })
        const devices = await navigator.mediaDevices.enumerateDevices()
        setCameras(devices.filter(d => d.kind === 'videoinput'))
      } catch (e) {}
    }
    getCameras()
  }, [])

  useEffect(() => {
    loadSettings()
    setOfflineQueue(loadQueue())
    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', () => setIsOnline(false))
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', () => setIsOnline(false))
    }
  }, [])

  async function handleOnline() { setIsOnline(true); await syncQueue() }

  async function syncQueue() {
    const queue = loadQueue()
    if (queue.length === 0) return
    setSyncing(true)
    const remaining = []
    for (const pass of queue) {
      const { error } = await supabase.from('passes').insert(pass)
      if (error) remaining.push(pass)
    }
    const synced = queue.length - remaining.length
    saveQueue(remaining)
    setOfflineQueue(remaining)
    setSyncing(false)
    if (synced > 0) { setSyncedCount(synced); setTimeout(() => setSyncedCount(0), 4000) }
  }

  useEffect(() => { if (unlocked && activePeriod) loadStudents() }, [unlocked, activePeriod])

  useEffect(() => {
    const studentId = searchParams.get('student')
    if (studentId && students.length > 0) handleStudentSelect(studentId)
  }, [students])

  useEffect(() => {
    const code = searchParams.get('unlock')
    if (code && code === unlockCode) setUnlocked(true)
  }, [unlockCode])

  // ── NFC HID listener ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || !activePeriod) return

    function handleNfcKey(e) {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      if (e.key === 'Enter') {
        const uid = nfcBufferRef.current.trim()
        nfcBufferRef.current = ''
        clearTimeout(nfcTimerRef.current)
        if (uid.length < 4) return
        if (students.length === 0) return
        // Normalize both the scanned UID and stored UIDs before comparing
        const normalizedUid = normalizeUid(uid)
        const reversed = uid.match(/.{2}/g)?.reverse().join('') || uid
        const normalizedReversed = normalizeUid(reversed)
        const match = students.find(s => {
          const stored = normalizeUid(s.nfc_uid || '')
          return stored === normalizedUid || stored === normalizedReversed
        })
        if (match) {
          // Use ref so we always have current passes — avoids stale closure crash
          const openPass = activePassesRef.current.find(p => p.student_id === match.id)
          if (openPass) {
            setSelected(match.id)
            setCurrentPass(openPass)
            // Directly checkin without showing confirm screen
            const mins = Math.floor((Date.now() - new Date(openPass.time_out)) / 60000)
            supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', openPass.id)
              .then(async () => {
                const weekStart = new Date()
                weekStart.setDate(weekStart.getDate() - weekStart.getDay())
                weekStart.setHours(0, 0, 0, 0)
                const { data: weekPasses } = await supabase.from('passes')
                  .select('duration_minutes')
                  .eq('student_id', match.id)
                  .gte('time_out', weekStart.toISOString())
                  .not('time_in', 'is', null)
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
                const { count: todayCount } = await supabase.from('passes')
                  .select('*', { count: 'exact', head: true })
                  .eq('student_id', match.id)
                  .gte('time_out', todayStart.toISOString())
                const weekCount = weekPasses?.length || 0
                const weekMins = weekPasses?.reduce((sum, p) => sum + (p.duration_minutes || 0), 0) || 0
                setMessage({ text: match.full_name, minsOut: mins, weekCount, weekMins, todayCount: todayCount || 0 })
                setNewPassId(null)
                setStage('checkin-done')
                setTimeout(() => reset(), 5000)
              })
          } else {
            handleStudentSelect(match.id)
          }
        } else {
          console.warn('NFC UID not matched:', uid, '→ normalized:', normalizedUid)
        }
        nfcBufferRef.current = ''
        return
      }

      nfcBufferRef.current += e.key
      clearTimeout(nfcTimerRef.current)
      nfcTimerRef.current = setTimeout(() => { nfcBufferRef.current = '' }, 300)
    }

    window.addEventListener('keydown', handleNfcKey)
    return () => {
      window.removeEventListener('keydown', handleNfcKey)
      clearTimeout(nfcTimerRef.current)
    }
  }, [unlocked, activePeriod, students])
  // ─── activePasses intentionally removed from deps — read via activePassesRef instead ───

  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value').in('key', ['teacher_unlock_code', 'teacher_pin'])
    if (data) {
      const unlockRow = data.find(r => r.key === 'teacher_unlock_code')
      const pinRow = data.find(r => r.key === 'teacher_pin')
      if (unlockRow) setUnlockCode(unlockRow.value)
      if (pinRow) setPinCode(pinRow.value)
    }
  }

  async function loadStudents() {
    // nfc_uid added for HID reader lookup
    const { data } = await supabase.from('students').select('id, full_name, last_name, nfc_uid').eq('period', activePeriod).order('first_name')
    if (data) setStudents(data)
    // Also load active passes so NFC auto-checkin knows who's out
    const { data: passes } = await supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod)
    if (passes) setActivePasses(passes)
  }

  function handlePin(digit) {
    if (lockedUntil) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      if (next === pinCode) {
        setUnlocked(true)
        setPinError(false)
        setPinAttempts(0)
      } else {
        const newAttempts = pinAttempts + 1
        setPinAttempts(newAttempts)
        setPinError(true)
        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000)
          setLockoutRemaining(LOCKOUT_SECONDS)
          setPin('')
          setPinError(false)
        } else {
          setTimeout(() => { setPin(''); setPinError(false) }, 1000)
        }
      }
    }
  }

  function handleReasonSelect(r) {
    setReason(r); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText(''); setOtherText('')
    if (r === 'Library') setShowLibraryAlert(true)
  }

  async function handleStudentSelect(id) {
    setSelected(id)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(1047, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    } catch (e) {}
    if (!id) return
    const { data: pass } = await supabase.from('passes').select('*').eq('student_id', id).is('time_in', null).maybeSingle()
    if (pass) { setCurrentPass(pass); setStage('checkin'); return }
    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const { count } = await supabase.from('passes').select('*', { count: 'exact', head: true }).eq('student_id', id).gte('time_out', weekStart.toISOString())
    setWeekCount(count || 0)
    setStage('select')
  }

  async function handleCheckout() {
    let finalReason = reason
    if (reason === 'On Assignment' && assignedTeacher) {
      finalReason = purposeText.trim()
        ? `On Assignment — ${assignedTeacher} — ${purposeText.trim()}`
        : `On Assignment — ${assignedTeacher}`
    } else if (reason === 'Errand' && errandTeacher) {
      finalReason = purposeText.trim()
        ? `Errand — ${errandTeacher} — ${purposeText.trim()}`
        : `Errand — ${errandTeacher}`
    } else if (reason === 'Errand' && purposeText.trim()) {
      finalReason = `Errand — ${purposeText.trim()}`
    } else if (reason === 'Other' && otherText) {
      finalReason = `Other — ${otherText}`
    }

    const passData = {
      student_id: selected, reason: finalReason, room: '27',
      period: activePeriod, teacher_id: null, time_out: new Date().toISOString(),
    }
    const name = students.find(s => s.id === selected)?.full_name

    if (!isOnline) {
      const queue = loadQueue()
      queue.push(passData); saveQueue(queue); setOfflineQueue(queue)
      setMessage({ text: name, sub: finalReason })
      setNewPassId(null)
      setStage('done'); return
    }

    const { data, error } = await supabase.from('passes').insert(passData).select().single()
    if (!error) {
      setMessage({ text: name, sub: finalReason })
      setNewPassId(data?.id || null)
      setStage('done')
      // Refresh active passes
      const { data: passes } = await supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod)
      if (passes) setActivePasses(passes)
    }
  }

  async function handleCheckin() {
    const now = new Date().toISOString()
    const mins = Math.floor((new Date() - new Date(currentPass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: now, duration_minutes: mins }).eq('id', currentPass.id)
    const name = students.find(s => s.id === selected)?.full_name

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    weekStart.setHours(0, 0, 0, 0)
    const { data: weekPasses } = await supabase.from('passes')
      .select('duration_minutes')
      .eq('student_id', selected)
      .gte('time_out', weekStart.toISOString())
      .not('time_in', 'is', null)

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase.from('passes')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', selected)
      .gte('time_out', todayStart.toISOString())

    const weekCount = weekPasses?.length || 0
    const weekMins = weekPasses?.reduce((sum, p) => sum + (p.duration_minutes || 0), 0) || 0

    setMessage({
      text: name,
      minsOut: mins,
      weekCount,
      weekMins,
      todayCount: todayCount || 0,
    })
    setNewPassId(null)
    setStage('checkin-done')

    // Auto-reset after 5 seconds
    setTimeout(() => reset(), 5000)
  }

  function reset() {
    setSelected(''); setReason(''); setStage('select')
    setMessage(null); setCurrentPass(null); setWeekCount(0)
    setNewPassId(null); setAssignedTeacher(''); setErrandTeacher('')
    setPurposeText(''); setOtherText(''); setShowLibraryAlert(false)
  }

  const checkoutDisabled = !selected || !reason ||
    (reason === 'On Assignment' && !assignedTeacher) ||
    (reason === 'Errand' && !errandTeacher && !purposeText.trim()) ||
    (reason === 'Other' && !otherText.trim())

  const periodLabel = PERIODS.find(p => p.value === activePeriod)?.label
  const studentName = students.find(s => s.id === selected)?.full_name

  if (!activePeriod) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-24 h-24 object-contain mb-4" style={{ filter: 'brightness(0) invert(1)' }} />
      <h1 className="text-2xl font-bold text-white mb-1">Room 27</h1>
      <p className="text-green-200 text-sm mb-8 uppercase tracking-widest">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {PERIODS.map(p => (
          <button key={p.value} onClick={() => setActivePeriod(p.value)}
            className="py-4 text-lg font-bold bg-white rounded-xl shadow-md hover:bg-green-50"
            style={{ color: RHS_GREEN }}>{p.label}</button>
        ))}
      </div>
    </div>
  )

  if (!unlocked) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4" style={{ filter: 'brightness(0) invert(1)' }} />
      <h1 className="text-2xl font-bold text-white mb-1">RHS PassAble</h1>
      <p className="text-green-200 text-sm mb-2">{PERIODS.find(p => p.value === activePeriod)?.label}</p>
      <p className="text-green-100 mb-4 text-sm">Enter teacher PIN to unlock</p>

      {lockedUntil ? (
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="text-6xl">🔒</div>
          <p className="text-white font-bold text-lg">Locked</p>
          <p className="text-red-300 text-sm text-center">Too many incorrect attempts.<br />Try again in {lockoutRemaining}s</p>
          <p className="text-green-300 text-xs text-center mt-2">Unauthorized access attempts are logged.</p>
        </div>
      ) : (
        <>
          <div className={`text-4xl tracking-widest mb-6 font-mono text-white ${pinError ? 'opacity-50' : ''}`}>
            {pin.length > 0 ? '●'.repeat(pin.length) : '○○○○'}
          </div>
          {pinAttempts > 0 && (
            <p className="text-red-300 text-xs mb-3">
              {MAX_PIN_ATTEMPTS - pinAttempts} attempt{MAX_PIN_ATTEMPTS - pinAttempts !== 1 ? 's' : ''} remaining
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 w-56 mb-8">
            {[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map((d, i) => (
              <button key={i} onClick={() => d === '⌫' ? setPin(p => p.slice(0,-1)) : d !== '' && handlePin(String(d))}
                className="h-14 text-xl font-bold bg-white rounded-xl shadow-md hover:bg-green-50 disabled:opacity-0"
                style={{ color: RHS_GREEN }} disabled={d === ''}>{d}</button>
            ))}
          </div>
        </>
      )}

      <div className="mb-2 text-xs text-green-200">— or scan teacher QR —</div>
      {cameras.length > 1 && (
        <select className="mb-2 w-48 rounded-lg bg-green-900 text-green-100 text-xs px-2 py-1 border border-green-600"
          value={selectedCamera}
          onChange={e => { setSelectedCamera(e.target.value); localStorage.setItem('kiosk_camera', e.target.value) }}>
          <option value="">Default camera</option>
          {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
        </select>
      )}
      <QRScanner onUnlock={() => { setUnlocked(true); setPinAttempts(0); setLockedUntil(null) }} unlockCode={unlockCode} deviceId={selectedCamera} />
      <button onClick={() => { setPin(''); setPinError(false); setUnlocked(false); setActivePeriod(null) }} className="mt-6 text-sm text-green-200 hover:text-white">← Change period</button>
    </div>
  )

  if (stage === 'done' && newPassId) {
    return <PassQRCode passId={newPassId} studentName={message?.text} reason={message?.sub} onDismiss={reset} />
  }

  if (stage === 'done' && !newPassId) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="text-5xl mb-4">✓</div>
      <h2 className="text-2xl font-semibold text-gray-800 mb-2">{message?.text} is checked out</h2>
      <p className="text-gray-500 mb-2">{message?.sub}</p>
      <p className="text-amber-600 text-xs mb-8">Saved offline — no pass link available</p>
      <button onClick={reset} className="px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: RHS_GREEN }}>Done</button>
    </div>
  )

  if (stage === 'checkin-done') {
    const firstName = message?.text?.split(' ')[0] || 'You'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-3xl font-bold text-white mb-1">Welcome back, {firstName}!</h2>
        <p className="text-green-200 text-sm mb-8">You're checked in</p>

        <div className="bg-white/10 rounded-2xl p-6 w-full max-w-sm mb-6 backdrop-blur">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-white">{message?.minsOut ?? 0}m</div>
              <div className="text-xs text-green-200 mt-1">This pass</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{message?.todayCount ?? 0}</div>
              <div className="text-xs text-green-200 mt-1">Today</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">{message?.weekCount ?? 0}</div>
              <div className="text-xs text-green-200 mt-1">This week</div>
            </div>
          </div>
          {message?.weekMins > 0 && (
            <div className="mt-4 pt-4 border-t border-white/20 text-center">
              <span className="text-sm text-green-200">{message.weekMins} min total out this week</span>
            </div>
          )}
        </div>

        <p className="text-green-300 text-xs">Returning to kiosk in a few seconds...</p>
      </div>
    )
  }

  if (stage === 'checkin') {
    const name = students.find(s => s.id === selected)?.full_name
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Welcome back!</h2>
        <p className="text-gray-500 mb-2">{name} is currently out</p>
        <p className="text-gray-400 mb-8 text-sm">Reason: {currentPass?.reason}</p>
        <div className="flex gap-3">
          <button onClick={handleCheckin} className="px-6 py-3 text-white rounded-lg font-medium" style={{ backgroundColor: RHS_GREEN }}>Check Back In</button>
          <button onClick={reset} className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      {showLibraryAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-xs mx-4 text-center shadow-xl">
            <div className="text-4xl mb-3">📚</div>
            <h2 className="text-lg font--semibold text-gray-800 mb-2">Library Pass Required</h2>
            <p className="text-gray-500 text-sm mb-4">You must have a signed pass from Mr. Joe to enter the library.</p>
            <button onClick={() => setShowLibraryAlert(false)}
              className="w-full py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>
              I have a pass
            </button>
          </div>
        </div>
      )}
      {!isOnline && (
        <div className="w-full max-w-sm mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs text-center">
          ⚠ Offline — passes will sync when connected ({offlineQueue.length} queued)
        </div>
      )}
      {syncing && (
        <div className="w-full max-w-sm mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-xs text-center">
          ↑ Syncing offline passes...
        </div>
      )}
      {syncedCount > 0 && (
        <div className="w-full max-w-sm mb-3 p-2 bg-green-50 border border-green-200 rounded-lg text-xs text-center" style={{ color: RHS_GREEN }}>
          ✓ Back online — {syncedCount} {syncedCount === 1 ? 'pass' : 'passes'} synced
        </div>
      )}
      <div className="w-full max-w-sm flex items-center justify-between mb-4">
        <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-36 h-36 object-contain" />
        <div className="flex flex-col items-end gap-2">
          <StudentScanner onScan={handleStudentSelect} deviceId={selectedCamera} />
          {cameras.length > 1 && (
            <select value={selectedCamera}
              onChange={e => { setSelectedCamera(e.target.value); localStorage.setItem('kiosk_camera', e.target.value) }}
              className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 bg-white">
              <option value="">Default camera</option>
              {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
            </select>
          )}
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
      <p className="text-sm font-medium mb-1" style={{ color: RHS_GREEN }}>Room 27 · {periodLabel}</p>
      <p className="text-gray-500 mb-6">Scan badge or select your name</p>
      <div className="w-full max-w-sm mb-4">
        <select value={selected} onChange={e => handleStudentSelect(e.target.value)}
          className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
          style={{ borderColor: RHS_GREEN }}>
          <option value="">— Choose your name —</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </div>
      {weekCount >= PASS_LIMIT && (
        <div className="w-full max-w-sm mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          ⚠ This is {studentName}'s {weekCount + 1}th pass this week
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm mb-4">
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
        <div className="w-full max-w-sm flex flex-col gap-2 mb-6">
          <select value={assignedTeacher} onChange={e => setAssignedTeacher(e.target.value)}
            className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
            style={{ borderColor: RHS_GREEN }}>
            <option value="">— Select a teacher —</option>
            {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" placeholder="Purpose (e.g. picking up worksheets)"
            value={purposeText} onChange={e => setPurposeText(e.target.value)}
            className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
            style={{ borderColor: RHS_GREEN }} />
        </div>
      )}

      {reason === 'Errand' && (
        <div className="w-full max-w-sm flex flex-col gap-2 mb-6">
          <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)}
            className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
            style={{ borderColor: RHS_GREEN }}>
            <option value="">— Select a teacher (optional) —</option>
            {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="text" placeholder="Purpose (e.g. returning equipment)"
            value={purposeText} onChange={e => setPurposeText(e.target.value)}
            className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
            style={{ borderColor: RHS_GREEN }} />
        </div>
      )}

      {reason === 'Other' && (
        <div className="w-full max-w-sm mb-6">
          <input type="text" placeholder="Where are you going?"
            value={otherText} onChange={e => setOtherText(e.target.value)}
            className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800"
            style={{ borderColor: RHS_GREEN }} autoFocus />
        </div>
      )}

      {reason !== 'On Assignment' && reason !== 'Errand' && reason !== 'Other' && <div className="mb-6" />}

      <button onClick={handleCheckout} disabled={checkoutDisabled}
        className="px-8 py-4 text-white text-lg font-bold rounded-xl disabled:opacity-30 shadow-md"
        style={{ backgroundColor: RHS_GREEN }}>
        Check Out
      </button>
      <button onClick={() => { setPin(''); setPinError(false); setUnlocked(false); setActivePeriod(null) }}
        className="mt-4 text-sm hover:opacity-70" style={{ color: RHS_GREEN }}>
        ← Change period
      </button>
    </div>
  )
}

export default function Kiosk() {
  return (
    <Suspense>
      <KioskInner />
    </Suspense>
  )
}
