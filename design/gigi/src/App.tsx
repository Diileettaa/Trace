import React, { useState } from 'react';
import { ArrowRight, Building2 } from 'lucide-react';
import { CheckoutModal } from './components/CheckoutModal';
import { EducationPortal } from './components/EducationPortal';
import { PricingSection } from './components/PricingSection';
import { TraceWorkspace } from './components/TraceWorkspace';
import { VerificationShowcase } from './components/VerificationShowcase';
import { PLAN_TIERS, PlanTier } from './data/traceData';

export default function App() {
  const [pageMode, setPageMode] = useState<'commercial' | 'workspace' | 'education'>(
    'commercial'
  );
  const [checkoutState, setCheckoutState] = useState<{
    plan: PlanTier | null;
    billing: 'annual' | 'monthly';
  }>({ plan: null, billing: 'annual' });
  const [siteHeroImgError, setSiteHeroImgError] = useState(false);

  const openCheckout = (
    plan: PlanTier = PLAN_TIERS[2],
    billing: 'annual' | 'monthly' = 'annual'
  ) => {
    setCheckoutState({ plan, billing });
  };

  const navigateToSection = (sectionId: string) => {
    if (pageMode !== 'commercial') {
      setPageMode('commercial');
      window.setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F6F2] text-[#202427]">
      {/* Dark #202427 Top Bar matching reference screenshot */}
      <header className="sticky top-0 z-40 bg-[#202427] text-[#F7F6F2] border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Amber Viewfinder Icon + Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setPageMode('commercial');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="inline-flex items-center gap-2.5 text-lg font-display font-bold tracking-tight text-[#F7F6F2] whitespace-nowrap shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="text-[#E9B949] shrink-0"
            >
              <path
                d="M4 9V5.5C4 4.67 4.67 4 5.5 4H9M15 4H18.5C19.33 4 20 4.67 20 5.5V9M20 15V18.5C20 19.33 19.33 20 18.5 20H15M9 20H5.5C4.67 20 4 19.33 4 18.5V15"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="2.2" fill="currentColor" />
            </svg>
            <span>TRACE.</span>
          </a>

          {/* Zone 2: Clean single-line nav links */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[#A9AFB0]"
          >
            <button
              type="button"
              onClick={() => navigateToSection('how-it-works')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'commercial'
                  ? 'text-[#F7F6F2]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              How it works
            </button>
            <button
              type="button"
              onClick={() => {
                setPageMode('workspace');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'workspace'
                  ? 'text-[#E9B949]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => navigateToSection('plans')}
              className="hover:text-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Plans
            </button>
            <button
              type="button"
              onClick={() => {
                setPageMode('education');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'education'
                  ? 'text-[#E9B949]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              Education
            </button>
          </nav>

          {/* Zone 3: Amber primary CTA */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => {
                if (pageMode === 'workspace') {
                  openCheckout(PLAN_TIERS[2], 'annual');
                } else {
                  setPageMode('workspace');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              }}
              className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pageMode === 'workspace' ? 'Subscribe' : 'Launch Demo'}
            </button>
          </div>
        </div>
      </header>

      {pageMode === 'workspace' ? (
        <main className="flex-1">
          <TraceWorkspace />
        </main>
      ) : pageMode === 'education' ? (
        <main className="flex-1">
          <EducationPortal onBackToCommercial={() => setPageMode('commercial')} />
        </main>
      ) : (
        <main id="top" className="flex-1">
          {/* Clean Editorial Hero matching reference screenshot */}
          <section className="pt-12 pb-16 sm:pt-14 sm:pb-20">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-3xl">
                <p className="text-xs font-mono font-semibold tracking-wider uppercase text-[#9A7218] mb-3">
                  Construction Intelligence
                </p>
                <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold tracking-tight text-[#202427] leading-[1.08] [text-wrap:balance]">
                  Every answer. Backed by evidence.
                </h1>
                <p className="mt-4 text-base sm:text-lg text-[#202427]/75 leading-relaxed max-w-2xl">
                  Ask your construction drawings anything. Get precise answers in 1–2 seconds—highlighted inside real 1:50 execution plans, inspectable in 3D with dimensions, and verified with dated site photos.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPageMode('workspace');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="px-5 py-3 rounded-lg bg-[#202427] text-[#F7F6F2] text-sm font-semibold hover:bg-[#202427]/90 transition-colors inline-flex items-center gap-2 whitespace-nowrap cursor-pointer"
                  >
                    <span>Try Live Demo</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateToSection('how-it-works')}
                    className="px-5 py-3 rounded-lg bg-white border border-[#A9AFB0]/60 text-sm font-medium text-[#202427] hover:border-[#202427] transition-colors whitespace-nowrap cursor-pointer"
                  >
                    How it works
                  </button>
                </div>
              </div>

              {/* Clean White Drawing Analysis Card directly below */}
              <div id="verification" className="mt-10">
                <VerificationShowcase
                  onOpenSubscribe={() => openCheckout(PLAN_TIERS[2], 'annual')}
                />
              </div>
            </div>
          </section>

          {/* How It Works & Core Pillars */}
          <section id="how-it-works" className="py-20 border-t border-[#A9AFB0]/35">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="max-w-2xl mb-12">
                <p className="text-xs font-mono font-semibold tracking-wider uppercase text-[#9A7218] mb-2">
                  How Trace. Works
                </p>
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#202427] [text-wrap:balance]">
                  Built to cut through real 1:50 execution-plan chaos.
                </h2>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 p-7 rounded-2xl border border-[#A9AFB0]/45 bg-white flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#9A7218] font-medium mb-2">
                      01. Click-to-3D Spatial Verification
                    </div>
                    <h3 className="text-xl font-semibold text-[#202427]">
                      From dense CAD hatchings straight into 3D dimensions.
                    </h3>
                    <p className="mt-3 text-sm text-[#202427]/80 leading-relaxed max-w-xl">
                      Real construction drawings pack structural walls, insulation hatches, dimension chains, door tags, and MEP ducts onto one sheet. Trace. isolates the exact element in 1–2 seconds in amber—and one click opens the 3D spatial model with clear heights and offsets.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#A9AFB0]/25 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-[#202427]/70">
                    <span>Vector PDF</span>
                    <span aria-hidden="true">·</span>
                    <span>DWG / DXF</span>
                    <span aria-hidden="true">·</span>
                    <span>IFC / BIM Models</span>
                    <span aria-hidden="true">·</span>
                    <span>Multilingual Drawings</span>
                  </div>
                </div>

                <div className="p-7 rounded-2xl border border-[#202427] bg-[#202427] text-[#F7F6F2] flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#E9B949] mb-2">
                      02. As-Built Photo Memory
                    </div>
                    <h3 className="text-xl font-semibold">
                      Snap once on site. Proven forever.
                    </h3>
                    <p className="mt-3 text-sm text-[#F7F6F2]/80 leading-relaxed">
                      Take a photo on site during inspection and pin it to that drawing coordinate. Date, time, and author lock automatically—so anyone searching weeks after drywall closes sees real photo evidence.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#A9AFB0]/20 text-xs font-mono text-[#A9AFB0]">
                    Auto-Timestamp · Author Lock
                  </div>
                </div>

                <div className="p-7 rounded-2xl border border-[#A9AFB0]/45 bg-white flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#9A7218] font-medium mb-2">
                      03. Permits, Invoices &amp; Claims
                    </div>
                    <h3 className="text-xl font-semibold text-[#202427]">
                      Commercial proof linked to geometry.
                    </h3>
                    <p className="mt-3 text-sm text-[#202427]/80 leading-relaxed">
                      Cross-search building permits, invoices, bank transfers, and defect claims. Tie every variation order directly to the exact drawing sheet and site photo.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#A9AFB0]/25 text-xs font-mono text-[#202427]/70">
                    Permits · Invoices · Claims
                  </div>
                </div>

                <div className="lg:col-span-2 p-7 rounded-2xl border border-[#A9AFB0]/45 bg-white flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-[#9A7218] font-medium mb-2">
                      04. Parallel Trade Workflows &amp; Low Inference Cost
                    </div>
                    <h3 className="text-xl font-semibold text-[#202427]">
                      Coordinate every trade without expensive full-sheet scans.
                    </h3>
                    <p className="mt-3 text-sm text-[#202427]/80 leading-relaxed max-w-xl">
                      Track parallel trade schedules, handovers, and sequence dependencies. Under the hood, Trace. indexes drawing coordinates once and inspects only the relevant region—delivering 92% lower compute cost per query.
                    </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-[#A9AFB0]/25 flex flex-wrap gap-x-6 gap-y-2 text-xs font-mono text-[#202427]/70">
                    <span>Trade Sequencing</span>
                    <span aria-hidden="true">·</span>
                    <span>92% Lower Cost</span>
                    <span aria-hidden="true">·</span>
                    <span>1–2s Response</span>
                  </div>
                </div>
              </div>

              {/* Field Proof Banner */}
              <div className="mt-10 rounded-2xl overflow-hidden border border-[#A9AFB0]/45 bg-[#202427] grid grid-cols-1 lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-7 relative min-h-[240px]">
                  {!siteHeroImgError ? (
                    <img
                      src="/src/assets/images/hero_architectural_site_1794662440229.jpg"
                      alt="Timber and concrete Nordic construction atrium during interior coordination"
                      referrerPolicy="no-referrer"
                      onError={() => setSiteHeroImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-[#F7F6F2] bg-[#202427]">
                      <Building2 className="w-10 h-10 text-[#E9B949] mb-2" />
                      <span className="text-sm font-medium">
                        Nordic Construction Site Proof
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-transparent to-transparent" />
                </div>
                <div className="lg:col-span-5 p-7 sm:p-9 text-[#F7F6F2] flex flex-col justify-between">
                  <div>
                    <p className="text-xs font-mono text-[#E9B949] mb-2">
                      Site Impact
                    </p>
                    <h3 className="text-2xl font-semibold tracking-tight leading-snug">
                      Hours saved daily. Rework caught before closure.
                    </h3>
                    <p className="mt-3 text-sm text-[#A9AFB0] leading-relaxed">
                      Site engineers verify concealed installations before walls close and trace every answer directly back to 3D geometry and dated field photos.
                    </p>
                  </div>
                  <div className="mt-6 pt-5 border-t border-[#A9AFB0]/20 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-display font-semibold tabular-nums text-[#E9B949]">
                        4.2 hrs
                      </div>
                      <div className="text-xs text-[#A9AFB0]">
                        Saved daily per site lead
                      </div>
                    </div>
                    <div>
                      <div className="text-2xl font-display font-semibold tabular-nums text-[#E9B949]">
                        100%
                      </div>
                      <div className="text-xs text-[#A9AFB0]">
                        Source-traceable answers
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Adobe-Style Pricing & Comparison Table */}
          <PricingSection
            onSelectPlan={(plan, billing) => openCheckout(plan, billing)}
            onOpenEducation={() => {
              setPageMode('education');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </main>
      )}

      {/* Quiet Architectural Footer (Website Views Only) */}
      {pageMode !== 'workspace' && (
        <footer className="border-t border-[#A9AFB0]/40 bg-[#F7F6F2] py-10">
          <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <span className="text-lg font-display font-bold tracking-tight text-[#202427]">
                TRACE.
              </span>
              <p className="text-xs text-[#202427]/65 mt-1">
                Verifiable construction drawing &amp; site memory platform · Helsinki &amp; Munich
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-6 text-xs font-medium text-[#202427]/75">
              <button
                type="button"
                onClick={() => {
                  setPageMode('workspace');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-[#202427] cursor-pointer"
              >
                Workspace App
              </button>
              <button
                type="button"
                onClick={() => navigateToSection('plans')}
                className="hover:text-[#202427] cursor-pointer"
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => {
                  setPageMode('education');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="hover:text-[#202427] cursor-pointer"
              >
                Trace Campus (Education)
              </button>
              <span className="text-[#202427]/50">© 2026 Trace.</span>
            </div>
          </div>
        </footer>
      )}

      {/* Adobe-Style Subscription Modal */}
      <CheckoutModal
        key={checkoutState.plan?.id || 'closed'}
        plan={checkoutState.plan}
        initialBilling={checkoutState.billing}
        onClose={() => setCheckoutState((prev) => ({ ...prev, plan: null }))}
        onLaunchWorkspace={() => {
          setCheckoutState((prev) => ({ ...prev, plan: null }));
          setPageMode('workspace');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
