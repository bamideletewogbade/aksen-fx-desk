import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-zinc-950 text-white px-4">
      <div className="text-center max-w-md">
        <span className="text-emerald-400 font-mono text-sm tracking-wider uppercase font-semibold">404 · Page Not Found</span>
        <h1 className="text-3xl font-bold tracking-tight mt-2 mb-3">Resource Unavailable</h1>
        <p className="text-zinc-400 text-sm mb-6">
          The requested OTC routing ticket or desk endpoint could not be found or has expired.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Home
          </Link>
          <Link
            href="/desk"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Operator Desk
          </Link>
        </div>
      </div>
    </main>
  );
}
