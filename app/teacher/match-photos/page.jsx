/*
  PassAble — RHS Hall Pass System
  FILE:    app/teacher/match-photos/page.jsx
  ROUTE:   /teacher/match-photos
  PURPOSE: Teacher-facing "Match My Students" page. Checks the logged-in teacher's
           roster against photos already stored in the lifetouch-raw bucket and
           assigns any matches to student-photos/{id}.jpg. Teachers run this after
           retake day or any time new students are added to their room.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (teachers, students tables; student-photos + lifetouch-raw buckets)
  UPDATED: 2026-06-21
*/

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

// Same normalization as admin/photos — must stay in sync
function normalizeNameKey(first, last) {
  const norm = s => (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // strip accents
    .replace(/[^a-z0-9]/g, '_')
  return `${norm(last)}_${norm(first)}.jpg`
}

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

export default function TeacherMatchPhotos() {
  const [teacher, setTeacher] = useState(null)
  const [loading, setLoading] = useState(true)
  const [matching, setMatching] = useState(false)
  const [done, setDone] = useState(false)
  const [status, setStatus] = useState([])
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    async function loadTeacher() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setLoading(false); return }
      const { data } = await supabase
        .from('teachers')
        .select('*')
        .eq('auth_id', session.user.id)
        .eq('is_active', true)
        .maybeSingle()
      setTeacher(data)
      setLoading(false)
    }
    loadTeacher()
  }, [])

  async function handleMatch() {
    if (!teacher) return
    setMatching(true)
    setDone(false)
    setStatus([])

    const log = []

    // Load this teacher's students only
    const { data: students, error: studErr } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name')
      .eq('teacher_id', teacher.id)

    if (studErr || !students) {
      setStatus([{ status: 'error', msg: 'Could not load your students: ' + (studErr?.message || 'unknown') }])
      setMatching(false)
      return
    }

    if (students.length === 0) {
      setStatus([{ status: 'skip', msg: 'No students found in your roster.' }])
      setMatching(false)
      setDone(true)
      return
    }

    // List stored photos
    const rawFiles = await listRawPhotos()

    if (rawFiles.size === 0) {
      setStatus([{ status: 'error', msg: 'No photos in staging area. Ask your admin to upload Lifetouch photos first.' }])
      setMatching(false)
      return
    }

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

    setStatus(log)
    setMatching(false)
    setDone(true)
  }

  const matched = status.filter(s => s.status === 'ok').length
  const skipped = status.filter(s => s.status === 'skip').length
  const errors  = status.filter(s => s.status === 'error').length

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: RHS_GREEN }} />
      </div>
    )
  }

  if (!teacher) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 text-sm mb-3">You need to be logged in as a teacher to use this page.</p>
          <a href="/teacher" className="text-sm font-medium" style={{ color: RHS_GREEN }}>← Go to Teacher Login</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Help Panel ── */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-end p-4" onClick={() => setShowHelp(false)}>
          <div className="bg-white rounded-2xl shadow-2xl flex flex-col mt-16 mr-2"
            style={{ width: 380, maxHeight: '80vh', border: '1px solid #e5e7eb' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 rounded-t-2xl" style={{ backgroundColor: '#f9fafb' }}>
              <p className="text-sm font-bold text-gray-800">Match Photos — Help</p>
              <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {[
                { q: 'What does this do?', a: 'Checks your roster against Lifetouch photos that your admin already uploaded. Any students with a matching photo get it assigned automatically.' },
                { q: 'When should I run this?', a: 'After picture retake day, or any time your admin tells you new photos were uploaded. Also useful when you add a new student who was photographed.' },
                { q: 'Some students say Skipped.', a: 'Either their photo isn\'t in the Lifetouch batch yet, or their name in PassAble doesn\'t exactly match the photo file. Ask your admin to check.' },
                { q: 'Can I upload photos myself?', a: 'Only the admin can upload the school-wide Lifetouch batch. But you can set an individual student\'s photo from your Student Manager — click Edit next to their name.' },
                { q: 'Is it safe to run this multiple times?', a: 'Yes — it uses upsert, so running it again just refreshes photos. Nothing gets deleted.' },
              ].map((item, i) => (
                <div key={i} className="bg-gray-50 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-gray-700 mb-1">{item.q}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Match My Photos</h1>
            <p className="text-green-200 text-xs">Room {teacher.room} · {teacher.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowHelp(true)} className="text-sm text-green-200 hover:text-white">❓ Help</button>
          <a href="/teacher" className="text-sm text-green-200 hover:text-white">← Dashboard</a>
        </div>
      </div>

      <div className="p-6 max-w-xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-800 mb-1">Match My Students to Photos</p>
          <p className="text-sm text-gray-500 mb-4">
            Checks your roster against Lifetouch photos already uploaded by admin.
            Run this after retake day, or any time new photos are available.
          </p>

          <button
            onClick={handleMatch}
            disabled={matching}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 mb-2"
            style={{ backgroundColor: RHS_GREEN }}
          >
            {matching ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Matching your students…
              </>
            ) : '📷 Match My Students'}
          </button>
          <p className="text-xs text-gray-400">Safe to run multiple times.</p>

          {done && (
            <div className="mt-5">
              <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-gray-100">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{matched}</p>
                  <p className="text-xs text-gray-500 mt-1">Matched</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-500">{skipped}</p>
                  <p className="text-xs text-gray-500 mt-1">Skipped</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{errors}</p>
                  <p className="text-xs text-gray-500 mt-1">Errors</p>
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {status.map((s, i) => (
                  <div key={i} className={`text-xs py-1.5 border-b border-gray-50 last:border-0 ${s.status === 'ok' ? 'text-green-600' : s.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                    {s.msg}
                  </div>
                ))}
              </div>
              {skipped > 0 && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                  ⚠ Skipped students don't have a matching Lifetouch photo yet. Ask your admin if photos were uploaded for your students.
                </div>
              )}
              {matched > 0 && errors === 0 && (
                <p className="mt-3 text-xs font-medium text-green-700">✓ {matched} photos updated for your students.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
