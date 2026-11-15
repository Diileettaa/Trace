import React, { useState } from 'react';
import { Check, GraduationCap, Minus } from 'lucide-react';
import {
  ADD_ONS,
  BillingCycle,
  CLOUD_STORAGE_TIERS,
  FEATURE_MATRIX_COLUMNS,
  FEATURE_MATRIX_GROUPS,
  FEATURE_MATRIX_ROWS,
  INCLUDED_IN_EVERY_PLAN,
  MatrixValue,
  PRODUCT_META,
  PRODUCT_PLANS,
  ProductPlan,
  TOKEN_PACK_OPTIONS,
} from '../data/traceData';
import {
  AddOnCheckoutModal,
  SelectedAddOnCheckout,
} from './AddOnCheckoutModal';

interface PricingSectionProps {
  activeCategory: 'individual' | 'business' | 'university';
  onCategoryChange: (category: 'individual' | 'business' | 'university') => void;
  onSelectPlan: (
    plan: ProductPlan,
    billing: BillingCycle,
    options?: { premiumSla?: boolean; masterplanSeats?: number }
  ) => void;
  onOpenEducation: () => void;
  onContactUs: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({
  activeCategory,
  onCategoryChange,
  onSelectPlan,
  onOpenEducation,
  onContactUs,
}) => {
  const [billing, setBilling] = useState<BillingCycle>('yearly');
  const [masterplanPremiumSla, setMasterplanPremiumSla] = useState<boolean>(false);
  const [masterplanSeats, setMasterplanSeats] = useState<number>(20);
  const [selectedTokenPackId, setSelectedTokenPackId] = useState<string | null>(
    null
  );
  const [selectedCloudTierId, setSelectedCloudTierId] = useState<string | null>(
    null
  );
  const [addOnCheckoutItem, setAddOnCheckoutItem] =
    useState<SelectedAddOnCheckout | null>(null);

  const visiblePlans = PRODUCT_PLANS.filter((plan) => {
    if (plan.category !== activeCategory) return false;
    if (activeCategory === 'business' && billing === 'weekly') {
      return plan.id === 'studio';
    }
    return true;
  });

  const renderMatrixCell = (val: MatrixValue) => {
    if (val === 'yes') {
      return (
        <span className="inline-flex items-center justify-center">
          <Check className="w-4 h-4 text-[#202427]" aria-label="Included" />
        </span>
      );
    }
    if (val === 'no') {
      return (
        <span className="inline-flex items-center justify-center text-[#A9AFB0]">
          <Minus className="w-4 h-4" aria-label="Not included" />
        </span>
      );
    }
    return (
      <span className="text-[11px] font-mono font-semibold text-[#9A7218]">
        Configurable (+10%)
      </span>
    );
  };

  const renderPlanPriceBlock = (plan: ProductPlan, isDark: boolean) => {
    if (plan.universityStudentPricing) {
      return (
        <div className="pb-5 border-b border-[#A9AFB0]/25">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-display font-semibold tabular-nums">
              €0
            </span>
            <span
              className={`text-xs ${
                isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
              }`}
            >
              / per student ID
            </span>
          </div>
          <div
            className={`text-[11px] font-mono mt-1.5 leading-snug ${
              isDark ? 'text-[#E9B949]' : 'text-[#9A7218]'
            }`}
          >
            Only available if your university is registered with Trace Academy
          </div>
          <div
            className={`text-[11px] mt-1 leading-snug ${
              isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/70'
            }`}
          >
            Otherwise, students must use an Individual plan (Sketch or Pro).
          </div>
        </div>
      );
    }

    if (plan.enterprisePricing) {
      const isOverMax = masterplanSeats >= plan.enterprisePricing.maximumSeats;
      const multiplier = masterplanPremiumSla
        ? 1 + plan.enterprisePricing.premiumSlaPercent / 100
        : 1;
      const platformFee = Math.round(
        plan.enterprisePricing.platformFeePerMonth * multiplier
      );
      const perSeat =
        Math.round(plan.enterprisePricing.perSeatPerMonth * multiplier * 100) /
        100;
      const extraSeats = Math.max(
        0,
        masterplanSeats - plan.enterprisePricing.minimumSeats
      );
      const totalMonthly = Math.round(
        (plan.enterprisePricing.platformFeePerMonth +
          extraSeats * plan.enterprisePricing.perSeatPerMonth) *
          multiplier
      );
      const totalYearly = totalMonthly * 12;

      return (
        <div className="pb-5 border-b border-[#A9AFB0]/25">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            {isOverMax ? (
              <span className="text-3xl font-display font-semibold">
                Custom Quote
              </span>
            ) : (
              <>
                <span className="text-4xl font-display font-semibold tabular-nums">
                  €{totalMonthly.toLocaleString('en-US')}
                </span>
                <span
                  className={`text-xs ${
                    isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                  }`}
                >
                  / month ({masterplanSeats} seats)
                </span>
              </>
            )}
          </div>
          <div
            className={`text-[11px] font-mono mt-1.5 leading-snug ${
              isDark ? 'text-[#E9B949]' : 'text-[#9A7218]'
            }`}
          >
            {isOverMax
              ? '50+ seats · Custom enterprise contract · Invoice · Excl. VAT'
              : extraSeats === 0
                ? `€${platformFee.toLocaleString('en-US')} base (20 seats incl.) · +€${perSeat}/extra seat · Excl. VAT`
                : `€${platformFee.toLocaleString('en-US')} (20 seats) + ${extraSeats} × €${perSeat}/seat · Excl. VAT`}
          </div>
          <div
            className={`text-[11px] mt-1 ${
              isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/75'
            }`}
          >
            {isOverMax ? (
              <span className="font-mono font-semibold text-[#9A7218]">
                Contact our team for 50+ seats
              </span>
            ) : (
              <span className="font-mono font-semibold text-[#202427]">
                Annual total: €{totalYearly.toLocaleString('en-US')} / year (yearly contract, invoice)
              </span>
            )}
          </div>
        </div>
      );
    }

    if (plan.monthlyPrice === 0) {
      return (
        <div className="pb-5 border-b border-[#A9AFB0]/25">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-display font-semibold tabular-nums">
              €0
            </span>
            <span
              className={`text-xs ${
                isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
              }`}
            >
              / month · €0 / year
            </span>
          </div>
          <div
            className={`text-[11px] font-mono mt-1.5 ${
              isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/60'
            }`}
          >
            1 seat · No card required
          </div>
        </div>
      );
    }

    const activePrice =
      billing === 'weekly'
        ? plan.weeklyPrice
        : billing === 'monthly'
          ? plan.monthlyPrice
          : plan.yearlyPerMonthPrice;

    const suffix =
      billing === 'weekly'
        ? '/ week'
        : billing === 'yearly'
          ? '/ month · billed yearly'
          : '/ month · billed monthly';

    return (
      <div className="pb-5 border-b border-[#A9AFB0]/25">
        <div className="flex items-baseline gap-2 flex-wrap">
          {billing === 'yearly' &&
            plan.monthlyPrice !== null &&
            activePrice !== null &&
            plan.monthlyPrice > activePrice && (
              <span
                className={`text-lg font-display line-through tabular-nums ${
                  isDark ? 'text-[#A9AFB0]/70' : 'text-[#202427]/40'
                }`}
              >
                €{plan.monthlyPrice}
              </span>
            )}
          <span className="text-4xl font-display font-semibold tabular-nums">
            €{activePrice}
          </span>
          <span
            className={`text-xs ${
              isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
            }`}
          >
            {plan.priceUnit ? `${plan.priceUnit} ` : ''}
            {suffix}
          </span>
        </div>

        {billing === 'yearly' && plan.yearlyTotalPrice !== null ? (
          <div
            className={`text-[11px] font-mono mt-1.5 font-semibold ${
              isDark ? 'text-[#E9B949]' : 'text-[#9A7218]'
            }`}
          >
            Annual total: €{plan.yearlyTotalPrice.toLocaleString('en-US')}{' '}
            {plan.priceUnit ? `${plan.priceUnit} ` : ''}/ year (excl. VAT)
            {plan.extraSeatPerMonth
              ? ` · Extra seat €${plan.extraSeatPerMonth}/mo`
              : ''}
          </div>
        ) : (
          <div
            className={`text-[11px] font-mono mt-1.5 ${
              isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/60'
            }`}
          >
            Excl. VAT
            {plan.extraSeatPerMonth
              ? ` · Extra seat €${plan.extraSeatPerMonth}/mo`
              : ' · Cancel anytime on weekly/monthly'}
          </div>
        )}
      </div>
    );
  };

  const handleBuyTokenPack = () => {
    const pack = TOKEN_PACK_OPTIONS.find((p) => p.id === selectedTokenPackId);
    if (!pack) return;
    setAddOnCheckoutItem({
      kind: 'token-pack',
      title: `Token Pack · ${pack.label}`,
      subtitle: `${pack.tokens.toLocaleString('en-US')} drawing query tokens for any paid plan`,
      price: pack.price,
      billingLabel: 'One-time pack',
    });
  };

  const handleBuyCloudTier = () => {
    const tier = CLOUD_STORAGE_TIERS.find((t) => t.id === selectedCloudTierId);
    if (!tier) return;
    setAddOnCheckoutItem({
      kind: 'cloud-plus',
      title: `Cloud+ Storage · ${tier.label}`,
      subtitle: `${tier.addedStorage} · EU-hosted encrypted Trace Cloud`,
      price: tier.monthlyPrice,
      billingLabel: 'Per month',
    });
  };

  return (
    <section id="plans" className="py-20 border-t border-[#A9AFB0]/35">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Header stacked ABOVE Price Categories */}
        <div className="flex flex-col gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
              {PRODUCT_META.name} · EUR · Prices exclude VAT
            </p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#202427] [text-wrap:balance]">
              Modular plans for every desk, team, and construction site.
            </h2>
            <p className="mt-3 text-base text-[#202427]/75 leading-relaxed">
              {PRODUCT_META.tagline} {PRODUCT_META.billingNote}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Segment Switch: Individual -> Business -> University */}
            <div
              className="inline-flex flex-wrap items-center p-1 rounded-lg bg-white border border-[#A9AFB0]/50"
              role="group"
              aria-label="Product category"
            >
              <button
                type="button"
                onClick={() => onCategoryChange('individual')}
                className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'individual'
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Individual (Sketch · Pro)
              </button>
              <button
                type="button"
                onClick={() => onCategoryChange('business')}
                className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'business'
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Business (Studio · Site · Masterplan)
              </button>
              <button
                type="button"
                onClick={() => onCategoryChange('university')}
                className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeCategory === 'university'
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                University (Trace Academy)
              </button>
            </div>

            {/* Weekly / Monthly / Yearly · Save up to 30% Switch */}
            <div
              className="inline-flex items-center p-1 rounded-lg bg-[#202427]/5 border border-[#A9AFB0]/40"
              role="group"
              aria-label="Billing frequency"
            >
              <button
                type="button"
                onClick={() => setBilling('weekly')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  billing === 'weekly'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setBilling('monthly')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  billing === 'monthly'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling('yearly')}
                className={`px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  billing === 'yearly'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                Yearly · Save up to 30%
              </button>
            </div>
          </div>
        </div>

        {/* Plan Cards for Selected Segment */}
        <div
          className={`grid grid-cols-1 gap-6 items-stretch ${
            visiblePlans.length === 1
              ? 'max-w-xl'
              : visiblePlans.length === 2
                ? 'lg:grid-cols-2'
                : 'lg:grid-cols-3'
          }`}
        >
          {visiblePlans.map((plan) => {
            const isDark = Boolean(plan.highlighted);
            const isMasterplanOverMax =
              Boolean(plan.enterprisePricing) &&
              masterplanSeats >= (plan.enterprisePricing?.maximumSeats ?? 50);

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
                      {plan.badge ||
                        (plan.segment === 'university'
                          ? 'University'
                          : plan.segment === 'business'
                            ? 'Business'
                            : plan.segment === 'enterprise'
                              ? 'Enterprise'
                              : 'Individual')}
                    </span>
                  </div>
                  <p
                    className={`text-xs mb-5 ${
                      isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                    }`}
                  >
                    {plan.target}
                  </p>

                  {renderPlanPriceBlock(plan, isDark)}

                  {/* Quotas: Seats, Tokens, Sheets, Cloud Storage */}
                  <div
                    className={`mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 pb-4 border-b text-xs ${
                      isDark ? 'border-white/10' : 'border-[#A9AFB0]/25'
                    }`}
                  >
                    <div>
                      <span
                        className={`block text-[10px] font-mono uppercase ${
                          isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/55'
                        }`}
                      >
                        Seats
                      </span>
                      <span className="font-mono font-semibold">{plan.seats}</span>
                    </div>
                    <div>
                      <span
                        className={`block text-[10px] font-mono uppercase ${
                          isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/55'
                        }`}
                      >
                        Tokens / month
                      </span>
                      <span className="font-mono font-semibold">
                        {plan.tokensPerMonth}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`block text-[10px] font-mono uppercase ${
                          isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/55'
                        }`}
                      >
                        Sheets / month
                      </span>
                      <span className="font-mono font-semibold">
                        {plan.sheetsPerMonth}
                      </span>
                    </div>
                    <div>
                      <span
                        className={`block text-[10px] font-mono uppercase ${
                          isDark ? 'text-[#A9AFB0]' : 'text-[#202427]/55'
                        }`}
                      >
                        Cloud storage
                      </span>
                      <span className="font-mono font-semibold">
                        {plan.cloudStorage}
                      </span>
                    </div>
                  </div>

                  {/* Masterplan Interactive Seat Selector (20 to 50+ seats) */}
                  {plan.enterprisePricing && (
                    <div className="mt-4 p-3 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/45 flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-[10px] font-mono uppercase text-[#202427]/60">
                          Configure Seats (Min. 20 · Max. 50)
                        </span>
                        <span className="text-xs font-semibold text-[#202427]">
                          {isMasterplanOverMax
                            ? '50+ seats (Enterprise Contact)'
                            : `${masterplanSeats} seats selected`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-[#A9AFB0]/50 rounded-md px-2 py-1">
                        <button
                          type="button"
                          onClick={() =>
                            setMasterplanSeats((s) => Math.max(20, s - 1))
                          }
                          className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                          aria-label="Decrease Masterplan seats"
                        >
                          −
                        </button>
                        <span className="text-xs font-mono font-semibold tabular-nums min-w-[32px] text-center">
                          {isMasterplanOverMax ? '50+' : masterplanSeats}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setMasterplanSeats((s) => Math.min(50, s + 1))
                          }
                          className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                          aria-label="Increase Masterplan seats"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}

                  {plan.includesPlanName && (
                    <p
                      className={`mt-4 text-xs font-mono font-semibold ${
                        isDark ? 'text-[#E9B949]' : 'text-[#9A7218]'
                      }`}
                    >
                      Includes everything in {plan.includesPlanName}, plus:
                    </p>
                  )}

                  <ul className="mt-3 space-y-2.5 text-sm">
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

                  {/* Configurable Add-on inside Trace Masterplan: Premium SLA (+10%) */}
                  {plan.enterprisePricing && (
                    <div className="mt-5 p-3.5 rounded-lg border border-[#A9AFB0]/45 bg-[#F7F6F2]">
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={masterplanPremiumSla}
                          onChange={(e) => setMasterplanPremiumSla(e.target.checked)}
                          className="mt-0.5 accent-[#202427] w-4 h-4 cursor-pointer"
                        />
                        <div className="text-xs">
                          <span className="font-semibold text-[#202427] block">
                            Add Premium SLA (99.9% uptime · +10%)
                          </span>
                          <span className="text-[#202427]/65 font-mono">
                            Upgrades standard 99.5% SLA to 99.9% uptime guarantee
                          </span>
                        </div>
                      </label>
                    </div>
                  )}
                </div>

                {isMasterplanOverMax ? (
                  <button
                    type="button"
                    onClick={onContactUs}
                    className="mt-8 w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90"
                  >
                    Please contact us
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      onSelectPlan(plan, billing, {
                        premiumSla: plan.enterprisePricing
                          ? masterplanPremiumSla
                          : undefined,
                        masterplanSeats: plan.enterprisePricing
                          ? masterplanSeats
                          : undefined,
                      })
                    }
                    className={`mt-8 w-full py-3 px-4 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      isDark
                        ? 'bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90'
                        : 'bg-[#202427] text-[#F7F6F2] hover:bg-[#202427]/90'
                    }`}
                  >
                    {plan.ctaLabel}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Included in Every Plan (Full Width) */}
        <div className="mt-10 rounded-xl border border-[#A9AFB0]/50 bg-white p-6">
          <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-4">
            Included in every plan
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {INCLUDED_IN_EVERY_PLAN.map((core) => (
              <div key={core.name} className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-[#9A7218] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#202427]">
                    {core.name}
                  </div>
                  <p className="text-xs text-[#202427]/70 mt-0.5 leading-relaxed">
                    {core.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Education Institutional Strip */}
        <div className="mt-6 rounded-xl border border-[#A9AFB0]/50 bg-white px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <GraduationCap className="w-5 h-5 text-[#9A7218] mt-0.5 shrink-0" />
            <div>
              <h3 className="text-base font-semibold text-[#202427]">
                Trace Academy — €0 per Student ID at Registered Universities
              </h3>
              <p className="text-sm text-[#202427]/75 mt-0.5">
                1 student with a valid student ID gets 100 Tokens/mo, 10 sheets/mo, and 10 GB Trace Cloud for €0 when their university is registered. Otherwise, students must use an Individual plan (Sketch or Pro).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenEducation}
            className="px-4 py-2.5 rounded-lg border border-[#202427] text-sm font-medium text-[#202427] hover:bg-[#202427] hover:text-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start md:self-auto"
          >
            Verify Trace Academy
          </button>
        </div>

        {/* Optional Add-ons Section (Token Pack 3-tier + Cloud+ 3-tier with Buy now flow) */}
        <div className="mt-14">
          <div className="mb-6">
            <h3 className="text-2xl font-semibold tracking-tight text-[#202427]">
              Optional Add-ons
            </h3>
            <p className="text-sm text-[#202427]/70 mt-1">
              Select a Token Pack or Cloud+ Storage Expansion package below to activate your purchase.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {ADD_ONS.map((addon) => {
              const isTokenPack = addon.id === 'token-pack';
              const hasSelection = isTokenPack
                ? Boolean(selectedTokenPackId)
                : Boolean(selectedCloudTierId);

              return (
                <div
                  key={addon.id}
                  className="p-6 rounded-xl border border-[#A9AFB0]/50 bg-white flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-base font-semibold text-[#202427]">
                        {addon.name}
                      </h4>
                      <span className="text-[11px] font-mono text-[#9A7218] shrink-0">
                        {addon.availableOn}
                      </span>
                    </div>
                    {addon.description && (
                      <p className="text-xs text-[#202427]/75 mt-1.5 leading-relaxed">
                        {addon.description}
                      </p>
                    )}

                    {/* Token Pack 3 Clickable Boxes */}
                    {addon.tokenPacks && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {addon.tokenPacks.map((pack) => {
                          const isSelected = selectedTokenPackId === pack.id;
                          return (
                            <button
                              key={pack.id}
                              type="button"
                              onClick={() => setSelectedTokenPackId(pack.id)}
                              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#202427] text-[#F7F6F2] border-[#202427]'
                                  : 'bg-[#F7F6F2] text-[#202427] border-[#A9AFB0]/40 hover:border-[#202427]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-semibold">
                                  {pack.label}
                                </span>
                                {pack.badge && (
                                  <span
                                    className={`text-[10px] font-mono font-semibold ${
                                      isSelected ? 'text-[#E9B949]' : 'text-[#9A7218]'
                                    }`}
                                  >
                                    {pack.badge}
                                  </span>
                                )}
                              </div>
                              <div className="text-base font-display font-semibold mt-1">
                                €{pack.price}
                              </div>
                              <div
                                className={`text-[10px] font-mono mt-0.5 ${
                                  isSelected ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                                }`}
                              >
                                Excl. VAT
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Cloud+ Storage 3 Clickable Boxes */}
                    {addon.tiers && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {addon.tiers.map((tier) => {
                          const isSelected = selectedCloudTierId === tier.id;
                          return (
                            <button
                              key={tier.id}
                              type="button"
                              onClick={() => setSelectedCloudTierId(tier.id)}
                              className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-[#202427] text-[#F7F6F2] border-[#202427]'
                                  : 'bg-[#F7F6F2] text-[#202427] border-[#A9AFB0]/40 hover:border-[#202427]'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-xs font-semibold">
                                  {tier.label}
                                </span>
                                {tier.badge && (
                                  <span
                                    className={`text-[10px] font-mono font-semibold ${
                                      isSelected ? 'text-[#E9B949]' : 'text-[#9A7218]'
                                    }`}
                                  >
                                    {tier.badge}
                                  </span>
                                )}
                              </div>
                              <div className="text-base font-display font-semibold mt-1">
                                €{tier.monthlyPrice} / mo
                              </div>
                              <div
                                className={`text-[10px] font-mono mt-0.5 ${
                                  isSelected ? 'text-[#A9AFB0]' : 'text-[#202427]/65'
                                }`}
                              >
                                {tier.addedStorage}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Subtle Divider + Buy Now Button (Gray until box clicked, Yellow when active) */}
                  <div className="pt-3 border-t border-[#A9AFB0]/25 flex items-center justify-between gap-3">
                    <span className="text-xs font-mono text-[#202427]/70">
                      {hasSelection
                        ? isTokenPack
                          ? `Selected: ${TOKEN_PACK_OPTIONS.find((p) => p.id === selectedTokenPackId)?.label} (€${TOKEN_PACK_OPTIONS.find((p) => p.id === selectedTokenPackId)?.price})`
                          : `Selected: ${CLOUD_STORAGE_TIERS.find((t) => t.id === selectedCloudTierId)?.label} (€${CLOUD_STORAGE_TIERS.find((t) => t.id === selectedCloudTierId)?.monthlyPrice}/mo)`
                        : 'Select a package above'}
                    </span>
                    <button
                      type="button"
                      disabled={!hasSelection}
                      onClick={
                        isTokenPack ? handleBuyTokenPack : handleBuyCloudTier
                      }
                      className={`px-5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                        hasSelection
                          ? 'bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90 cursor-pointer'
                          : 'bg-[#A9AFB0]/35 text-[#202427]/45 cursor-not-allowed'
                      }`}
                    >
                      Buy now
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Full Feature Matrix Table with Category Headers (Individual, Business, University) */}
        <div className="mt-16">
          <div className="mb-6">
            <h3 className="text-2xl font-semibold tracking-tight text-[#202427]">
              Compare all Trace editions
            </h3>
            <p className="text-sm text-[#202427]/70 mt-1">
              Side-by-side feature matrix across Individual, Business, and University editions.
            </p>
          </div>

          <div className="overflow-x-auto border border-[#A9AFB0]/50 rounded-xl bg-white">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                {/* Category Header Row */}
                <tr className="border-b border-[#A9AFB0]/30 bg-[#202427] text-[#F7F6F2]">
                  <th className="py-2.5 px-5 text-[11px] font-mono uppercase tracking-wider text-[#A9AFB0] w-[34%]">
                    Category
                  </th>
                  {FEATURE_MATRIX_GROUPS.map((group) => (
                    <th
                      key={group.category}
                      colSpan={group.colSpan}
                      className="py-2.5 px-3 text-[11px] font-mono uppercase tracking-wider text-[#E9B949] text-center border-l border-white/10"
                    >
                      {group.category}
                    </th>
                  ))}
                </tr>
                {/* Product Names Header Row */}
                <tr className="border-b border-[#A9AFB0]/40 bg-[#F7F6F2]">
                  <th className="py-4 px-5 text-xs font-medium text-[#202427]/70">
                    Capability
                  </th>
                  {FEATURE_MATRIX_COLUMNS.map((col) => (
                    <th
                      key={col.id}
                      className={`py-4 px-3 text-xs sm:text-sm font-semibold text-[#202427] text-center border-l border-[#A9AFB0]/20 ${
                        col.highlighted ? 'bg-[#E9B949]/15' : ''
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURE_MATRIX_ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className="border-b border-[#A9AFB0]/20 last:border-b-0 hover:bg-[#F7F6F2]/60 transition-colors"
                  >
                    <td className="py-3.5 px-5 text-sm text-[#202427]/90">
                      {row.feature}
                    </td>
                    {FEATURE_MATRIX_COLUMNS.map((col) => (
                      <td
                        key={col.id}
                        className={`py-3.5 px-3 text-center border-l border-[#A9AFB0]/15 ${
                          col.highlighted ? 'bg-[#E9B949]/[0.07]' : ''
                        }`}
                      >
                        {renderMatrixCell(row.values[col.id])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add-On Payment Options Popup */}
      <AddOnCheckoutModal
        key={addOnCheckoutItem?.title || 'closed'}
        item={addOnCheckoutItem}
        onClose={() => setAddOnCheckoutItem(null)}
      />
    </section>
  );
};
