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
  const [template, setTemplate] = useState('badge')

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

  async function generateQRCodes(studentList) {
    const codes = {}
    for (const s of studentList) {
      const url = `https://hall-pass-lime.vercel.app/kiosk?student=${s.id}`
      codes[s.id] = await QRCode.toDataURL(url, { width: 200, margin: 1 })
    }
    setQrCodes(codes)
  }

  async function generatePhotoUrls(studentList) {
    const urls = {}
    for (const s of studentList) {
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

        /* ─────────────────────────────────────────
           PRINT STYLES
        ───────────────────────────────────────── */
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; padding: 0; width: 8.5in; }

          /* Badge 3-up */
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

          /* ── Spartan R011 sticker sheet
             Sheet:        8.5" × 11"
             Top margin:   0.25"
             Side margin:  1.1875"
             Label:        3" × 2"
             Col gap:      0.125" (pitch 3.125" - width 3")
             Row gap:      0.125" (pitch 2.125" - height 2")
          ── */
          @page {
            size: 8.5in 11in;
            margin: 0;
          }

          .sticker-sheet {
            width: 8.5in;
            box-sizing: border-box;
            padding-top: 0.25in;
            padding-left: 1.1875in;
            padding-right: 1.1875in;
            padding-bottom: 0;
          }

          .sticker-grid {
            display: grid;
            grid-template-columns: 3in 3in;
            grid-template-rows: repeat(5, 2in);
            column-gap: 0.125in;
            row-gap: 0.125in;
          }

          /* Each label is exactly 3" × 2", flex column */
          .sticker-label {
            width: 3in;
            height: 2in;
            box-sizing: border-box;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            padding: 0.1in 0.12in 0.08in 0.12in;
            page-break-inside: avoid;
            break-inside: avoid;
          }

          /* Top content row fills remaining height above brand strip */
          .sticker-top {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 0.1in;
            flex: 1;
            min-height: 0;
          }

          .sticker-left {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4pt;
            width: 1.1in;
            flex-shrink: 0;
          }
          .sticker-photo {
            width: 1.05in;
            height: 1.05in;
            object-fit: cover;
            border-radius: 5pt;
          }
          .sticker-placeholder {
            width: 1.05in;
            height: 1.05in;
            border-radius: 5pt;
            background: #f3f4f6;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .sticker-logo {
            width: 0.4in;
            height: 0.4in;
            object-fit: contain;
            opacity: 0.3;
          }
          .sticker-name {
            font-size: 9pt;
            font-weight: 800;
            text-align: center;
            color: #111;
            line-height: 1.2;
            max-width: 1.1in;
          }

          .sticker-right {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4pt;
          }
          .sticker-qr {
            width: 1.1in;
            height: 1.1in;
          }
          .sticker-sub {
            font-size: 8pt;
            font-weight: 600;
            color: #444;
            text-align: center;
            line-height: 1.3;
          }

          /* Brand strip — locked inside label, fixed height */
          .sticker-brand {
            flex-shrink: 0;
            border-top: 0.5pt solid #d1d5db;
            padding-top: 3pt;
            margin-top: 4pt;
          }
          .sticker-brand-text {
            font-size: 11pt;
            font-weight: 800;
            letter-spacing: 0.04em;
            color: #006938;
            white-space: nowrap;
          }
          .sticker-brand-text span {
            color: #9ca3af;
            font-weight: 400;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
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

          {/* Template toggle */}
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

          {/* Print tip */}
          <div className="no-print mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            {template === 'badge'
              ? '⚠ Before printing: set printer to single-sided and fit to page.'
              : '⚠ Before printing: set printer to actual size (NOT fit to page) and single-sided. Load Spartan R011 label sheets.'}
          </div>

          {students.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400 text-sm no-print">
              No students in this period
            </div>
          ) : template === 'badge' ? (

            /* Badge template */
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

            /* Sticker template — screen preview */
            <div className="sticker-sheet" style={{ paddingLeft: 0 }}>
              <div className="sticker-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 288px)',
                columnGap: 12,
                rowGap: 12,
              }}>
                {students.map(s => (
                  <div key={s.id} className="sticker-label" style={{
                    width: 288,
                    height: 192,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '10px 12px 8px 12px',
                    border: '1px dashed #d1d5db',
                    background: 'white',
                  }}>

                    {/* Top row */}
                    <div className="sticker-top" style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      flex: 1,
                      minHeight: 0,
                    }}>

                      {/* Left: photo + name */}
                      <div className="sticker-left" style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                        width: 106,
                        flexShrink: 0,
                      }}>
                        {photoUrls[s.id] ? (
                          <img src={photoUrls[s.id]} alt={s.full_name} className="sticker-photo"
                            style={{ width: 101, height: 101, objectFit: 'cover', borderRadius: 5 }} />
                        ) : (
                          <div className="sticker-placeholder" style={{
                            width: 101, height: 101, borderRadius: 5,
                            background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <img src="/RHSCOWBOYlogo.png" alt="RHS" className="sticker-logo"
                              style={{ width: 38, height: 38, objectFit: 'contain', opacity: 0.3 }} />
                          </div>
                        )}
                        <p className="sticker-name" style={{
                          fontSize: 9, fontWeight: 800, textAlign: 'center',
                          color: '#111', lineHeight: 1.2, maxWidth: 106,
                        }}>
                          {s.full_name}
                        </p>
                      </div>

                      {/* Right: QR + subtitle */}
                      <div className="sticker-right" style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}>
                        {qrCodes[s.id] && (
                          <img src={qrCodes[s.id]} alt={s.full_name} className="sticker-qr"
                            style={{ width: 106, height: 106 }} />
                        )}
                        <p className="sticker-sub" style={{
                          fontSize: 8, fontWeight: 600, color: '#444',
                          textAlign: 'center', lineHeight: 1.3,
                        }}>
                          {badgeSubtitle}
                        </p>
                      </div>
                    </div>

                    {/* Brand strip — inside label */}
                    <div className="sticker-brand" style={{
                      flexShrink: 0,
                      borderTop: '1px solid #d1d5db',
                      paddingTop: 3,
                      marginTop: 4,
                    }}>
                      <p className="sticker-brand-text" style={{
                        fontSize: 11, fontWeight: 800, letterSpacing: '0.04em',
                        color: RHS_GREEN, whiteSpace: 'nowrap',
                      }}>
                        Scan Out. Scan In.{' '}
                        <span style={{ color: '#9ca3af', fontWeight: 400 }}>PassAble MultiPass</span>
                      </p>
                    </div>

                  </div>
                ))}
              </div>
            </div>

          )}

          {/* Footer */}
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
