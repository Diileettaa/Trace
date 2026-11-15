// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronDown,
  GraduationCap,
  HelpCircle,
  Layers,
  User,
} from 'lucide-react';
import { AccountModal } from './components/AccountModal';
import { CheckoutModal } from './components/CheckoutModal';
import { EducationPortal } from './components/EducationPortal';
import { FactSlidesCarousel } from './components/FactSlidesCarousel';
import { ProductsPage } from './components/ProductsPage';
import { SupportPage } from './components/SupportPage';
import RealWorkspace from '../gigi/RealWorkspace';
import '../gigi/gigi.css';
import { UserCasesPage } from './components/UserCasesPage';
import { type BillingCycle, PRODUCT_META, PRODUCT_PLANS, type ProductPlan } from './data/traceData';

type PageMode =
  | 'home'
  | 'products'
  | 'user-cases'
  | 'education'
  | 'support'
  | 'workspace';

export default function App({ onOpenProjects }: { onOpenProjects?: () => void }) {
  const [pageMode, setPageMode] = useState<PageMode>('home');
  const [pricingCategory, setPricingCategory] = useState<
    'individual' | 'business' | 'university'
  >('individual');
  const [productsMenuOpen, setProductsMenuOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [scrollToEducationSeminars, setScrollToEducationSeminars] =
    useState(false);
  const [subscriptionState, setSubscriptionState] = useState<{
    active: boolean;
    planName: string;
  }>({
    active: true,
    planName: 'Trace Pro (Yearly)',
  });
  const [checkoutState, setCheckoutState] = useState<{
    plan: ProductPlan | null;
    billing: BillingCycle;
    premiumSla?: boolean;
    masterplanSeats?: number;
  }>({ plan: null, billing: 'yearly', premiumSla: false, masterplanSeats: 20 });

  const productsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        productsDropdownRef.current &&
        !productsDropdownRef.current.contains(event.target as Node)
      ) {
        setProductsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const individualPlans = PRODUCT_PLANS.filter((p) => p.category === 'individual');
  const businessPlans = PRODUCT_PLANS.filter((p) => p.category === 'business');
  const universityPlans = PRODUCT_PLANS.filter((p) => p.category === 'university');
  const proPlan = PRODUCT_PLANS.find((p) => p.id === 'pro') || PRODUCT_PLANS[1];

  const navigateToPage = (target: PageMode, scrollToTop = true) => {
    setProductsMenuOpen(false);
    if (target !== 'education') {
      setScrollToEducationSeminars(false);
    }
    setPageMode(target);
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSelectProductFromRunner = (plan: ProductPlan) => {
    setPricingCategory(plan.category);
    navigateToPage('products');
  };

  const openCheckout = (
    plan: ProductPlan = proPlan,
    billing: BillingCycle = 'yearly',
    options?: { premiumSla?: boolean; masterplanSeats?: number }
  ) => {
    setCheckoutState({
      plan,
      billing,
      premiumSla: Boolean(options?.premiumSla),
      masterplanSeats: options?.masterplanSeats ?? 20,
    });
  };

  return (
    <div className="gigi-root min-h-screen flex flex-col bg-[#F7F6F2] text-[#202427]">
      {/* Dark #202427 Top Runner Bar */}
      <header className="sticky top-0 z-40 bg-[#202427] text-[#F7F6F2] border-b border-white/10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left: Amber Viewfinder Icon + TRACE. (Main Page) + by Stoa */}
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                navigateToPage('home');
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
            <span className="hidden sm:inline-block text-[11px] font-mono text-[#A9AFB0] border-l border-white/15 pl-2.5 whitespace-nowrap">
              for Stoa
            </span>
          </div>

          {/* Center Nav Runners: Each Runner Opens Its Dedicated Page */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-[#A9AFB0]"
          >
            {/* Products Runner (Dropdown + Page) */}
            <div ref={productsDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setProductsMenuOpen((o) => !o)}
                aria-expanded={productsMenuOpen}
                className={`inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  pageMode === 'products' || productsMenuOpen
                    ? 'text-[#E9B949]'
                    : 'hover:text-[#F7F6F2]'
                }`}
              >
                <span>Products</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${
                    productsMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {productsMenuOpen && (
                <div className="absolute left-0 top-full mt-3 w-[640px] rounded-xl bg-[#202427] border border-white/15 shadow-2xl p-5 text-[#F7F6F2] z-50">
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#E9B949] mb-2.5">
                        Individual
                      </div>
                      <div className="space-y-1.5">
                        {individualPlans.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProductFromRunner(p)}
                            className="w-full text-left p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <div className="text-sm font-semibold text-[#F7F6F2]">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[#A9AFB0] leading-snug">
                              {p.tagline}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-l border-white/10 pl-5">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#E9B949] mb-2.5">
                        Business
                      </div>
                      <div className="space-y-1.5">
                        {businessPlans.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProductFromRunner(p)}
                            className="w-full text-left p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <div className="text-sm font-semibold text-[#F7F6F2]">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[#A9AFB0] leading-snug">
                              {p.tagline}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="border-l border-white/10 pl-5">
                      <div className="text-[11px] font-mono uppercase tracking-wider text-[#E9B949] mb-2.5">
                        University
                      </div>
                      <div className="space-y-1.5">
                        {universityPlans.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handleSelectProductFromRunner(p)}
                            className="w-full text-left p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <div className="text-sm font-semibold text-[#F7F6F2]">
                              {p.name}
                            </div>
                            <div className="text-[11px] text-[#A9AFB0] leading-snug">
                              {p.tagline}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-[#A9AFB0]">
                      Yearly Save up to 30% · Prices excl. VAT
                    </span>
                    <button
                      type="button"
                      onClick={() => navigateToPage('products')}
                      className="text-xs font-semibold text-[#E9B949] hover:underline cursor-pointer shrink-0"
                    >
                      Compare all 6 plans →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigateToPage('user-cases')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'user-cases'
                  ? 'text-[#E9B949]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              User Cases
            </button>

            <button
              type="button"
              onClick={() => navigateToPage('education')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'education'
                  ? 'text-[#E9B949]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              Education
            </button>

            <button
              type="button"
              onClick={() => navigateToPage('support')}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                pageMode === 'support'
                  ? 'text-[#E9B949]'
                  : 'hover:text-[#F7F6F2]'
              }`}
            >
              Learning &amp; Support
            </button>
          </nav>

          {/* Right: Prominent Demo Version CTA + Small Account Icon */}
          <div className="flex items-center gap-2 shrink-0">
            {onOpenProjects && (
              <button
                type="button"
                onClick={onOpenProjects}
                title="Community: team channels, files, private messages and schedule"
                className="hidden lg:inline-flex px-3 py-2 text-xs sm:text-sm font-medium rounded-lg border border-white/15 text-[#F7F6F2] hover:border-[#E9B949] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Community
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (pageMode === 'workspace') {
                  openCheckout(proPlan, 'yearly');
                } else {
                  navigateToPage('workspace');
                }
              }}
              className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {pageMode === 'workspace' ? 'Subscribe' : 'Demo Version'}
            </button>

            <button
              type="button"
              onClick={() => setAccountModalOpen(true)}
              aria-label="Sign in and manage subscriptions"
              title="Account & Subscriptions"
              className="w-9 h-9 rounded-lg border border-white/20 bg-white/5 text-[#F7F6F2] hover:border-[#E9B949] hover:text-[#E9B949] transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            >
              <User className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact Mobile Runner Strip */}
        <div className="md:hidden border-t border-white/10 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-[#A9AFB0]">
          <button
            type="button"
            onClick={() => navigateToPage('products')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              pageMode === 'products' ? 'text-[#E9B949]' : 'hover:text-[#F7F6F2]'
            }`}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => navigateToPage('user-cases')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              pageMode === 'user-cases' ? 'text-[#E9B949]' : 'hover:text-[#F7F6F2]'
            }`}
          >
            User Cases
          </button>
          <button
            type="button"
            onClick={() => navigateToPage('education')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              pageMode === 'education' ? 'text-[#E9B949]' : 'hover:text-[#F7F6F2]'
            }`}
          >
            Education
          </button>
          <button
            type="button"
            onClick={() => navigateToPage('support')}
            className={`whitespace-nowrap shrink-0 cursor-pointer ${
              pageMode === 'support' ? 'text-[#E9B949]' : 'hover:text-[#F7F6F2]'
            }`}
          >
            Learning &amp; Support
          </button>
        </div>
      </header>

      {/* Dedicated Route Rendering per Runner */}
      {pageMode === 'workspace' ? (
        <main className="flex-1">
          <RealWorkspace onHome={() => setPageMode('home')} />
        </main>
      ) : pageMode === 'products' ? (
        <main className="flex-1">
          <ProductsPage
            activeCategory={pricingCategory}
            onCategoryChange={setPricingCategory}
            onSelectPlan={(plan, billing, options) =>
              openCheckout(plan, billing, options)
            }
            onOpenEducation={() => navigateToPage('education')}
            onContactUs={() => navigateToPage('support')}
            onBackHome={() => navigateToPage('home')}
          />
        </main>
      ) : pageMode === 'user-cases' ? (
        <main className="flex-1">
          <UserCasesPage
            onBackHome={() => navigateToPage('home')}
            onOpenDemo={() => navigateToPage('workspace')}
          />
        </main>
      ) : pageMode === 'education' ? (
        <main className="flex-1">
          <EducationPortal
            hasActiveSubscription={subscriptionState.active}
            activePlanName={subscriptionState.planName}
            scrollToSeminars={scrollToEducationSeminars}
            onScrolledToSeminars={() => setScrollToEducationSeminars(false)}
            onBackToCommercial={() => navigateToPage('home')}
            onOpenPlans={() => navigateToPage('products')}
            onOpenAccount={() => setAccountModalOpen(true)}
            onUnlockSubscription={(planName) =>
              setSubscriptionState({ active: true, planName })
            }
          />
        </main>
      ) : pageMode === 'support' ? (
        <main className="flex-1">
          <SupportPage
            onBackHome={() => navigateToPage('home')}
            onOpenEducation={() => {
              setScrollToEducationSeminars(true);
              navigateToPage('education', false);
            }}
          />
        </main>
      ) : (
        /* MAIN PAGE ("home" when clicking TRACE. logo):
           1. Continuously Looping 4-Slide Showcase as Main Focus
           2. Concise Workspace Trailer + 4 Runner Teaser Cards below */
        <main id="home" className="flex-1 blueprint-grid-bg">
          {/* Top Focus: Stoa Header + Continuous 4-Slide Fact Carousel */}
          <section className="pt-8 pb-12 sm:pt-10 sm:pb-14">
            <div className="max-w-[1200px] mx-auto px-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-mono font-semibold tracking-wider uppercase text-[#9A7218]">
                    Trace. · Built for Stoa
                  </p>
                  <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[#202427] mt-1">
                    {PRODUCT_META.tagline}
                  </h1>
                </div>
                <button
                  type="button"
                  onClick={() => navigateToPage('workspace')}
                  className="px-4 py-2.5 rounded-lg bg-[#202427] text-[#F7F6F2] text-xs sm:text-sm font-semibold hover:bg-[#202427]/90 transition-colors inline-flex items-center gap-2 whitespace-nowrap self-start sm:self-auto shrink-0 cursor-pointer"
                >
                  <span>Open Demo Version</span>
                  <ArrowRight className="w-4 h-4 text-[#E9B949]" />
                </button>
              </div>

              {/* Main 4-Slide Auto-Loop */}
              <FactSlidesCarousel
                onAction={(target) => {
                  if (target === 'demo') navigateToPage('workspace');
                  else if (target === 'education') navigateToPage('education');
                  else navigateToPage('products');
                }}
              />
            </div>
          </section>

          {/* Tutorial video + Explorer Cards to Dedicated Runner Pages */}
          <section className="py-12 border-t border-[#A9AFB0]/35">
            <div className="max-w-[1200px] mx-auto px-6 space-y-10">
              {/* Product tutorial replaces the former illustrative workspace animation. */}
              <div>
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5">
                  <div>
                    <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218]">
                      Trace tutorial
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202427] mt-1">
                      See how Trace turns a construction drawing into answers, evidence and a 2.5D view.
                    </h2>
                  </div>
                  <p className="text-sm text-[#202427]/70 max-w-md">
                    Follow the walkthrough, then try the same workflow in the interactive Demo Version.
                  </p>
                </div>
                <div className="rounded-2xl border border-[#A9AFB0]/60 bg-[#202427] shadow-sm overflow-hidden">
                  <video
                    className="block w-full max-h-[680px] bg-[#202427]"
                    controls
                    playsInline
                    preload="metadata"
                    aria-label="Trace product tutorial"
                  >
                    <source src="/trace-tutorial.mp4" type="video/mp4" />
                    Your browser does not support the tutorial video. Please open the Demo Version instead.
                  </video>
                  <div className="px-4 sm:px-5 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs text-[#F7F6F2]/75">Trace product tutorial</span>
                    <button
                      type="button"
                      onClick={() => navigateToPage('workspace')}
                      className="px-3.5 py-1.5 rounded-lg bg-[#E9B949] text-[#202427] text-xs font-semibold hover:bg-[#E9B949]/90 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <span>Open Demo Version</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 4 Concise Runner Portals (Directing Visitors to Dedicated Pages) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  type="button"
                  onClick={() => navigateToPage('products')}
                  className="text-left p-5 rounded-xl border border-[#A9AFB0]/50 bg-white hover:border-[#202427] transition-colors flex flex-col justify-between gap-4 group cursor-pointer"
                >
                  <div>
                    <Layers className="w-5 h-5 text-[#9A7218] mb-3" />
                    <h3 className="text-base font-semibold text-[#202427]">
                      Products &amp; Pricing
                    </h3>
                    <p className="text-xs text-[#202427]/70 mt-1.5 leading-relaxed">
                      Individual (Sketch, Pro), Business (Studio, Site, Masterplan) &amp; University (Academy). Yearly Save up to 30%.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#202427] inline-flex items-center gap-1.5 group-hover:text-[#9A7218] transition-colors">
                    <span>Explore Products</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPage('user-cases')}
                  className="text-left p-5 rounded-xl border border-[#A9AFB0]/50 bg-white hover:border-[#202427] transition-colors flex flex-col justify-between gap-4 group cursor-pointer"
                >
                  <div>
                    <Building2 className="w-5 h-5 text-[#9A7218] mb-3" />
                    <h3 className="text-base font-semibold text-[#202427]">
                      User Cases
                    </h3>
                    <p className="text-xs text-[#202427]/70 mt-1.5 leading-relaxed">
                      Illustrative use cases: how contractors, architects and MEP teams could use Trace.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#202427] inline-flex items-center gap-1.5 group-hover:text-[#9A7218] transition-colors">
                    <span>View Case Studies</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPage('education')}
                  className="text-left p-5 rounded-xl border border-[#A9AFB0]/50 bg-white hover:border-[#202427] transition-colors flex flex-col justify-between gap-4 group cursor-pointer"
                >
                  <div>
                    <GraduationCap className="w-5 h-5 text-[#9A7218] mb-3" />
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="relative text-xs font-mono text-[#202427]/50 px-0.5">
                        €49/mo
                        <span
                          aria-hidden="true"
                          className="absolute left-0 right-0 top-1/2 -rotate-12 h-[2px] bg-[#E9B949]"
                        />
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-[#E9B949] text-[#202427] text-sm font-display font-bold">
                        €0
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-[#202427]">
                      University · Trace Academy
                    </h3>
                    <p className="text-xs text-[#202427]/70 mt-1.5 leading-relaxed">
                      €0 per student ID if your university is registered. Otherwise Individual plans (Sketch or Pro) apply.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#202427] inline-flex items-center gap-1.5 group-hover:text-[#9A7218] transition-colors">
                    <span>Verify Trace Academy</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => navigateToPage('support')}
                  className="text-left p-5 rounded-xl border border-[#A9AFB0]/50 bg-white hover:border-[#202427] transition-colors flex flex-col justify-between gap-4 group cursor-pointer"
                >
                  <div>
                    <HelpCircle className="w-5 h-5 text-[#9A7218] mb-3" />
                    <h3 className="text-base font-semibold text-[#202427]">
                      Learning &amp; Support
                    </h3>
                    <p className="text-xs text-[#202427]/70 mt-1.5 leading-relaxed">
                      Technical Q&amp;As, onboarding guides, and direct contact with Stoa’s engineering desk.
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-[#202427] inline-flex items-center gap-1.5 group-hover:text-[#9A7218] transition-colors">
                    <span>Visit Help Center</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Quiet Architectural Footer (Website Views Only) */}
      {pageMode !== 'workspace' && (
        <footer className="border-t border-[#A9AFB0]/40 bg-[#F7F6F2] py-8">
          <div className="max-w-[1200px] mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-display font-bold tracking-tight text-[#202427]">
                  TRACE.
                </span>
                <span className="text-xs font-mono text-[#9A7218] font-semibold">
                  Built for Stoa
                </span>
              </div>
              <p className="text-xs text-[#202427]/65 mt-1">
                Verifiable construction drawing intelligence &amp; site memory · stoabuild.com
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-5 text-xs font-medium text-[#202427]/75">
              <button
                type="button"
                onClick={() => navigateToPage('workspace')}
                className="hover:text-[#202427] cursor-pointer"
              >
                Demo Version
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('products')}
                className="hover:text-[#202427] cursor-pointer"
              >
                Products
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('user-cases')}
                className="hover:text-[#202427] cursor-pointer"
              >
                User Cases
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('education')}
                className="hover:text-[#202427] cursor-pointer"
              >
                Education
              </button>
              <button
                type="button"
                onClick={() => navigateToPage('support')}
                className="hover:text-[#202427] cursor-pointer"
              >
                Learning &amp; Support
              </button>
              <span className="text-[#202427]/50">© 2026 Stoa / Trace.</span>
            </div>
          </div>
        </footer>
      )}

      {/* Subscription Checkout Modal */}
      <CheckoutModal
        key={`${checkoutState.plan?.id || 'closed'}-${checkoutState.premiumSla ? 'sla' : 'std'}-${checkoutState.masterplanSeats || 20}`}
        plan={checkoutState.plan}
        initialBilling={checkoutState.billing}
        initialPremiumSla={checkoutState.premiumSla}
        initialMasterplanSeats={checkoutState.masterplanSeats}
        onClose={() => setCheckoutState((prev) => ({ ...prev, plan: null }))}
        onContactUs={() => {
          setCheckoutState((prev) => ({ ...prev, plan: null }));
          navigateToPage('support');
        }}
        onSubscribed={(planName) =>
          setSubscriptionState({ active: true, planName })
        }
        onLaunchWorkspace={() => {
          setCheckoutState((prev) => ({ ...prev, plan: null }));
          navigateToPage('workspace');
        }}
      />

      {/* Account & Subscriptions Modal */}
      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        onOpenPlans={() => navigateToPage('products')}
        onOpenEducation={() => navigateToPage('education')}
        onOpenDemo={() => navigateToPage('workspace')}
        onSubscriptionChange={(active, planName) =>
          setSubscriptionState({
            active,
            planName: planName || 'Trace Pro',
          })
        }
      />
    </div>
  );
}
