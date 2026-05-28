'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'
// ── Inlined schedule logic (no import dependency) ─────────────────────────────

const SCHEDULES = {
  regular: { name: 'Regular', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'09:02' },
    { id:'2', label:'Period 2', start:'09:06', end:'09:56' },
    { id:'brunch', label:'Brunch', start:'09:56', end:'10:11', break:true },
    { id:'3', label:'Period 3', start:'10:15', end:'11:05' },
    { id:'4', label:'Period 4', start:'11:09', end:'11:59' },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'5', label:'Period 5', start:'12:37', end:'13:27' },
    { id:'6', label:'Period 6', start:'13:31', end:'14:21' },
    { id:'7', label:'Period 7', start:'14:25', end:'15:15' },
  ]},
  earlyRelease: { name: 'Early Release', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:41' },
    { id:'3', label:'Period 3', start:'09:45', end:'10:26' },
    { id:'4', label:'Period 4', start:'10:30', end:'11:11' },
    { id:'lunch', label:'Lunch', start:'11:11', end:'11:45', break:true },
    { id:'5', label:'Period 5', start:'11:49', end:'12:30' },
    { id:'6', label:'Period 6', start:'12:34', end:'13:15' },
    { id:'7', label:'Period 7', start:'13:19', end:'14:00' },
  ]},
  blockWed: { name: 'Block Day (Wed)', periods: [
    { id:'1', label:'Periods 1 & 2', start:'08:10', end:'09:57' },
    { id:'brunch', label:'Brunch', start:'09:57', end:'10:12', break:true },
    { id:'3', label:'Periods 3 & 4', start:'10:16', end:'11:59' },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'5', label:'Periods 5 & 6', start:'12:37', end:'14:20' },
    { id:'7', label:'Period 7', start:'14:24', end:'15:15' },
  ]},
  blockThu: { name: 'Block Day (Thu)', periods: [
    { id:'2', label:'Periods 1 & 2', start:'08:10', end:'09:57' },
    { id:'brunch', label:'Brunch', start:'09:57', end:'10:12', break:true },
    { id:'4', label:'Periods 3 & 4', start:'10:16', end:'11:59' },
    { id:'lunch', label:'Lunch', start:'11:59', end:'12:33', break:true },
    { id:'6', label:'Periods 5 & 6', start:'12:37', end:'14:20' },
    { id:'7', label:'Period 7', start:'14:24', end:'15:15' },
  ]},
  minimum: { name: 'Minimum Day', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:46' },
    { id:'2', label:'Period 2', start:'08:50', end:'09:23' },
    { id:'3', label:'Period 3', start:'09:27', end:'10:00' },
    { id:'4', label:'Period 4', start:'10:04', end:'10:37' },
    { id:'brunch', label:'Brunch/Lunch', start:'10:37', end:'11:10', break:true },
    { id:'5', label:'Period 5', start:'11:14', end:'11:47' },
    { id:'6', label:'Period 6', start:'11:51', end:'12:24' },
    { id:'7', label:'Period 7', start:'12:28', end:'13:01' },
  ]},
  activity: { name: 'Activity Day', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:44' },
    { id:'brunch', label:'Brunch', start:'09:44', end:'09:59', break:true },
    { id:'3', label:'Period 3', start:'10:03', end:'10:47' },
    { id:'4', label:'Period 4', start:'10:51', end:'11:35' },
    { id:'5', label:'Period 5', start:'11:39', end:'12:23' },
    { id:'lunch', label:'Lunch', start:'12:23', end:'12:57', break:true },
    { id:'6', label:'Period 6', start:'13:01', end:'13:45' },
    { id:'7', label:'Period 7', start:'13:49', end:'14:33' },
  ]},
  foggy: { name: 'Foggy/Late Arrival', periods: [
    { id:'1', label:'Period 1', start:'10:00', end:'10:44' },
    { id:'2', label:'Period 2', start:'10:48', end:'11:28' },
    { id:'3', label:'Period 3', start:'11:32', end:'12:12' },
    { id:'lunch', label:'Lunch', start:'12:12', end:'12:49', break:true },
    { id:'4', label:'Period 4', start:'12:53', end:'13:33' },
    { id:'5', label:'Period 5', start:'13:37', end:'14:17' },
    { id:'6', label:'Period 6', start:'14:21', end:'15:01' },
    { id:'7', label:'Period 7', start:'15:05', end:'15:45' },
  ]},
  codeDay: { name: 'C.O.D.E Day', periods: [
    { id:'1', label:'Period 1', start:'08:10', end:'08:56' },
    { id:'2', label:'Period 2', start:'09:00', end:'09:44' },
    { id:'brunch', label:'Brunch', start:'09:44', end:'09:59', break:true },
    { id:'3', label:'Period 3', start:'10:03', end:'10:47' },
    { id:'4', label:'Period 4', start:'10:51', end:'11:35' },
    { id:'rally', label:'Kickball Rally', start:'11:39', end:'12:17', break:true },
    { id:'lunch', label:'Lunch', start:'12:17', end:'12:51', break:true },
    { id:'5', label:'Period 5', start:'12:55', end:'13:39' },
    { id:'6', label:'Period 6', start:'13:43', end:'14:27' },
    { id:'7', label:'Period 7', start:'14:31', end:'15:15' },
  ]},
  // ── Finals Week (June 8–12, 2026) — REMOVE AFTER JUNE 12 ─────────────────
  finals1: { name: 'Finals — Day 1', periods: [
    { id:'1', label:'Period 1 (Review)', start:'08:10', end:'08:48' },
    { id:'2', label:'Period 2 (Review)', start:'08:52', end:'09:28' },
    { id:'3', label:'Period 3 (Review)', start:'09:32', end:'10:08' },
    { id:'brunch', label:'Brunch', start:'10:08', end:'10:23', break:true },
    { id:'4', label:'Period 4 (Review)', start:'10:27', end:'11:03' },
    { id:'5', label:'Period 5 (Review)', start:'11:07', end:'11:43' },
    { id:'lunch', label:'Lunch', start:'11:43', end:'12:18', break:true },
    { id:'6', label:'Period 6 (Review)', start:'12:22', end:'12:58' },
    { id:'final6', label:'Final — Period 6', start:'13:02', end:'14:35' },
    { id:'7', label:'Period 7 (Review)', start:'14:39', end:'15:15' },
  ]},
  finals2: { name: 'Finals — Day 2', periods: [
    { id:'1', label:'Period 1 (Review)', start:'08:10', end:'08:54' },
    { id:'final1', label:'Final — Period 1', start:'08:58', end:'10:31' },
    { id:'brunch', label:'Brunch', start:'10:31', end:'10:46', break:true },
    { id:'6', label:'Period 6 (Review)', start:'10:50', end:'11:32' },
    { id:'2', label:'Period 2 (Review)', start:'11:36', end:'12:18' },
    { id:'lunch', label:'Lunch', start:'12:18', end:'12:53', break:true },
    { id:'final2', label:'Final — Period 2', start:'12:57', end:'14:30' },
    { id:'mtg', label:'Class Meetings', start:'14:34', end:'15:15', break:true },
  ]},
  finals3: { name: 'Finals — Day 3', periods: [
    { id:'3', label:'Period 3 (Review)', start:'08:10', end:'08:40' },
    { id:'final3', label:'Final — Period 3', start:'08:44', end:'10:17' },
    { id:'4', label:'Period 4 (Review)', start:'10:21', end:'10:51' },
    { id:'lunch', label:'Lunch', start:'10:51', end:'11:24', break:true },
    { id:'final4', label:'Final — Period 4', start:'11:28', end:'13:01' },
  ]},
  finals4: { name: 'Finals — Day 4', periods: [
    { id:'5', label:'Period 5 (Review)', start:'08:10', end:'08:40' },
    { id:'final5', label:'Final — Period 5', start:'08:44', end:'10:17' },
    { id:'7', label:'Period 7 (Review)', start:'10:21', end:'10:51' },
    { id:'lunch', label:'Lunch', start:'10:51', end:'11:24', break:true },
    { id:'final7', label:'Final — Period 7', start:'11:28', end:'13:01' },
  ]},
  // finals5 = minimum day (June 12) — already handled by 'minimum' schedule
}

// ── Finals dates hardcoded — REMOVE AFTER JUNE 12, 2026 ─────────────────────
const FINALS_DATES = {
  '2026-06-08': 'finals1',
  '2026-06-09': 'finals2',
  '2026-06-10': 'finals3',
  '2026-06-11': 'finals4',
  '2026-06-12': 'minimum',
}

const NO_SCHOOL_DATES = [
  '2025-09-01','2025-11-11','2025-11-27','2025-11-28',
  '2025-12-22','2025-12-23','2025-12-24','2025-12-25','2025-12-26',
  '2025-12-29','2025-12-30','2025-12-31',
  '2026-01-01','2026-01-02','2026-01-05','2026-01-06',
  '2026-01-07','2026-01-08','2026-01-09','2026-01-12',
  '2026-01-19','2026-02-09','2026-02-16',
  '2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03',
  '2026-05-25',
]

const CALENDAR_URL = 'https://script.google.com/macros/s/AKfycbwdoA4UVuCyq8RU7hP6dBrRWAMVcMqq-0DNmZE09j6oVst1iPa7KzWq7raoCT3i0SL_/exec'

function _toMins(t) { const [h,m]=t.split(':').map(Number); return h*60+m; }
function _nowMins(now) { return now.getHours()*60+now.getMinutes(); }
function _dateStr(d) { return d.toISOString().split('T')[0]; }
function _isNoSchool(ds) { return NO_SCHOOL_DATES.includes(ds); }
function _schoolDaysThisWeek(date) {
  const day=date.getDay(), monday=new Date(date);
  monday.setDate(date.getDate()-(day===0?6:day-1));
  let count=0;
  for(let i=0;i<5;i++){const d=new Date(monday);d.setDate(monday.getDate()+i);if(!_isNoSchool(_dateStr(d)))count++;}
  return count;
}

async function fetchTodayScheduleType(date=new Date()) {
  const dateStr=_dateStr(date), dow=date.getDay();
  if(dow===0||dow===6) return {type:'noSchool',schedule:null};
  if(_isNoSchool(dateStr)) return {type:'noSchool',schedule:null};

  // ── Finals week hardcode — REMOVE AFTER JUNE 12, 2026 ───────────────────
  if(FINALS_DATES[dateStr]) {
    const type = FINALS_DATES[dateStr]
    return { type, schedule: SCHEDULES[type] }
  }

  let calendarEvents=[];
  try {
    const res=await fetch(`${CALENDAR_URL}?date=${dateStr}`);
    const data=await res.json();
    if(data.status==='ok') calendarEvents=data.events||[];
  } catch(e) {}
  const titles = calendarEvents.filter(e => e.start && e.start.substring(0, 10) === dateStr).map(e => (e.title || '').toLowerCase());
  const has=kw=>titles.some(t=>t.includes(kw));
  if(has('foggy')||has('late arrival')) return {type:'foggy',schedule:SCHEDULES.foggy};
  if(has('minimum')) return {type:'minimum',schedule:SCHEDULES.minimum};
  if(has('code day')) return {type:'codeDay',schedule:SCHEDULES.codeDay};
  if(has('activity')) return {type:'activity',schedule:SCHEDULES.activity};
  if(has('block')) return dow===3?{type:'blockWed',schedule:SCHEDULES.blockWed}:{type:'blockThu',schedule:SCHEDULES.blockThu};
  if(has('early release')) return {type:'earlyRelease',schedule:SCHEDULES.earlyRelease};
  if(_schoolDaysThisWeek(date)<=4) return {type:'regular',schedule:SCHEDULES.regular};
  if(dow===1) return {type:'earlyRelease',schedule:SCHEDULES.earlyRelease};
  if(dow===3) return {type:'blockWed',schedule:SCHEDULES.blockWed};
  if(dow===4) return {type:'blockThu',schedule:SCHEDULES.blockThu};
  return {type:'regular',schedule:SCHEDULES.regular};
}

function getCurrentPeriodInfo(schedule, now=new Date()) {
  if(!schedule) return {status:'noSchool',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
  const mins=_nowMins(now), periods=schedule.periods;
  if(mins<_toMins(periods[0].start)) return {status:'before',current:null,next:periods[0],minutesUntilNext:_toMins(periods[0].start)-mins,minutesLeftInCurrent:0};
  const last=periods[periods.length-1];
  if(mins>=_toMins(last.end)) return {status:'after',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
  for(let i=0;i<periods.length;i++){
    const p=periods[i],start=_toMins(p.start),end=_toMins(p.end);
    if(mins>=start&&mins<end){
      const minutesLeftInCurrent=end-mins, next=periods[i+1]||null;
      return {status:p.break?'break':'period',current:p,next,minutesUntilNext:next?_toMins(next.start)-mins:0,minutesLeftInCurrent};
    }
    if(i<periods.length-1){
      const nextP=periods[i+1],gap_start=end,gap_end=_toMins(nextP.start);
      if(mins>=gap_start&&mins<gap_end) return {status:'passing',current:null,next:nextP,minutesUntilNext:gap_end-mins,minutesLeftInCurrent:0};
    }
  }
  return {status:'before',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
}

function getCheckoutStatus(periodInfo) {
  if(!periodInfo||periodInfo.status!=='period') return 'ok';
  const {minutesLeftInCurrent,current}=periodInfo;
  if(!current||current.break) return 'ok';
  const now=new Date(), mins=_nowMins(now), minutesSinceStart=mins-_toMins(current.start);
  if(minutesSinceStart<15) return 'first15';
  if(minutesLeftInCurrent<=15) return 'last15';
  if(minutesLeftInCurrent<=20) return 'warning20';
  return 'ok';
}

const RHS_GREEN = '#006938'

const REASONS = [
  'Restroom', 'Library', 'Office', 'Counselor', 'Lockers',
  'Errand', 'On Assignment', 'Career Counselor', 'Other',
]

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Joe', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

const PASS_LIMIT = 3
const MAX_PIN_ATTEMPTS = 3
const LOCKOUT_SECONDS = 60

const DEFAULT_PERIODS = [
  { label: 'Period 1', value: '1' },
  { label: 'Period 2', value: '2' },
  { label: 'Period 3', value: '3' },
  { label: 'Period 4', value: '4' },
  { label: 'Period 5', value: '5' },
  { label: 'Period 6', value: '6' },
  { label: 'Period 7', value: '7' },
]

function buildPeriodLabel(value) { return `Period ${value}` }

function StudentScanner({ onScan, deviceId }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  useEffect(() => {
    let stream, interval
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
          const uid = url.searchParams.get('uid')
          if (studentId) onScan(studentId)
          else if (uid) onScan(uid)
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
    QRCode.toDataURL(passUrl, { width: 200, margin: 1 }).then(url => setQrDataUrl(url)).catch(() => {})
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
        <button onClick={onDismiss} className="text-green-200 text-xs hover:text-white">Tap to dismiss</button>
      </div>
    </div>
  )
}

const QUEUE_KEY = 'hall_pass_offline_queue'
function loadQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] } }
function saveQueue(q) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }

function normalizeUid(uid) {
  const clean = uid.trim().toLowerCase().replace(/[^0-9a-f]/g, '')
  return clean.slice(-6)
}

// ── Period status bar component ───────────────────────────────────────────────
function PeriodStatusBar({ periodInfo, checkoutStatus, blockMinsEnabled }) {
  if (!periodInfo || periodInfo.status === 'noSchool') return null

  if (periodInfo.status === 'break' || periodInfo.status === 'passing') {
    const label = periodInfo.current?.label || 'Passing Period'
    const next = periodInfo.next
    return (
      <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
        style={{ backgroundColor: '#1d4ed8', color: 'white' }}>
        <span>⏸ {label}</span>
        {next && <span>Next: {next.label} in {periodInfo.minutesUntilNext} min</span>}
      </div>
    )
  }

  if (periodInfo.status === 'before') {
    return (
      <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
        style={{ backgroundColor: '#6b7280', color: 'white' }}>
        <span>🏫 School starts soon</span>
        {periodInfo.next && <span>{periodInfo.next.label} in {periodInfo.minutesUntilNext} min</span>}
      </div>
    )
  }

  if (periodInfo.status === 'after') {
    return (
      <div className="w-full px-4 py-2 text-center text-sm font-medium"
        style={{ backgroundColor: '#6b7280', color: 'white' }}>
        🏁 School day complete
      </div>
    )
  }

  if (periodInfo.status === 'period') {
    const left = periodInfo.minutesLeftInCurrent

    if (!blockMinsEnabled) {
      return (
        <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
          style={{ backgroundColor: '#166534', color: 'white' }}>
          <span>{periodInfo.current?.label}</span>
          <span>{left} min remaining</span>
        </div>
      )
    }

    if (checkoutStatus === 'first15') {
      const minsLeft = Math.max(0, 15 - toMinutesFromPeriodStart(periodInfo))
      return (
        <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
          style={{ backgroundColor: '#dc2626', color: 'white' }}>
          <span>🔴 First 15 min — Hold students</span>
          <span>Green in ~{minsLeft} min</span>
        </div>
      )
    }

    if (checkoutStatus === 'warning20') {
      return (
        <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
          style={{ backgroundColor: '#d97706', color: 'white' }}>
          <span>🟡 Last chance — {left} min left</span>
          <span>Red in {left - 15} min</span>
        </div>
      )
    }

    if (checkoutStatus === 'last15') {
      return (
        <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
          style={{ backgroundColor: '#dc2626', color: 'white' }}>
          <span>🔴 Last 15 min — Hold students</span>
          <span>{left} min until bell</span>
        </div>
      )
    }

    return (
      <div className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium"
        style={{ backgroundColor: '#166534', color: 'white' }}>
        <span>🟢 OK to send students out</span>
        <span>{left} min left in {periodInfo.current?.label}</span>
      </div>
    )
  }

  return null
}

function toMinutesFromPeriodStart(periodInfo) {
  if (!periodInfo?.current) return 0
  const now = new Date()
  const currentMins = now.getHours() * 60 + now.getMinutes()
  const [h, m] = periodInfo.current.start.split(':').map(Number)
  return currentMins - (h * 60 + m)
}

function BreakScreen({ periodInfo, kioskRoom, kioskTeacherName }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const label = periodInfo.current?.label || 'Passing Period'
  const next = periodInfo.next
  const secs = next
    ? Math.max(0, (new Date(now.getFullYear(), now.getMonth(), now.getDate(),
        ...next.start.split(':').map(Number)).getTime() - now.getTime()) / 1000)
    : 0
  const displayMins = Math.floor(secs / 60)
  const displaySecs = Math.floor(secs % 60)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `linear-gradient(135deg, #1d4ed8 0%, #1e3a8a 100%)` }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4"
        style={{ filter: 'brightness(0) invert(1)' }} />
      <p className="text-blue-200 text-sm uppercase tracking-widest mb-2">Room {kioskRoom}</p>
      <h1 className="text-4xl font-bold text-white mb-2">{label}</h1>
      {next && (
        <>
          <p className="text-blue-200 text-lg mb-6">{next.label} starts in</p>
          <div className="text-7xl font-mono font-black text-white mb-8">
            {String(displayMins).padStart(2, '0')}:{String(displaySecs).padStart(2, '0')}
          </div>
        </>
      )}
      <p className="text-blue-300 text-sm">{kioskTeacherName}</p>
    </div>
  )
}

function PeriodChangeBanner({ label, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center py-4 shadow-lg"
      style={{ backgroundColor: RHS_GREEN }}>
      <div className="text-white text-center">
        <p className="text-xs uppercase tracking-widest text-green-200 mb-1">Period Changed</p>
        <p className="text-2xl font-bold">Now {label}</p>
      </div>
      <button onClick={onDismiss} className="absolute right-4 text-green-200 hover:text-white text-xl">×</button>
    </div>
  )
}

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
  const [dnloList, setDnloList] = useState([])
  const [offlineQueue, setOfflineQueue] = useState([])
  const [isOnline, setIsOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)
  const [cameras, setCameras] = useState([])
  const [teacherPeriods, setTeacherPeriods] = useState(DEFAULT_PERIODS)
  const [selectedCamera, setSelectedCamera] = useState('')
  const [kioskRoom, setKioskRoom] = useState('')
  const [kioskTeacherId, setKioskTeacherId] = useState(null)
  const [kioskTeacherName, setKioskTeacherName] = useState('Teacher')

  const [scheduleType, setScheduleType] = useState(null)
  const [currentSchedule, setCurrentSchedule] = useState(null)
  const [periodInfo, setPeriodInfo] = useState(null)
  const [checkoutStatus, setCheckoutStatus] = useState('ok')
  const [showBreakScreen, setShowBreakScreen] = useState(false)
  const [periodChangeBanner, setPeriodChangeBanner] = useState(null)
  const [blockMinsEnabled, setBlockMinsEnabled] = useState(true)
  const [showPeriodChangePIN, setShowPeriodChangePIN] = useState(false)
  const [suggestedPeriod, setSuggestedPeriod] = useState(null)
  const lastDetectedPeriodId = useRef(null)

  const nfcBufferRef = useRef('')
  const nfcTimerRef = useRef(null)
  const activePassesRef = useRef([])

  useEffect(() => { activePassesRef.current = activePasses }, [activePasses])

  useEffect(() => {
    detectSchedule()
    const t = setInterval(detectSchedule, 60000)
    return () => clearInterval(t)
  }, [])

  async function detectSchedule() {
    const now = new Date()
    const result = await fetchTodayScheduleType(now)
    setScheduleType(result.type)
    setCurrentSchedule(result.schedule)
    updatePeriodInfo(result.schedule, now)
  }

  function updatePeriodInfo(schedule, now = new Date()) {
    const info = getCurrentPeriodInfo(schedule, now)
    setPeriodInfo(info)
    const status = getCheckoutStatus(info)
    setCheckoutStatus(status)

    if (info.current && !info.current.break) {
      const nowMins = new Date().getHours() * 60 + new Date().getMinutes()
      let bestMatch = null, bestDiff = Infinity
      teacherPeriods.forEach(tp => {
        if (tp.value === info.current.id) { bestMatch = tp.value; bestDiff = 0 }
      })
      if (!bestMatch && currentSchedule) {
        teacherPeriods.forEach(tp => {
          const schedPeriod = currentSchedule.periods.find(p => p.id === tp.value)
          if (schedPeriod) {
            const [h, m] = schedPeriod.start.split(':').map(Number)
            const diff = Math.abs(nowMins - (h * 60 + m))
            if (diff < bestDiff) { bestDiff = diff; bestMatch = tp.value }
          }
        })
        if (!bestMatch && teacherPeriods.length > 0) {
          const activePeriods = currentSchedule.periods.filter(p => !p.break)
          const periodIndex = activePeriods.findIndex(p => p.id === info.current.id)
          if (periodIndex >= 0 && periodIndex < teacherPeriods.length) {
            bestMatch = teacherPeriods[periodIndex].value
          } else {
            bestMatch = teacherPeriods[0].value
          }
        }
      }
      if (bestMatch) {
        setSuggestedPeriod(bestMatch)
        if (unlocked && !activePeriod) setActivePeriod(bestMatch)
      }
    }

    if (unlocked && activePeriod && (info.status === 'break' || info.status === 'passing')) {
      setShowBreakScreen(true)
    } else {
      setShowBreakScreen(false)
    }

    if (info.current && !info.current.break && info.current.id !== lastDetectedPeriodId.current) {
      if (lastDetectedPeriodId.current !== null && unlocked) {
        setPeriodChangeBanner(info.current.label)
      }
      lastDetectedPeriodId.current = info.current.id
    }
  }

  useEffect(() => {
    if (!currentSchedule) return
    const t = setInterval(() => updatePeriodInfo(currentSchedule), 30000)
    return () => clearInterval(t)
  }, [currentSchedule, unlocked, activePeriod])

  useEffect(() => {
    if (!lockedUntil) return
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (remaining <= 0) {
        setLockedUntil(null); setLockoutRemaining(0); setPinAttempts(0); clearInterval(interval)
      } else { setLockoutRemaining(remaining) }
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
    saveQueue(remaining); setOfflineQueue(remaining); setSyncing(false)
    if (synced > 0) { setSyncedCount(synced); setTimeout(() => setSyncedCount(0), 4000) }
  }

  // ── KEY FIX: use searchParams directly, not kioskRoom state ─────────────
  useEffect(() => {
  if (unlocked && activePeriod && kioskRoom) loadStudents()
}, [unlocked, activePeriod, kioskRoom])

  useEffect(() => {
    const studentId = searchParams.get('student')
    if (studentId && students.length > 0) handleStudentSelect(studentId)
  }, [students])

  useEffect(() => {
    const code = searchParams.get('unlock')
    if (code && code === unlockCode) setUnlocked(true)
  }, [unlockCode])

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
        const normalizedUid = normalizeUid(uid)
        const reversed = uid.match(/.{2}/g)?.reverse().join('') || uid
        const normalizedReversed = normalizeUid(reversed)
        const match = students.find(s => {
          const stored = normalizeUid(s.nfc_uid || '')
          return stored === normalizedUid || stored === normalizedReversed
        })
        if (match) {
          const openPass = activePassesRef.current.find(p => p.student_id === match.id)
          if (openPass) {
            setSelected(match.id)
            setCurrentPass(openPass)
            const mins = Math.floor((Date.now() - new Date(openPass.time_out)) / 60000)
            supabase.from('passes').update({ time_in: new Date().toISOString(), duration_minutes: mins }).eq('id', openPass.id)
              .then(async () => {
                const weekStart = new Date()
                weekStart.setDate(weekStart.getDate() - weekStart.getDay())
                weekStart.setHours(0, 0, 0, 0)
                const { data: weekPasses } = await supabase.from('passes')
                  .select('duration_minutes').eq('student_id', match.id)
                  .gte('time_out', weekStart.toISOString()).not('time_in', 'is', null)
                const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
                const { count: todayCount } = await supabase.from('passes')
                  .select('*', { count: 'exact', head: true }).eq('student_id', match.id)
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

  async function loadSettings() {
    const { data: settingsData } = await supabase.from('settings').select('key, value')
      .in('key', ['teacher_unlock_code', 'teacher_pin', 'block_first_last_15'])
    if (settingsData) {
      const unlockRow = settingsData.find(r => r.key === 'teacher_unlock_code')
      const pinRow = settingsData.find(r => r.key === 'teacher_pin')
      const blockRow = settingsData.find(r => r.key === 'block_first_last_15')
      if (unlockRow) setUnlockCode(unlockRow.value)
      if (pinRow) setPinCode(pinRow.value)
      if (blockRow) setBlockMinsEnabled(blockRow.value !== 'false')
    }
    const roomParam = searchParams.get('room') || '27'
    setKioskRoom(roomParam)
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, name, room, periods, period_labels, unlock_code')
      .eq('room', roomParam)
      .eq('is_active', true)
      .maybeSingle()
    if (teacher) {
      setKioskTeacherId(teacher.id || null)
      setKioskTeacherName(teacher.name || 'Teacher')
      if (teacher.unlock_code) setUnlockCode(teacher.unlock_code)
      if (teacher.periods?.length > 0) {
        const labels = teacher.period_labels || {}
        setTeacherPeriods(
          teacher.periods.sort().map(p => ({
            label: labels[p] || buildPeriodLabel(p),
            value: p,
          }))
        )
      }
    }
  }

  async function loadStudents() {
    // Use searchParams directly to avoid stale kioskRoom state
    const roomParam = searchParams.get('room') || '27'
    const { data: spRows } = await supabase
      .from('student_periods').select('student_id').eq('period', activePeriod).eq('room', roomParam)
    const studentIds = spRows?.map(r => r.student_id) || []
    if (studentIds.length === 0) { setStudents([]); return }
    const { data } = await supabase
      .from('students').select('id, full_name, last_name, nfc_uid').in('id', studentIds).order('first_name')
    if (data) setStudents(data.filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i))
    const { data: passes } = await supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod)
    if (passes) setActivePasses(passes)
    const { data: dnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true)
    if (dnlo) setDnloList(dnlo.map(d => d.student_id))
  }

  function handlePin(digit) {
    if (lockedUntil) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      if (next === pinCode) {
        setUnlocked(true); setPinError(false); setPinAttempts(0); setPin(''); setShowPeriodChangePIN(false); setActivePeriod(null)
      } else {
        const newAttempts = pinAttempts + 1
        setPinAttempts(newAttempts); setPinError(true)
        if (newAttempts >= MAX_PIN_ATTEMPTS) {
          setLockedUntil(Date.now() + LOCKOUT_SECONDS * 1000)
          setLockoutRemaining(LOCKOUT_SECONDS); setPin(''); setPinError(false)
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
    if (!id) { setSelected(''); return }
    if (dnloList.includes(id)) {
      setSelected(id)
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        for (let i = 0; i < 3; i++) {
          const osc = ctx.createOscillator(); const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square'
          osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.25)
          gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.25)
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.25 + 0.2)
          osc.start(ctx.currentTime + i * 0.25); osc.stop(ctx.currentTime + i * 0.25 + 0.2)
        }
      } catch(e) {}
      setStage('dnlo-blocked'); return
    }
    setSelected(id)
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator(); const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(1047, ctx.currentTime)
      gain.gain.setValueAtTime(0.2, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3)
    } catch (e) {}
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
    const roomParam = searchParams.get('room') || '27'
    const passData = {
      student_id: selected, reason: finalReason, room: roomParam,
      period: activePeriod, teacher_id: kioskTeacherId, time_out: new Date().toISOString(),
    }
    const name = students.find(s => s.id === selected)?.full_name
    if (!isOnline) {
      const queue = loadQueue()
      queue.push(passData); saveQueue(queue); setOfflineQueue(queue)
      setMessage({ text: name, sub: finalReason })
      setNewPassId(null); setStage('done'); return
    }
    const { data, error } = await supabase.from('passes').insert(passData).select().single()
    if (!error) {
      setMessage({ text: name, sub: finalReason })
      setNewPassId(data?.id || null)
      setStage('done')
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
      .select('duration_minutes').eq('student_id', selected)
      .gte('time_out', weekStart.toISOString()).not('time_in', 'is', null)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const { count: todayCount } = await supabase.from('passes')
      .select('*', { count: 'exact', head: true }).eq('student_id', selected)
      .gte('time_out', todayStart.toISOString())
    const weekCount = weekPasses?.length || 0
    const weekMins = weekPasses?.reduce((sum, p) => sum + (p.duration_minutes || 0), 0) || 0
    setMessage({ text: name, minsOut: mins, weekCount, weekMins, todayCount: todayCount || 0 })
    setNewPassId(null); setStage('checkin-done')
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

  const periodLabel = teacherPeriods.find(p => p.value === activePeriod)?.label
  const studentName = students.find(s => s.id === selected)?.full_name
  const roomDisplay = searchParams.get('room') || kioskRoom || '27'

  // ── Period selection screen ───────────────────────────────────────────────
  if (!activePeriod) return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-24 h-24 object-contain mb-4"
        style={{ filter: 'brightness(0) invert(1)' }} />
      <h1 className="text-2xl font-bold text-white mb-1">Room {roomDisplay}</h1>
      {scheduleType && scheduleType !== 'noSchool' && currentSchedule && (
        <p className="text-green-200 text-xs mb-1 uppercase tracking-widest">{currentSchedule.name}</p>
      )}
      <p className="text-green-200 text-sm mb-6 uppercase tracking-widest">Select the current period</p>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {teacherPeriods.map(p => (
          <button key={p.value} onClick={() => setActivePeriod(p.value)}
            className="py-4 text-lg font-bold rounded-xl shadow-md hover:opacity-90 transition-opacity relative"
            style={{
              backgroundColor: p.value === suggestedPeriod ? 'white' : 'rgba(255,255,255,0.15)',
              color: p.value === suggestedPeriod ? RHS_GREEN : 'white',
            }}>
            {p.label}
            {p.value === suggestedPeriod && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: RHS_GREEN, color: 'white' }}>
                Now
              </span>
            )}
          </button>
        ))}
      </div>
      {scheduleType === 'noSchool' && (
        <p className="text-green-300 text-sm mt-6">No school today</p>
      )}
    </div>
  )

  // ── Period Change PIN Modal ───────────────────────────────────────────────
  if (showPeriodChangePIN) return (
    <div className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-4"
        style={{ filter: 'brightness(0) invert(1)' }} />
      <h1 className="text-2xl font-bold text-white mb-1">Change Period</h1>
      <p className="text-green-100 mb-4 text-sm">Enter teacher PIN to change period</p>
      {lockedUntil ? (
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="text-6xl">🔒</div>
          <p className="text-white font-bold text-lg">Locked</p>
          <p className="text-red-300 text-sm text-center">Too many incorrect attempts.<br />Try again in {lockoutRemaining}s</p>
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
      <button onClick={() => { setPin(''); setPinError(false); setShowPeriodChangePIN(false) }}
        className="mt-2 text-sm text-green-200 hover:text-white">← Cancel</button>
    </div>
  )

  // ── Break screen ──────────────────────────────────────────────────────────
  if (showBreakScreen && periodInfo) return (
    <>
      {periodChangeBanner && (
        <PeriodChangeBanner label={periodChangeBanner} onDismiss={() => setPeriodChangeBanner(null)} />
      )}
      <BreakScreen periodInfo={periodInfo} kioskRoom={roomDisplay} kioskTeacherName={kioskTeacherName} />
    </>
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

  if (stage === 'dnlo-blocked') {
    const name = students.find(s => s.id === selected)?.full_name || 'This student'
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6"
        style={{ background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)' }}>
        <div className="text-6xl mb-4 animate-bounce">⛔</div>
        <h2 className="text-3xl font-bold text-white mb-2">Do Not Let Out</h2>
        <p className="text-red-200 text-lg mb-1">{name}</p>
        <p className="text-red-300 text-sm mb-8 text-center">This student has an admin restriction.<br/>Teacher must approve before checking out.</p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button onClick={async () => {
            await supabase.from('do_not_let_out').insert({
              student_id: selected, reason: 'Kiosk override by teacher',
              scope: 'override_log', created_by: 'kiosk', active: false,
            }).catch(() => {})
            setStage('select')
          }} className="py-4 text-white text-lg font-bold rounded-xl border-2 border-white/50 bg-white/10 hover:bg-white/20">
            Override — Check Out Anyway
          </button>
          <button onClick={reset} className="py-4 text-red-200 text-sm font-medium rounded-xl border border-red-400/30 hover:bg-red-900/30">
            Cancel — Send Back to Seat
          </button>
        </div>
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

  // ── Main checkout screen ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      {periodChangeBanner && (
        <PeriodChangeBanner label={periodChangeBanner} onDismiss={() => setPeriodChangeBanner(null)} />
      )}

      {showLibraryAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-xs mx-4 text-center shadow-xl">
            <div className="text-4xl mb-3">📚</div>
            <h2 className="text-lg font-semibold text-gray-800 mb-2">Library Pass Required</h2>
            <p className="text-gray-500 text-sm mb-4">You must have a signed pass from {kioskTeacherName} to enter the library.</p>
            <button onClick={() => setShowLibraryAlert(false)}
              className="w-full py-3 text-white rounded-xl font-medium" style={{ backgroundColor: RHS_GREEN }}>
              I have a pass
            </button>
          </div>
        </div>
      )}

      {periodInfo && (
        <div className="w-full fixed top-0 left-0 right-0 z-40">
          <PeriodStatusBar
            periodInfo={periodInfo}
            checkoutStatus={checkoutStatus}
            blockMinsEnabled={blockMinsEnabled}
          />
        </div>
      )}

      <div className={`w-full flex flex-col items-center ${periodInfo ? 'pt-10' : ''}`}>
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

        {blockMinsEnabled && checkoutStatus !== 'ok' && (
          <div className="w-full max-w-sm mb-3 p-3 rounded-xl text-sm font-medium text-center"
            style={{
              backgroundColor: checkoutStatus === 'warning20' ? '#fffbeb' : '#fef2f2',
              color: checkoutStatus === 'warning20' ? '#92400e' : '#dc2626',
              border: `1px solid ${checkoutStatus === 'warning20' ? '#fcd34d' : '#fca5a5'}`,
            }}>
            {checkoutStatus === 'first15' && '🔴 First 15 minutes — teacher discretion before sending students out'}
            {checkoutStatus === 'warning20' && `🟡 Last chance — ${periodInfo?.minutesLeftInCurrent} min left. Students should check out now or wait until next period.`}
            {checkoutStatus === 'last15' && '🔴 Last 15 minutes — hold students until next period'}
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
        <p className="text-sm font-medium mb-1" style={{ color: RHS_GREEN }}>Room {roomDisplay} · {periodLabel}</p>
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
              className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
              <option value="">— Select a teacher —</option>
              {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" placeholder="Purpose (e.g. picking up worksheets)"
              value={purposeText} onChange={e => setPurposeText(e.target.value)}
              className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
          </div>
        )}
        {reason === 'Errand' && (
          <div className="w-full max-w-sm flex flex-col gap-2 mb-6">
            <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)}
              className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
              <option value="">— Select a teacher (optional) —</option>
              {TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="text" placeholder="Purpose (e.g. returning equipment)"
              value={purposeText} onChange={e => setPurposeText(e.target.value)}
              className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
          </div>
        )}
        {reason === 'Other' && (
          <div className="w-full max-w-sm mb-6">
            <input type="text" placeholder="Where are you going?"
              value={otherText} onChange={e => setOtherText(e.target.value)}
              className="w-full p-3 text-lg border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} autoFocus />
          </div>
        )}
        {reason !== 'On Assignment' && reason !== 'Errand' && reason !== 'Other' && <div className="mb-6" />}

        <button onClick={handleCheckout} disabled={checkoutDisabled}
          className="px-8 py-4 text-white text-lg font-bold rounded-xl disabled:opacity-30 shadow-md"
          style={{ backgroundColor: RHS_GREEN }}>
          Check Out
        </button>

        <button onClick={() => { setPin(''); setPinError(false); setShowPeriodChangePIN(true) }}
          className="mt-4 text-sm hover:opacity-70" style={{ color: RHS_GREEN }}>
          ← Change period
        </button>
      </div>
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
