/*
  PassAble — RHS Hall Pass System
  FILE:    app/teacher/page.jsx
  ROUTE:   /teacher
  PURPOSE: Teacher dashboard — hall pass checkout, student tracking, late passes,
           pull passes, settings, schedule detection, period status bar.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students, passes, pass_holds, do_not_let_out, settings)
  AUTH:    Password-based (passcode). Default = room number doubled (room 27 → "2727").
           First login shows a forced password change screen (must_change_password flag).
  UPDATED: 2026-06-20
*/

'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'
// ── Inlined schedule logic ────────────────────────────────────────────────────
const _SCHEDULES = {
  regular: { name:'Regular', periods:[
    {id:'1',label:'Period 1',start:'08:10',end:'09:02'},{id:'2',label:'Period 2',start:'09:06',end:'09:56'},
    {id:'brunch',label:'Brunch',start:'09:56',end:'10:11',break:true},{id:'3',label:'Period 3',start:'10:15',end:'11:05'},
    {id:'4',label:'Period 4',start:'11:09',end:'11:59'},{id:'lunch',label:'Lunch',start:'11:59',end:'12:33',break:true},
    {id:'5',label:'Period 5',start:'12:37',end:'13:27'},{id:'6',label:'Period 6',start:'13:31',end:'14:21'},{id:'7',label:'Period 7',start:'14:25',end:'15:15'},
  ]},
  earlyRelease:{name:'Early Release',periods:[
    {id:'1',label:'Period 1',start:'08:10',end:'08:56'},{id:'2',label:'Period 2',start:'09:00',end:'09:41'},
    {id:'3',label:'Period 3',start:'09:45',end:'10:26'},{id:'4',label:'Period 4',start:'10:30',end:'11:11'},
    {id:'lunch',label:'Lunch',start:'11:11',end:'11:45',break:true},{id:'5',label:'Period 5',start:'11:49',end:'12:30'},
    {id:'6',label:'Period 6',start:'12:34',end:'13:15'},{id:'7',label:'Period 7',start:'13:19',end:'14:00'},
  ]},
  blockWed:{name:'Block Day (Wed)',periods:[
    {id:'1',label:'Periods 1 & 2',start:'08:10',end:'09:57'},{id:'brunch',label:'Brunch',start:'09:57',end:'10:12',break:true},
    {id:'3',label:'Periods 3 & 4',start:'10:16',end:'11:59'},{id:'lunch',label:'Lunch',start:'11:59',end:'12:33',break:true},
    {id:'5',label:'Periods 5 & 6',start:'12:37',end:'14:20'},{id:'7',label:'Period 7',start:'14:24',end:'15:15'},
  ]},
  blockThu:{name:'Block Day (Thu)',periods:[
    {id:'2',label:'Periods 1 & 2',start:'08:10',end:'09:57'},{id:'brunch',label:'Brunch',start:'09:57',end:'10:12',break:true},
    {id:'4',label:'Periods 3 & 4',start:'10:16',end:'11:59'},{id:'lunch',label:'Lunch',start:'11:59',end:'12:33',break:true},
    {id:'6',label:'Periods 5 & 6',start:'12:37',end:'14:20'},{id:'7',label:'Period 7',start:'14:24',end:'15:15'},
  ]},
  minimum:{name:'Minimum Day',periods:[
    {id:'1',label:'Period 1',start:'08:10',end:'08:46'},{id:'2',label:'Period 2',start:'08:50',end:'09:23'},
    {id:'3',label:'Period 3',start:'09:27',end:'10:00'},{id:'4',label:'Period 4',start:'10:04',end:'10:37'},
    {id:'brunch',label:'Brunch/Lunch',start:'10:37',end:'11:10',break:true},{id:'5',label:'Period 5',start:'11:14',end:'11:47'},
    {id:'6',label:'Period 6',start:'11:51',end:'12:24'},{id:'7',label:'Period 7',start:'12:28',end:'13:01'},
  ]},
  activity:{name:'Activity Day',periods:[
    {id:'1',label:'Period 1',start:'08:10',end:'08:56'},{id:'2',label:'Period 2',start:'09:00',end:'09:44'},
    {id:'brunch',label:'Brunch',start:'09:44',end:'09:59',break:true},{id:'3',label:'Period 3',start:'10:03',end:'10:47'},
    {id:'4',label:'Period 4',start:'10:51',end:'11:35'},{id:'5',label:'Period 5',start:'11:39',end:'12:23'},
    {id:'lunch',label:'Lunch',start:'12:23',end:'12:57',break:true},{id:'6',label:'Period 6',start:'13:01',end:'13:45'},{id:'7',label:'Period 7',start:'13:49',end:'14:33'},
  ]},
  foggy:{name:'Foggy/Late Arrival',periods:[
    {id:'1',label:'Period 1',start:'10:00',end:'10:44'},{id:'2',label:'Period 2',start:'10:48',end:'11:28'},
    {id:'3',label:'Period 3',start:'11:32',end:'12:12'},{id:'lunch',label:'Lunch',start:'12:12',end:'12:49',break:true},
    {id:'4',label:'Period 4',start:'12:53',end:'13:33'},{id:'5',label:'Period 5',start:'13:37',end:'14:17'},
    {id:'6',label:'Period 6',start:'14:21',end:'15:01'},{id:'7',label:'Period 7',start:'15:05',end:'15:45'},
  ]},
  codeDay:{name:'C.O.D.E Day',periods:[
    {id:'1',label:'Period 1',start:'08:10',end:'08:56'},{id:'2',label:'Period 2',start:'09:00',end:'09:44'},
    {id:'brunch',label:'Brunch',start:'09:44',end:'09:59',break:true},{id:'3',label:'Period 3',start:'10:03',end:'10:47'},
    {id:'4',label:'Period 4',start:'10:51',end:'11:35'},{id:'rally',label:'Kickball Rally',start:'11:39',end:'12:17',break:true},
    {id:'lunch',label:'Lunch',start:'12:17',end:'12:51',break:true},{id:'5',label:'Period 5',start:'12:55',end:'13:39'},
    {id:'6',label:'Period 6',start:'13:43',end:'14:27'},{id:'7',label:'Period 7',start:'14:31',end:'15:15'},
  ]},
}
const _NO_SCHOOL=['2025-09-01','2025-11-11','2025-11-27','2025-11-28','2025-12-22','2025-12-23','2025-12-24','2025-12-25','2025-12-26','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09','2026-01-12','2026-01-19','2026-02-09','2026-02-16','2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03','2026-05-25']
const _CAL_URL='https://script.google.com/macros/s/AKfycbwdoA4UVuCyq8RU7hP6dBrRWAMVcMqq-0DNmZE09j6oVst1iPa7KzWq7raoCT3i0SL_/exec'
function _t2m(t){const[h,m]=t.split(':').map(Number);return h*60+m;}
function _nm(n){return n.getHours()*60+n.getMinutes();}
function _ds(d){return d.toISOString().split('T')[0];}
function _sdw(date){const day=date.getDay(),mon=new Date(date);mon.setDate(date.getDate()-(day===0?6:day-1));let c=0;for(let i=0;i<5;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);if(!_NO_SCHOOL.includes(_ds(d)))c++;}return c;}
async function fetchTodayScheduleType(date=new Date()){
  const ds=_ds(date),dow=date.getDay();
  if(dow===0||dow===6||_NO_SCHOOL.includes(ds))return{type:'noSchool',schedule:null};
  let evts=[];
  try{const r=await fetch(`${_CAL_URL}?date=${ds}`);const d=await r.json();if(d.status==='ok')evts=d.events||[];}catch(e){}
  const tt=evts.filter(e=>e.start&&e.start.substring(0,10)===ds).map(e=>(e.title||'').toLowerCase()),has=kw=>tt.some(t=>t.includes(kw));
  if(has('foggy')||has('late arrival'))return{type:'foggy',schedule:_SCHEDULES.foggy};
  if(has('minimum'))return{type:'minimum',schedule:_SCHEDULES.minimum};
  if(has('code day'))return{type:'codeDay',schedule:_SCHEDULES.codeDay};
  if(has('activity'))return{type:'activity',schedule:_SCHEDULES.activity};
  if(has('block'))return dow===3?{type:'blockWed',schedule:_SCHEDULES.blockWed}:{type:'blockThu',schedule:_SCHEDULES.blockThu};
  if(has('early release'))return{type:'earlyRelease',schedule:_SCHEDULES.earlyRelease};
  if(_sdw(date)<=4)return{type:'regular',schedule:_SCHEDULES.regular};
  if(dow===1)return{type:'earlyRelease',schedule:_SCHEDULES.earlyRelease};
  if(dow===3)return{type:'blockWed',schedule:_SCHEDULES.blockWed};
  if(dow===4)return{type:'blockThu',schedule:_SCHEDULES.blockThu};
  return{type:'regular',schedule:_SCHEDULES.regular};
}
function getCurrentPeriodInfo(schedule,now=new Date()){
  if(!schedule)return{status:'noSchool',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
  const mins=_nm(now),periods=schedule.periods;
  if(mins<_t2m(periods[0].start))return{status:'before',current:null,next:periods[0],minutesUntilNext:_t2m(periods[0].start)-mins,minutesLeftInCurrent:0};
  const last=periods[periods.length-1];
  if(mins>=_t2m(last.end))return{status:'after',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
  for(let i=0;i<periods.length;i++){
    const p=periods[i],s=_t2m(p.start),e=_t2m(p.end);
    if(mins>=s&&mins<e){const left=e-mins,next=periods[i+1]||null;return{status:p.break?'break':'period',current:p,next,minutesUntilNext:next?_t2m(next.start)-mins:0,minutesLeftInCurrent:left};}
    if(i<periods.length-1){const np=periods[i+1],gs=e,ge=_t2m(np.start);if(mins>=gs&&mins<ge)return{status:'passing',current:null,next:np,minutesUntilNext:ge-mins,minutesLeftInCurrent:0};}
  }
  return{status:'before',current:null,next:null,minutesUntilNext:0,minutesLeftInCurrent:0};
}
function getCheckoutStatus(periodInfo){
  if(!periodInfo||periodInfo.status!=='period')return 'ok';
  const{minutesLeftInCurrent,current}=periodInfo;
  if(!current||current.break)return 'ok';
  const mins=_nm(new Date()),sinceStart=mins-_t2m(current.start);
  if(sinceStart<15)return 'first15';
  if(minutesLeftInCurrent<=15)return 'last15';
  if(minutesLeftInCurrent<=20)return 'warning20';
  return 'ok';
}

// ── Photo URL resolver (mirrors admin/students logic) ─────────────────────────
// Prefers photo_url (direct), falls back to photo_file (Supabase storage)
function getStudentPhotoUrl(student) {
  if (!student) return null
  if (student.photo_url) return student.photo_url
  if (!student.photo_file) return null
  const { data } = supabase.storage.from('student-photos').getPublicUrl(student.photo_file)
  return data?.publicUrl || null
}

// ── Constants ─────────────────────────────────────────────────────────────────
const RHS_GREEN = '#006938'
const TIME_LIMIT = 10

const REASONS = [
  'Restroom', 'Library', 'Office', 'Counselor', 'Lockers',
  'Errand', 'On Assignment', 'Career Counselor', 'Other',
]

const TEACHERS = [
  'Castro', 'Simpson', 'Tiller',
  'Aguiniga', 'Anders', 'Banuelos', 'Bettencourt', 'Bianchi', 'Bishop',
  'Carrion', 'Ceballos', 'Chavez', 'Chavira', 'Cozad', 'Cuiriz', 'De La Pena',
  'Edlund', 'Farris', 'Garibaldi', 'Gerling', 'Gjoshe', 'Gonzalez',
  'Hughes', 'Jessup', 'Joe', 'Kang', 'Kellogg', 'Mendoza Sanchez', 'Mullane',
  'Nemeth', 'Reyes', 'Sunamoto', 'Warden', 'Weibert', 'Welch', 'Yehl',
]

const ERRAND_LOCATIONS = [
  'Car', 'Farm', 'Leadership Room', 'Cafeteria', 'Outpost', 'Quad',
  'Corral', 'North Gym', 'South Gym', 'Football Field', 'Tennis Courts', 'Office',
]

// ── Period Status Bar ─────────────────────────────────────────────────────────
function PeriodStatusBar({ periodInfo, checkoutStatus, blockMinsEnabled }) {
  if (!periodInfo || periodInfo.status === 'noSchool') return null

  const left = periodInfo.minutesLeftInCurrent

  if (periodInfo.status === 'break' || periodInfo.status === 'passing') {
    const label = periodInfo.current?.label || 'Passing Period'
    const next = periodInfo.next
    return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1d4ed8', color: 'white', fontSize: 12, fontWeight: 600, letterSpacing: '0.03em' }}>
        <span>⏸ {label}</span>
        {next && <span>Next: {next.label} in {periodInfo.minutesUntilNext} min</span>}
      </div>
    )
  }

  if (periodInfo.status === 'before') return (
    <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#4b5563', color: 'white', fontSize: 12, fontWeight: 600 }}>
      <span>🏫 School starts soon</span>
      {periodInfo.next && <span>{periodInfo.next.label} in {periodInfo.minutesUntilNext} min</span>}
    </div>
  )

  if (periodInfo.status === 'after') return (
    <div style={{ width: '100%', padding: '6px 24px', textAlign: 'center', backgroundColor: '#4b5563', color: 'white', fontSize: 12, fontWeight: 600 }}>
      🏁 School day complete
    </div>
  )

  if (periodInfo.status === 'period') {
    if (!blockMinsEnabled) return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#166534', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>{periodInfo.current?.label}</span>
        <span>{left} min remaining</span>
      </div>
    )

    const now = new Date()
    const [h, m] = (periodInfo.current?.start || '00:00').split(':').map(Number)
    const sinceStart = now.getHours() * 60 + now.getMinutes() - (h * 60 + m)

    if (checkoutStatus === 'first15') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dc2626', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🔴 First 15 min — Hold students</span>
        <span>Green in ~{Math.max(0, 15 - sinceStart)} min</span>
      </div>
    )

    if (checkoutStatus === 'warning20') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#d97706', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🟡 Last chance — {left} min left</span>
        <span>Red in {left - 15} min</span>
      </div>
    )

    if (checkoutStatus === 'last15') return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#dc2626', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🔴 Last 15 min — Hold students</span>
        <span>{left} min until bell</span>
      </div>
    )

    return (
      <div style={{ width: '100%', padding: '6px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#166534', color: 'white', fontSize: 12, fontWeight: 600 }}>
        <span>🟢 OK to send students out</span>
        <span>{left} min left in {periodInfo.current?.label}</span>
      </div>
    )
  }

  return null
}

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
  console.log('[PassAble] Late pass notification:', { to: `${toTeacher.toLowerCase().replace(/\s+/g, '.')}@rjusd.org`, subject: `Late Pass — ${studentName} heading your way`, body: `${studentName} issued a late pass to your class by ${issuedBy} at ${timeIssued}. Pass: ${passUrl}` })
}

// ── Main component ────────────────────────────────────────────────────────────
function TeacherInner() {
  const searchParams = useSearchParams()

  // Auth
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  // Help panel (draggable, no backdrop)
  const [showHelp, setShowHelp] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [helpPos, setHelpPos] = useState({ x: 0, y: 0 })
  const helpPanelRef = useRef(null)
  const helpDragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (showHelp) {
      setHelpPos({ x: Math.max(0, window.innerWidth - 440), y: 80 })
    }
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

  // First-login forced password change
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [firstPwNew, setFirstPwNew] = useState('')
  const [firstPwConfirm, setFirstPwConfirm] = useState('')
  const [firstPwError, setFirstPwError] = useState('')
  const [firstPwSaving, setFirstPwSaving] = useState(false)

  // Unlock QR (for dashboard settings panel only)
  const [unlockCode, setUnlockCode] = useState('')
  const [unlockQR, setUnlockQR] = useState('')

  // Period & data
  const [activePeriod, setActivePeriod] = useState(null)
  const [activePasses, setActivePasses] = useState([])
  const [incomingPasses, setIncomingPasses] = useState([])  // students heading THIS teacher's way via wire self-checkout
  const [heldPasses, setHeldPasses] = useState([])
  const [missedPasses, setMissedPasses] = useState([])
  const [checkingInMissed, setCheckingInMissed] = useState(null)
  const [dnloList, setDnloList] = useState([])
  const [students, setStudents] = useState({})
  const [allStudents, setAllStudents] = useState([])
  const [now, setNow] = useState(Date.now())

  // Schedule & period status
  const [currentSchedule, setCurrentSchedule] = useState(null)
  const [periodInfo, setPeriodInfo] = useState(null)
  const [checkoutStatus, setCheckoutStatus] = useState('ok')
  const [blockMinsEnabled, setBlockMinsEnabled] = useState(true)

  // Checkout form
  const [selected, setSelected] = useState('')
  const [reason, setReason] = useState('')
  const [assignedTeacher, setAssignedTeacher] = useState('')
  const [errandTeacher, setErrandTeacher] = useState('')
  const [purposeText, setPurposeText] = useState('')

  // Modals
  const [showLatePass, setShowLatePass] = useState(false)
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
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [printPasses, setPrintPasses] = useState(false)
  const [printPassesSaved, setPrintPassesSaved] = useState(false)
  const [transferNotifications, setTransferNotifications] = useState(true)
  const [rotating, setRotating] = useState(false)
  const [teacherDnloList, setTeacherDnloList] = useState([])
  const [rotated, setRotated] = useState(false)

  const prevHeldIds = useRef([])
  const prevActiveIds = useRef([])

  // ── Schedule detection ─────────────────────────────────────────────────────
  useEffect(() => {
    detectSchedule()
    const t = setInterval(detectSchedule, 60000)
    return () => clearInterval(t)
  }, [])

  async function detectSchedule() {
    const result = await fetchTodayScheduleType(new Date())
    setCurrentSchedule(result.schedule)
    updatePeriodStatus(result.schedule)
  }

  function updatePeriodStatus(schedule) {
    const info = getCurrentPeriodInfo(schedule, new Date())
    setPeriodInfo(info)
    setCheckoutStatus(getCheckoutStatus(info))
  }

  useEffect(() => {
    if (!currentSchedule) return
    const t = setInterval(() => updatePeriodStatus(currentSchedule), 30000)
    return () => clearInterval(t)
  }, [currentSchedule])

  // ── Close late pass search on outside click ────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (lateSearchRef.current && !lateSearchRef.current.contains(e.target)) setLateSearchOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Auth effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setAuthLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) { loadSettings(); loadCurrentTeacher() }
  }, [session])

  // ── Check must_change_password after teacher loads ─────────────────────────
  useEffect(() => {
    if (!currentTeacher) return
    if (currentTeacher.must_change_password) {
      setMustChangePassword(true)
    }
    if (currentTeacher.unlock_code) {
      setUnlockCode(currentTeacher.unlock_code)
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${currentTeacher.unlock_code}&room=${currentTeacher.room || '27'}`
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setUnlockQR)
    }
    if (currentTeacher.pin) setCurrentPin(currentTeacher.pin)
    if (currentTeacher.print_passes !== undefined) setPrintPasses(!!currentTeacher.print_passes)
    if (currentTeacher.sub_code) setSubCode(currentTeacher.sub_code)
    if (currentTeacher.block_first_last_15 !== undefined) setBlockMinsEnabled(!!currentTeacher.block_first_last_15)
    if (currentTeacher.transfer_notifications !== undefined) setTransferNotifications(currentTeacher.transfer_notifications !== false)
  }, [currentTeacher])

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

  // ── Auth ───────────────────────────────────────────────────────────────────
  async function loadCurrentTeacher() {
    const { data: { session: s } } = await supabase.auth.getSession()
    if (!s) return
    const { data } = await supabase.from('teachers').select('*').eq('auth_id', s.user.id).eq('is_active', true).maybeSingle()
    if (data) setCurrentTeacher(data)
  }

  async function handlePasswordSignIn(e) {
    if (e) e.preventDefault()
    setSigningIn(true); setAuthError('')
    if (!email.endsWith('@rjusd.org') && !email.endsWith('@demo.passable.app') && email !== 'connect.joe@gmail.com') {
      setAuthError('Only @rjusd.org accounts are allowed.')
      setSigningIn(false); return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError('Invalid email or passcode.')
    setSigningIn(false)
  }

  // ── First-login forced password change ────────────────────────────────────
  async function handleFirstLoginPasswordChange(e) {
    if (e) e.preventDefault()
    setFirstPwError('')
    if (firstPwNew.length < 8) { setFirstPwError('Password must be at least 8 characters.'); return }
    if (firstPwNew !== firstPwConfirm) { setFirstPwError('Passwords do not match.'); return }
    setFirstPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: firstPwNew })
    if (error) {
      setFirstPwError(error.message)
    } else {
      // Clear the flag in the teachers table
      if (currentTeacher?.id) {
        await supabase.from('teachers').update({ must_change_password: false }).eq('id', currentTeacher.id)
        setCurrentTeacher(prev => ({ ...prev, must_change_password: false }))
      }
      setMustChangePassword(false)
      setFirstPwNew(''); setFirstPwConfirm('')
    }
    setFirstPwSaving(false)
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    setActivePeriod(null); setShowSettings(false); setCurrentTeacher(null)
    setMustChangePassword(false)
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    const { data } = await supabase.from('settings').select('key, value')
      .in('key', ['teacher_unlock_code', 'teacher_pin', 'sub_code', 'teacher_checkout_code', 'kiosk_return_required', 'print_passes', 'block_first_last_15'])
    if (!data) return
    const get = (key) => data.find(r => r.key === key)?.value
    const teacherUnlockVal = currentTeacher?.unlock_code || get('teacher_unlock_code')
    if (teacherUnlockVal) {
      setUnlockCode(teacherUnlockVal)
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${teacherUnlockVal}&room=${teacherRoom}`
      QRCode.toDataURL(url, { width: 160, margin: 1 }).then(setUnlockQR)
    }
    if (get('teacher_pin') && !currentTeacher?.pin) setCurrentPin(get('teacher_pin'))
    if (!currentTeacher?.sub_code && get('sub_code')) setSubCode(get('sub_code'))
    if (get('teacher_checkout_code')) setSelfCheckoutCode(get('teacher_checkout_code'))
    if (get('kiosk_return_required')) setKioskReturnRequired(get('kiosk_return_required') !== 'false')
    if (!currentTeacher?.print_passes && get('print_passes')) setPrintPasses(get('print_passes') === 'true')
    if (currentTeacher?.block_first_last_15 === undefined && get('block_first_last_15')) setBlockMinsEnabled(get('block_first_last_15') !== 'false')
  }

  async function rotateUnlockCode() {
    setRotating(true)
    const newCode = Math.random().toString(36).substring(2, 12)
    if (currentTeacher?.id) await supabase.from('teachers').update({ unlock_code: newCode }).eq('id', currentTeacher.id)
    await supabase.from('settings').update({ value: newCode }).eq('key', 'teacher_unlock_code')
    setUnlockCode(newCode)
    const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${newCode}&room=${teacherRoom}`
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then(qr => { setUnlockQR(qr); setRotating(false); setRotated(true); setTimeout(() => setRotated(false), 3000) })
  }

  async function savePin() {
    if (newPin.length !== 4 || isNaN(newPin)) return
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ pin: newPin }).eq('id', currentTeacher.id)
    } else {
      await supabase.from('settings').update({ value: newPin }).eq('key', 'teacher_pin')
    }
    setCurrentPin(newPin); setNewPin(''); setPinSaved(true)
    setTimeout(() => setPinSaved(false), 3000)
  }

  async function saveSubCode() {
    if (newSubCode.length !== 4 || isNaN(newSubCode)) return
    if (currentTeacher?.id) {
      await supabase.from('teachers').update({ sub_code: newSubCode }).eq('id', currentTeacher.id)
    } else {
      await supabase.from('settings').update({ value: newSubCode }).eq('key', 'sub_code')
    }
    setSubCode(newSubCode); setNewSubCode(''); setSubCodeSaved(true)
    setTimeout(() => setSubCodeSaved(false), 3000)
  }

  async function saveKioskReturn(val) {
    await supabase.from('settings').upsert({ key: 'kiosk_return_required', value: val ? 'true' : 'false' })
    setKioskReturnRequired(val); setKioskReturnSaved(true)
    setTimeout(() => setKioskReturnSaved(false), 2000)
  }

  async function savePassword() {
    setPasswordError('')
    if (newPassword.length < 8) { setPasswordError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirmPassword) { setPasswordError('Passwords do not match.'); return }
    setSavingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { setPasswordError(error.message) } else {
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setPasswordSaved(true); setTimeout(() => setPasswordSaved(false), 3000)
    }
    setSavingPassword(false)
  }

  async function generateCheckoutCode() {
    const code = Math.floor(1000 + Math.random() * 9000).toString()
    setSelfCheckoutCode(code)
    await supabase.from('settings').update({ value: code }).eq('key', 'active_checkout_code')
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  async function loadData() {
    let passQuery = supabase.from('passes').select('*').is('time_in', null).eq('period', activePeriod).order('time_out')
    if (currentTeacher?.id) passQuery = passQuery.eq('teacher_id', currentTeacher.id)
    const { data: passes } = await passQuery
    const room = currentTeacher?.room || '27'
    const { data: spRows } = await supabase.from('student_periods').select('student_id').eq('period', activePeriod).eq('room', room)
    const studentIds = spRows?.map(r => r.student_id) || []

    const { data: rawStuds } = studentIds.length > 0
      ? await supabase.from('students').select('id, full_name, last_name, photo_url, photo_file').in('id', studentIds).order('first_name')
      : { data: [] }

    // Deduplicate by id — prefer row with photo_url
    const seenStuds = new Map()
    for (const s of rawStuds || []) {
      if (!seenStuds.has(s.id) || (!seenStuds.get(s.id).photo_url && s.photo_url)) {
        seenStuds.set(s.id, s)
      }
    }
    const studs = Array.from(seenStuds.values())

    const { data: holds } = await supabase.from('pass_holds').select('*').order('created_at')
    const { data: dnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true)

    if (passes) {
      const newIds = passes.map(p => p.student_id)
      const returned = prevActiveIds.current.filter(id => !newIds.includes(id))
      if (returned.length > 0 && holds?.length > 0) playClearAlert()
      const LABEL_REASONS = ['Restroom', 'Library', 'Office', 'Counselor', 'Lockers', 'Errand', 'On Assignment', 'Career Counselor', 'Other']
      passes.filter(p => !prevActiveIds.current.includes(p.student_id)).forEach(p => {
        const base = p.reason?.split(' — ')[0]
        if (printPasses && LABEL_REASONS.includes(base)) window.open(`/pass/${p.id}/label`, '_blank')
      })
      prevActiveIds.current = newIds
      setActivePasses(passes)
    }
    if (studs) { setAllStudents(studs); const map = {}; studs.forEach(s => map[s.id] = s); setStudents(map) }
    if (holds) {
      const newIds = holds.map(h => h.id)
      if (newIds.some(id => !prevHeldIds.current.includes(id)) && holds.length > 0) playAlert()
      prevHeldIds.current = newIds
      setHeldPasses(holds)
    }
    if (dnlo) setDnloList(dnlo.map(d => d.student_id))
    const { data: teacherDnlo } = await supabase.from('do_not_let_out').select('student_id').eq('active', true).eq('scope', 'teacher').eq('created_by', currentTeacher?.id || '')
    if (teacherDnlo) setTeacherDnloList(teacherDnlo.map(d => d.student_id))

    // ── Incoming students (Errand / On Assignment heading THIS teacher's way) ──
    // Students who checked out on wire self-checkout with destination_teacher_id = myId
    if (currentTeacher?.id) {
      const { data: incoming } = await supabase
        .from('passes')
        .select('*, students(id, full_name, photo_url, photo_file)')
        .is('time_in', null)
        .eq('destination_teacher_id', currentTeacher.id)
        .order('time_out')
      setIncomingPasses(incoming || [])
    }

    await loadMissedPasses(activePeriod)
  }

  async function loadMissedPasses(currentPeriod) {
    const currentPeriodNum = parseInt(currentPeriod)
    if (currentPeriodNum <= 1) { setMissedPasses([]); return }
    const pastPeriods = Array.from({ length: currentPeriodNum - 1 }, (_, i) => i + 1)
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
    let missedQuery = supabase.from('passes').select('*').is('time_in', null).in('period', pastPeriods).gte('time_out', todayStart.toISOString()).lte('time_out', todayEnd.toISOString()).order('time_out')
    if (currentTeacher?.id) missedQuery = missedQuery.eq('teacher_id', currentTeacher.id)
    const { data: missed } = await missedQuery
    if (!missed) return
    const ids = [...new Set(missed.map(p => p.student_id))]
    const { data: studs } = await supabase.from('students').select('id, full_name, photo_url, photo_file').in('id', ids)
    const studMap = {}
    if (studs) studs.forEach(s => studMap[s.id] = s)
    setMissedPasses(missed.map(p => ({ ...p, students: studMap[p.student_id] || null })))
  }

  // ── Pass actions ───────────────────────────────────────────────────────────
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
    await supabase.from('pass_holds').delete().eq('id', hold.id)
    await supabase.from('passes').insert({ student_id: hold.student_id, reason: hold.reason, room: currentTeacher?.room || '27', period: hold.period, teacher_id: currentTeacher?.id || null, time_out: new Date().toISOString() })
    loadData()
  }

  async function handleDismissHold(holdId) {
    await supabase.from('pass_holds').delete().eq('id', holdId)
    loadData()
  }

  async function handleTeacherCheckout() {
    if (!selected || !reason) return
    if (reason === 'On Assignment' && !assignedTeacher) return
    if (dnloList.includes(selected)) {
      playDnloAlert()
      await supabase.from('do_not_let_out').insert({ student_id: selected, reason: 'Teacher override on teacher page', scope: 'override_log', created_by: currentTeacher?.email || session?.user?.email || 'teacher', active: false }).catch(() => {})
    }
    let finalReason = reason
    if (reason === 'On Assignment' && assignedTeacher) finalReason = purposeText.trim() ? `On Assignment — ${assignedTeacher} — ${purposeText.trim()}` : `On Assignment — ${assignedTeacher}`
    else if (reason === 'Errand' && errandTeacher) finalReason = purposeText.trim() ? `Errand — ${errandTeacher} — ${purposeText.trim()}` : `Errand — ${errandTeacher}`
    else if (reason === 'Errand' && purposeText.trim()) finalReason = `Errand — ${purposeText.trim()}`
    else if (reason === 'Other' && purposeText.trim()) finalReason = `Other — ${purposeText.trim()}`
    const { data: passData } = await supabase.from('passes').insert({ student_id: selected, reason: finalReason, room: currentTeacher?.room || '27', period: activePeriod, teacher_id: currentTeacher?.id || null }).select().single()
    const PRINT_REASONS = ['Restroom', 'Library', 'Office', 'Errand', 'On Assignment', 'Other']
    if (PRINT_REASONS.includes(finalReason.split(' — ')[0]) && passData?.id) {
      const studentName = allStudents.find(s => s.id === selected)?.full_name || 'Student'
      const timeIssued = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      printHallPass({ passId: passData.id, studentName, reason: finalReason, timeIssued, room: currentTeacher?.room || '27' })
    }
    setSelected(''); setReason(''); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('')
    loadData()
  }

  // ── Late pass ──────────────────────────────────────────────────────────────
  async function handleIssueLatePass() {
    if (lateStudents.length === 0 || !lateTeacher) return
    setIssuingLatePass(true)
    const issuedBy = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
    const room = currentTeacher?.room || '27'
    const nowDate = new Date()
    const timeIssued = nowDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    for (const student of lateStudents) {
      if (!student.isOther) {
        await supabase.from('passes').insert({ student_id: student.id, reason: `Late Pass → ${lateTeacher}`, room, period: activePeriod, teacher_id: currentTeacher?.id || null, time_out: nowDate.toISOString(), time_in: nowDate.toISOString(), duration_minutes: 0, pass_type: 'late_pass' })
      }
      printLatePass({ studentName: student.name, toTeacher: lateTeacher, timeIssued, lateReason, issuedBy, room })
      await notifyReceivingTeacher({ toTeacher: lateTeacher, studentName: student.name, issuedBy, timeIssued, passUrl: window.location.origin })
    }
    const names = lateStudents.map(s => s.name).join(', ')
    setLatePassSuccess({ studentName: names, toTeacher: lateTeacher })
    setIssuingLatePass(false)
    setLateStudents([]); setLateTeacher(''); setLateReason(''); setLateSearchInput('')
    loadData()
    setTimeout(() => { setLatePassSuccess(null); setShowLatePass(false) }, 4000)
  }

  function addLateStudent(student) {
    if (lateStudents.find(x => x.id === student.id)) return
    setLateStudents(prev => [...prev, { id: student.id, name: student.full_name, isOther: false }])
    setLateSearchInput(''); setLateSearchOpen(false)
  }

  function addLateStudentOther(name) {
    const trimmed = name.trim()
    if (!trimmed || lateStudents.find(x => x.name === trimmed)) return
    setLateStudents(prev => [...prev, { id: null, name: trimmed, isOther: true }])
    setLateSearchInput(''); setLateSearchOpen(false)
  }

  function removeLateStudent(key) { setLateStudents(prev => prev.filter(x => (x.id || x.name) !== key)) }

  function resetLatePass() {
    setShowLatePass(false); setLateStudents([]); setLateSearchInput('')
    setLateSearchOpen(false); setLateTeacher(''); setLateReason('')
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const overLimit = activePasses.filter(p => Math.floor((now - new Date(p.time_out)) / 60000) >= TIME_LIMIT)
  const elapsed = (timeOut) => Math.floor((now - new Date(timeOut)) / 60000)
  const elapsedColor = (mins) => mins >= TIME_LIMIT ? 'text-red-500' : mins >= TIME_LIMIT * 0.7 ? 'text-amber-500' : 'text-green-600'
  const teacherDisplayName = currentTeacher?.name || session?.user?.email?.split('@')[0] || 'Teacher'
  const teacherRoom = currentTeacher?.room || '27'
  const periods = currentTeacher?.periods?.length
    ? currentTeacher.periods.sort().map(p => ({ value: p, label: currentTeacher.period_labels?.[p] || `Period ${p}` }))
    : [{ value: '1', label: 'Periods 1 & 2' }, { value: '4', label: 'Periods 4 & 5' }, { value: '6', label: 'Periods 6 & 7' }]
  const periodLabel = periods.find(p => p.value === activePeriod)?.label || `Period ${activePeriod}`
  const lateSearchFiltered = lateSearchInput.trim().length > 0
    ? allStudents.filter(s => s.full_name.toLowerCase().includes(lateSearchInput.trim().toLowerCase()) && !lateStudents.find(x => x.id === s.id)).slice(0, 6)
    : []
  const kioskQRUrl = currentTeacher?.id
    ? `https://hall-pass-lime.vercel.app/unlock?teacher_id=${currentTeacher.id}&room=${teacherRoom}`
    : `https://hall-pass-lime.vercel.app/unlock?code=${unlockCode}&room=${teacherRoom}`

  if (authLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  // ── Login screen — password only ───────────────────────────────────────────
  if (!session) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>RHS PassAble</h1>
      <p className="text-gray-400 text-sm mb-8">Sign in with your email and passcode</p>
      <form onSubmit={handlePasswordSignIn} className="w-full max-w-xs flex flex-col gap-3">
        <input
          type="email"
          placeholder="you@rjusd.org"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
          style={{ borderColor: RHS_GREEN }}
        />
        <input
          type="password"
          placeholder="Passcode"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
          style={{ borderColor: RHS_GREEN }}
        />
        {authError && <p className="text-red-500 text-xs text-center">{authError}</p>}
        <button
          type="submit"
          disabled={signingIn || !email || !password}
          className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
          style={{ backgroundColor: RHS_GREEN }}>
          {signingIn ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      <a href="/" className="mt-8 text-sm text-gray-400 hover:text-gray-600">← Home</a>
    </div>
  )

  // ── First-login: forced password change ────────────────────────────────────
  if (mustChangePassword) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 object-contain mb-3" />
      <h1 className="text-2xl font-bold mb-1" style={{ color: RHS_GREEN }}>Welcome, {teacherDisplayName}</h1>
      <p className="text-gray-500 text-sm text-center mb-2 max-w-xs">
        For your security, please set a new password before continuing.<br />
        Your default passcode was your room number doubled.
      </p>
      <div className="w-full max-w-xs mt-4">
        <form onSubmit={handleFirstLoginPasswordChange} className="flex flex-col gap-3">
          <input
            type="password"
            placeholder="New password (min 8 characters)"
            value={firstPwNew}
            onChange={e => setFirstPwNew(e.target.value)}
            required
            autoFocus
            className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
            style={{ borderColor: RHS_GREEN }}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            value={firstPwConfirm}
            onChange={e => setFirstPwConfirm(e.target.value)}
            required
            className="w-full px-4 py-3 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none"
            style={{ borderColor: RHS_GREEN }}
          />
          {firstPwError && <p className="text-red-500 text-xs text-center">{firstPwError}</p>}
          <button
            type="submit"
            disabled={firstPwSaving || !firstPwNew || !firstPwConfirm}
            className="w-full py-3 text-sm font-semibold rounded-xl text-white disabled:opacity-40"
            style={{ backgroundColor: RHS_GREEN }}>
            {firstPwSaving ? 'Saving...' : 'Set Password & Continue'}
          </button>
        </form>
        <button onClick={handleSignOut} className="w-full mt-4 text-sm text-gray-400 hover:text-gray-600 text-center">
          Sign Out
        </button>
      </div>
    </div>
  )

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
              <div><h2 className="text-lg font-semibold text-gray-800">Request Student</h2><p className="text-xs text-gray-400">Print a pass to pull a student from another class</p></div>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="flex flex-col gap-3 mb-4">
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Student Name</label><input type="text" placeholder="First and last name" value={pullStudentName} onChange={e => setPullStudentName(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Currently In</label><select value={pullFromTeacher} onChange={e => setPullFromTeacher(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label className="text-xs text-gray-500 font-medium mb-1 block">Purpose</label><input type="text" placeholder="e.g. meeting, project..." value={pullPurpose} onChange={e => setPullPurpose(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => { const timeIssued = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); printPullPass({ studentName: pullStudentName, fromTeacher: pullFromTeacher, purpose: pullPurpose, timeIssued, issuedBy: teacherDisplayName, room: teacherRoom }); setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} disabled={!pullStudentName || !pullFromTeacher} className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30" style={{ backgroundColor: RHS_GREEN }}>🖨️ Print Pass</button>
              <button onClick={() => { setShowPullPass(false); setPullStudentName(''); setPullFromTeacher(''); setPullPurpose('') }} className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Help Modal ── */}
      {showHelp && (() => {
        const lnk = (href, label) => <a href={href} onClick={() => setShowHelp(false)} style={{ color: RHS_GREEN, textDecoration: 'underline' }}>{label}</a>
        const settingsBtn = <button onClick={() => { setShowHelp(false); setShowSettings(true); setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 100) }} style={{ color: RHS_GREEN, textDecoration: 'underline', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 'inherit', fontWeight: 600 }}>⚙️ Show Settings</button>
        const ALL_SECTIONS = [
          { title: 'Getting Started', items: [
            { q: "What's my passcode?", keys: "passcode room number login sign in default",
              a: <>Your default passcode is your room number doubled — Room 27 → <span className="font-mono">2727</span>, Room 30 → <span className="font-mono">3030</span>. You were prompted to change it on first login. If you're locked out, contact your admin.</> },
            { q: "How do I switch periods?", keys: "period switch dropdown header class",
              a: <>Use the period dropdown in the top-right of the header to switch between your class periods at any time — no need to sign out or go back.</> },
            { q: "I don't see any students.", keys: "no students roster empty import period",
              a: <>Your roster hasn't been imported yet for this period. {lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Import your roster here →')} — upload your Aeries class roster Excel file. It takes about 30 seconds.</> },
          ]},
          { title: 'Hall Passes', items: [
            { q: "How do I check out a student?", keys: "checkout send pass reason dropdown",
              a: <>Select the student's name and a reason from the dropdowns, then click <strong>Send</strong>. If Printable Passes is on (in {settingsBtn}), a pass will print to your default printer automatically.</> },
            { q: "How do I check a student back in?", keys: "return check in student back",
              a: <>Click <strong>Return</strong> next to their name in the Students Out list. Or they can check back in at the classroom kiosk when they return.</> },
            { q: "What does the red timer mean?", keys: "red timer 10 minutes alert over limit",
              a: <>A student has been out for 10+ minutes. The alert at the top of the page lists their name.</> },
            { q: "What's a Do Not Let Out (DNLO) flag?", keys: "do not let out dnlo flag restrict admin override",
              a: <>Admin or you can flag students who shouldn't leave class. If you try to check one out, a red warning appears and you'll need to confirm an override — which gets logged. Manage your list at {lnk('/teacher/dnlo', 'Do Not Let Out →')}.</> },
          ]},
          { title: 'Late Passes & Pull Passes', items: [
            { q: "What's a Late Pass?", keys: "late pass receipt printer arrive tardy destination teacher",
              a: <>For students arriving late to another teacher's class. Click <strong>Issue Late Pass</strong>, select the student(s) and the destination teacher. A receipt prints to your default printer — one per student. The student is not expected to return to your room. If you'd like to set up a dedicated receipt printer, talk to Mr. Joe.</> },
            { q: "What's a Pull Pass / Request Student?", keys: "pull pass request student release slip another room",
              a: <>Use this when you need to pull a student from another teacher's room. Fill in the student's name, who they're currently with, and your purpose. A formal release slip prints — send a student to deliver it to the other room.</> },
          ]},
          { title: 'Kiosk & Self-Checkout', items: [
            { q: "What's the Kiosk?", keys: "kiosk tablet door check out in tap name record dashboard",
              a: <>A tablet or dedicated computer at your classroom door where students check themselves out and back in. Students tap their name to check out — it's recorded instantly and shows up on your dashboard. When they return to class, they tap to check back in, which is also recorded. Your kiosk link is in {settingsBtn} → Kiosk URL.</> },
            { q: "What's Self-Checkout Mode?", keys: "self checkout phone laptop code session california law",
              a: <>Students go to <span className="font-mono text-xs">hall-pass-lime.vercel.app/self-checkout</span> and enter the 4-digit session code shown on your dashboard. Works on school laptops. Note: students may not be able to use personal phones in class under California law — we're still testing this flow.</> },
          ]},
          { title: 'Settings', items: [
            { q: "How do I access Settings?", keys: "settings open show hide access find scroll",
              a: <>Scroll to the bottom of your dashboard and click {settingsBtn}. All your options will expand below. Click <strong>🔒 Hide Settings</strong> to collapse them when you're done.</> },
            { q: "What's the Sub Code?", keys: "sub code substitute teacher login classroom 4 digit",
              a: <>A 4-digit code tied to your classroom that a substitute teacher can use to log in without your password. Set it in {settingsBtn} so your sub can track passes while you're out.</> },
            { q: "What's Block First & Last 15 Min?", keys: "block 15 minutes first last period red status bar warn",
              a: <>When on, the status bar turns red at the start and end of each period as a reminder not to let students out. It doesn't block checkout — just warns you and the students.</> },
            { q: "What's Printable Passes?", keys: "printable passes print default off automatic",
              a: <>Off by default. When turned on in {settingsBtn}, a printable pass opens automatically and sends to your default printer every time a student is checked out.</> },
            { q: "How do I change my password?", keys: "password change update reset minimum characters",
              a: <>Open {settingsBtn} → Change Password. Minimum 8 characters.</> },
          ]},
          { title: 'Pages & Tools', items: [
            { q: "Manage Students", keys: "manage students edit name fix lookup periods enrolled",
              a: <>{lnk('/admin/students', 'Manage Students →')} lets you view, search, and edit student records. Use it to fix a name spelling, look up a student, or check which periods they're enrolled in.</> },
            { q: "Print QR Badges", keys: "qr badges print scan camera kiosk id",
              a: <>{lnk('/qr', 'Print QR Badges →')} generates a printable sheet of QR code ID badges for your students. Students can use these to scan in and out at the kiosk using a camera instead of tapping their name on screen.</> },
            { q: "Pass Log", keys: "pass log history record who when how long reason save print",
              a: <>{lnk('/log', 'Pass Log →')} shows a full history of every hall pass issued from your classroom — who went out, when, how long they were gone, and the reason. Useful for tracking patterns or following up with a student. You can also save or print your log directly from that page.</> },
            { q: "Do Not Let Out List", keys: "do not let out dnlo list personal admin school wide",
              a: <>{lnk('/teacher/dnlo', 'Do Not Let Out →')} is where you manage your personal list of students who shouldn't leave your classroom. Admin can also add students here school-wide.</> },
            { q: "Open Kiosk", keys: "open kiosk fullscreen door return back teacher dashboard unlock",
              a: <>Opens your classroom kiosk on this device in full screen. Students use it to check themselves out and back in. To return to your teacher dashboard from the kiosk, use your teacher unlock QR (found in {settingsBtn} → Teacher Unlock QR) or navigate directly to {lnk('/teacher', 'hall-pass-lime.vercel.app/teacher')}.</> },
            { q: "Import Roster", keys: "import roster aeries excel upload students period",
              a: <>{lnk(`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`, 'Import Roster →')} is where you upload your Aeries class roster Excel file to populate your student list for each period.</> },
            { q: "Match the Photos", keys: "match photos lifetouch pictures student photo missing upload",
              a: <>Pulls the Lifetouch photos your admin uploaded and matches them to the students on your roster. Run this after your admin imports a new photo batch. If a student's photo still doesn't appear, the name in the photo file may not match their name in PassAble — contact your admin. You can also add a photo manually for any individual student by going to {lnk('/admin/students', 'Manage Students →')} and clicking Edit next to their name.</> },
            { q: "Analytics", keys: "analytics trends pass count reason busiest time pattern",
              a: <>{lnk(`/analytics?teacher_id=${currentTeacher?.id || ''}`, 'Analytics →')} (in the header) shows pass trends for your classroom — busiest times, most frequent reasons, and students with high pass counts.</> },
          ]},
          { title: 'Locked Out?', items: [
            { q: "I can't sign in.", keys: "locked out cant sign in password forgot reset admin",
              a: <>Contact your admin — they can reset your passcode from the admin panel in about 30 seconds. Your data is safe.</> },
          ]},
        ]
        const q = helpSearch.trim().toLowerCase()
        const filtered = q
          ? ALL_SECTIONS.map(s => ({ ...s, items: s.items.filter(i => (s.title + i.q + i.keys).toLowerCase().includes(q)) })).filter(s => s.items.length > 0)
          : ALL_SECTIONS
        return (
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
                <h2 className="text-sm font-semibold text-gray-800">PassAble Relay Station Help</h2>
              </div>
              <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
              <div className="px-6 pt-3 pb-2">
                <input
                  type="search"
                  placeholder="Search help topics…"
                  value={helpSearch}
                  onChange={e => setHelpSearch(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 outline-none"
                  style={{ '--tw-ring-color': RHS_GREEN }}
                  autoComplete="off"
                />
              </div>
              <div className="overflow-y-auto px-6 py-3 flex flex-col gap-5">
                {filtered.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">No results for "{helpSearch}"</p>
                )}
                {filtered.map(section => (
                  <div key={section.title}>
                    <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: RHS_GREEN }}>{section.title}</p>
                    <div className="flex flex-col gap-3">
                      {section.items.map(item => (
                        <div key={item.q}>
                          <p className="text-sm font-medium text-gray-800">{item.q}</p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-6 py-4 border-t border-gray-100">
                <button onClick={() => { setShowHelp(false); setHelpSearch('') }} className="w-full py-2.5 text-sm font-medium rounded-xl text-white" style={{ backgroundColor: RHS_GREEN }}>Got it</button>
              </div>
          </div>
        )
      })()}

      {/* ── Late Pass Modal ── */}
      {showLatePass && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-lg font-semibold text-gray-800">Issue Late Pass</h2><p className="text-xs text-gray-400">Student will not return to Room {teacherRoom}</p></div>
              <button onClick={resetLatePass} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            {latePassSuccess ? (
              <div className="text-center py-4"><div className="text-4xl mb-2">🖨️</div><p className="font-semibold text-gray-800">{latePassSuccess.studentName}</p><p className="text-sm text-gray-500">Late pass to {latePassSuccess.toTeacher} — printing...</p></div>
            ) : (
              <>
                <div className="flex flex-col gap-3 mb-4">
                  <div ref={lateSearchRef}>
                    <label className="text-xs text-gray-500 font-medium mb-1 block">Students</label>
                    {lateStudents.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {lateStudents.map((s) => (
                          <span key={s.id || s.name} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: s.isOther ? '#f3f4f6' : '#dcfce7', color: s.isOther ? '#374151' : RHS_GREEN, border: `1px solid ${s.isOther ? '#d1d5db' : '#86efac'}` }}>
                            {s.isOther && <span className="opacity-40 mr-0.5">✎</span>}{s.name}
                            <button onClick={() => removeLateStudent(s.id || s.name)} className="ml-0.5 hover:opacity-60 leading-none font-bold">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <input type="text" placeholder={lateStudents.length === 0 ? 'Search student or type name…' : 'Add another…'} value={lateSearchInput}
                        onChange={e => { setLateSearchInput(e.target.value); setLateSearchOpen(true) }}
                        onFocus={() => setLateSearchOpen(true)}
                        onKeyDown={e => { if (e.key === 'Enter' && lateSearchInput.trim()) { const match = lateSearchFiltered[0]; if (match) addLateStudent(match); else addLateStudentOther(lateSearchInput) } if (e.key === 'Escape') setLateSearchOpen(false) }}
                        className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800 outline-none" style={{ borderColor: RHS_GREEN }} />
                      {lateSearchOpen && lateSearchInput.trim().length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                          {lateSearchFiltered.map(s => <button key={s.id} onMouseDown={e => e.preventDefault()} onClick={() => addLateStudent(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 text-gray-800 transition-colors">{s.full_name}</button>)}
                          {lateSearchInput.trim().length > 1 && <button onMouseDown={e => e.preventDefault()} onClick={() => addLateStudentOther(lateSearchInput)} className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 border-t border-gray-100 italic transition-colors">✎ Add &ldquo;{lateSearchInput.trim()}&rdquo; as other</button>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div><label className="text-xs text-gray-500 font-medium mb-1 block">Reporting To</label><select value={lateTeacher} onChange={e => setLateTeacher(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="text-xs text-gray-500 font-medium mb-1 block">Reason for Lateness</label><input type="text" placeholder="e.g. finishing assignment..." value={lateReason} onChange={e => setLateReason(e.target.value)} className="w-full p-2.5 text-sm border-2 rounded-xl bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} /></div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-700">{lateStudents.length > 1 ? `${lateStudents.length} passes will print — one per student.` : 'A receipt will print and the receiving teacher will be notified.'}</div>
                <div className="flex gap-3">
                  <button onClick={handleIssueLatePass} disabled={lateStudents.length === 0 || !lateTeacher || issuingLatePass} className="flex-1 py-3 text-white text-sm font-semibold rounded-xl disabled:opacity-30" style={{ backgroundColor: RHS_GREEN }}>{issuingLatePass ? 'Issuing...' : lateStudents.length > 1 ? `🖨️ Print ${lateStudents.length} Passes` : '🖨️ Print & Issue'}</button>
                  <button onClick={resetLatePass} className="flex-1 py-3 border border-gray-200 text-gray-600 text-sm rounded-xl hover:bg-gray-50">Cancel</button>
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
            <h1 className="text-lg font-bold text-white">RHS PassAble · The Relay Station</h1>
            <p className="text-green-200 text-xs">Room {teacherRoom} · {periodLabel} · {teacherDisplayName}</p>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <a href={`/analytics?teacher_id=${currentTeacher?.id || ''}`} className="text-sm text-green-200 hover:text-white">Analytics</a>
          {currentTeacher?.is_admin && <a href="/admin" className="text-sm text-green-200 hover:text-white">Admin</a>}
          <button onClick={() => setShowHelp(true)} className="text-sm text-green-200 hover:text-white">? Help</button>
          <select
            value={activePeriod || ''}
            onChange={e => {
              if (e.target.value) { setActivePeriod(e.target.value); generateCheckoutCode() }
              else setActivePeriod(null)
            }}
            className="text-sm rounded-lg px-2 py-1 cursor-pointer"
            style={{ backgroundColor: '#004d28', color: '#bbf7d0', border: '1px solid #16a34a' }}
          >
            {periods.map(p => (
              <option key={p.value} value={p.value} style={{ backgroundColor: 'white', color: '#1f2937' }}>{p.label}</option>
            ))}
            <option value="" style={{ backgroundColor: 'white', color: '#6b7280' }}>← Switch Period</option>
          </select>
          <button onClick={handleSignOut} className="text-sm text-green-200 hover:text-white">Sign Out</button>
        </div>
      </div>

      {/* ── Period Status Bar ── */}
      <PeriodStatusBar periodInfo={periodInfo} checkoutStatus={checkoutStatus} blockMinsEnabled={blockMinsEnabled} />

      <div className="p-6 max-w-3xl mx-auto">

        {/* ── Empty roster nudge ── */}
        {allStudents.length === 0 && (
          <div className="mb-6 p-4 rounded-xl flex items-center justify-between gap-4" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a' }}>
            <div>
              <p className="text-sm font-semibold text-amber-800">No students in this period yet</p>
              <p className="text-xs text-amber-600 mt-0.5">Import your class roster to start tracking hall passes.</p>
            </div>
            <a href={`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`}
              className="text-xs px-3 py-2 rounded-lg text-white font-semibold flex-shrink-0 whitespace-nowrap"
              style={{ backgroundColor: '#d97706' }}>
              Import Roster →
            </a>
          </div>
        )}

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

        {heldPasses.length > 0 && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-amber-100 border-b border-amber-200"><span className="text-amber-700 text-sm font-medium">⚠ Students on Hold — conflict rule active</span></div>
            {heldPasses.map(hold => (
              <div key={hold.id} className="px-4 py-3 border-b border-amber-100 last:border-0 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800">{students[hold.student_id]?.full_name || hold.student_id} → {hold.reason}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Held at {new Date(hold.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · conflicting student still out</p>
                </div>
                <div className="flex gap-2 ml-4 flex-shrink-0">
                  <button onClick={() => handleOverride(hold)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: RHS_GREEN }}>Override & Send</button>
                  <button onClick={() => handleDismissHold(hold.id)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50">Dismiss</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activePasses.length >= 2 && <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">⚠ {activePasses.length} students out simultaneously: {activePasses.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')}</div>}
        {overLimit.length > 0 && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">! {overLimit.map(p => students[p.student_id]?.full_name?.split(' ')[0]).join(', ')} {overLimit.length === 1 ? 'has' : 'have'} been out over {TIME_LIMIT} min</div>}

        {/* ── Incoming Students (Errand / On Assignment heading this way) ── */}
        {transferNotifications && incomingPasses.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl mb-6">
            <div className="flex items-center justify-between px-4 py-3 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <span style={{ fontSize: 16 }}>🚶</span>
                <span className="text-sm font-semibold text-blue-800">Heading Your Way</span>
                <span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-800 rounded-full font-medium">{incomingPasses.length}</span>
              </div>
              <span className="text-xs text-blue-400">Students en route via self-checkout</span>
            </div>
            {incomingPasses.map(pass => {
              const stu = pass.students
              const mins = Math.floor((Date.now() - new Date(pass.time_out)) / 60000)
              const photoUrl = stu?.photo_url || (stu?.photo_file ? getStudentPhotoUrl(stu) : null)
              return (
                <div key={pass.id} className="flex items-center gap-3 px-4 py-3 border-b border-blue-100 last:border-0">
                  {photoUrl
                    ? <img src={photoUrl} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-2 ring-blue-300" />
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 text-white bg-blue-500">
                        {stu?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('') || '?'}
                      </div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-blue-900">{stu?.full_name || 'Unknown student'}</div>
                    <div className="text-xs text-blue-600">
                      {pass.reason}
                      {pass.destination_note ? ` · ${pass.destination_note}` : ''}
                      {' · '}left {mins} min ago
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await supabase.from('passes').update({ time_in: new Date().toISOString() }).eq('id', pass.id)
                      loadData()
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg text-white font-medium flex-shrink-0"
                    style={{ backgroundColor: RHS_GREEN }}
                  >
                    Arrived ✓
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Students Out ── */}
        <div className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-medium" style={{ color: RHS_GREEN }}>Students Out</span>
            <div className="flex items-center gap-3">
              <button onClick={() => setShowPullPass(true)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: '#7c3aed' }}>📋 Request Student</button>
              <button onClick={() => setShowLatePass(true)} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium" style={{ backgroundColor: '#1d4ed8' }}>🖨️ Issue Late Pass</button>
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
              <div key={pass.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 ${isLatePass ? 'bg-blue-50' : ''}`}>
                {getStudentPhotoUrl(student)
                  ? <img src={getStudentPhotoUrl(student)} alt={student.full_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white" style={{ backgroundColor: isLatePass ? '#1d4ed8' : RHS_GREEN }}>
                      {student?.full_name?.split(' ').map(n => n[0]).slice(0,2).join('')}
                    </div>
                }
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{student?.full_name}</span>
                    {isLatePass && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">Late Pass</span>}
                  </div>
                  <div className="text-xs text-gray-400">{pass.reason} · out at {new Date(pass.time_out).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                <span className={`text-sm font-medium w-10 text-right ${elapsedColor(mins)}`}>{mins}m</span>
                {!isLatePass && <button onClick={() => handleReturn(pass.id)} className="text-xs px-3 py-1.5 rounded-lg text-white" style={{ backgroundColor: RHS_GREEN }}>Return</button>}
              </div>
            )
          })}

          {/* ── Checkout form ── */}
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 rounded-b-xl">
            <div className="text-xs font-medium text-gray-500 mb-2">Check out a student</div>
            <div className="flex gap-2 mb-2">
              <select value={selected} onChange={e => setSelected(e.target.value)} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                <option value="">— Student —</option>
                {allStudents.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <select value={reason} onChange={e => { setReason(e.target.value); setAssignedTeacher(''); setErrandTeacher(''); setPurposeText('') }} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}>
                <option value="">— Reason —</option>
                {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={handleTeacherCheckout} disabled={!selected || !reason || (reason === 'On Assignment' && !assignedTeacher)} className="px-4 py-2 text-sm rounded-lg disabled:opacity-30 font-medium text-white" style={{ backgroundColor: selected && dnloList.includes(selected) ? '#dc2626' : RHS_GREEN }}>
                {selected && dnloList.includes(selected) ? '⚠ Override' : 'Send'}
              </button>
            </div>

            {selected && dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-red-600 border border-red-700 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⛔</span>
                <div><div>Do Not Let Out — Admin Restriction</div><div className="text-xs font-normal text-red-200 mt-0.5">Clicking Send will log an override.</div></div>
              </div>
            )}
            {selected && teacherDnloList.includes(selected) && !dnloList.includes(selected) && (
              <div className="mb-2 p-3 bg-amber-500 border border-amber-600 rounded-lg text-white text-sm font-bold flex items-center gap-2">
                <span className="text-lg">⚠</span>
                <div><div>Your Do Not Let Out List</div><div className="text-xs font-normal text-amber-100 mt-0.5">You added this student. This is a reminder only.</div></div>
              </div>
            )}

            {reason === 'On Assignment' && (
              <div className="flex flex-col gap-2">
                <select value={assignedTeacher} onChange={e => setAssignedTeacher(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select a teacher —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                <input type="text" placeholder="Purpose (e.g. picking up worksheets)" value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
              </div>
            )}
            {reason === 'Errand' && (
              <div className="flex flex-col gap-2">
                <select value={errandTeacher} onChange={e => setErrandTeacher(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select a teacher (optional) —</option>{TEACHERS.map(t => <option key={t} value={t}>{t}</option>)}</select>
                <select value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }}><option value="">— Select location (optional) —</option>{ERRAND_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}</select>
              </div>
            )}
            {reason === 'Other' && <input type="text" placeholder="Describe reason..." value={purposeText} onChange={e => setPurposeText(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800 mt-2" style={{ borderColor: RHS_GREEN }} />}

            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex gap-2 mb-2">
                {[{ label: 'Manual', val: false }, { label: 'Self-Checkout Mode', val: true }].map(({ label, val }) => (
                  <button key={label} onClick={() => setSelfCheckoutMode(val)} className="flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors"
                    style={{ background: selfCheckoutMode === val ? RHS_GREEN : 'white', color: selfCheckoutMode === val ? 'white' : '#6b7280', outline: selfCheckoutMode !== val ? '1px solid #d1d5db' : 'none', border: 'none', cursor: 'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
              {selfCheckoutMode && (
                <div className="bg-white rounded-xl p-4 border border-gray-200 text-center">
                  <div className="text-4xl font-mono font-black tracking-widest text-gray-800 mb-1">{selfCheckoutCode || '—'}</div>
                  <div className="text-xs text-gray-500 mb-1">Teacher session code — tell students to go to:</div>
                  <div className="text-xs font-mono font-bold mb-3" style={{ color: RHS_GREEN }}>hall-pass-lime.vercel.app/self-checkout</div>
                  <button onClick={generateCheckoutCode} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 mb-3">🔄 Generate New Code</button>
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-xs text-gray-700">Kiosk return required:</span>
                    <button onClick={() => saveKioskReturn(!kioskReturnRequired)} className="px-3 py-1 rounded-full text-xs font-semibold transition-colors" style={{ background: kioskReturnRequired ? RHS_GREEN : '#e5e7eb', color: kioskReturnRequired ? 'white' : '#6b7280', border: 'none', cursor: 'pointer' }}>{kioskReturnRequired ? 'ON' : 'OFF'}</button>
                    {kioskReturnSaved && <span className="text-xs" style={{ color: RHS_GREEN }}>✓ Saved</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">{kioskReturnRequired ? 'Students must scan at kiosk to return' : "Students see an \"I'm Back\" button on their device"}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Missed passes ── */}
        {missedPasses.length > 0 && (
          <div className="bg-white rounded-xl border border-orange-200 mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-orange-100 bg-orange-50">
              <div><span className="text-sm font-medium text-orange-700">⚠ Didn't Return — Previous Periods</span><p className="text-xs text-orange-500 mt-0.5">These students checked out earlier today and never scanned back in.</p></div>
              <span className="text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">{missedPasses.length}</span>
            </div>
            {missedPasses.map(pass => {
              const name = pass.students?.full_name || 'Unknown'
              const initials = name.split(' ').map(n => n[0]).slice(0,2).join('')
              const mins = Math.floor((Date.now() - new Date(pass.time_out)) / 60000)
              const timeOut = new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              return (
                <div key={pass.id} className="flex items-center gap-3 px-4 py-3 border-b border-orange-50 last:border-0">
                  {getStudentPhotoUrl(pass.students)
                    ? <img src={getStudentPhotoUrl(pass.students)} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white bg-orange-400">{initials}</div>
                  }
                  <div className="flex-1">
                    <div className="flex items-center gap-2"><span className="text-sm font-medium text-gray-800">{name}</span><span className="text-xs px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">P{pass.period}</span></div>
                    <div className="text-xs text-gray-400">{pass.reason} · out at {timeOut} · {mins}m ago</div>
                  </div>
                  <button onClick={() => handleMissedReturn(pass.id)} disabled={checkingInMissed === pass.id} className="text-xs px-3 py-1.5 rounded-lg text-white font-medium disabled:opacity-50" style={{ backgroundColor: RHS_GREEN }}>{checkingInMissed === pass.id ? '...' : 'Check In'}</button>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Settings ── */}
        {showSettings && (
          <>
            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Teacher Unlock QR</p><p className="text-xs text-gray-400">Two separate QR codes for two different purposes</p></div>
              <div className="flex gap-4 mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                {unlockQR && <img src={unlockQR} alt="Teacher unlock QR" className="w-20 h-20 flex-shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-blue-800 mb-0.5">📲 Teacher Sign-In QR</p>
                  <p className="text-xs text-blue-600 mb-1">Scan with a phone camera to sign into the teacher dashboard.</p>
                  <p className="text-xs text-gray-500 font-mono mb-2">Code: {unlockCode}</p>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={rotateUnlockCode} disabled={rotating} className={`text-xs px-3 py-1.5 rounded-lg border font-medium ${rotated ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-blue-200 text-blue-700 hover:bg-blue-50'}`}>{rotating ? 'Rotating...' : rotated ? '✓ Rotated' : '🔄 Rotate Code'}</button>
                    <a href="/unlock" target="_blank" className="text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-white text-blue-700 hover:bg-blue-50 font-medium">Full Screen →</a>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-green-50 border border-green-100 rounded-xl">
                <p className="text-xs font-semibold mb-0.5" style={{ color: RHS_GREEN }}>🖥️ Kiosk Unlock QR</p>
                <p className="text-xs text-green-700 mb-3">Save this link on your phone to show the QR that unlocks your classroom kiosk.</p>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => navigator.clipboard.writeText(kioskQRUrl)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: RHS_GREEN }}>📋 Copy Kiosk QR Link</button>
                  <a href={kioskQRUrl} target="_blank" className="text-xs px-3 py-1.5 rounded-lg font-medium border border-green-200 text-green-700 hover:bg-green-100">📱 Open on this device →</a>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Kiosk URL</p><p className="text-xs text-gray-400">Share this URL to set up your classroom kiosk</p></div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 mb-3 break-all">{`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`}</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => navigator.clipboard.writeText(`https://hall-pass-lime.vercel.app/kiosk?room=${teacherRoom}`)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-white" style={{ backgroundColor: RHS_GREEN }}>📋 Copy URL</button>
              </div>
              <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">💡 To write to an NFC sticker: open <strong>NFC Tools for Desktop</strong> → Write → URL → paste the URL above.</div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Substitute Code</p><p className="text-xs text-gray-400">Current code: <span className="font-mono">{subCode}</span></p></div>
              <div className="flex gap-2">
                <input type="number" maxLength={4} placeholder="New 4-digit sub code" value={newSubCode} onChange={e => setNewSubCode(e.target.value.slice(0, 4))} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={saveSubCode} disabled={newSubCode.length !== 4} className={`px-4 py-2 text-sm font-medium rounded-lg ${subCodeSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`} style={!subCodeSaved ? { backgroundColor: RHS_GREEN } : {}}>{subCodeSaved ? '✓ Saved' : 'Save Code'}</button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="mb-3">
                <p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Change Password</p>
                <p className="text-xs text-gray-400">Update your PassAble login passcode</p>
              </div>
              <div className="flex flex-col gap-2">
                <input type="password" placeholder="New password (min 8 characters)" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                {passwordError && <p className="text-xs text-red-500">{passwordError}</p>}
                <button onClick={savePassword} disabled={!newPassword || !confirmPassword || savingPassword} className={`px-4 py-2 text-sm font-medium rounded-lg ${passwordSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`} style={!passwordSaved ? { backgroundColor: RHS_GREEN } : {}}>
                  {savingPassword ? 'Saving...' : passwordSaved ? '✓ Password Updated' : 'Save Password'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Block First &amp; Last 15 Min</p><p className="text-xs text-gray-400">Prevent students from leaving in the first and last 15 minutes of each period</p></div>
                <button onClick={async () => {
                  const newVal = !blockMinsEnabled
                  setBlockMinsEnabled(newVal)
                  if (currentTeacher?.id) {
                    await supabase.from('teachers').update({ block_first_last_15: newVal }).eq('id', currentTeacher.id)
                  } else {
                    await supabase.from('settings').upsert({ key: 'block_first_last_15', value: String(newVal) }, { onConflict: 'key' })
                  }
                }} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${blockMinsEnabled ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${blockMinsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Printable Passes</p><p className="text-xs text-gray-400">Auto-open a printable pass when a student is checked out</p></div>
                <button onClick={async () => {
                  const newVal = !printPasses
                  setPrintPasses(newVal)
                  if (currentTeacher?.id) {
                    await supabase.from('teachers').update({ print_passes: newVal }).eq('id', currentTeacher.id)
                  } else {
                    await supabase.from('settings').upsert({ key: 'print_passes', value: String(newVal) }, { onConflict: 'key' })
                  }
                  setPrintPassesSaved(true)
                  setTimeout(() => setPrintPassesSaved(false), 2000)
                }} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${printPasses ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${printPasses ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {printPassesSaved && <p className="text-xs text-green-600 mt-2">✓ Saved</p>}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Student Transfer Notifications</p><p className="text-xs text-gray-400">Get notified on your dashboard when another teacher sends a student your way</p></div>
                <button onClick={async () => {
                  const newVal = !transferNotifications
                  setTransferNotifications(newVal)
                  if (currentTeacher?.id) {
                    await supabase.from('teachers').update({ transfer_notifications: newVal }).eq('id', currentTeacher.id)
                  }
                }} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${transferNotifications ? 'bg-green-600' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${transferNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 mb-6 p-4">
              <div className="mb-3"><p className="text-sm font-medium" style={{ color: RHS_GREEN }}>Keypad PIN</p><p className="text-xs text-gray-400">Current PIN: <span className="font-mono">{currentPin}</span></p></div>
              <div className="flex gap-2">
                <input type="number" maxLength={4} placeholder="New 4-digit PIN" value={newPin} onChange={e => setNewPin(e.target.value.slice(0, 4))} className="flex-1 p-2 text-sm border-2 rounded-lg bg-white text-gray-800" style={{ borderColor: RHS_GREEN }} />
                <button onClick={savePin} disabled={newPin.length !== 4} className={`px-4 py-2 text-sm font-medium rounded-lg ${pinSaved ? 'bg-green-50 border border-green-200 text-green-700' : 'text-white disabled:opacity-30'}`} style={!pinSaved ? { backgroundColor: RHS_GREEN } : {}}>{pinSaved ? '✓ Saved' : 'Save PIN'}</button>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end mb-4">
          <button onClick={() => setShowSettings(s => !s)} className="text-xs px-3 py-1.5 border rounded-lg text-gray-500 hover:bg-gray-50">{showSettings ? '🔒 Hide Settings' : '⚙️ Show Settings'}</button>
        </div>

        <div className="flex justify-between items-center flex-wrap gap-2">
          <a href="/admin/students" className="text-sm text-gray-400 hover:text-gray-600">Manage Students →</a>
          <a href={`/roster?room=${teacherRoom}&teacher_id=${currentTeacher?.id || ''}`} className="text-sm text-gray-400 hover:text-gray-600">Import Roster →</a>
          <a href="/teacher/match-photos" className="text-sm text-gray-400 hover:text-gray-600">Match the Photos →</a>
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
