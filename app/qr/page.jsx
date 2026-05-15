'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'

const PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function QRPage() {
  const [students, setStudents] = useState([])
  const [qrCodes, setQrCodes] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [activePeriod, setActivePeriod] = useState('1')

  useEffect(() => {
    loadStudents()
  }, [activePeriod])

  async function loadStudents() {
    // Use student_periods junction table
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('period', activePeriod)
      .eq('room', '27')
    const studentIds = spRows?.map(r => r.student_id) || []
    if (studentIds.length === 0) { setStudents([]); return }
    const { data } = await supabase
      .from('students')
      .select('id, full_name, photo_file')
      .in('id', studentIds)
      .order('first_name')
    if (data) {
      setStudents(data)
      generateQRCodes(data)
      generatePhotoUrls(data)
    }
  }

  async function generateQRCodes(students) {
    const codes = {}
    for (const s of students) {
      const url = `https://hall-pass-lime.vercel.app/kiosk?student=${s.id}`
      codes[s.id] = await QRCode.toDataURL(url, { width: 140, margin: 1 })
    }
    setQrCodes(codes)
  }

  async function generatePhotoUrls(students) {
    const urls = {}
    for (const s of students) {
      if (s.photo_file) {
        const { data } = supabase.storage.from('student-photos').getPublicUrl(s.photo_file)
        if (data?.publicUrl) urls[s.id] = data.publicUrl
      }
    }
    setPhotoUrls(urls)
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
          @page { margin: 8mm; size: letter; }
          .print-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            padding: 6px;
          }
          .print-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .print-card .photo { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; margin-bottom: 4px; }
          .print-card .placeholder { width: 80px; height: 80px; border-radius: 6px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
          .print-card img.logo { width: 24px; height: 24px; object-fit: contain; }
          .print-card img.qr { width: 100px; height: 100px; }
          .print-card .name { font-size: 10px; font-weight: 600; text-align: center; margin-bottom: 1px; }
          .print-card .sub { font-size: 8px; color: #9ca3af; margin-bottom: 4px; }
          .print-card .label { font-size: 7px; color: #d1d5db; margin-top: 2px; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6 no-print">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Student QR Codes</h1>
              <p className="text-gray-500 text-sm">Print and cut — one badge per student</p>
            </div>
            <div className="flex gap-2">
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setActivePeriod(p.value)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border ${activePeriod === p.value ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="no-print mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            ⚠ Before printing: set printer to <strong>single-sided</strong> and <strong>fit to page</strong>.
          </div>

          <div className="grid grid-cols-3 gap-3 print-grid">
            {students.map(s => (
              <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center print-card">
                {photoUrls[s.id] ? (
                  <img src={photoUrls[s.id]} alt={s.full_name} className="photo w-20 h-20 object-cover rounded-lg mb-2" />
                ) : (
                  <div className="placeholder w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center mb-2">
                    <img src="/RHSCOWBOYlogo.png" alt="RHS" className="logo w-10 h-10 object-contain opacity-30" />
                  </div>
                )}
                <p className="name text-xs font-semibold text-gray-800 mb-0.5 text-center">{s.full_name}</p>
                <p className="sub text-xs text-gray-400 mb-2">Room 27 · Mr. Joe</p>
                {qrCodes[s.id] && <img src={qrCodes[s.id]} alt={s.full_name} className="qr w-24 h-24" />}
                <p className="label text-xs text-gray-300 mt-1">RHS PassAble</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-between items-center no-print">
            <a href="/teacher"
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              ← Back to Dashboard
            </a>
            <button onClick={() => window.print()}
              className="px-6 py-3 bg-gray-900 text-white rounded-lg text-sm font-medium">
              Print This Page
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
