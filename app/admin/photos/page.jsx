/*
  PassAble — RHS Hall Pass System
  FILE:    app/admin/photos/page.jsx
  ROUTE:   /admin/photos
  PURPOSE: Two-phase photo workflow:
           Phase 1 — Upload Lifetouch photos to lifetouch-raw bucket (by normalized name key).
                     Do this once per year, or whenever retake/new photos arrive.
           Phase 2 — Match All Students: copies matched photos from lifetouch-raw →
                     student-photos/{id}.jpg and updates photo_file in the DB.
                     Run any time new teachers/students are added.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students table, student-photos + lifetouch-raw storage buckets)
  UPDATED: 2026-06-21
*/

'use client'
import { useState, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

// Normalize a student name to a storage key: "García López" → "garcia_lopez.jpg"
function normalizeNameKey(first, last) {
  const norm = s => (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents (José → jose)
    .replace(/[^a-z0-9]/g, '_')                        // non-alphanumeric → underscore
  return `${norm(last)}_${norm(first)}.jpg`
}

// List all files in lifetouch-raw bucket (handles pagination)
async function listRawPhotos() {
  const files = new Set()
  let offset = 0
  const limit = 100
  while (true) {
    const { data, error } = await supabase.storage.from('lifetouch-raw').list('', { limit, offset })
    if (error || !data || data.length === 0) break
    data.forEach(f => files.add(f.name))
    if (data.length < limit) break
    offset += limit
  }
  return files
}

export default function PhotoUpload() {
  const [showHelp, setShowHelp] = useState(false)
  const [helpPos, setHelpPos] = useState({ x: null, y: null })
  const helpRef = useRef(null)
  const dragOffset = useRef(null)

  const onHelpMouseDown = useCallback((e) => {
    const rect = helpRef.current?.getBoundingClientRect()
    if (!rect) return
    dragOffset.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top }
    const onMove = (mv) => {
      setHelpPos({ x: mv.clientX - dragOffset.current.dx, y: mv.clientY - dragOffset.current.dy })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // Phase 1: Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadStatus, setUploadStatus] = useState([])

  // Phase 2: Match state
  const [matching, setMatching] = useState(false)
  const [matchDone, setMatchDone] = useState(false)
  const [matchStatus, setMatchStatus] = useState([])

  // ── Phase 1: Upload Lifetouch photos to lifetouch-raw ──────────────────────
  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    setUploading(true)
    setUploadDone(false)
    setUploadStatus([])

    const log = []

    for (const file of files) {
      if (!file.name.match(/\.jpe?g$/i)) continue

      // Filename format: 0043_LastName_FirstName_01.jpg
      const parts = file.name.replace(/\.jpe?g$/i, '').split('_')
      if (parts.length < 3) {
        log.push({ status: 'skip', msg: `Unrecognized format: ${file.name}` })
        continue
      }

      const firstName = parts[parts.length - 2]
      const lastName  = parts.slice(1, parts.length - 2).join(' ')

      if (!firstName || !lastName) {
        log.push({ status: 'skip', msg: `Could not parse name from: ${file.name}` })
        continue
      }

      const key = normalizeNameKey(firstName, lastName)

      const { error } = await supabase.storage
        .from('lifetouch-raw')
        .upload(key, file, { upsert: true, contentType: 'image/jpeg' })

      if (error) {
        log.push({ status: 'error', msg: `${lastName}, ${firstName}: ${error.message}` })
      } else {
        log.push({ status: 'ok', msg: `✓ Stored: ${lastName}, ${firstName}` })
      }
    }

    setUploadStatus(log)
    setUploading(false)
    setUploadDone(true)
  }

  // ── Phase 2: Match all students to stored photos ────────────────────────────
  async function handleMatchAll() {
    setMatching(true)
    setMatchDone(false)
    setMatchStatus([])

    const log = []

    // Load all students
    const { data: students, error: studErr } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name')

    if (studErr || !students) {
      setMatchStatus([{ status: 'error', msg: 'Could not load students: ' + (studErr?.message || 'unknown error') }])
      setMatching(false)
      return
    }

    // List all files in lifetouch-raw
    const rawFiles = await listRawPhotos()

    if (rawFiles.size === 0) {
      setMatchStatus([{ status: 'error', msg: 'No photos found in lifetouch-raw bucket. Complete Step 1 first.' }])
      setMatching(false)
      return
    }

    // For each student: find photo → download → copy to student-photos → update DB
    for (const student of students) {
      const key = normalizeNameKey(student.first_name, student.last_name)

      if (!rawFiles.has(key)) {
        log.push({ status: 'skip', msg: `No photo for ${student.full_name}` })
        continue
      }

      const { data: blob, error: dlErr } = await supabase.storage
        .from('lifetouch-raw')
        .download(key)

      if (dlErr || !blob) {
        log.push({ status: 'error', msg: `${student.full_name}: download failed — ${dlErr?.message}` })
        continue
      }

      const path = `${student.id}.jpg`
      const { error: upErr } = await supabase.storage
        .from('student-photos')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })

      if (upErr) {
        log.push({ status: 'error', msg: `${student.full_name}: upload failed — ${upErr.message}` })
        continue
      }

      const { error: dbErr } = await supabase
        .from('students')
        .update({ photo_file: path })
        .eq('id', student.id)

      if (dbErr) {
        log.push({ status: 'error', msg: `${student.full_name}: DB update failed — ${dbErr.message}` })
      } else {
        log.push({ status: 'ok', msg: `✓ ${student.full_name}` })
      }
    }

    setMatchStatus(log)
    setMatching(false)
    setMatchDone(true)
  }

  const uploadStored  = uploadStatus.filter(s => s.status === 'ok').length
  const uploadSkipped = uploadStatus.filter(s => s.status === 'skip').length
  const uploadErrors  = uploadStatus.filter(s => s.status === 'error').length

  const matchMatched  = matchStatus.filter(s => s.status === 'ok').length
  const matchSkipped  = matchStatus.filter(s => s.status === 'skip').length
  const matchErrors   = matchStatus.filter(s => s.status === 'error').length

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Help Panel (draggable) ── */}
      {showHelp && (
        <div
          ref={helpRef}
          style={{
            position: 'fixed',
            zIndex: 50,
            width: 420,
            maxHeight: '85vh',
            top:  helpPos.y !== null ? helpPos.y : 80,
            left: helpPos.x !== null ? helpPos.x : 'calc(100vw - 440px)',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
            border: '1px solid #e5e7eb',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            onMouseDown={onHelpMouseDown}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid #f3f4f6',
              background: '#f9fafb', borderRadius: '16px 16px 0 0', cursor: 'grab',
            }}
          >
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', margin: 0 }}>Photo Import Help</p>
              <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>Two-step Lifetouch photo workflow</p>
            </div>
            <button
              onClick={() => setShowHelp(false)}
              style={{ background: 'none', border: 'none', fontSize: 20, color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}
            >×</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { q: 'What is Step 1 (Upload)?', a: 'Uploads all Lifetouch photos to a staging area by student name. Do this once — at the start of year or when retakes arrive. Photos stay stored until you replace them.' },
              { q: 'What is Step 2 (Match All Students)?', a: 'Looks at every student in PassAble, finds their photo in the staging area by name, and assigns it. Run this whenever new teachers or students are added — no re-upload needed.' },
              { q: 'Do I do this for every teacher?', a: 'No. One upload + one match covers the entire school. New teacher joins? Just click Match All Students.' },
              { q: 'Retake photos came in mid-year. What do I do?', a: 'Upload just the retake files (Step 1). Then click Match All Students (Step 2). Only updated photos change.' },
              { q: 'Some students say Skipped.', a: "Skipped means no stored photo matched that student's name. Common causes: student not yet in PassAble, or name spelling differs between Lifetouch and Aeries (e.g. \"Jose\" vs \"José\")." },
              { q: 'What Lifetouch filename format is expected?', a: 'Standard format: 0043_LastName_FirstName_01.jpg — the number prefix and _01 suffix are ignored. Only the last and first name are used.' },
              { q: 'Can teachers match just their own students?', a: "Yes. Teachers use Match the Photos from their Relay Station. Useful after retakes when only one room's photos changed." },
            ].map((item, i) => (
              <div key={i} style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px' }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: '#374151', margin: '0 0 4px' }}>{item.q}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Photo Import</h1>
            <p className="text-green-200 text-xs">School-Wide · Lifetouch Workflow</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setShowHelp(v => !v); setHelpPos({ x: null, y: null }) }}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: `2px solid ${RHS_GREEN}`,
              background: showHelp ? RHS_GREEN : 'white', color: showHelp ? 'white' : RHS_GREEN,
              fontWeight: 700, fontSize: 16, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >?</button>
          <a href="/admin" className="text-sm text-green-200 hover:text-white">← Admin Panel</a>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-6">

        {/* ── Step 1: Upload ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>1</span>
            <p className="text-sm font-semibold text-gray-800">Upload Lifetouch Photos</p>
          </div>
          <p className="text-xs text-gray-500 mb-3 ml-8">
            Do this once per year, or when retake photos arrive. Photos are stored by student name and stay until replaced.
          </p>
          <div className="mb-3 ml-8 px-3 py-2 bg-green-50 rounded-lg text-xs text-green-700">
            💡 Open your Lifetouch folder, select all files (Cmd+A / Ctrl+A), then click Open.
          </div>
          <div className="ml-8">
            <input
              type="file"
              accept=".jpg,.jpeg"
              multiple
              onChange={handleFiles}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white cursor-pointer"
            />
            <p className="text-xs text-gray-400 mt-2">Expected format: <span className="font-mono">0043_LastName_FirstName_01.jpg</span></p>
          </div>

          {uploading && (
            <div className="mt-4 ml-8 flex items-center gap-2 text-sm text-gray-500">
              <div className="w-4 h-4 border-2 border-gray-200 rounded-full animate-spin flex-shrink-0" style={{ borderTopColor: RHS_GREEN }} />
              Uploading to staging area — please wait…
            </div>
          )}

          {uploadDone && (
            <div className="mt-4 ml-8">
              <div className="grid grid-cols-3 gap-3 mb-3 pb-3 border-b border-gray-100">
                <div className="text-center">
                  <p className="text-xl font-bold text-green-600">{uploadStored}</p>
                  <p className="text-xs text-gray-500">Stored</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-500">{uploadSkipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-red-500">{uploadErrors}</p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {uploadStatus.map((s, i) => (
                  <div key={i} className={`text-xs py-1 border-b border-gray-50 last:border-0 ${s.status === 'ok' ? 'text-green-600' : s.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                    {s.msg}
                  </div>
                ))}
              </div>
              {uploadStored > 0 && (
                <p className="mt-3 text-xs font-medium text-green-700">
                  ✓ {uploadStored} photos stored. Now run Step 2 to assign them to students.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Match All Students ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center flex-shrink-0" style={{ backgroundColor: RHS_GREEN }}>2</span>
            <p className="text-sm font-semibold text-gray-800">Match All Students</p>
          </div>
          <p className="text-xs text-gray-500 mb-4 ml-8">
            Run any time — after uploading photos, or whenever new teachers or students join.
            Checks every student in the school against stored photos. No re-upload needed.
          </p>
          <div className="ml-8">
            <button
              onClick={handleMatchAll}
              disabled={matching}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: RHS_GREEN }}
            >
              {matching ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Matching students…
                </>
              ) : '📷 Match All Students'}
            </button>
            <p className="text-xs text-gray-400 mt-2">Safe to run multiple times. Takes ~30–60 sec for a full school.</p>
          </div>

          {matchDone && (
            <div className="mt-4 ml-8">
              <div className="grid grid-cols-3 gap-3 mb-3 pb-3 border-b border-gray-100">
                <div className="text-center">
                  <p className="text-xl font-bold text-green-600">{matchMatched}</p>
                  <p className="text-xs text-gray-500">Matched</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-500">{matchSkipped}</p>
                  <p className="text-xs text-gray-500">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-red-500">{matchErrors}</p>
                  <p className="text-xs text-gray-500">Errors</p>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {matchStatus.map((s, i) => (
                  <div key={i} className={`text-xs py-1 border-b border-gray-50 last:border-0 ${s.status === 'ok' ? 'text-green-600' : s.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                    {s.msg}
                  </div>
                ))}
              </div>
              {matchSkipped > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  ⚠ {matchSkipped} students had no matching photo. Normal if not all students have Lifetouch photos yet.
                </div>
              )}
              {matchMatched > 0 && matchErrors === 0 && (
                <p className="mt-3 text-xs font-medium text-green-700">✓ {matchMatched} student photos updated school-wide.</p>
              )}
            </div>
          )}
        </div>

        {/* ── Teacher note ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
          <p className="text-xs text-blue-700 font-medium mb-1">For individual teachers</p>
          <p className="text-xs text-blue-600">
            Teachers can match just their own roster at <span className="font-mono font-medium">/teacher/match-photos</span>.
            Useful after retakes when only one room's photos changed.
          </p>
        </div>

      </div>
    </div>
  )
}
