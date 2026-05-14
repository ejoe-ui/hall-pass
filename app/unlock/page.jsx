'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'

export default function UnlockPage() {
  const [qrCode, setQrCode] = useState('')
  const [unlockCode, setUnlockCode] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadAndRender()
    // Poll every 15 seconds so rotated codes show up fast
    const interval = setInterval(loadAndRender, 15000)
    return () => clearInterval(interval)
  }, [])

  async function loadAndRender() {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'teacher_unlock_code')
      .maybeSingle()
    if (data?.value) {
      setUnlockCode(data.value)
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
