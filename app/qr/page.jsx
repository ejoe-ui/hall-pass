/*
  PassAble — RHS Hall Pass System
  FILE:    app/qr/page.jsx
  ROUTE:   /qr
  PURPOSE: Generate and print student QR badge cards, sticker labels (Spartan R011 3"×2"),
           and personalized instruction sheets (2-up) for student onboarding.
           QR codes point to /wire?uid=STUDENTID (room-agnostic personal wire page).
           Students scan their QR / tap their NFC badge to open their personal PassAble page.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students, student_periods, teachers) + lifetouch-raw storage bucket
  UPDATED: 2026-06-24 — added instruction sheet template; QR URL → /wire?uid; photos → lifetouch-raw
           per-student search + reprint; instruction sheet is first template option
*/
'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import QRCode from 'qrcode'

const RHS_GREEN = '#006938'
const BASE_URL  = 'https://hall-pass-lime.vercel.app'

const DEFAULT_PERIODS = [
  { label: 'Periods 1 & 2', value: '1' },
  { label: 'Periods 4 & 5', value: '4' },
  { label: 'Periods 6 & 7', value: '6' },
]

export default function QRPage() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [room, setRoom]                     = useState('27')
  const [periods, setPeriods]               = useState(DEFAULT_PERIODS)
  const [students, setStudents]             = useState([])
  const [qrCodes, setQrCodes]               = useState({})
  const [photoUrls, setPhotoUrls]           = useState({})
  const [activePeriod, setActivePeriod]     = useState(null)
  const [template, setTemplate]             = useState('instruction')
  const [studentSearch, setStudentSearch]   = useState('')
  const [notAuthed, setNotAuthed]           = useState(false)

  // ── Auth + teacher load ──────────────────────────────────────────────────
  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setNotAuthed(true); return }
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

  // ── Data loaders ─────────────────────────────────────────────────────────
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
      const seen = new Map()
      for (const s of data) {
        if (!seen.has(s.id)) {
          seen.set(s.id, s)
        } else {
          const existing = seen.get(s.id)
          if (!existing.photo_file && s.photo_file) seen.set(s.id, s)
        }
      }
      const deduped = Array.from(seen.values())
      setStudents(deduped)
      generateQRCodes(deduped)
      generatePhotoUrls(deduped)
    }
  }

  async function generateQRCodes(studentList) {
    const codes = {}
    for (const s of studentList) {
      const url = `${BASE_URL}/wire?uid=${s.id}`
      codes[s.id] = await QRCode.toDataURL(url, { width: 220, margin: 1 })
    }
    setQrCodes(codes)
  }

  async function generatePhotoUrls(studentList) {
    const withPhotos = (studentList || []).filter(s => s?.photo_file)
    if (withPhotos.length === 0) return
    const urls = {}
    // Try lifetouch-raw first (source of truth), fall back to student-photos bucket.
    // Use individual signed URL calls — matches the pattern that works in wire/self-checkout pages.
    await Promise.all(withPhotos.map(async s => {
      try {
        const { data: rd } = await supabase.storage
          .from('lifetouch-raw')
          .createSignedUrl(s.photo_file, 3600)
        if (rd?.signedUrl) { urls[s.id] = rd.signedUrl; return }
        // Fallback: student-photos bucket (legacy)
        const { data: fd } = await supabase.storage
          .from('student-photos')
          .createSignedUrl(s.photo_file, 3600)
        if (fd?.signedUrl) urls[s.id] = fd.signedUrl
      } catch { /* no photo for this student */ }
    }))
    setPhotoUrls(urls)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const teacherName       = currentTeacher?.name || 'Teacher'
  const badgeSubtitle     = `Room ${room} · ${teacherName}`
  const activePeriodLabel = periods.find(p => p.value === activePeriod)?.label || `Period ${activePeriod}`

  // Filtered student list for instruction sheet — respects search
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students
    const q = studentSearch.toLowerCase()
    return students.filter(s => s.full_name.toLowerCase().includes(q))
  }, [students, studentSearch])

  // ── Guard renders ─────────────────────────────────────────────────────────
  if (notAuthed) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-gray-500">You need to be signed in to view this page.</p>
      <a href="/teacher" className="text-sm font-medium text-green-700 hover:underline">← Go to Teacher Login</a>
    </div>
  )

  if (!activePeriod) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
    </div>
  )

  // ── Instruction sheet HTML builder (shared by print + per-student reprint) ─
  function buildStudentSheetHtml(s) {
    const wireUrl   = `${BASE_URL}/wire?uid=${s.id}`
    const photoHtml = photoUrls[s.id]
      ? `<img src="${photoUrls[s.id]}" style="width:1.1in;height:1.1in;object-fit:cover;border-radius:8pt;display:block;margin:0 auto;" />`
      : `<div style="width:1.1in;height:1.1in;border-radius:8pt;background:#f3f4f6;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:28pt;font-weight:800;color:#9ca3af;">${s.full_name.split(' ').map(n=>n[0]).slice(0,2).join('')}</div>`
    const qrHtml = qrCodes[s.id]
      ? `<img src="${qrCodes[s.id]}" style="width:1.0in;height:1.0in;display:block;margin:0 auto;" />`
      : ''

    return `
      <div style="width:8.5in;height:5.5in;box-sizing:border-box;padding:0.35in 0.5in;display:flex;flex-direction:row;gap:0.35in;background:white;overflow:hidden;">
        <!-- LEFT: student identity + URL -->
        <div style="width:2.1in;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:0.12in;">
          ${photoHtml}
          <p style="font-size:13pt;font-weight:800;text-align:center;color:#111;margin:0;line-height:1.25;">${s.full_name}</p>
          <p style="font-size:8pt;color:#6b7280;margin:0;text-align:center;">${activePeriodLabel} · Room ${room}</p>
          <div style="margin-top:0.1in;width:100%;">
            ${qrHtml}
            <p style="font-size:7.5pt;font-weight:700;color:#006938;text-align:center;margin:4pt 0 2pt;">Scan to open your page</p>
            <p style="font-size:6.5pt;color:#6b7280;text-align:center;word-break:break-all;margin:0;">${wireUrl}</p>
          </div>
          <div style="margin-top:0.12in;border:1pt solid #e5e7eb;border-radius:6pt;padding:6pt 8pt;width:100%;box-sizing:border-box;background:#f9fafb;">
            <p style="font-size:7pt;font-weight:700;color:#374151;margin:0 0 3pt;">📲 NFC Setup</p>
            <p style="font-size:6.5pt;color:#6b7280;margin:0;line-height:1.4;">Copy this URL into NFC Tools and write it to your badge sticker.</p>
            <p style="font-size:6.5pt;color:#006938;font-weight:700;margin:3pt 0 0;word-break:break-all;">${wireUrl}</p>
          </div>
        </div>
        <!-- DIVIDER -->
        <div style="width:1pt;background:#e5e7eb;flex-shrink:0;"></div>
        <!-- RIGHT: instructions -->
        <div style="flex:1;display:flex;flex-direction:column;gap:0.14in;">
          <!-- Header -->
          <div style="display:flex;align-items:center;gap:8pt;padding-bottom:0.1in;border-bottom:1.5pt solid #006938;">
            <img src="/RHSCOWBOYlogo.png" style="width:0.35in;height:0.35in;object-fit:contain;" />
            <div>
              <p style="font-size:14pt;font-weight:800;color:#006938;margin:0;letter-spacing:-0.02em;">PassAble MultiPass</p>
              <p style="font-size:9pt;color:#6b7280;margin:0;">Three ways to check out — always check back in at the kiosk</p>
            </div>
          </div>
          <!-- Three checkout methods -->
          <div style="display:flex;gap:0;flex:1;">

            <!-- 1: Kiosk -->
            <div style="flex:1;padding-right:0.15in;border-right:0.75pt solid #e5e7eb;">
              <p style="font-size:9pt;font-weight:800;color:#006938;margin:0 0 3pt;text-transform:uppercase;letter-spacing:0.04em;">🖥️ Kiosk</p>
              <p style="font-size:8pt;color:#6b7280;margin:0 0 5pt;font-style:italic;">Primary method</p>
              <ol style="margin:0;padding-left:13pt;font-size:9pt;color:#374151;line-height:1.6;">
                <li>Walk to the classroom kiosk</li>
                <li>Scan your NFC badge or QR code, or select your name from the dropdown</li>
                <li>Select your destination</li>
                <li>Tap <strong>Check Out</strong> — done!</li>
              </ol>
            </div>

            <!-- 2: Teacher -->
            <div style="flex:1;padding-left:0.15in;padding-right:0.15in;border-right:0.75pt solid #e5e7eb;">
              <p style="font-size:9pt;font-weight:800;color:#374151;margin:0 0 3pt;text-transform:uppercase;letter-spacing:0.04em;">👩‍🏫 Teacher</p>
              <p style="font-size:8pt;color:#6b7280;margin:0 0 5pt;font-style:italic;">Teacher checks you out</p>
              <ol style="margin:0;padding-left:13pt;font-size:9pt;color:#374151;line-height:1.6;">
                <li>Ask your teacher to check you out</li>
                <li>They select your name and reason on their end</li>
                <li>You're good to go — no kiosk needed to leave</li>
                <li>Still check back in at the kiosk when you return</li>
              </ol>
            </div>

            <!-- 3: Wire page self-checkout -->
            <div style="flex:1.1;padding-left:0.15in;">
              <p style="font-size:9pt;font-weight:800;color:#2563eb;margin:0 0 3pt;text-transform:uppercase;letter-spacing:0.04em;">📱 Your Wire Page</p>
              <p style="font-size:8pt;color:#6b7280;margin:0 0 5pt;font-style:italic;">Self-checkout on your Chromebook</p>
              <ol style="margin:0;padding-left:13pt;font-size:9pt;color:#374151;line-height:1.6;">
                <li>Open your link (scan QR or tap NFC badge)</li>
                <li>Find <strong>PassAble Pass Status</strong> → tap <strong>Request Check-Out</strong></li>
                <li>Get teacher approval: scan their QR code on screen, or type the code they give you</li>
                <li>Choose destination → tap <strong>Check Out</strong></li>
                <li>Screen turns red — you're checked out. Go!</li>
              </ol>
            </div>
          </div>

          <!-- Bottom strip: check-in + tips -->
          <div style="display:flex;gap:0.2in;border-top:1pt solid #e5e7eb;padding-top:0.1in;">
            <div style="flex:1.1;">
              <p style="font-size:9pt;font-weight:800;color:#374151;margin:0 0 4pt;text-transform:uppercase;letter-spacing:0.04em;">🔁 Checking Back In (all three methods)</p>
              <p style="font-size:9pt;color:#374151;margin:0;line-height:1.5;">Return to class → go to the <strong>classroom kiosk</strong> → scan your NFC badge or QR code → tap <strong>Check In</strong>. Your Chromebook screen resets automatically.</p>
            </div>
            <div style="flex:1;">
              <p style="font-size:9pt;font-weight:800;color:#b45309;margin:0 0 4pt;text-transform:uppercase;letter-spacing:0.04em;">⚠ Important</p>
              <ul style="margin:0;padding-left:12pt;font-size:9pt;color:#374151;line-height:1.5;">
                <li>You <strong>cannot</strong> check in from your Chromebook — kiosk only</li>
                <li>Your teacher tracks all passes in real time</li>
                <li>Passes are logged — use them responsibly</li>
                <li>Your badge is personal — never share it</li>
              </ul>
            </div>
          </div>

          <div style="border-top:1pt solid #e5e7eb;padding-top:5pt;display:flex;justify-content:space-between;align-items:center;">
            <p style="font-size:7.5pt;color:#9ca3af;margin:0;">RHS PassAble · Room ${room} · ${teacherName}</p>
            <p style="font-size:7.5pt;color:#9ca3af;margin:0;">Questions? Ask your teacher.</p>
          </div>
        </div>
      </div>`
  }

  // ── Print handlers ────────────────────────────────────────────────────────
  function printInstructionSheets(studentList) {
    const pairs = Array.from({ length: Math.ceil(studentList.length / 2) }, (_, i) =>
      studentList.slice(i * 2, i * 2 + 2)
    )
    const sheetsHtml = pairs.map(pair => `
      <div style="width:8.5in;height:11in;display:flex;flex-direction:column;page-break-after:always;">
        ${pair.map(s => buildStudentSheetHtml(s)).join('<div style="width:100%;height:1pt;background:#e5e7eb;"></div>')}
        ${pair.length === 1 ? '<div style="flex:1;background:white;"></div>' : ''}
      </div>`
    ).join('')

    const html = `<!DOCTYPE html>
<html>
<head><title>PassAble Student Instructions</title>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  html, body { margin: 0; padding: 0; width: 8.5in; font-family: system-ui, sans-serif; }
</style></head>
<body>${sheetsHtml}
<script>window.onload=function(){window.print();}<\/script>
</body></html>`

    const win = window.open('', '_blank', 'width=1000,height=800')
    win.document.write(html)
    win.document.close()
  }

  function printStickerLabels() {
    const labelsHtml = students.map(s => {
      const photo = photoUrls[s.id]
        ? `<img src="${photoUrls[s.id]}" style="width:1.05in;height:1.05in;object-fit:cover;border-radius:5pt;display:block;" />`
        : `<div style="width:1.05in;height:1.05in;border-radius:5pt;background:#f3f4f6;display:flex;align-items:center;justify-content:center;"><img src="/RHSCOWBOYlogo.png" style="width:0.4in;height:0.4in;opacity:0.3;" /></div>`
      const qr = qrCodes[s.id]
        ? `<img src="${qrCodes[s.id]}" style="width:1.1in;height:1.1in;display:block;" />`
        : ''
      return `
        <div style="width:3in;height:2in;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;padding:0.1in 0.12in 0.08in 0.12in;background:white;">
          <div style="display:flex;flex-direction:row;align-items:center;gap:0.1in;flex:1;min-height:0;">
            <div style="display:flex;flex-direction:column;align-items:center;gap:4pt;width:1.1in;flex-shrink:0;">
              ${photo}
              <p style="font-size:9pt;font-weight:800;text-align:center;color:#111;line-height:1.2;margin:0;max-width:1.1in;">${s.full_name}</p>
            </div>
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4pt;">
              ${qr}
              <p style="font-size:8pt;font-weight:600;color:#444;text-align:center;margin:0;line-height:1.3;">${badgeSubtitle}</p>
            </div>
          </div>
          <div style="flex-shrink:0;border-top:0.5pt solid #d1d5db;padding-top:3pt;margin-top:4pt;">
            <p style="font-size:11pt;font-weight:800;letter-spacing:0.04em;color:#006938;white-space:nowrap;margin:0;">
              Scan Out. Scan In. <span style="color:#9ca3af;font-weight:400;">PassAble MultiPass</span>
            </p>
          </div>
        </div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html>
<head><title>PassAble Sticker Labels</title>
<style>
  @page { size: 8.5in 11in; margin: 0; }
  html, body { margin: 0; padding: 0; width: 8.5in; height: 11in; }
  .sheet { width:8.5in;height:11in;padding-top:0.1in;padding-left:1.1875in;padding-right:1.1875in;box-sizing:border-box; }
  .grid { display:grid;grid-template-columns:3in 3in;grid-template-rows:repeat(5,2in);column-gap:0.125in;row-gap:0.125in; }
</style></head>
<body><div class="sheet"><div class="grid">${labelsHtml}</div></div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`

    const win = window.open('', '_blank', 'width=900,height=700')
    win.document.write(html)
    win.document.close()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @page { size: 8.5in 11in; margin: 0; }
        @media print {
          html, body { width:8.5in!important;height:11in!important;margin:0!important;padding:0!important;overflow:hidden!important; }
          .no-print { display:none!important; }
          .min-h-screen,.max-w-5xl { margin:0!important;padding:0!important;max-width:none!important;min-height:0!important;background:white!important; }
          .badge-print-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:6px; }
          .badge-print-card { border:1px solid #e5e7eb;border-radius:8px;padding:6px;display:flex;flex-direction:column;align-items:center;page-break-inside:avoid;break-inside:avoid; }
          .badge-print-card .photo { width:80px;height:80px;object-fit:cover;border-radius:6px;margin-bottom:4px; }
          .badge-print-card .placeholder { width:80px;height:80px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;margin-bottom:4px; }
          .badge-print-card img.qr { width:100px;height:100px; }
          .badge-print-card .name { font-size:10px;font-weight:600;text-align:center;margin-bottom:1px; }
          .badge-print-card .sub { font-size:8px;color:#9ca3af;margin-bottom:4px; }
          .badge-print-card .label { font-size:7px;color:#d1d5db;margin-top:2px; }
          .sticker-label { width:3in!important;height:2in!important;box-sizing:border-box!important;overflow:hidden!important;padding:0.1in 0.12in 0.08in 0.12in!important;page-break-inside:avoid!important;break-inside:avoid!important;display:flex!important;flex-direction:column!important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-4 no-print">
            <div>
              <h1 className="text-2xl font-semibold text-gray-800">Student QR Badges</h1>
              <p className="text-gray-500 text-sm">Room {room} · {teacherName} · Print and distribute to students</p>
            </div>
            <div className="flex gap-2 flex-wrap">
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
          <div className="no-print mb-4 flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500 font-medium">Template:</span>
            <div className="flex gap-2 flex-wrap">
              {[
                { id: 'instruction', label: '📋 Instruction Sheets', sub: '2-up · NFC URL + how-to guide' },
                { id: 'badge',       label: '🪪 Badge Cards',        sub: '3-up · cut & laminate' },
                { id: 'sticker',     label: '🏷️ Sticker Labels',     sub: 'Spartan R011 · 3"×2" · 10/sheet' },
              ].map(t => (
                <button key={t.id} onClick={() => { setTemplate(t.id); setStudentSearch('') }}
                  className={`px-4 py-2.5 rounded-xl border text-left transition-colors ${template === t.id ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                  style={template === t.id ? { backgroundColor: RHS_GREEN } : {}}>
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className={`text-xs mt-0.5 ${template === t.id ? 'text-green-200' : 'text-gray-400'}`}>{t.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Student search (instruction template only) */}
          {template === 'instruction' && students.length > 0 && (
            <div className="no-print mb-4 flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by student name to reprint…"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{ '--tw-ring-color': RHS_GREEN }}
                />
              </div>
              {studentSearch && (
                <span className="text-sm text-gray-500">
                  {filteredStudents.length === 0
                    ? 'No match'
                    : filteredStudents.length === 1
                    ? `1 student — `
                    : `${filteredStudents.length} students — `}
                </span>
              )}
              {studentSearch && filteredStudents.length > 0 && (
                <button
                  onClick={() => printInstructionSheets(filteredStudents)}
                  className="px-4 py-2 text-white text-sm font-medium rounded-lg"
                  style={{ backgroundColor: RHS_GREEN }}>
                  🖨️ Print {filteredStudents.length === 1 ? filteredStudents[0].full_name.split(' ')[0] + "'s sheet" : `${filteredStudents.length} sheets`}
                </button>
              )}
              {studentSearch && (
                <button onClick={() => setStudentSearch('')}
                  className="px-3 py-2 text-sm text-gray-500 border border-gray-200 rounded-lg bg-white hover:bg-gray-50">
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Print tip */}
          <div className="no-print mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            {template === 'instruction' && '⚠ Set printer to actual size, single-sided. Each sheet has 2 students — cut in half to separate. To reprint a lost sheet, search the student\'s name above and print just theirs.'}
            {template === 'badge' && '⚠ Set printer to single-sided and fit to page.'}
            {template === 'sticker' && '⚠ Set printer to actual size (NOT fit to page), single-sided. Load Spartan R011 label sheets.'}
          </div>

          {/* ── Content ── */}
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
                      <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-10 h-10 object-contain opacity-30" />
                    </div>
                  )}
                  <p className="name text-xs font-semibold text-gray-800 mb-0.5 text-center">{s.full_name}</p>
                  <p className="sub text-xs text-gray-400 mb-2">{badgeSubtitle}</p>
                  {qrCodes[s.id] && <img src={qrCodes[s.id]} alt={s.full_name} className="qr w-24 h-24" />}
                  <p className="label text-xs text-gray-300 mt-1">RHS PassAble</p>
                </div>
              ))}
            </div>

          ) : template === 'sticker' ? (

            /* Sticker template */
            <div style={{ paddingLeft: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 288px)', columnGap: 12, rowGap: 12 }}>
                {students.map(s => (
                  <div key={s.id} className="sticker-label" style={{
                    width: 288, height: 192, boxSizing: 'border-box', overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                    padding: '10px 12px 8px 12px',
                    border: '1px dashed #d1d5db', background: 'white',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 0 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 106, flexShrink: 0 }}>
                        {photoUrls[s.id] ? (
                          <img src={photoUrls[s.id]} alt={s.full_name} style={{ width: 101, height: 101, objectFit: 'cover', borderRadius: 5 }} />
                        ) : (
                          <div style={{ width: 101, height: 101, borderRadius: 5, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src="/RHSCOWBOYlogo.png" alt="RHS" style={{ width: 38, height: 38, objectFit: 'contain', opacity: 0.3 }} />
                          </div>
                        )}
                        <p style={{ fontSize: 9, fontWeight: 800, textAlign: 'center', color: '#111', lineHeight: 1.2, maxWidth: 106, margin: 0 }}>
                          {s.full_name}
                        </p>
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        {qrCodes[s.id] && <img src={qrCodes[s.id]} alt={s.full_name} style={{ width: 106, height: 106 }} />}
                        <p style={{ fontSize: 8, fontWeight: 600, color: '#444', textAlign: 'center', margin: 0, lineHeight: 1.3 }}>
                          {badgeSubtitle}
                        </p>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, borderTop: '1px solid #d1d5db', paddingTop: 3, marginTop: 4 }}>
                      <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: RHS_GREEN, whiteSpace: 'nowrap', margin: 0 }}>
                        Scan Out. Scan In.{' '}
                        <span style={{ color: '#9ca3af', fontWeight: 400 }}>PassAble MultiPass</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          ) : (

            /* Instruction sheet template (screen preview) */
            <div className="space-y-4">
              {Array.from({ length: Math.ceil(filteredStudents.length / 2) }, (_, i) => {
                const pair = filteredStudents.slice(i * 2, i * 2 + 2)
                return (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm" style={{ maxWidth: 850 }}>
                    {pair.map((s, si) => (
                      <div key={s.id}>
                        {si > 0 && <div style={{ height: 1, background: '#e5e7eb' }} />}
                        <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'row', gap: 18 }}>

                          {/* Left column */}
                          <div style={{ width: 148, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                            {photoUrls[s.id] ? (
                              <img src={photoUrls[s.id]} alt={s.full_name}
                                style={{ width: 78, height: 78, objectFit: 'cover', borderRadius: 7 }} />
                            ) : (
                              <div style={{ width: 78, height: 78, borderRadius: 7, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#9ca3af' }}>
                                {s.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                              </div>
                            )}
                            <div style={{ textAlign: 'center' }}>
                              <p style={{ fontSize: 11, fontWeight: 800, color: '#111', margin: 0 }}>{s.full_name}</p>
                              <p style={{ fontSize: 8, color: '#6b7280', margin: '2px 0 0' }}>{activePeriodLabel} · Room {room}</p>
                            </div>
                            {qrCodes[s.id] && (
                              <div style={{ width: '100%', textAlign: 'center' }}>
                                <img src={qrCodes[s.id]} alt="" style={{ width: 70, height: 70, display: 'block', margin: '0 auto' }} />
                                <p style={{ fontSize: 6.5, color: '#6b7280', margin: '2px 0 0', wordBreak: 'break-all' }}>
                                  {BASE_URL}/wire?uid={s.id}
                                </p>
                              </div>
                            )}
                            <div style={{ border: '1px solid #e5e7eb', borderRadius: 5, padding: '5px 6px', background: '#f9fafb', width: '100%', boxSizing: 'border-box' }}>
                              <p style={{ fontSize: 7, fontWeight: 700, color: '#374151', margin: '0 0 2px' }}>📲 NFC Setup</p>
                              <p style={{ fontSize: 6, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>
                                Copy this URL into NFC Tools and write it to your badge sticker.
                              </p>
                              <p style={{ fontSize: 6, color: RHS_GREEN, fontWeight: 700, margin: '2px 0 0', wordBreak: 'break-all' }}>
                                {BASE_URL}/wire?uid={s.id}
                              </p>
                            </div>
                          </div>

                          {/* Divider */}
                          <div style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />

                          {/* Right column */}
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 7, borderBottom: `1.5px solid ${RHS_GREEN}` }}>
                              <img src="/RHSCOWBOYlogo.png" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 800, color: RHS_GREEN, margin: 0 }}>PassAble MultiPass</p>
                                <p style={{ fontSize: 8, color: '#6b7280', margin: 0 }}>Three ways to check out — always check back in at the kiosk</p>
                              </div>
                            </div>

                            {/* Three methods */}
                            <div style={{ display: 'flex', gap: 0, flex: 1 }}>

                              {/* Kiosk */}
                              <div style={{ flex: 1, paddingRight: 10, borderRight: '1px solid #e5e7eb' }}>
                                <p style={{ fontSize: 8.5, fontWeight: 800, color: RHS_GREEN, margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🖥️ Kiosk</p>
                                <p style={{ fontSize: 7.5, color: '#6b7280', margin: '0 0 4px', fontStyle: 'italic' }}>Primary method</p>
                                <ol style={{ margin: 0, paddingLeft: 12, fontSize: 8.5, color: '#374151', lineHeight: 1.55 }}>
                                  <li>Walk to the classroom kiosk</li>
                                  <li>Scan NFC badge or QR code</li>
                                  <li>Select destination</li>
                                  <li>Tap <strong>Check Out</strong> — done!</li>
                                </ol>
                              </div>

                              {/* Teacher */}
                              <div style={{ flex: 1, paddingLeft: 10, paddingRight: 10, borderRight: '1px solid #e5e7eb' }}>
                                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#374151', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>👩‍🏫 Teacher</p>
                                <p style={{ fontSize: 7.5, color: '#6b7280', margin: '0 0 4px', fontStyle: 'italic' }}>Teacher checks you out</p>
                                <ol style={{ margin: 0, paddingLeft: 12, fontSize: 8.5, color: '#374151', lineHeight: 1.55 }}>
                                  <li>Ask your teacher to check you out</li>
                                  <li>They select your name and reason</li>
                                  <li>You're good to go — no kiosk to leave</li>
                                  <li>Still check back in at the kiosk on return</li>
                                </ol>
                              </div>

                              {/* Wire page */}
                              <div style={{ flex: 1.1, paddingLeft: 10 }}>
                                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#2563eb', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>📱 Your Wire Page</p>
                                <p style={{ fontSize: 7.5, color: '#6b7280', margin: '0 0 4px', fontStyle: 'italic' }}>Self-checkout on your Chromebook</p>
                                <ol style={{ margin: 0, paddingLeft: 12, fontSize: 8.5, color: '#374151', lineHeight: 1.55 }}>
                                  <li>Open your link (QR / NFC badge)</li>
                                  <li>Find <strong>PassAble Pass Status</strong> → tap <strong>Request Check-Out</strong></li>
                                  <li>Scan teacher's QR or enter the code they give you</li>
                                  <li>Choose destination → tap <strong>Check Out</strong></li>
                                  <li>Screen turns red — checked out. Go!</li>
                                </ol>
                              </div>
                            </div>

                            {/* Bottom: check-in + tips */}
                            <div style={{ display: 'flex', gap: 14, borderTop: '1px solid #e5e7eb', paddingTop: 7 }}>
                              <div style={{ flex: 1.1 }}>
                                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#374151', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>🔁 Checking Back In (all methods)</p>
                                <p style={{ fontSize: 8.5, color: '#374151', margin: 0, lineHeight: 1.5 }}>
                                  Return to class → go to the <strong>classroom kiosk</strong> → scan your NFC badge or QR code → tap <strong>Check In</strong>. Your Chromebook screen resets automatically.
                                </p>
                              </div>
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 8.5, fontWeight: 800, color: '#b45309', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>⚠ Important</p>
                                <ul style={{ margin: 0, paddingLeft: 12, fontSize: 8.5, color: '#374151', lineHeight: 1.5 }}>
                                  <li>You <strong>cannot</strong> check in from your Chromebook — kiosk only</li>
                                  <li>Teacher tracks all passes in real time</li>
                                  <li>Passes are logged — use them responsibly</li>
                                  <li>Your badge is personal — never share it</li>
                                </ul>
                              </div>
                            </div>

                            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                              <p style={{ fontSize: 7, color: '#9ca3af', margin: 0 }}>RHS PassAble · Room {room} · {teacherName}</p>
                              <button
                                onClick={() => printInstructionSheets([s])}
                                className="no-print text-xs text-gray-400 hover:text-gray-600 underline"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                🖨️ Reprint this sheet
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}

              {filteredStudents.length === 0 && studentSearch && (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
                  No students match "{studentSearch}"
                </div>
              )}
            </div>

          )}

          {/* Footer */}
          <div className="mt-8 flex justify-between items-center no-print">
            <a href="/teacher"
              className="px-5 py-2.5 text-sm font-medium rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              ← Back to Dashboard
            </a>
            {template === 'badge' && (
              <button onClick={() => window.print()}
                className="px-6 py-3 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: RHS_GREEN }}>
                🖨️ Print Badge Cards
              </button>
            )}
            {template === 'sticker' && (
              <button onClick={printStickerLabels}
                className="px-6 py-3 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: RHS_GREEN }}>
                🖨️ Print Sticker Labels
              </button>
            )}
            {template === 'instruction' && (
              <button onClick={() => printInstructionSheets(filteredStudents)}
                className="px-6 py-3 text-white rounded-lg text-sm font-medium"
                style={{ backgroundColor: RHS_GREEN }}>
                🖨️ Print {studentSearch && filteredStudents.length < students.length
                  ? `${filteredStudents.length} Filtered Sheet${filteredStudents.length !== 1 ? 's' : ''}`
                  : 'All Instruction Sheets'}
              </button>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
