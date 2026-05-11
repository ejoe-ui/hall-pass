'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'
const QR_TTL_MINUTES = 60 // QR refreshes every 60 minutes

export default function UnlockPage() {
  const [qrCode, setQrCode] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [minutesLeft, setMinutesLeft] = useState(QR_TTL_MINUTES)
  const [generatedAt, setGeneratedAt] = useState(null)

  useEffect(() => {
    loadTeacherEmail()
  }, [])

  useEffect(() => {
    if (!generatedAt) return
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - generatedAt) / 60000)
      const left = QR_TTL_MINUTES - elapsed
      if (left <= 0) {
        generateQR(email)
      } else {
        setMinutesLeft(left)
      }
    }, 30000) // check every 30 seconds
    return () => clearInterval(interval)
  }, [generatedAt, email])

  async function loadTeacherEmail() {
    const { data: { session } } = await supabase.auth.getSession()
    const teacherEmail = session?.user?.email || ''
    setEmail(teacherEmail)
    await generateQR(teacherEmail)
    setLoading(false)
  }

  async function generateQR(teacherEmail) {
    // QR points to teacher page with magic link trigger
    // The teacher page will catch the ?magic=1&email= param and send a magic link
    const url = teacherEmail
      ? `https://hall-pass-lime.vercel.app/teacher?magic=1&email=${encodeURIComponent(teacherEmail)}`
      : `https://hall-pass-lime.vercel.app/teacher?magic=1`
    const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 })
    setQrCode(qr)
    setGeneratedAt(Date.now())
    setMinutesLeft(QR_TTL_MINUTES)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 mb-4 object-contain" />
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Teacher Unlock</h1>
      <p className="text-sm text-gray-400 mb-2">RHS PassAble · Scan to sign in</p>

      {loading ? (
        <div className="w-72 h-72 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
        </div>
      ) : (
        <>
          <div className="relative mb-4">
            {qrCode && <img src={qrCode} alt="Unlock QR" className="w-72 h-72" />}
            <div className="absolute bottom-2 right-2 bg-white/80 rounded-lg px-2 py-1">
              <span className="text-xs text-gray-400">Refreshes in {minutesLeft}m</span>
            </div>
          </div>

          {email ? (
            <p className="text-xs text-gray-400 mb-1">Signed in as <span className="font-medium text-gray-600">{email}</span></p>
          ) : (
            <p className="text-xs text-amber-500 mb-1">⚠ Sign in first for personalized QR</p>
          )}

          <p className="text-xs text-gray-300 mt-2 text-center max-w-xs">
            Hold this QR up to the kiosk camera.<br />
            A sign-in link will be sent to your email.
          </p>

          <button
            onClick={() => generateQR(email)}
            className="mt-6 text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            🔄 Refresh QR
          </button>

          <a href="/teacher" className="mt-4 text-xs text-gray-300 hover:text-gray-500">
            ← Back to Teacher Login
          </a>
        </>
      )}
    </div>
  )
}
