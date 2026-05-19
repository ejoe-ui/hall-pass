'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'

function UnlockInner() {
  const searchParams = useSearchParams()
  const [qrCode, setQrCode] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const teacherId = searchParams.get('teacher_id')
    const room = searchParams.get('room')

    if (teacherId) {
      loadFromTeacher(teacherId, room)
      // Poll every 15s so rotated codes update automatically
      const interval = setInterval(() => loadFromTeacher(teacherId, room), 15000)
      return () => clearInterval(interval)
    } else {
      loadGlobal()
      const interval = setInterval(loadGlobal, 15000)
      return () => clearInterval(interval)
    }
  }, [])

  async function loadFromTeacher(teacherId, room) {
    const { data } = await supabase
      .from('teachers')
      .select('unlock_code, room')
      .eq('id', teacherId)
      .maybeSingle()
    if (data?.unlock_code) {
      const r = room || data.room || ''
      const url = r
        ? `https://hall-pass-lime.vercel.app/kiosk?unlock=${data.unlock_code}&room=${r}`
        : `https://hall-pass-lime.vercel.app/kiosk?unlock=${data.unlock_code}`
      const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 })
      setQrCode(qr)
    }
    setLoading(false)
  }

  async function loadGlobal() {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'teacher_unlock_code')
      .maybeSingle()
    if (data?.value) {
      const url = `https://hall-pass-lime.vercel.app/kiosk?unlock=${data.value}`
      const qr = await QRCode.toDataURL(url, { width: 400, margin: 2 })
      setQrCode(qr)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-16 h-16 mb-4 object-contain" />
      <h1 className="text-xl font-semibold text-gray-800 mb-1">Teacher Unlock</h1>
      <p className="text-sm text-gray-400 mb-6">RHS PassAble · Scan to unlock kiosk</p>
      {loading ? (
        <div className="w-72 h-72 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
        </div>
      ) : (
        <>
          {qrCode && <img src={qrCode} alt="Unlock QR" className="w-72 h-72 mb-4" />}
          <p className="text-xs text-gray-300 text-center max-w-xs mb-6">
            Hold this QR up to the kiosk camera to unlock.<br />
            Updates automatically when code is rotated.
          </p>
          <a href="/teacher" className="text-xs text-gray-300 hover:text-gray-500">
            ← Back to Dashboard
          </a>
        </>
      )}
    </div>
  )
}

export default function UnlockPage() {
  return (
    <Suspense>
      <UnlockInner />
    </Suspense>
  )
}
