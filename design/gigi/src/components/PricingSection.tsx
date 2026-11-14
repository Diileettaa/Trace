import React, { useState } from 'react';
import { Check, GraduationCap, Minus } from 'lucide-react';
import { COMPARISON_TABLE, PLAN_TIERS, PlanTier } from '../data/traceData';

interface PricingSectionProps {
  onSelectPlan: (plan: PlanTier, billing: 'annual' | 'monthly') => void;
  onOpenEducation: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({
  onSelectPlan,
  onOpenEducation,
}) => {
  const [billing, setBilling] = useState<'annual' | 'monthly'>('annual');

  const renderCellValue = (val: string | boolean, isHighlighted?: boolean) => {
    if (val === true) {
      return (
        <span className="inline-flex items-center justify-center">
          <Check
            className={`w-4 h-4 ${isHighlighted ? 'text-[#202427]' : 'text-[#202427]'}`}
            aria-label="Included"
          />
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
        {/* Header & Billing Switch */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <p className="text-xs font-mono text-[#202427]/70 mb-2">
              Flexible Licensing · Modular or Unified
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#202427] [text-wrap:balance]">
              Choose the plan built for your role on site.
            </h2>
            <p className="mt-3 text-base text-[#202427]/75 leading-relaxed">
              Start with spatial drawing verification, manage permits and trade workflows, or unify every discipline in Trace Complete. All plans include a 14-day free trial.
            </p>
          </div>

          <div
            className="inline-flex items-center p-1 rounded-lg bg-[#202427]/5 border border-[#A9AFB0]/40 self-start md:self-auto shrink-0"
            role="group"
            aria-label="Billing frequency"
          >
            <button
              type="button"
              onClick={() => setBilling('monthly')}
              className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                billing === 'annual'
                  ? 'bg-[#202427] text-[#F7F6F2]'
                  : 'text-[#202427]/75 hover:text-[#202427]'
              }`}
            >
              Annual · Save 20%
            </button>
          </div>
        </div>

        {/* 3 Adobe-Style Plan Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {PLAN_TIERS.map((plan) => {
            const price = billing === 'annual' ? plan.annualPrice : plan.monthlyPrice;
            const isDark = Boolean(plan.highlighted);

            return (
              <div
                key={plan.id}
                className={`rounded-xl p-7 flex flex-col justify-between transition-colors ${
                  isDark
                    ? 'bg-[#202427] text-[#F7F6F2] border border-[#202427]'
                    : 'bg-white/70 text-[#202427] border border-[#A9AFB0]/50'
                }`}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <h3 className="text-xl font-semibold tracking-tight">{plan.name}</h3>
                    {isDark && (
                      <span className="text-xs font-mono text-[#E9B949] whitespace-nowrap shrink-0">
                        Full Suite
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-xs mb-5 ${
                      isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                    }`}
                  >
                    {plan.audience}
                  </p>

                  <div className="flex items-baseline gap-1.5 pb-5 border-b border-[#A9AFB0]/25">
                    <span className="text-4xl font-display font-semibold tabular-nums">
                      €{price}
                    </span>
                    <span
                      className={`text-xs ${
                        isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                      }`}
                    >
                      / seat / month{billing === 'annual' ? ' · billed annually' : ''}
                    </span>
                  </div>

                  <p
                    className={`mt-5 text-sm leading-relaxed ${
                      isDark ? 'text-[#F7F6F2]/90' : 'text-[#202427]/80'
                    }`}
                  >
                    {plan.description}
                  </p>

                  <p
                    className={`mt-6 mb-3 text-xs font-medium ${
                      isDark ? 'text-[#E9B949]' : 'text-[#202427]'
                    }`}
                  >
                    {plan.includesHeading}
                  </p>
                  <ul className="space-y-2.5 text-sm">
                    {plan.highlights.map((item) => (
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
        <div className="mt-8 rounded-xl border border-[#A9AFB0]/50 bg-[#202427]/[0.03] px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <GraduationCap className="w-5 h-5 text-[#202427] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-[#202427]">
                Trace. Education &amp; Campus Licensing — Free for Students
              </h3>
              <p className="text-sm text-[#202427]/75 mt-0.5">
                Students at partner universities receive full Trace Complete access, live workshops, and BIM verification certification at €0 when their faculty holds an academic agreement.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenEducation}
            className="px-4 py-2.5 rounded-lg border border-[#202427] text-sm font-medium text-[#202427] hover:bg-[#202427] hover:text-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start md:self-auto"
          >
            Open Trace Campus
          </button>
        </div>

        {/* Adobe-Style Full Feature Comparison Table */}
        <div className="mt-16">
          <div className="mb-6">
            <h3 className="text-2xl font-semibold tracking-tight text-[#202427]">
              Compare plan capabilities
            </h3>
            <p className="text-sm text-[#202427]/70 mt-1">
              Side-by-side breakdown across drawing intelligence, site photo verification, documents, and trade workflows.
            </p>
          </div>

          <div className="overflow-x-auto border border-[#A9AFB0]/50 rounded-xl bg-white/75">
            <table className="w-full text-left border-collapse min-w-[680px]">
              <thead>
                <tr className="border-b border-[#A9AFB0]/40 bg-[#F7F6F2]">
                  <th className="py-4 px-5 text-xs font-medium text-[#202427]/70 w-[46%]">
                    Capability
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%]">
                    Trace Drawings
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%]">
                    Trace Docs &amp; Flow
                  </th>
                  <th className="py-4 px-4 text-sm font-semibold text-[#202427] text-center w-[18%] bg-[#E9B949]/15">
                    Trace Complete
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
                          {renderCellValue(row.drawings)}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {renderCellValue(row.docs)}
                        </td>
                        <td className="py-3.5 px-4 text-center bg-[#E9B949]/[0.07]">
                          {renderCellValue(row.complete, true)}
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
