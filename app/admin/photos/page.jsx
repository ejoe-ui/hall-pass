'use client'
import { useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function PhotoUpload() {
  const [status, setStatus] = useState([])
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleFiles(e) {
    const files = Array.from(e.target.files)
    setUploading(true)
    setDone(false)
    setStatus([])

    const { data: students } = await supabase
      .from('students')
      .select('id, first_name, last_name, full_name')

    const log = []

    for (const file of files) {
      if (!file.name.endsWith('.jpg') && !file.name.endsWith('.jpeg')) continue

      // Parse filename: 0043_Abundiz_Cruz_Juan_01.jpg
      const parts = file.name.replace(/\.jpg$/i, '').split('_')
      if (parts.length < 3) continue

      // Last part is photo number, first part is sequence number
      // Everything in between is Last Name parts then First Name
      // Try matching by first + last name
      const firstName = parts[parts.length - 2]
      const lastName = parts.slice(1, parts.length - 2).join(' ')

      const match = students.find(s => {
        const sFirst = s.first_name?.toLowerCase().trim()
        const sLast = s.last_name?.toLowerCase().trim()
        const fFirst = firstName?.toLowerCase().trim()
        const fLast = lastName?.toLowerCase().trim()
        return sFirst === fFirst && sLast === fLast
      })

      if (!match) {
        log.push({ name: file.name, status: 'skip', msg: `No match for ${firstName} ${lastName}` })
        continue
      }

      // Upload to Supabase storage
      const path = `${match.id}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('student-photos')
        .upload(path, file, { upsert: true, contentType: 'image/jpeg' })

      if (uploadError) {
        log.push({ name: file.name, status: 'error', msg: uploadError.message })
        continue
      }

      // Save photo_url to student record
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
  const errors = status.filter(s => s.status === 'error').length

  return (
    <div className="min-h-screen bg-gray-50 p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Photo Upload</h1>
          <p className="text-gray-500 text-sm">Import Lifetouch student photos</p>
        </div>
        <a href="/teacher" className="text-sm text-gray-400 hover:text-gray-600">← Dashboard</a>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <p className="text-sm text-gray-600 mb-4">
          Select all photo files from your Lifetouch download folder. The app will automatically match each photo to the correct student by name.
        </p>
        <input
          type="file"
          accept=".jpg,.jpeg"
          multiple
          onChange={handleFiles}
          disabled={uploading}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-gray-900 file:text-white hover:file:bg-gray-700"
        />
      </div>

      {uploading && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 text-center">
          <p className="text-gray-500 text-sm">Uploading photos... please wait</p>
        </div>
      )}

      {done && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center">
              <p className="text-2xl font-semibold text-green-600">{matched}</p>
              <p className="text-xs text-gray-500">Matched</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-amber-500">{skipped}</p>
              <p className="text-xs text-gray-500">Skipped</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-red-500">{errors}</p>
              <p className="text-xs text-gray-500">Errors</p>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {status.map((s, i) => (
              <div key={i} className={`text-xs py-1 border-b border-gray-50 ${s.status === 'ok' ? 'text-green-600' : s.status === 'error' ? 'text-red-500' : 'text-gray-400'}`}>
                {s.msg} <span className="text-gray-300">({s.name})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}