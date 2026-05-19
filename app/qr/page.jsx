'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'

const DEFAULT_PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function QRPage() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [room, setRoom] = useState('27')
  const [periods, setPeriods] = useState(DEFAULT_PERIODS)
  const [students, setStudents] = useState([])
  const [qrCodes, setQrCodes] = useState({})
  const [photoUrls, setPhotoUrls] = useState({})
  const [activePeriod, setActivePeriod] = useState(null)
  const [template, setTemplate] = useState('badge') // 'badge' | 'sticker'

  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (data) {
        setCurrentTeacher(data)
        const teacherRoom = data.room || '27'
        setRoom(teacherRoom)
        if (data.periods?.length) {
          const sorted = [...data.periods].sort()
          const builtPeriods = sorted.map(p => ({
            value: p,
            label: data.period_labels?.[p] || `Period ${p}`,
          }))
          setPeriods(builtPeriods)
          setActivePeriod(sorted[0])
        } else {
          setActivePeriod('1')
        }
      }
    }
    loadTeacher()
  }, [])

  useEffect(() => {
    if (activePeriod && room) loadStudents()
  }, [activePeriod, room])

  async function loadStudents() {
    const { data: spRows } = await supabase
      .from('student_periods')
      .select('student_id')
      .eq('period', activePeriod)
      .eq('room', room)
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

  const teacherName = currentTeacher?.name || 'Teacher'
  const badgeSubtitle = `Room ${room} · ${teacherName}`

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; }

          /* ── Badge template (3-up) ── */
          .badge-print-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
            padding: 6px;
          }
          .badge-print-card {
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .badge-print-card .photo { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; margin-bottom: 4px; }
          .badge-print-card .placeholder { width: 80px; height: 80px; border-radius: 6px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
          .badge-print-card img.logo { width: 24px; height: 24px; object-fit: contain; }
          .badge-print-card img.qr { width: 100px; height: 100px; }
          .badge-print-card .name { font-size: 10px; font-weight: 600; text-align: center; margin-bottom: 1px; }
          .badge-print-card .sub { font-size: 8px; color: #9ca3af; margin-bottom: 4px; }
          .badge-print-card .label { font-size: 7px; color: #d1d5db; margin-top: 2px; }

          /* ── Sticker template (Spartan R011 — 3"×2", 2×5, 10/sheet) ── */
          /* 
            Sheet: 8.5" × 11"
            Top margin: 0.25" = 18pt
            Side margin: 1.1875" = 85.5pt
            Label: 3" × 2" = 216pt × 144pt
            H pitch: 3.125" = 225pt (gap = 9pt)
            V pitch: 2.125" = 153pt (gap = 9pt)
          */
          @page { size: 8.5in 11in; margin: 0; }

          .sticker-header {
            width: 6.125in;
            text-align: center;
            margin-bottom: 0.15in;
          }
          .sticker-header .sticker-title {
            font-size: 18pt;
            font-weight: 900;
            letter-spacing: 0.05em;
            color: #006938;
          }
          .sticker-header .sticker-title span {
            color: #9ca3af;
            font-weight: 400;
          }
          .sticker-sheet {
            width: 8.5in;
            min-height: 11in;
            padding-top: 0.25in;
            padding-left: 1.1875in;
            padding-right: 1.1875in;
            box-sizing: border-box;
          }
          .sticker-grid {
            display: grid;
            grid-template-columns: 3in 3in;
            grid-template-rows: repeat(5, 2in);
            column-gap: 0.125in;
            row-gap: 0.125in;
          }
          .sticker-label {
            width: 3in;
            height: 2in;
            overflow: hidden;
            box-sizing: border-box;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: 0.1in 0.12in;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .sticker-label .sticker-left {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4pt;
            flex-shrink: 0;
            width: 1in;
          }
          .sticker-label .sticker-photo { width: 1in; height: 1in; object-fit: cover; border-radius: 4pt; }
            width: 0.7in;
            height: 0.7in;
            object-fit: cover;
            border-radius: 4pt;
          }
          .sticker-label .sticker-placeholder { width: 1in; height: 1in; border-radius: 4pt; background: #f3f4f6; display: flex; align-items: center; justify-content: center; }
            width: 0.7in;
            height: 0.7in;
            border-radius: 4pt;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sticker-label .sticker-logo {
            width: 0.35in;
            height: 0.35in;
            object-fit: contain;
            opacity: 0.3;
          }
          .sticker-label .sticker-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding-left: 0.08in;
          }
          .sticker-label .sticker-qr {
            width: 1in;
            height: 1in;
          }
          .sticker-label .sticker-name {
            font-size: 7pt;
            font-weight: 700;
            text-align: center;
            color: #111;
            margin-top: 3pt;
            line-height: 1.2;
            max-width: 1.1in;
          }
          .sticker-label .sticker-sub {
            font-size: 6pt;
            color: #9ca3af;
            text-align: center;
            margin-top: 1pt;
          }
        }

        /* Screen styles for sticker header */
        .sticker-header {
          width: 6.125in;
          text-align: center;
          margin-bottom: 0.15in;
          padding-top: 4px;
        }
        .sticker-title {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #006938;
        }
        .sticker-title span {
          color: #9ca3af;
          font-weight: 400;
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-4 no-print">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Student QR Badges</h1>
              <p className="text-gray-500 text-sm">Room {room} · {teacherName} · Print and cut — one badge per student</p>
            </div>
            <div className="flex gap-2">
              {periods.map(p => (
                <button key={p.value} onClick={() => setActivePeriod(p.value)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg border ${activePeriod === p.value ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  style={activePeriod === p.value ? { backgroundColor: RHS_GREEN } : {}}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Template toggle ── */}
          <div className="no-print mb-4 flex items-center gap-3">
            <span className="text-sm text-gray-500 font-medium">Template:</span>
            <div className="flex gap-2">
              {[
                { id: 'badge', label: '🪪 Badge Cards', sub: '3-up, cut & laminate' },
                { id: 'sticker', label: '🏷️ Sticker Labels', sub: 'Spartan R011 · 3"×2" · 10/sheet' },
              ].map(t => (
                <button key={t.id} onClick={() => setTemplate(t.id)}
                  className={`px-4 py-2.5 rounded-xl border text-left transition-colors ${template === t.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  style={template === t.id ? { backgroundColor: RHS_GREEN } : {}}>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className={`text-xs mt-0.5 ${template === t.id ? 'text-green-200' : 'text-gray-400'}`}>{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Print tip ── */}
          <div className="no-print mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            {template === 'badge'
              ? '⚠ Before printing: set printer to <strong>single-sided</strong> and <strong>fit to page</strong>.'
              : '⚠ Before printing: set printer to <strong>actual size</strong> (not fit to page) and <strong>single-sided</strong>. Load Spartan R011 label sheets.'}
          </div>

          {students.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm no-print">
              No students in this period
            </div>
          ) : template === 'badge' ? (

            /* ── Badge template ── */
            <div className="grid grid-cols-3 gap-3 badge-print-grid">
              {students.map(s => (
                <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-3 flex flex-col items-center badge-print-card">
                  {photoUrls[s.id] ? (
                    <img src={photoUrls[s.id]} alt={s.full_name} className="photo w-20 h-20 object-cover rounded-lg mb-2" />
                  ) : (
                    <div className="placeholder w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center mb-2">
                      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="logo w-10 h-10 object-contain opacity-30" />
                    </div>
                  )}
                  <p className="name text-xs font-semibold text-gray-800 mb-0.5 text-center">{s.full_name}</p>
                  <p className="sub text-xs text-gray-400 mb-2">{badgeSubtitle}</p>
                  {qrCodes[s.id] && <img src={qrCodes[s.id]} alt={s.full_name} className="qr w-24 h-24" />}
                  <p className="label text-xs text-gray-300 mt-1">RHS PassAble</p>
                </div>
              ))}
            </div>

          ) : (

            /* ── Sticker template ── */
            <div className="sticker-sheet">
              <div className="sticker-header">
                <div className="sticker-title">Scan Out. Scan In. <span>PassAble.</span></div>
              </div>
              <div className="sticker-grid">
                {students.map(s => (
                  <div key={s.id} className="sticker-label" style={{ border: '0.5pt dashed #e5e7eb' }}>
                    <div className="sticker-left">
                      {photoUrls[s.id] ? (
                        <img src={photoUrls[s.id]} alt={s.full_name} className="sticker-photo" />
                      ) : (
                        <div className="sticker-placeholder">
                          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="sticker-logo" />
                        </div>
                      )}
                    </div>
                    <div className="sticker-right">
                      {qrCodes[s.id] && <img src={qrCodes[s.id]} alt={s.full_name} className="sticker-qr" />}
                      <p className="sticker-name">{s.full_name}</p>
                      <p className="sticker-sub">{badgeSubtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          )}

          {/* ── Footer ── */}
          <div className="mt-8 flex justify-between items-center no-print">
            <a href="/teacher"
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              ← Back to Dashboard
            </a>
            <button onClick={() => window.print()}
              className="px-6 py-3 text-white rounded-lg text-sm font-medium"
              style={{ backgroundColor: RHS_GREEN }}>
              Print This Page
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
