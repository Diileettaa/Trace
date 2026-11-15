import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, MapPin } from 'lucide-react';
import { PARTNER_FIRMS, USER_CASES } from '../data/traceData';

interface UserCasesPageProps {
  onBackHome: () => void;
  onOpenDemo: () => void;
}

export const UserCasesPage: React.FC<UserCasesPageProps> = ({
  onBackHome,
  onOpenDemo,
}) => {
  const [heroImgError, setHeroImgError] = useState(false);

  return (
    <div className="min-h-[82vh] blueprint-grid-bg text-[#202427]">
      <section className="py-12 sm:py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#202427]/75 hover:text-[#202427] mb-8 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Trace. Overview</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch mb-14">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
                  User Cases · Stoa Field Deployments
                </p>
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#202427] leading-[1.08] [text-wrap:balance]">
                  Projects mentored by Trace. &amp; our partner firms.
                </h1>
                <p className="mt-4 text-base text-[#202427]/80 leading-relaxed max-w-xl">
                  Explore how general contractors, interior architects, and MEP teams deploy Trace. across multi-level commercial complexes, cleanrooms, and timber offices.
                </p>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4 p-5 rounded-xl bg-white border border-[#A9AFB0]/50">
                <div>
                  <div className="text-2xl font-display font-semibold tabular-nums text-[#202427]">
                    53,600 m²
                  </div>
                  <div className="text-xs text-[#202427]/65 mt-0.5">
                    Active verified floor area
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-display font-semibold tabular-nums text-[#9A7218]">
                    4.2 hrs
                  </div>
                  <div className="text-xs text-[#202427]/65 mt-0.5">
                    Avg. daily savings / lead
                  </div>
                </div>
                <div>
                  <div className="text-2xl font-display font-semibold tabular-nums text-[#202427]">
                    −68%
                  </div>
                  <div className="text-xs text-[#202427]/65 mt-0.5">
                    Pre-closure rework claims
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 min-h-[280px] rounded-2xl overflow-hidden border border-[#A9AFB0]/50 bg-[#202427] relative">
              {!heroImgError ? (
                <img
                  src="/src/assets/images/hero_architectural_site_1794662440229.jpg"
                  alt="Nordic commercial timber and concrete building project coordinated with Trace."
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#F7F6F2] p-8">
                  Nordic Construction Portfolio
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 text-[#F7F6F2]">
                <span className="text-xs font-mono text-[#E9B949]">
                  FEATURED DEPLOYMENT · HELSINKI &amp; MUNICH
                </span>
                <p className="text-sm mt-1">
                  Full 2D-to-3D sanitary, fire damper, and MEP clearance memory verified before drywall closure.
                </p>
              </div>
            </div>
          </div>

          {/* Mentored Case Studies */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {USER_CASES.map((uc) => (
              <article
                key={uc.id}
                className="p-6 rounded-xl border border-[#A9AFB0]/50 bg-white flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs font-mono text-[#9A7218] mb-2">
                    <span className="font-semibold">{uc.metric}</span>
                    <span className="inline-flex items-center gap-1 text-[#202427]/60">
                      <MapPin className="w-3 h-3" />
                      {uc.location}
                    </span>
                  </div>
                  <h2 className="text-xl font-semibold text-[#202427]">
                    {uc.project}
                  </h2>
                  <p className="text-xs font-medium text-[#202427]/65 mt-0.5">
                    {uc.company}
                  </p>
                  <p className="mt-3 text-sm text-[#202427]/80 leading-relaxed">
                    {uc.summary}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-[#A9AFB0]/25 space-y-2">
                  <div className="text-[11px] font-mono text-[#202427]/65">
                    {uc.scope}
                  </div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-medium text-[#202427]">
                    <Check className="w-3.5 h-3.5 text-[#9A7218]" />
                    <span>Stoa Mentored Deployment</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Partner Firms & Demo CTA */}
          <div className="mt-12 p-7 rounded-2xl border border-[#A9AFB0]/50 bg-[#202427] text-[#F7F6F2] flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-[#E9B949] mb-2 inline-flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Partner Companies Building with Trace.</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-2">
                {PARTNER_FIRMS.map((firm) => (
                  <span
                    key={firm}
                    className="text-base font-display font-semibold text-[#F7F6F2]"
                  >
                    {firm}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenDemo}
              className="px-5 py-3 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer self-start md:self-auto"
            >
              <span>Inspect Project in Demo Version</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
