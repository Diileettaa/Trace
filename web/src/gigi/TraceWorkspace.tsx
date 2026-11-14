import type { ReactNode } from 'react'

/** Gigi's three-rail workspace frame; content is supplied by the live Trace adapters. */
export function TraceWorkspace({ topbar, history, canvas, assistant, children }: { topbar: ReactNode; history: ReactNode; canvas: ReactNode; assistant: ReactNode; children?: ReactNode }) {
  return <main className="min-h-screen bg-[#F7F6F2] text-[#202427] font-sans">
    {topbar}
    <div className="grid min-h-[calc(100vh-56px)] grid-cols-[240px_minmax(0,1fr)_320px] max-[1050px]:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="border-r border-[#A9AFB0]/45 bg-[#F7F6F2] p-4">{history}</aside>
      <section className="min-w-0 bg-white p-5">{canvas}</section>
      <aside className="border-l border-[#A9AFB0]/45 bg-[#F7F6F2] p-4 max-[1050px]:hidden">{assistant}</aside>
    </div>
    {children}</main>
}
