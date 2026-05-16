import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(135deg, #006938 0%, #005a30 100%)' }}>
      <div className="bg-white rounded-3xl shadow-2xl px-12 py-10 flex flex-col items-center">
        <Image
          src="/RHSCOWBOYlogo.png"
          alt="RHS Cowboy Logo"
          width={260}
          height={260}
          className="mb-4"
        />
        <h1 className="text-3xl font-bold text-gray-900 mb-1 tracking-wide">
          RHS PassAble
        </h1>
        <p className="text-gray-400 mb-8 text-xs tracking-widest uppercase">
          Room 27 · Mr. Joe
        </p>
        <div className="flex gap-4 mb-3">
          <Link href="/kiosk"
            className="px-8 py-4 rounded-xl font-bold text-lg shadow-md text-white"
            style={{ backgroundColor: '#006938' }}>
            Kiosk
          </Link>
          <Link href="/teacher"
            className="px-8 py-4 rounded-xl font-bold text-lg border-2"
            style={{ borderColor: '#006938', color: '#006938' }}>
            Teacher
          </Link>
        </div>
        <div className="flex gap-6 mt-2">
          <Link href="/sub" className="text-sm text-gray-400 hover:text-gray-600">
            Substitute →
          </Link>
          <Link href="/admin" className="text-sm text-gray-400 hover:text-gray-600">
            Admin →
          </Link>
        </div>
      </div>
    </main>
  )
}
