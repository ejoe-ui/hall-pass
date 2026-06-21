/*
  PassAble — RHS Hall Pass System
  FILE:    app/admin/photos/page.jsx
  ROUTE:   /admin/photos
  PURPOSE: Bulk Lifetouch photo importer — matches against ALL students school-wide,
           not just the logged-in teacher's room. Drop the entire school photo dump in once.
  REPO:    hall-pass (hall-pass-lime.vercel.app)
  BACKEND: Supabase (students table, student-photos storage bucket)
  UPDATED: 2026-06-21
*/

'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

const RHS_GREEN = '#006938'

export default function PhotoUpload() {
  const [currentTeacher, setCurrentTeacher] = useState(null)
  const [status, setStatus] = useState([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

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
      if (data) setCurrentTeacher(data)
    }
    loadTeacher()
  }, [])

  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    setUploading(true)
    setDone(false)
    setStatus([])

    // Load ALL students school-wide — not filtered by room
    const { data: students } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name')

    const log = []

    for (const file of files) {
      if (!file.name.endsWith('.jpg') && !file.name.endsWith('.jpeg')) continue

      // Filename format: 0043_LastName_FirstName_01.jpg
      const parts = file.name.replace(/\.jpe?g$/i, '').split('_')
      if (parts.length < 3) continue

      const firstName = parts[parts.length - 2]
      const lastName = parts.slice(1, parts.length - 2).join(' ')

      const match = students?.find(s => {
        const sFirst = s.first_name?.toLowerCase().trim()
        const sLast  = s.last_name?.toLowerCase().trim()
        const fFirst = firstName?.toLowerCase().trim()
        const fLast  = lastName?.toLowerCase().trim()
        return sFirst === fFirst && sLast === fLast
      })

      if (!match) {
        log.push({ name: file.name, status: 'skip', msg: `No match for ${firstName} ${lastName}` })
        continue
      }

      const path = `${match.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('student-photos')
        .upload(path, file, { upsert: true, contentType: 'image/jpeg' })

      if (uploadError) {
        log.push({ name: file.name, status: 'error', msg: uploadError.message })
        continue
      }

      const { error: updateError } = await supabase
        .from('students')
        .update({ photo_file: path })
        .eq('id', match.id)

      if (updateError) {
        log.push({ name: file.name, status: 'error', msg: updateError.message })
      } else {
        log.push({ name: file.name, status: 'ok', msg: `✓ ${match.full_name}` })
      }
    }

    setStatus(log)
    setUploading(false)
    setDone(true)
  }

  const matched = status.filter(s => s.status === 'ok').length
  const skipped = status.filter(s => s.status === 'skip').length
  const errors  = status.filter(s => s.status === 'error').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: RHS_GREEN }}>
        <div className="flex items-center gap-3">
          <img src="/RHSCOWBOYlogo.png" alt="RHS" className="w-8 h-8 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
          <div>
            <h1 className="text-lg font-bold text-white">Photo Upload</h1>
            <p className="text-green-200 text-xs">School-Wide · Lifetouch Import</p>
          </div>
        </div>
        <a href="/admin" className="text-sm text-green-200 hover:text-white">← Admin Panel</a>
      </div>

      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <p className="text-sm font-medium mb-1" style={{ color: RHS_GREEN }}>Import Lifetouch Photos — All Students</p>
          <p className="text-sm text-gray-500 mb-1">
            Select all photo files from your Lifetouch download. Photos are matched by name against every student in the school — you only need to do this once per Lifetouch batch.
          </p>
          <div className="mb-4 px-3 py-2 bg-green-50 rounded-lg text-xs text-green-700">
            💡 Drop in the entire school's photo folder. Skipped photos just mean that student isn't in PassAble yet — no harm done.
          </div>
          <input
            type="file"
            accept=".jpg,.jpeg"
            multiple
            onChange={handleFiles}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:text-white"
            style={{ '--file-bg': RHS_GREEN }}
          />
          <p className="text-xs text-gray-400 mt-3">Expected filename format: <span className="font-mono">0043_LastName_FirstName_01.jpg</span></p>
        </div>

        {uploading && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center">
            <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin mx-auto mb-3" style={{ borderTopColor: RHS_GREEN }} />
            <p className="text-gray-500 text-sm">Uploading photos — please wait</p>
          </div>
        )}

        {done && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
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
                  {s.msg} <span className="text-gray-300">({s.name})</span>
                </div>
              ))}
            </div>
            {skipped > 0 && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                ⚠ Skipped photos couldn't be matched to any student. This usually means the student isn't in PassAble yet, or the name in the photo filename doesn't exactly match what's in Aeries.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
