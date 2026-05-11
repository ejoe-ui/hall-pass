'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

const PASS_LIMITS = {
  'Restroom': 8,
  'Water': 5,
  'Library': 10,
  'Office': 10,
  'Errand': 10,
  'Other': 10,
  'Counselor': null,
  'On Assignment': null,
  'School Store': null,
}

function getLimit(reason) {
  if (!reason) return null
  for (const [key, val] of Object.entries(PASS_LIMITS)) {
    if (reason.startsWith(key)) return val
  }
  return 10
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function TimerRing({ elapsed, limitSecs, hasLimit }) {
  const size = 220
  const stroke = 12
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  let progress = 0
  let color = RHS_GREEN

  if (hasLimit && limitSecs) {
    progress = Math.min(elapsed / limitSecs, 1)
    const pct = elapsed / limitSecs
    if (pct >= 1) color = '#dc2626'        // red — over limit
    else if (pct >= 0.75) color = '#f59e0b' // yellow — 75%
    else color = RHS_GREEN
  } else {
    // No limit — just spin the ring slowly, always green
    progress = (elapsed % 60) / 60
    color = RHS_GREEN
  }

  const dashOffset = circumference - progress * circumference

  return (
    <svg width={size} height={size} className="drop-shadow-lg">
      {/* Background ring */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#e5e7eb" strokeWidth={stroke}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.5s ease' }}
      />
    </svg>
  )
}

export default function PassPage() {
  const { id } = useParams()
  const [pass, setPass] = useState(null)
  const [student, setStudent] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [weekCount, setWeekCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [returned, setReturned] = useState(false)

  useEffect(() => {
    loadPass()
  }, [id])

async function loadPass() {
  const { data: passData } = await supabase
    .from('passes')
    .select('*')
    .eq('id', id)
    .single()

  if (!passData) { setLoading(false); return }
  setPass(passData)

  const { data: studentData } = await supabase
    .from('students')
    .select('full_name, id')
    .eq('id', passData.student_id)
    .single()

  if (studentData) setStudent(studentData)

  if (passData.time_in) setReturned(true)

  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const { count } = await supabase
    .from('passes')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', passData.student_id)
    .gte('time_out', weekStart.toISOString())
  setWeekCount(count || 0)
  setLoading(false)
}

  // Live elapsed timer
  useEffect(() => {
    if (!pass || returned) return
    function tick() {
      const secs = Math.floor((Date.now() - new Date(pass.time_out).getTime()) / 1000)
      setElapsed(secs)
    }
    tick()
    const interval = setInterval(tick, 1000)
    // Poll Supabase every 15s to catch check-in
    const pollInterval = setInterval(async () => {
      const { data } = await supabase.from('passes').select('time_in').eq('id', id).single()
      if (data?.time_in) { setReturned(true); clearInterval(interval); clearInterval(pollInterval) }
    }, 15000)
    return () => { clearInterval(interval); clearInterval(pollInterval) }
  }, [pass, returned])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <div className="text-white text-lg">Loading pass...</div>
    </div>
  )

  if (!pass) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-3">🤔</div>
        <p className="text-gray-500">Pass not found.</p>
      </div>
    </div>
  )

  if (returned) return (
    <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: `linear-gradient(135deg, ${RHS_GREEN} 0%, #005a30 100%)` }}>
      <div className="text-6xl mb-4">✓</div>
      <h2 className="text-2xl font-bold text-white mb-2">You're back!</h2>
      <p className="text-green-200 text-sm">Pass closed — head back to your seat.</p>
    </div>
  )

  const limit = getLimit(pass.reason)
  const hasLimit = limit !== null
  const limitSecs = hasLimit ? limit * 60 : null
  const isOver = hasLimit && elapsed > limitSecs
  const isWarning = hasLimit && !isOver && elapsed >= limitSecs * 0.75
  const timeLeft = hasLimit ? Math.max(0, limitSecs - elapsed) : null

  let statusColor = RHS_GREEN
  if (isOver) statusColor = '#dc2626'
  else if (isWarning) statusColor = '#f59e0b'

  const firstName = student?.full_name?.split(' ')[0] || 'Student'

  return (
    <div className="min-h-screen flex flex-col items-center justify-between bg-gray-50 px-4 py-8">

      {/* Header */}
      <div className="w-full max-w-sm flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest">RHS PassAble</p>
          <h1 className="text-xl font-bold text-gray-800">{student?.full_name}</h1>
        </div>
        <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-10 h-10 object-contain opacity-60" />
      </div>

      {/* Timer ring */}
      <div className="flex flex-col items-center">
        <div className="relative flex items-center justify-center">
          <TimerRing elapsed={elapsed} limitSecs={limitSecs} hasLimit={hasLimit} />
          <div className="absolute flex flex-col items-center">
            <span className="text-4xl font-mono font-bold" style={{ color: statusColor }}>
              {formatElapsed(elapsed)}
            </span>
            <span className="text-xs text-gray-400 mt-1">elapsed</span>
          </div>
        </div>

        {/* Time left or no limit */}
        {hasLimit ? (
          <div className="mt-3 text-center">
            {isOver ? (
              <p className="text-red-600 font-semibold text-sm">
                ⚠ {formatElapsed(elapsed - limitSecs)} over limit — head back now
              </p>
            ) : (
              <p className="text-sm" style={{ color: isWarning ? '#f59e0b' : '#6b7280' }}>
                {formatElapsed(timeLeft)} remaining
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No time limit</p>
        )}
      </div>

      {/* Pass details */}
      <div className="w-full max-w-sm space-y-3">

        {/* Reason */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Reason</p>
          <p className="text-lg font-semibold text-gray-800">{pass.reason}</p>
        </div>

        {/* Time out */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Checked Out</p>
          <p className="text-lg font-semibold text-gray-800">
            {new Date(pass.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        {/* Pass limit warning */}
        {weekCount >= 3 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-amber-800 text-sm font-medium">
              ⚠ This is your {weekCount === 3 ? '3rd' : `${weekCount}th`} pass this week
            </p>
            <p className="text-amber-600 text-xs mt-1">Use your passes wisely.</p>
          </div>
        )}

        {/* Check in reminder */}
        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-xs text-gray-400">To check back in, scan your badge at the</p>
          <p className="text-sm font-semibold text-gray-700">Room 27 Kiosk</p>
        </div>

      </div>
    </div>
  )
}
