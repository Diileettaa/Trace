// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
import React, { useState } from 'react';
import { Check, GraduationCap, Minus } from 'lucide-react';
import {
  COMPARISON_TABLE,
  PRODUCT_PLANS,
  type ProductPlan,
} from '../data/traceData';

interface PricingSectionProps {
  activeCategory: 'individual' | 'business';
  onCategoryChange: (category: 'individual' | 'business') => void;
  onSelectPlan: (plan: ProductPlan, billing: 'annual' | 'monthly') => void;
  onOpenEducation: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({
  activeCategory,
  onCategoryChange,
  onSelectPlan,
  onOpenEducation,
}) => {
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');

  const visiblePlans = PRODUCT_PLANS.filter(
    (plan) => plan.category === activeCategory
  );

  const renderCellValue = (val: string | boolean) => {
    if (val === true) {
      return (
        <span className="inline-flex items-center justify-center">
          <Check className="w-4 h-4 text-[#202427]" aria-label="Included" />
        </span>
      );
    }
    if (val === false) {
      return (
        <span className="inline-flex items-center justify-center text-[#A9AFB0]">
          <Minus className="w-4 h-4" aria-label="Not included" />
        </span>
      );
    }
    return (
      <span className="text-xs font-mono tabular-nums font-medium text-[#202427]">
        {val}
      </span>
    );
  };

  return (
    <section id="plans" className="py-20 border-t border-[#A9AFB0]/35">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header & Controls */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
              Stoa / Trace. Product Lineup · Save up to 30% on Yearly Plans
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#202427] [text-wrap:balance]">
              Modular plans for every studio and construction site.
            </h2>
            <p className="mt-3 text-base text-[#202427]/75 leading-relaxed">
              Start individually with Trace Draft, Sketch, or Pro—or scale across project teams with Trace Studio, Site, and Masterplan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto shrink-0">
            {/* Individual / Business Switch */}
            <div
              className="inline-flex items-center p-1 rounded-lg bg-white border border-[#A9AFB0]/50"
              role="group"
              aria-label="Product category"
            >
              <button
                type="button"
                onClick={() => onCategoryChange('individual')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'individual'
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Individual (Draft · Sketch · Pro)
              </button>
              <button
                type="button"
                onClick={() => onCategoryChange('business')}
                className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'business'
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Business (Studio · Site · Masterplan)
              </button>
            </div>

            {/* Monthly / Yearly · Save 30% Switch */}
            <div
              className="inline-flex items-center p-1 rounded-lg bg-[#202427]/5 border border-[#A9AFB0]/40"
              role="group"
              aria-label="Billing frequency"
            >
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  billing === 'monthly'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('annual')}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  billing === 'annual'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Yearly · Save 30%
              </button>
            </div>
          </div>
        </div>

        {/* 3 Product Plan Cards for Selected Category */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {visiblePlans.map((plan) => {
            const price = billing === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const isDark = Boolean(plan.highlighted);

            return (
              <div
                key={plan.id}
                className={`rounded-xl p-7 flex flex-col justify-between transition-colors ${
                  isDark
                    ? 'bg-[#202427] text-[#F7F6F2] border border-[#202427]'
                    : 'bg-white text-[#202427] border border-[#A9AFB0]/50'
                }`}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="text-xl font-semibold tracking-tight">
                      {plan.name}
                    </h3>
                    <span
                      className={`text-[11px] font-mono whitespace-nowrap shrink-0 ${
                        isDark ? 'text-[#E9B949]' : 'text-[#9A7218]'
                      }`}
                    >
                      {isDark
                        ? 'Most Popular'
                        : plan.category === 'business'
                          ? 'Business'
                          : 'Individual'}
                    </span>
                  </div>
                  <p
                    className={`text-xs mb-5 ${
                      isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                    }`}
                  >
                    {plan.tagline}
                  </p>

                  <div className="flex items-baseline gap-2 pb-5 border-b border-[#A9AFB0]/25">
                    {billing === 'annual' && (
                      <span
                        className={`text-lg font-display line-through tabular-nums ${
                          isDark ? 'text-[#A9AFB0]/70' : 'text-[#202427]/40'
                        }`}
                      >
                        €{plan.monthlyPrice}
                      </span>
                    )}
                    <span className="text-4xl font-display font-semibold tabular-nums">
                      €{price}
                    </span>
                    <span
                      className={`text-xs ${
                        isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                      }`}
                    >
                      {plan.category === 'business' ? '/ team' : '/ seat'} / month
                      {billing === 'annual' ? ' · billed yearly (-30%)' : ' · billed monthly'}
                    </span>
                  </div>

                  <p
                    className={`mt-5 text-sm leading-relaxed ${
                      isDark ? 'text-[#F7F6F2]/90' : 'text-[#202427]/80'
                    }`}
                  >
                    {plan.description}
                  </p>

                  <ul className="mt-6 space-y-2.5 text-sm">
                    {plan.features.map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <Check
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            isDark ? 'text-[#E9B949]' : 'text-[#202427]'
                          }`}
                        />
                        <span
                          className={
                            isDark ? 'text-[#F7F6F2]/85' : 'text-[#202427]/85'
                          }
                        >
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectPlan(plan, billing)}
                  className={`mt-8 w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    isDark
                      ? 'bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90'
                      : 'bg-[#202427] text-[#F7F6F2] hover:bg-[#202427]/90'
                  }`}
                >
                  {plan.ctaLabel}
                </button>
              </div>
            );
          })}
        </div>

        {/* Education Institutional Strip */}
        <div className="mt-8 rounded-xl border border-[#A9AFB0]/50 bg-white px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <GraduationCap className="w-5 h-5 text-[#9A7218] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-[#202427]">
                Trace. Education &amp; Campus — Completely FREE for Students
              </h3>
              <p className="text-sm text-[#202427]/75 mt-0.5">
                Students receive full Trace Pro &amp; 3D site verification at €0 when their university holds a Stoa Campus license—plus live workshops and certification.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenEducation}
            className="px-4 py-2.5 rounded-lg border border-[#202427] text-sm font-medium text-[#202427] hover:bg-[#202427] hover:text-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start md:self-auto"
          >
            Open Education Portal
          </button>
        </div>

        {/* Adobe-Style Core Capability Comparison Table */}
        <div className="mt-16">
          <div className="mb-6">
            <h3 className="text-2xl font-semibold tracking-tight text-[#202427]">
              Compare core Trace. editions
            </h3>
            <p className="text-sm text-[#202427]/70 mt-1">
              Side-by-side breakdown across Trace Draft, Trace Sketch, and Trace Pro.
            </p>
          </div>

          <div className="overflow-x-auto border border-[#A9AFB0]/50 rounded-xl bg-white">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#A9AFB0]/40 bg-[#F7F6F2]">
                  <th className="py-4 px-5 text-xs font-medium text-[#202427]/70 w-[46%]">
                    Capability
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%]">
                    Trace Draft
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%]">
                    Trace Sketch
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%] bg-[#E9B949]/15">
                    Trace Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_TABLE.map((group) => (
                  <React.Fragment key={group.category}>
                    <tr className="border-b border-[#A9AFB0]/30 bg-[#202427]/[0.03]">
                      <td
                        colSpan={4}
                        className="py-2.5 px-5 text-xs font-semibold text-[#202427]"
                      >
                        {group.category}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={row.feature}
                        className="border-b border-[#A9AFB0]/20 last:border-b-0 hover:bg-[#F7F6F2]/60 transition-colors"
                      >
                        <td className="py-3.5 px-5 text-sm text-[#202427]/90">
                          {row.feature}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {renderCellValue(row.draft)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {renderCellValue(row.sketch)}
                        </td>
                        <td className="py-3.5 px-4 text-center bg-[#E9B949]/[0.07]">
                          {renderCellValue(row.pro)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
};
