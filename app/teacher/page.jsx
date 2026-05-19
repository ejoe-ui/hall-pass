'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

// ── Constants ─────────────────────────────────────────────────────────────────
const RHS_GREEN = '#006938'
const TIME_LIMIT = 10

const REASONS = [
  'Restroom', 'Library', 'Office', 'Counselor', 'Lockers',
  'Errand', 'On Assignment', 'School Store', 'Other',
]

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

const ERRAND_LOCATIONS = [
  'Car', 'Farm', 'Leadership Room', 'Cafeteria', 'Outpost', 'Quad',
  'Corral', 'North Gym', 'South Gym', 'Football Field', 'Tennis Courts', 'Office',
]

// ── Audio helpers ─────────────────────────────────────────────────────────────
function playTone(freqA, freqB) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(freqA, ctx.currentTime)
    osc.frequency.setValueAtTime(freqB, ctx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4)
  } catch (e) {}
}
const playAlert = () => playTone(880, 660)
const playClearAlert = () => playTone(660, 880)

function playDnloAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.25)
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2)
      osc.start(ctx.currentTime + i * 0.25); osc.stop(ctx.currentTime + i * 0.25 + 0.2)
    }
  } catch (e) {}
}

// ── QR Scanner component ──────────────────────────────────────────────────────
function QRScanner({ onUnlock, unlockCode, deviceId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    let stream, interval
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
          if (code.rawValue.includes('magic=1')) {
            const url = new URL(code.rawValue)
            const email = url.searchParams.get('email')
            if (email) onUnlock(email)
            return
          }
          if (unlockCode && code.rawValue.includes(unlockCode)) onUnlock(null)
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

// ── Print helpers ─────────────────────────────────────────────────────────────
const RECEIPT_STYLES = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 72mm; margin: 0 auto; }
  body { font-family: 'Courier New', monospace; font-size: 17px; padding: 8px 10px; text-align: center; }
  .divider { border-top: 1px dashed #000; margin: 9px 0; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 2px; }
  .value { font-size: 20px; font-weight: bold; margin-bottom: 8px; }
  .tag { display: inline-block; border: 2px solid #000; padding: 4px 10px; font-weight: bold; font-size: 14px; letter-spacing: 0.1em; margin-bottom: 8px; }
  .header-title { font-size: 26px; font-weight: bold; }
  .header-sub { font-size: 12px; margin-bottom: 4px; }
  .sig-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin-bottom: 4px; }
  .sig-line { border-bottom: 1px solid #000; width: 80%; margin: 0 auto 4px auto; height: 28px; }
  .sig-name { font-size: 13px; color: #555; }
  .footer { font-size: 12px; color: #444; margin-top: 10px; line-height: 1.6; }
  @media print { html, body { margin: 0 auto; } }
`

function printHallPass({ passId, studentName, reason, timeIssued, room }) {
  const passUrl = `https://hall-pass-lime.vercel.app/pass/${passId}`
  const win = window.open('', '_blank', 'width=420,height=600')
  win.document.write(`<!DOCTYPE html><html><head><title>Hall Pass</title>
    <style>${RECEIPT_STYLES}
      img.qr { width: 120px; height: 120px; margin: 8px auto; display: block; }
    </style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">HALL PASS</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Reason</div><div class="value">${reason}</div>
    <div class="divider"></div>
    <div class="label">Time Out</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div class="footer">Return to Room ${room} promptly.<br/>Scan QR for live pass timer.</div>
    <script>
      const img = new Image();
      img.className = 'qr';
      img.onload = function() { document.body.appendChild(img); window.print(); }
      img.onerror = function() { window.print(); }
      img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent('${passUrl}')
    </script></body></html>`)
  win.document.close()
}

function printLatePass({ studentName, toTeacher, timeIssued, lateReason, issuedBy, room }) {
  const win = window.open('', '_blank', 'width=420,height=650')
  win.document.write(`<!DOCTYPE html><html><head><title>Late Pass</title>
    <style>${RECEIPT_STYLES}</style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">LATE PASS TO CLASS</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Reporting To</div><div class="value">${toTeacher}</div>
    <div class="label">Issued By</div><div class="value">${issuedBy}</div>
    ${lateReason ? `<div class="label">Reason for Lateness</div><div class="value">${lateReason}</div>` : ''}
    <div class="divider"></div>
    <div class="label">Date & Time Issued</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div class="sig-label">Signature / Initials</div>
    <div class="sig-line"></div>
    <div class="sig-name">${issuedBy} · Room ${room}</div>
    <div class="divider"></div>
    <div class="footer">Student is not expected to return to Room ${room}.<br/>Please mark student appropriately upon arrival.</div>
    <script>window.onload = function() { window.print(); }</script>
    </body></html>`)
  win.document.close()
}

function printPullPass({ studentName, fromTeacher, purpose, timeIssued, issuedBy, room }) {
  const win = window.open('', '_blank', 'width=420,height=550')
  win.document.write(`<!DOCTYPE html><html><head><title>Pull Pass</title>
    <style>${RECEIPT_STYLES}</style></head><body>
    <div class="header-title">RHS PassAble</div>
    <div class="header-sub">Riverdale High School · Room ${room}</div>
    <div class="divider"></div>
    <div class="tag">REQUEST TO RELEASE STUDENT</div>
    <div class="divider"></div>
    <div class="label">Student</div><div class="value">${studentName}</div>
    <div class="label">Currently In</div><div class="value">${fromTeacher}</div>
    <div class="label">Requested By</div><div class="value">${issuedBy} · Room ${room}</div>
    ${purpose ? `<div class="label">Purpose</div><div class="value">${purpose}</div>` : ''}
    <div class="divider"></div>
    <div class="label">Date & Time</div><div class="value">${timeIssued}</div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;gap:10px;">
      <div style="flex:1;text-align:center;">
        <div class="sig-label">Authorized By</div>
        <div class="sig-line"></div>
        <div class="sig-name">${issuedBy} · Rm ${room}</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div class="sig-label">Released By</div>
        <div class="sig-line"></div>
        <div class="sig-name">${fromTeacher}</div>
      </div>
    </div>
    <div class="divider"></div>
    <div class="footer">Please send student to Room ${room}.<br/>Thank you!</div>
    <script>window.onload = function() { window.print(); }</script>
    </body></html>`)
  win.document.close()
}

async function notifyReceivingTeacher({ toTeacher, studentName, issuedBy, timeIssued, passUrl }) {
  console.log('[PassAble] Late pass notification:', {
    to: `${toTeacher.toLowerCase().replace(/\s+/g, '.')}@rjusd.org`,
    subject: `Late Pass — ${studentName} heading your way`,
    body: `${studentName} issued a late pass to your class by ${issuedBy} at ${timeIssued}. Pass: ${passUrl}`,
  })
}

// ── Main component ────────────────────────────────────────────────────────────
function TeacherInner() {
  const searchParams = useSearchParams()

  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [email, setEmail] = useState('')
  const [authMode, setAuthMode] = useState('magic')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [magicEmail, setMagicEmail] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Camera
  const [cameras, setCameras] = useState([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockQR, setUnlockQR] = useState('')

  // Period & data
  const [activePeriod, setActivePeriod] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [heldPasses, setHeldPasses] = useState([])
  const [missedPasses, setMissedPasses] = useState([])
  const [checkingInMissed, setCheckingInMissed] = useState(null)
  const [dnloList, setDnloList] = useState([])
  const [students, setStudents] = useState({})
  const [allStudents, setAllStudents] = useState([])
  const [now, setNow] = useState(Date.now())

  // Checkout form
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [errandTeacher, setErrandTeacher] = useState('')
  const [purposeText, setPurposeText] = useState('')

  // Modals
  const [showLatePass, setShowLatePass] = useState(false)
  // lateStudents: array of { id: string|null, name: string, isOther: boolean }
  const [lateStudents, setLateStudents] = useState([])
  const [lateSearchInput, setLateSearchInput] = useState('')
  const [lateSearchOpen, setLateSearchOpen] = useState(false)
  const lateSearchRef = useRef(null)
  const [lateTeacher, setLateTeacher] = useState('')
  const [lateReason, setLateReason] = useState('')
  const [issuingLatePass, setIssuingLatePass] = useState(false)
  const [latePassSuccess, setLatePassSuccess] = useState(null)
  const [showPullPass, setShowPullPass] = useState(false)
  const [pullStudentName, setPullStudentName] = useState('')
  const [pullFromTeacher, setPullFromTeacher] = useState('')
  const [pullPurpose, setPullPurpose] = useState('')

  // Self-checkout
  const [selfCheckoutMode, setSelfCheckoutMode] = useState(false)
  const [selfCheckoutCode, setSelfCheckoutCode] = useState('')
  const [kioskReturnRequired, setKioskReturnRequired] = useState(true)
  const [kioskReturnSaved, setKioskReturnSaved] = useState(false)

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [pinSaved, setPinSaved] = useState(false)
  const [subCode, setSubCode] = useState('')
  const [newSubCode, setNewSubCode] = useState('')
  const [subCodeSaved, setSubCodeSaved] = useState(false)
  const [printPasses, setPrintPasses] = useState(false)
  const [printPassesSaved, setPrintPassesSaved] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [teacherDnloList, setTeacherDnloList] = useState([])
  const [rotated, setRotated] = useState(false)

  const prevHeldIds = useRef([])
  const prevActiveIds = useRef([])

  // ── Close late pass search on outside click ─────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (lateSearchRef.current && !lateSearchRef.current.contains(e.target)) {
        setLateSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Auth effects ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setAuthLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const magic = searchParams.get('magic')
    const emailParam = searchParams.get('email')
    if (magic === '1' && emailParam && !session) handleMagicLinkFromQR(emailParam)
  }, [searchParams])

  useEffect(() => {
    const saved = localStorage.getItem('teacher_camera')
    if (saved) setSelectedCamera(saved)
    navigator.mediaDevices?.getUserMedia({ video: true })
      .then(() => navigator.mediaDevices.enumerateDevices())
      .then(devices => setCameras(devices.filter(d => d.kind === 'videoinput')))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (session) { loadSettings(); loadCurrentTeacher() }
  }, [session])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'teacher_unlock_code').maybeSingle()
      .then(({ data }) => { if (data) setUnlockCode(data.value) })
  }, [])

  useEffect(() => {
    if (!activePeriod) return
    loadData()
    const timer = setInterval(() => { setNow(Date.now()); loadData() }, 15000)
    return () => clearInterval(timer)
  }, [activePeriod, currentTeacher])

  // ── Auth functions ──────────────────────────────────────────────────────────
  async function loadCurrentTeacher() {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return
    const { data } = await supabase.from('teachers').select('*').eq('auth_id', s.user.id).eq('is_active', true).maybeSingle()
    if (data) setCurrentTeacher(data)
  }

  async function handleQRScan(scannedEmail) {
    if (scannedEmail) {
      await handleMagicLinkFromQR(scannedEmail)
    } else {
      const { data: { session: s } } = await supabase.auth.getSession()
      if (s) setSession(s)
    }
  }

  async function handleMagicLinkFromQR(scannedEmail) {
    setMagicEmail(scannedEmail)
    const { error } = await supabase.auth.signInWithOtp({
      email: scannedEmail,
      options: { emailRedirectTo: 'https://hall-pass-lime.vercel.app/teacher' },
    })
    if (!error) setMagicSent(true)
  }

  async function handleSendMagicLink() {
    setSigningIn(true); setAuthError('')
    if (!email.endsWith('@rjusd.org') && email !== 'connect.joe@gmail.com') {
      setAuthError('Only @rjusd.org accounts are allowed.')
      setSigningIn(false)
      return
    }
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://hall-pass-lime.vercel.app/teacher' } })
    if (error) setAuthError('Could not send link. Try again.')
    else { setMagicSent(true); setMagicEmail(email) }
    setSigningIn(false)
  }

  async function handlePasswordSignIn() {
    setSigningIn(true); setAuthError('')
    if (!email.endsWith('@rjusd.org') && email !== 'connect.joe@gmail.com') {
      setAuthError('Only @rjusd.org accounts are allowed.')
      setSigningIn(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Invalid email or password.')
    setSigningIn(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setActivePeriod(null); setShowSettings(false); setCurrentTeacher(null)
    setMagicSent(false); setMagicEmail('')
  }

  // ── Settings ────────────────────────────────────────────────────────────────
  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['teacher_unlock_code', 'teacher_pin', 'sub_code', 'teacher_checkout_code', 'kiosk_return_required', 'print_passes'])
    if (!data) return
    const get = (key) => data.find(r => r.key === key)?.value
    const unlockVal = get('teacher_unlock_code')
    if (unlockVal) {
      setUnlockCode(unlockVal)
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${unlockVal}&room=${teacherRoom}`
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setUnlockQR)
    }
    if (get('teacher_pin')) setCurrentPin(get('teacher_pin'))
    if (get('sub_code')) setSubCode(get('sub_code'))
    if (get('teacher_checkout_code')) setSelfCheckoutCode(get('teacher_checkout_code'))
    if (get('kiosk_return_required')) setKioskReturnRequired(get('kiosk_return_required') !== 'false')
    if (get('print_passes')) setPrintPasses(get('print_passes') === 'true')
  }

  async function rotateUnlockCode() {
    setRotating(true)
    const newCode = Math.random().toString(36).substring(2, 12)
    await supabase.from('settings').update({ value: newCode }).eq('key', 'teacher_unlock_code')
    setUnlockCode(newCode)
    const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${newCode}&room=${teacherRoom}`
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then(qr => { setUnlockQR(qr); setRotating(false); setRotated(true); setTimeout(() => setRotated(false), 3000) })
  }

  async function savePin() {
    if (newPin.length !== 4 || isNaN(newPin)) return
    await supabase.from('settings').update({ value: newPin }).eq('key', 'teacher_pin')
    setCurrentPin(newPin); setNewPin(''); setPinSaved(true)
    setTimeout(() => setPinSaved(false), 3000)
  }

  async function saveSubCode() {
    if (newSubCode.length !== 4 || isNaN(newSubCode)) return
    await supabase.from('settings').update({ value: newSubCode }).eq('key', 'sub_code')
    setSubCode(newSubCode); setNewSubCode(''); setSubCodeSaved(true)
    setTimeout(() => setSubCodeSaved(false), 3000)
  }

  async function saveKioskReturn(val) {
    await supabase.from('settings').upsert({ key: 'kiosk_return_required', value: val ? 'true' : 'false' })
    setKioskReturnRequired(val); setKioskReturnSaved(true)
    setTimeout(() => setKioskReturnSaved(false), 2000)
  }

  async function generateCheckoutCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString()
    setSelfCheckoutCode(code)
    await supabase.from('settings').update({ value: code }).eq('key', 'active_checkout_code')
  }

  // ── Data loading ────────────────────────────────────────────────────────────
  async function loadData() {
    let passQuery = supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod).order('time_out')
    if (currentTeacher?.id) passQuery = passQuery.or(`teacher_id.eq.${currentTeacher.id},teacher_id.is.null`)
    const { data: passes } = await passQuery

    const room = currentTeacher?.room || '27'
    const { data: spRows } = await supabase.from('student_periods').select('student_id').eq('period', activePeriod).eq('room', room)
    const studentIds = spRows?.map(r => r.student_id) || []
    const { data: studs } = studentIds.length > 0
      ? await supabase.from('students').select('id, full_name, last_name').in('id', studentIds).order('first_name')
      : { data: [] }

    const { data: holds } = await supabase.from('pass_holds').select('*').is('released_at', null).order('held_at')
    const { data: dnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true)

    if (passes) {
      const newIds = passes.map(p => p.student_id)
      const returned = prevActiveIds.current.filter(id => !newIds.includes(id))
      if (returned.length > 0 && holds?.length > 0) playClearAlert()
      const LABEL_REASONS = ['Library', 'Office', 'Errand', 'On Assignment']
      passes.filter(p => !prevActiveIds.current.includes(p.student_id)).forEach(p => {
        const base = p.reason?.split(' — ')[0]
        if (printPasses && LABEL_REASONS.includes(base)) window.open(`/pass/${p.id}/label`, '_blank')
      })
      prevActiveIds.current = newIds
      setActivePasses(passes)
    }
    if (studs) {
      setAllStudents(studs)
      const map = {}; studs.forEach(s => map[s.id] = s); setStudents(map)
    }
    if (holds) {
      const newIds = holds.map(h => h.id)
      if (newIds.some(id => !prevHeldIds.current.includes(id)) && holds.length > 0) playAlert()
      prevHeldIds.current = newIds
      setHeldPasses(holds)
    }
    if (dnlo) setDnloList(dnlo.map(d => d.student_id))
    const { data: teacherDnlo } = await supabase
      .from('do_not_let_out')
      .select('student_id')
      .eq('active', true)
      .eq('scope', 'teacher')
      .eq('created_by', currentTeacher?.id || '')
    if (teacherDnlo) setTeacherDnloList(teacherDnlo.map(d => d.student_id))

    await loadMissedPasses(activePeriod)
  }

  async function loadMissedPasses(currentPeriod) {
    const currentPeriodNum = parseInt(currentPeriod)
    if (currentPeriodNum <= 1) { setMissedPasses([]); return }
    const pastPeriods = Array.from({ length: currentPeriodNum - 1 }, (_, i) => i + 1)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    const { data: missed } = await supabase.from('passes').select('*').is('time_in', null)
      .in('period', pastPeriods).gte('time_out', todayStart.toISOString()).lte('time_out', todayEnd.toISOString()).order('time_out')
    if (!missed) return
    const ids = [...new Set(missed.map(p => p.student_id))]
    const { data: studs } = await supabase.from('students').select('id, full_name').in('id', ids)
    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s)
    setMissedPasses(missed.map(p => ({ ...p, students: studMap[p.student_id] || null })))
  }

  // ── Pass actions ────────────────────────────────────────────────────────────
  async function handleReturn(passId) {
    const pass = activePasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    loadData()
  }

  async function handleMissedReturn(passId) {
    setCheckingInMissed(passId)
    const pass = missedPasses.find(p => p.id === passId)
    const mins = Math.floor((new Date() - new Date(pass.time_out)) / 60000)
    await supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', passId)
    setMissedPasses(prev => prev.filter(p => p.id !== passId))
    setCheckingInMissed(null)
  }

  async function handleOverride(hold) {
    await supabase.from('pass_holds').update({
      released_at: new Date().toISOString(), override: true,
      override_by: currentTeacher?.email || session?.user?.email || 'unknown',
    }).eq('id', hold.id)
    await supabase.from('passes').insert({
      student_id: hold.student_id, reason: hold.reason,
      room: currentTeacher?.room || '27', period: hold.period,
      teacher_id: currentTeacher?.id || null, time_out: new Date().toISOString(),
    })
    loadData()
  }

  async function handleDismissHold(holdId) {
    await supabase.from('pass_holds').update({ released_at: new Date().toISOString() }).eq('id', holdId)
    loadData()
  }

  async function handleTeacherCheckout() {
    if (!selected || !reason) return
    if (reason === 'On Assignment' && !assignedTeacher) return

    if (dnloList.includes(selected)) {
      playDnloAlert()
      await supabase.from('do_not_let_out').insert({
        student_id: selected, reason: 'Teacher override on teacher page',
        scope: 'override_log', created_by: currentTeacher?.email || session?.user?.email || 'teacher', active: false,
      }).catch(() => {})
    }

    let finalReason = reason
    if (reason === 'On Assignment' && assignedTeacher)
      finalReason = purposeText.trim() ? `On Assignment — ${assignedTeacher} — ${purposeText.trim()}` : `On Assignment — ${assignedTeacher}`
    else if (reason === 'Errand' && errandTeacher)
      finalReason = purposeText.trim() ? `Errand — ${errandTeacher} — ${purposeText.trim()}` : `Errand — ${errandTeacher}`
    else if (reason === 'Errand' && purposeText.trim())
      finalReason = `Errand — ${purposeText.trim()}`
    else if (reason === 'Other' && purposeText.trim())
      finalReason = `Other — ${purposeText.trim()}`

    const { data: passData } = await supabase.from('passes').insert({
      student_id: selected, reason: finalReason,
      room: currentTeacher?.room || '27', period: activePeriod,
      teacher_id: currentTeacher?.id || null,
    }).select().single()

    const PRINT_REASONS = ['Restroom', 'Library', 'Office', 'Errand', 'On Assignment', 'Other']
    if (PRINT_REASONS.includes(finalReason.split(' — ')[0]) && passData?.id) {
      const studentName = allStudents.find(s => s.id === selected)?.full_name || 'Student'
      const timeIssued = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      printHallPass({ passId: passData.id, studentName, reason: finalReason, timeIssued, room: currentTeacher?.room || '27' })
    }

    setSelected(''); setReason(''); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('')
    loadData()
  }

  // ── Late pass — supports multiple students ─────────────────────────────────
  async function handleIssueLatePass() {
    if (lateStudents.length === 0 || !lateTeacher) return
    setIssuingLatePass(true)
    const issuedBy = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
    const room = currentTeacher?.room || '27'
    const now = new Date()
    const timeIssued = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    for (const student of lateStudents) {
      const studentName = student.name
      if (!student.isOther) {
        await supabase.from('passes').insert({
          student_id: student.id, reason: `Late Pass → ${lateTeacher}`,
          room, period: activePeriod, teacher_id: currentTeacher?.id || null,
          time_out: now.toISOString(), time_in: now.toISOString(), duration_minutes: 0, pass_type: 'late_pass',
        })
      }
      printLatePass({ studentName, toTeacher: lateTeacher, timeIssued, lateReason, issuedBy, room })
      await notifyReceivingTeacher({ toTeacher: lateTeacher, studentName, issuedBy, timeIssued, passUrl: window.location.origin })
    }

    const names = lateStudents.map(s => s.name).join(', ')
    setLatePassSuccess({ studentName: names, toTeacher: lateTeacher })
    setIssuingLatePass(false)
    setLateStudents([]); setLateTeacher(''); setLateReason(''); setLateSearchInput('')
    loadData()
    setTimeout(() => { setLatePassSuccess(null); setShowLatePass(false) }, 4000)
  }

  // ── Late pass tag input helpers ────────────────────────────────────────────
  function addLateStudent(student) {
    if (lateStudents.find(x => x.id === student.id)) return
    setLateStudents(prev => [...prev, { id: student.id, name: student.full_name, isOther: false }])
    setLateSearchInput('')
    setLateSearchOpen(false)
  }

  function addLateStudentOther(name) {
    const trimmed = name.trim()
    if (!trimmed || lateStudents.find(x => x.name === trimmed)) return
    setLateStudents(prev => [...prev, { id: null, name: trimmed, isOther: true }])
    setLateSearchInput('')
    setLateSearchOpen(false)
  }

  function removeLateStudent(key) {
    setLateStudents(prev => prev.filter(x => (x.id || x.name) !== key))
  }

  function resetLatePass() {
    setShowLatePass(false)
    setLateStudents([])
    setLateSearchInput('')
    setLateSearchOpen(false)
    setLateTeacher('')
    setLateReason('')
  }

  // ── Derived ─────────────────────────────────────────────────────────────────
  const overLimit = activePasses.filter(p => Math.floor((now - new Date(p.time_out)) / 60000) >= TIME_LIMIT)
  const elapsed = (timeOut) => Math.floor((now - new Date(timeOut)) / 60000)
  const elapsedColor = (mins) => mins >= TIME_LIMIT ? 'text-red-500' : mins >= TIME_LIMIT * 0.7 ? 'text-amber-500' : 'text-green-600'
  const teacherDisplayName = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
  const teacherRoom = currentTeacher?.room || '27'

  const periods = currentTeacher?.periods?.length
    ? currentTeacher.periods.sort().map(p => ({
        value: p,
        label: currentTeacher.period_labels?.[p] || `Period ${p}`,
      }))
    : [
        { value: '1', label: 'Periods 1 & 2' },
        { value: '4', label: 'Periods 4 & 5' },
        { value: '6', label: 'Periods 6 & 7' },
      ]

  const periodLabel = periods.find(p => p.value === activePeriod)?.label || `Period ${activePeriod}`

  // ── Filtered students for late pass search ─────────────────────────────────
  const lateSearchFiltered = lateSearchInput.trim().length > 0
    ? allStudents
        .filter(s =>
          s.full_name.toLowerCase().includes(lateSearchInput.trim().toLowerCase()) &&
          !lateStudents.find(x => x.id === s.id)
        )
        .slice(0, 6)
    : []

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  if (!session) {
    if (magicSent) return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4" />
        <div className="text-4xl mb-4">📬</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: RHS_GREEN }}>Check your email</h1>
        <p className="text-gray-500 text-sm text-center mb-2">
          A sign-in link was sent to<br />
          <span className="font-medium text-gray-700">{magicEmail}</span>
        </p>
        <p className="text-gray-400 text-xs text-center mb-8">Tap the link in your email to sign in.</p>
        <button onClick={() => { setMagicSent(false); setMagicEmail('') }}
          className="text-sm text-gray-400 hover:text-gray-600">← Try again</button>
      </div>
    )

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
        <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
        <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
        <p className="text-gray-400 text-sm mb-8">Sign in to continue</p>
        <div className="w-full max-w-xs flex flex-col gap-3">
          {authMode === 'magic' ? (
            <>
              <input type="email" placeholder="you@rjusd.org" value={email}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMagicLink()}
                className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
                style={{ borderColor: RHS_GREEN }} />
              {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
              <button onClick={handleSendMagicLink} disabled={signingIn || !email}
                className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: RHS_GREEN }}>
                {signingIn ? 'Sending...' : '✉️ Send Sign-In Link'}
              </button>
              <button onClick={() => setAuthMode('password')} className="text-xs text-center text-gray-400 hover:text-gray-600">
                Use password instead
              </button>
            </>
          ) : (
            <>
              <input type="email" placeholder="you@rjusd.org" value={email}
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordSignIn()}
                className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
                style={{ borderColor: RHS_GREEN }} />
              <input type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePasswordSignIn()}
                className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
                style={{ borderColor: RHS_GREEN }} />
              {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
              <button onClick={handlePasswordSignIn} disabled={signingIn || !email || !password}
                className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
                style={{ backgroundColor: RHS_GREEN }}>
                {signingIn ? 'Signing in...' : 'Sign In'}
              </button>
              <button onClick={() => setAuthMode('magic')} className="text-xs text-center text-gray-400 hover:text-gray-600">
                ← Send magic link instead
              </button>
            </>
          )}
          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or scan teacher QR</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <QRScanner onUnlock={handleQRScan} unlockCode={unlockCode} deviceId={selectedCamera} />
            {cameras.length > 1 && (
              <select value={selectedCamera}
                onChange={e => { setSelectedCamera(e.target.value); localStorage.setItem('teacher_camera', e.target.value) }}
                className="text-xs text-gray-500 border border-gray-200 rounded-lg px-2 py-1 bg-white w-48">
                <option value="">Default camera</option>
                {cameras.map((c, i) => <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${i + 1}`}</option>)}
              </select>
            )}
          </div>
        </div>
        <a href="/" className="mt-8 text-sm text-gray-400 hover:text-gray-600">← Home</a>
      </div>
    )
  }

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
      <p className="text-gray-400 text-sm mb-1">Welcome, {teacherDisplayName}</p>
      <p className="text-gray-400 text-sm mb-8">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {periods.map(p => (
          <button key={p.value} onClick={() => { setActivePeriod(p.value); generateCheckoutCode() }}
            className="py-4 text-lg font-bold bg-white border-2 rounded-xl shadow-sm hover:bg-green-50"
            style={{ borderColor: RHS_GREEN, color: RHS_GREEN }}>
            {p.label}
          </button>
        ))}
      </div>
      <button onClick={handleSignOut} className="mt-8 text-sm text-gray-400 hover:text-gray-600">Sign Out</button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Pull Pass Modal ── */}
      {showPullPass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Request Student</h2>
                <p className="text-xs text-gray-400">Print a pass to pull a student from another class</p>
              </div>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Student Name</label>
                <input type="text" placeholder="First and last name" value={pullStudentName}
                  onChange={e => setPullStudentName(e.target.value)}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Currently In</label>
                <select value={pullFromTeacher} onChange={e => setPullFromTeacher(e.target.value)}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Select teacher —</option>
                  {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">Purpose</label>
                <input type="text" placeholder="e.g. meeting, project, makeup work..." value={pullPurpose}
                  onChange={e => setPullPurpose(e.target.value)}
                  className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                  style={{ borderColor: RHS_GREEN }} />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => {
                const timeIssued = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
                  ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                printPullPass({ studentName: pullStudentName, fromTeacher: pullFromTeacher, purpose: pullPurpose, timeIssued, issuedBy: teacherDisplayName, room: teacherRoom })
                setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('')
              }} disabled={!pullStudentName || !pullFromTeacher}
                className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30"
                style={{ backgroundColor: RHS_GREEN }}>
                🖨️ Print Pass
              </button>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }}
                className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Late Pass Modal ── */}
      {showLatePass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Issue Late Pass</h2>
                <p className="text-xs text-gray-400">Student will not return to Room {teacherRoom}</p>
              </div>
              <button onClick={resetLatePass}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {latePassSuccess ? (
              <div className="text-center py-4">
                <div className="text-4xl mb-2">🖨️</div>
                <p className="font-semibold text-gray-800">{latePassSuccess.studentName}</p>
                <p className="text-sm text-gray-500">Late pass to {latePassSuccess.toTeacher} — printing...</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">

                  {/* ── Student tag input ── */}
                  <div ref={lateSearchRef}>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Students</label>

                    {/* Chips */}
                    {lateStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {lateStudents.map((s) => (
                          <span
                            key={s.id || s.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: s.isOther ? '#f3f4f6' : '#dcfce7',
                              color: s.isOther ? '#374151' : RHS_GREEN,
                              border: `1px solid ${s.isOther ? '#d1d5db' : '#86efac'}`,
                            }}>
                            {s.isOther && <span className="opacity-40 mr-0.5">✎</span>}
                            {s.name}
                            <button
                              onClick={() => removeLateStudent(s.id || s.name)}
                              className="ml-0.5 hover:opacity-60 leading-none font-bold">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Search input */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={lateStudents.length === 0 ? 'Search student or type name…' : 'Add another…'}
                        value={lateSearchInput}
                        onChange={e => { setLateSearchInput(e.target.value); setLateSearchOpen(true) }}
                        onFocus={() => setLateSearchOpen(true)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && lateSearchInput.trim()) {
                            const match = lateSearchFiltered[0]
                            if (match) {
                              addLateStudent(match)
                            } else {
                              addLateStudentOther(lateSearchInput)
                            }
                          }
                          if (e.key === 'Escape') setLateSearchOpen(false)
                        }}
                        className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
                        style={{ borderColor: RHS_GREEN }}
                      />

                      {/* Dropdown */}
                      {lateSearchOpen && lateSearchInput.trim().length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          {lateSearchFiltered.map(s => (
                            <button
                              key={s.id}
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => addLateStudent(s)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 text-gray-800 transition-colors">
                              {s.full_name}
                            </button>
                          ))}
                          {/* Other / freeform option */}
                          {lateSearchInput.trim().length > 1 && (
                            <button
                              onMouseDown={e => e.preventDefault()}
                              onClick={() => addLateStudentOther(lateSearchInput)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-t border-gray-100 italic transition-colors">
                              ✎ Add &ldquo;{lateSearchInput.trim()}&rdquo; as other
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Reporting To */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Reporting To</label>
                    <select value={lateTeacher} onChange={e => setLateTeacher(e.target.value)}
                      className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                      style={{ borderColor: RHS_GREEN }}>
                      <option value="">— Select teacher —</option>
                      {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Reason for Lateness</label>
                    <input type="text" placeholder="e.g. finishing assignment, helping in class..."
                      value={lateReason} onChange={e => setLateReason(e.target.value)}
                      className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800"
                      style={{ borderColor: RHS_GREEN }} />
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-700">
                  {lateStudents.length > 1
                    ? `${lateStudents.length} passes will print — one per student.`
                    : 'A receipt will print and the receiving teacher will be notified.'}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleIssueLatePass}
                    disabled={lateStudents.length === 0 || !lateTeacher || issuingLatePass}
                    className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {issuingLatePass
                      ? 'Issuing...'
                      : lateStudents.length > 1
                        ? `🖨️ Print ${lateStudents.length} Passes`
                        : '🖨️ Print & Issue'}
                  </button>
                  <button onClick={resetLatePass}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">RHS PassAble · Teacher</h1>
            <p className="text-green-200 text-xs">Room {teacherRoom} · {periodLabel} · {teacherDisplayName}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <a href="/analytics" className="text-sm text-green-200 hover:text-white">Analytics</a>
          {currentTeacher?.is_admin && (
            <a href="/admin" className="text-sm text-green-200 hover:text-white">Admin</a>
          )}
          <button onClick={() => setActivePeriod(null)} className="text-sm text-green-200 hover:text-white">← Period</button>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto">

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Currently Out', value: activePasses.length, color: activePasses.length > 0 ? 'text-red-500' : 'text-green-600' },
            { label: `Over ${TIME_LIMIT} min`, value: overLimit.length, color: overLimit.length > 0 ? 'text-red-500' : 'text-green-600' },
            { label: 'On Hold', value: heldPasses.length, color: heldPasses.length > 0 ? 'text-amber-500' : 'text-green-600' },
          ].map(m => (
            <div key={m.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-xs text-gray-500 mb-1">{m.label}</div>
              <div className={`text-2xl font-semibold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* ── Held passes ── */}
        {heldPasses.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
              <span className="text-amber-700 text-sm font-medium">⚠ Students on Hold — conflict rule active</span>
            </div>
            {heldPasses.map(hold => (
              <div key={hold.id} className="px-4 py-3 border-b border-amber-100 last:border-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{students[hold.student_id]?.full_name || hold.student_id} → {hold.reason}</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Held at {new Date(hold.held_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · conflicting student still out
                  </p>
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button onClick={() => handleOverride(hold)}
                    className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: RHS_GREEN }}>
                    Override & Send
                  </button>
                  <button onClick={() => handleDismissHold(hold.id)}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Alerts ── */}
        {activePasses.length >= 2 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            ⚠ {activePasses.length} students out simultaneously: {activePasses.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')}
          </div>
        )}
        {overLimit.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
            ! {overLimit.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')} {overLimit.length === 1 ? 'has' : 'have'} been out over {TIME_LIMIT} min
          </div>
        )}

        {/* ── Students Out card ── */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students Out</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPullPass(true)}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                style={{ backgroundColor: '#7c3aed' }}>
                📋 Request Student
              </button>
              <button onClick={() => setShowLatePass(true)}
                className="text-xs px-3 py-1.5 rounded-lg text-white font-medium"
                style={{ backgroundColor: '#1d4ed8' }}>
                🖨️ Issue Late Pass
              </button>
              <button onClick={loadData} className="text-xs text-gray-400 hover:text-gray-600">Refresh</button>
            </div>
          </div>

          {activePasses.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">All students are in the classroom</div>
          ) : activePasses.map(pass => {
            const mins = elapsed(pass.time_out)
            const student = students[pass.student_id]
            const isLatePass = pass.pass_type === 'late_pass'
            return (
              <div key={pass.id}
                className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${isLatePass ? 'bg-blue-50' : ''}`}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white"
                  style={{ backgroundColor: isLatePass ? '#1d4ed8' : RHS_GREEN }}>
                  {student?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{student?.full_name}</span>
                    {isLatePass && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Late Pass</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {pass.reason} · out at {new Date(pass.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
                <span className={`text-sm font-medium w-10 text-right ${elapsedColor(mins)}`}>{mins}m</span>
                {!isLatePass && (
                  <button onClick={() => handleReturn(pass.id)}
                    className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: RHS_GREEN }}>
                    Return
                  </button>
                )}
              </div>
            )
          })}

          {/* ── Checkout form ── */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <div className="text-xs font-medium text-gray-500 mb-2">Check out a student</div>
            <div className="flex gap-2 mb-2">
              <select value={selected} onChange={e => setSelected(e.target.value)}
                className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
                style={{ borderColor: RHS_GREEN }}>
                <option value="">— Student —</option>
                {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select value={reason} onChange={e => { setReason(e.target.value); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('') }}
                className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800"
                style={{ borderColor: RHS_GREEN }}>
                <option value="">— Reason —</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleTeacherCheckout}
                disabled={!selected || !reason || (reason === 'On Assignment' && !assignedTeacher)}
                className="px-4 py-2 text-sm rounded-lg disabled:opacity-30 font-medium text-white"
                style={{ backgroundColor: selected && dnloList.includes(selected) ? '#dc2626' : RHS_GREEN }}>
                {selected && dnloList.includes(selected) ? '⚠ Override' : 'Send'}
              </button>
            </div>

            {selected && dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-red-600 border border-red-700 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⛔</span>
                <div>
                  <div>Do Not Let Out — Admin Restriction</div>
                  <div className="text-xs font-normal text-red-200 mt-0.5">Clicking Send will log an override. Confirm with student before proceeding.</div>
                </div>
              </div>
            )}
            {selected && teacherDnloList.includes(selected) && !dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-amber-500 border border-amber-600 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <div>
                  <div>Your Do Not Let Out List</div>
                  <div className="text-xs font-normal text-amber-100 mt-0.5">You added this student to your DNLO list. You can still send them — this is a reminder only.</div>
                </div>
              </div>
            )}

            {reason === 'On Assignment' && (
              <div className="flex flex-col gap-2">
                <select value={assignedTeacher} onChange={e => setAssignedTeacher(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Select a teacher —</option>
                  {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="text" placeholder="Purpose (e.g. picking up worksheets)"
                  value={purposeText} onChange={e => setPurposeText(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
              </div>
            )}
            {reason === 'Errand' && (
              <div className="flex flex-col gap-2">
                <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Select a teacher (optional) —</option>
                  {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <select value={purposeText} onChange={e => setPurposeText(e.target.value)}
                  className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                  <option value="">— Select location (optional) —</option>
                  {ERRAND_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            )}
            {reason === 'Other' && (
              <input type="text" placeholder="Describe reason..."
                value={purposeText} onChange={e => setPurposeText(e.target.value)}
                className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800 mt-2" style={{ borderColor: RHS_GREEN }} />
            )}

            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex gap-2 mb-2">
                {[{ label: 'Manual', val: false }, { label: 'Self-Checkout Mode', val: true }].map(({ label, val }) => (
                  <button key={label} onClick={() => setSelfCheckoutMode(val)}
                    className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                    style={{
                      background: selfCheckoutMode === val ? RHS_GREEN : 'white',
                      color: selfCheckoutMode === val ? 'white' : '#6b7280',
                      outline: selfCheckoutMode !== val ? '1px solid #d1d5db' : 'none',
                      border: 'none', cursor: 'pointer',
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              {selfCheckoutMode && (
                <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                  <div className="text-4xl font-mono font-black tracking-widest text-gray-800 mb-1">{selfCheckoutCode || '—'}</div>
                  <div className="text-xs text-gray-500 mb-1">Teacher session code — tell students to go to:</div>
                  <div className="text-xs font-mono font-bold mb-3" style={{ color: RHS_GREEN }}>hall-pass-lime.vercel.app/self-checkout</div>
                  <button onClick={generateCheckoutCode}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 mb-3">
                    🔄 Generate New Code
                  </button>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-700">Kiosk return required:</span>
                    <button onClick={() => saveKioskReturn(!kioskReturnRequired)}
                      className="px-3 py-1 rounded-full text-xs font-semibold transition-colors"
                      style={{ background: kioskReturnRequired ? RHS_GREEN : '#e5e7eb', color: kioskReturnRequired ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>
                      {kioskReturnRequired ? 'ON' : 'OFF'}
                    </button>
                    {kioskReturnSaved && <span className="text-xs" style={{ color: RHS_GREEN }}>✓ Saved</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    {kioskReturnRequired ? 'Students must scan at kiosk to return' : "Students see an \"I'm Back\" button on their device"}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Missed passes ── */}
        {missedPasses.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50">
              <div>
                <span className="text-sm font-medium text-orange-700">⚠ Didn't Return — Previous Periods</span>
                <p className="text-xs text-orange-500 mt-0.5">These students checked out earlier today and never scanned back in.</p>
              </div>
              <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">{missedPasses.length}</span>
            </div>
            {missedPasses.map(pass => {
              const name = pass.students?.full_name || 'Unknown'
              const initials = name.split(' ').map(n => n[0]).slice(0,2).join('')
              const mins = Math.floor((Date.now() - new Date(pass.time_out)) / 60000)
              const timeOut = new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={pass.id} className="flex items-center gap-3 px-4 py-3 border-b border-orange-50 last:border-0">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white bg-orange-400">
                    {initials}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800">{name}</span>
                      <span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">P{pass.period}</span>
                    </div>
                    <div className="text-xs text-gray-400">{pass.reason} · out at {timeOut} · {mins}m ago</div>
                  </div>
                  <button onClick={() => handleMissedReturn(pass.id)} disabled={checkingInMissed === pass.id}
                    className="text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50"
                    style={{ backgroundColor: RHS_GREEN }}>
                    {checkingInMissed === pass.id ? '...' : 'Check In'}
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Settings ── */}
        {showSettings && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Teacher Unlock QR</p>
                  <p className="text-xs text-gray-400">Scan to sign in without typing password</p>
                </div>
                <button onClick={rotateUnlockCode} disabled={rotating}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${rotated ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                  {rotating ? 'Rotating...' : rotated ? '✓ Rotated' : 'Rotate Code'}
                </button>
              </div>
              <div className="flex items-center gap-4">
                {unlockQR && <img src={unlockQR} alt="Teacher unlock QR" className="w-24 h-24" />}
                <div>
                  <p className="text-xs text-gray-400 mb-1">Current code</p>
                  <p className="text-sm font-mono text-gray-700">{unlockCode}</p>
                  <p className="text-xs text-gray-400 mt-2">Tap Rotate Code anytime to invalidate the old one.</p>
                  <a href="/unlock" target="_blank" className="text-xs mt-2 inline-block" style={{ color: RHS_GREEN }}>Open full-screen QR →</a>
<div className="flex gap-2 mt-3 flex-wrap">
  <button
    onClick={() => navigator.clipboard.writeText(`https://hall-pass-lime.vercel.app/unlock?code=${unlockCode}&room=${teacherRoom}`)}
    className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
    style={{ backgroundColor: RHS_GREEN }}>
    📋 Copy QR Link
  </button>
  
    <a href={`/unlock?code=${unlockCode}&room=${teacherRoom}`}
    target="_blank"
    className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
    📱 Open on this device →
  </a>
</div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Kiosk URL</p>
                <p className="text-xs text-gray-400">Share this URL to set up your classroom kiosk on any device</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 mb-3 break-all">
                {`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => navigator.clipboard.writeText(`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ backgroundColor: RHS_GREEN }}>
                  📋 Copy URL
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`)}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                  📲 Copy for NFC Tag
                </button>
              </div>
              <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
                💡 To write to an NFC sticker: open <strong>NFC Tools for Desktop</strong> → Write → URL → paste the URL above. Tap the sticker on the kiosk computer to launch instantly.
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Substitute Code</p>
                <p className="text-xs text-gray-400">Current code: <span className="font-mono">{subCode}</span></p>
              </div>
              <div className="flex gap-2">
                <input type="number" maxLength={4} placeholder="New 4-digit sub code" value={newSubCode}
                  onChange={e => setNewSubCode(e.target.value.slice(0, 4))}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={saveSubCode} disabled={newSubCode.length !== 4}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${subCodeSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`}
                  style={!subCodeSaved ? { backgroundColor: RHS_GREEN } : {}}>
                  {subCodeSaved ? '✓ Saved' : 'Save Code'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Printable Passes</p>
                  <p className="text-xs text-gray-400">Auto-open a printable pass label when a student is checked out to Library, Office, Errand, or On Assignment</p>
                </div>
                <button
                  onClick={async () => {
                    const newVal = !printPasses
                    setPrintPasses(newVal)
                    await supabase.from('settings').upsert({ key: 'print_passes', value: String(newVal) }, { onConflict: 'key' })
                    setPrintPassesSaved(true)
                    setTimeout(() => setPrintPassesSaved(false), 2000)
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${printPasses ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${printPasses ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {printPassesSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Keypad PIN</p>
                <p className="text-xs text-gray-400">Current PIN: <span className="font-mono">{currentPin}</span></p>
              </div>
              <div className="flex gap-2">
                <input type="number" maxLength={4} placeholder="New 4-digit PIN" value={newPin}
                  onChange={e => setNewPin(e.target.value.slice(0, 4))}
                  className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={savePin} disabled={newPin.length !== 4}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${pinSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`}
                  style={!pinSaved ? { backgroundColor: RHS_GREEN } : {}}>
                  {pinSaved ? '✓ Saved' : 'Save PIN'}
                </button>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end mb-4">
          <button onClick={() => setShowSettings(s => !s)}
            className="text-xs px-3 py-1.5 border rounded-lg text-gray-500 hover:bg-gray-50">
            {showSettings ? '🔒 Hide Settings' : '⚙️ Show Settings'}
          </button>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-2">
          <a href="/admin/students" className="text-sm text-gray-400 hover:text-gray-600">Manage Students →</a>
          <a href={`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`} className="text-sm text-gray-400 hover:text-gray-600">Import Roster →</a>
          <a href="/qr" className="text-sm text-gray-400 hover:text-gray-600">Print QR Badges →</a>
          <a href="/log" className="text-sm text-gray-400 hover:text-gray-600">Pass Log →</a>
          <a href="/teacher/dnlo" className="text-sm text-gray-400 hover:text-gray-600">Do Not Let Out →</a>
          <a href={`/kiosk?room=${teacherRoom}`} className="text-sm text-gray-400 hover:text-gray-600">Open Kiosk →</a>
        </div>
      </div>
    </div>
  )
}

export default function Teacher() {
  return (
    <Suspense>
      <TeacherInner />
    </Suspense>
  )
}
