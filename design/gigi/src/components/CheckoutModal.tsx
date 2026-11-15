import React, { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react';
import {
  BillingCycle,
  CLOUD_STORAGE_TIERS,
  PARTNER_UNIVERSITIES,
  ProductPlan,
} from '../data/traceData';

interface CheckoutModalProps {
  plan: ProductPlan | null;
  initialBilling: BillingCycle;
  initialPremiumSla?: boolean;
  initialMasterplanSeats?: number;
  onClose: () => void;
  onContactUs?: () => void;
  onLaunchWorkspace?: () => void;
  onSubscribed?: (planName: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  plan,
  initialBilling,
  initialPremiumSla = false,
  initialMasterplanSeats = 20,
  onClose,
  onContactUs,
  onLaunchWorkspace,
  onSubscribed,
}) => {
  const defaultBilling: BillingCycle =
    plan?.weeklyPrice === null && initialBilling === 'weekly'
      ? 'yearly'
      : initialBilling;

  const [billing, setBilling] = useState<BillingCycle>(defaultBilling);
  const [seats, setSeats] = useState<number>(
    plan?.enterprisePricing
      ? Math.min(50, Math.max(20, initialMasterplanSeats))
      : plan?.id === 'studio'
        ? 3
        : plan?.id === 'site'
          ? 5
          : 1
  );
  const [selectedCloudTierId, setSelectedCloudTierId] = useState<string>('base');
  const [premiumSla, setPremiumSla] = useState<boolean>(initialPremiumSla);
  const [email, setEmail] = useState<string>('');
  const [organization, setOrganization] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isProvisioned, setIsProvisioned] = useState<boolean>(false);

  if (!plan) return null;

  const isFree = plan.monthlyPrice === 0 && !plan.universityStudentPricing;
  const isUniversity = Boolean(plan.universityStudentPricing);
  const isEnterprise = Boolean(plan.enterprisePricing);
  const isEnterpriseOverMax =
    isEnterprise && seats >= (plan.enterprisePricing?.maximumSeats ?? 50);
  const hasTrial = plan.id === 'pro' || plan.id === 'studio';
  const isFixedSeat = plan.id === 'sketch' || plan.id === 'pro' || isUniversity;

  const selectedCloudTier = CLOUD_STORAGE_TIERS.find(
    (t) => t.id === selectedCloudTierId
  );
  const cloudAddonMonthly = selectedCloudTier ? selectedCloudTier.monthlyPrice : 0;

  const getPriceSummary = () => {
    if (isFree) {
      return {
        label: 'Free starter · 20 Tokens / mo · 1 Sheet / mo · 3 GB Trace Cloud',
        amount: '€0',
        unit: '/ mo',
        annualNote: '€0 / year',
      };
    }
    if (isUniversity) {
      return {
        label: '1 student · 100 Tokens / mo · 10 Sheets / mo · 10 GB Trace Cloud',
        amount: '€0',
        unit: '/ student ID',
        annualNote: 'Requires registered university · Otherwise Individual plan applies',
      };
    }
    if (plan.enterprisePricing) {
      if (isEnterpriseOverMax) {
        return {
          label: '50+ seats · Custom enterprise deployment',
          amount: 'Custom',
          unit: '',
          annualNote: 'Contact our enterprise team for 50+ seats',
        };
      }
      const slaMult = premiumSla
        ? 1 + plan.enterprisePricing.premiumSlaPercent / 100
        : 1;
      const extraSeats = Math.max(
        0,
        seats - plan.enterprisePricing.minimumSeats
      );
      const baseTotal = Math.round(
        (plan.enterprisePricing.platformFeePerMonth +
          extraSeats * plan.enterprisePricing.perSeatPerMonth) *
          slaMult
      );
      const total = baseTotal + cloudAddonMonthly;
      const yearlyTotal = total * 12;
      return {
        label:
          extraSeats === 0
            ? `€${plan.enterprisePricing.platformFeePerMonth.toLocaleString('en-US')} (20 seats incl.)${premiumSla ? ' (+10% Premium SLA)' : ''}${cloudAddonMonthly ? ` + €${cloudAddonMonthly} Cloud+` : ''}`
            : `€${plan.enterprisePricing.platformFeePerMonth.toLocaleString('en-US')} (20 seats) + ${extraSeats} × €${plan.enterprisePricing.perSeatPerMonth}${premiumSla ? ' (+10% Premium SLA)' : ''}${cloudAddonMonthly ? ` + €${cloudAddonMonthly} Cloud+` : ''}`,
        amount: `€${total.toLocaleString('en-US')}`,
        unit: '/ mo',
        annualNote: `Annual total: €${yearlyTotal.toLocaleString('en-US')} / year (invoice, excl. VAT)`,
      };
    }
    if (plan.id === 'site') {
      const base =
        billing === 'monthly'
          ? plan.monthlyPrice || 590
          : plan.yearlyPerMonthPrice || 490;
      const extraSeats = Math.max(0, seats - 5);
      const total =
        base + extraSeats * (plan.extraSeatPerMonth || 79) + cloudAddonMonthly;
      const yearlyTotal = total * 12;
      return {
        label: `Per project (5 seats incl.${extraSeats > 0 ? ` + ${extraSeats} extra × €79` : ''}${cloudAddonMonthly ? ` + €${cloudAddonMonthly} Cloud+` : ''}) · excl. VAT`,
        amount: `€${total.toLocaleString('en-US')}`,
        unit: '/ mo',
        annualNote:
          billing === 'yearly'
            ? `Annual total: €${yearlyTotal.toLocaleString('en-US')} / year (excl. VAT)`
            : undefined,
      };
    }

    const activeUnit =
      billing === 'weekly'
        ? plan.weeklyPrice ?? plan.monthlyPrice ?? 0
        : billing === 'monthly'
          ? plan.monthlyPrice ?? 0
          : plan.yearlyPerMonthPrice ?? 0;

    const multiplier = plan.id === 'studio' ? seats : 1;
    const cloudPerPeriod =
      billing === 'weekly'
        ? Math.round((cloudAddonMonthly / 4) * 100) / 100
        : cloudAddonMonthly;
    const total = activeUnit * multiplier + cloudPerPeriod;
    const periodLabel = billing === 'weekly' ? '/ wk' : '/ mo';
    const yearlyTotal = (activeUnit * multiplier + cloudAddonMonthly) * 12;

    return {
      label: `${hasTrial ? '14-day free trial · ' : ''}€${activeUnit}${plan.priceUnit ? ` ${plan.priceUnit}` : ''}${periodLabel}${cloudAddonMonthly ? ` + €${cloudPerPeriod}${periodLabel} Cloud+` : ''} · excl. VAT`,
      amount: `€${total.toLocaleString('en-US')}`,
      unit: periodLabel,
      annualNote:
        billing === 'yearly'
          ? `Annual total: €${yearlyTotal.toLocaleString('en-US')} / year (excl. VAT)`
          : undefined,
    };
  };

  const priceSummary = getPriceSummary();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEnterpriseOverMax) {
      onContactUs?.();
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid work or university email address.');
      return;
    }
    if (isUniversity) {
      const domainPart = email.trim().toLowerCase().split('@')[1] || '';
      const isRegistered = PARTNER_UNIVERSITIES.some((u) =>
        domainPart.endsWith(u.domain)
      );
      if (!isRegistered) {
        setError(
          'This university domain is not registered for Trace Academy. Please choose an Individual plan (Trace Sketch or Trace Pro).'
        );
        return;
      }
    }
    if (organization.trim().length < 2) {
      setError('Please enter your company, studio, or university name.');
      return;
    }
    setError('');
    setIsProvisioned(true);
    onSubscribed?.(plan.name);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between gap-4 sticky top-0 z-10">
          <div>
            <p className="text-xs font-mono text-[#E9B949]">
              Stoa / Trace Subscription
            </p>
            <h3 id="checkout-modal-title" className="text-lg font-semibold">
              {isProvisioned
                ? 'Workspace Ready'
                : isUniversity
                  ? 'Verify Trace Academy'
                  : `Activate ${plan.name}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-[#A9AFB0] hover:text-[#F7F6F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isProvisioned ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Billing Toggle + Seats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#202427]/75 mb-1.5">
                  Billing Cycle
                </label>
                {isEnterprise ? (
                  <div className="px-3 py-2 rounded-lg bg-white border border-[#A9AFB0]/50 text-xs font-mono text-[#202427]">
                    Yearly contract · Invoice
                  </div>
                ) : isUniversity ? (
                  <div className="px-3 py-2 rounded-lg bg-white border border-[#A9AFB0]/50 text-xs font-mono text-[#202427]">
                    €0 / student ID (verified uni)
                  </div>
                ) : isFree ? (
                  <div className="px-3 py-2 rounded-lg bg-white border border-[#A9AFB0]/50 text-xs font-mono text-[#202427]">
                    Free Plan (€0 / year)
                  </div>
                ) : (
                  <div className="grid grid-cols-3 p-1 rounded-lg bg-[#202427]/5 border border-[#A9AFB0]/40">
                    <button
                      type="button"
                      disabled={plan.weeklyPrice === null}
                      onClick={() => setBilling('weekly')}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors ${
                        plan.weeklyPrice === null
                          ? 'opacity-40 cursor-not-allowed text-[#202427]/50'
                          : billing === 'weekly'
                            ? 'bg-[#202427] text-[#F7F6F2] cursor-pointer'
                            : 'text-[#202427]/75 cursor-pointer'
                      }`}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBilling('monthly')}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                        billing === 'monthly'
                          ? 'bg-[#202427] text-[#F7F6F2]'
                          : 'text-[#202427]/75'
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      type="button"
                      onClick={() => setBilling('yearly')}
                      className={`py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                        billing === 'yearly'
                          ? 'bg-[#202427] text-[#F7F6F2]'
                          : 'text-[#202427]/75'
                      }`}
                    >
                      Yearly (-30%)
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="seat-count"
                  className="block text-xs font-medium text-[#202427]/75 mb-1.5"
                >
                  Seats / Allocation
                </label>
                {isFixedSeat ? (
                  <div
                    id="seat-count"
                    className="px-3 py-2 rounded-lg bg-white border border-[#A9AFB0]/50 text-xs font-mono font-semibold text-[#202427]"
                  >
                    {plan.seats}
                  </div>
                ) : (
                  <div className="flex items-center justify-between border border-[#A9AFB0]/50 bg-white rounded-lg px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setSeats((s) =>
                          Math.max(
                            isEnterprise
                              ? 20
                              : plan.id === 'studio'
                                ? 2
                                : plan.id === 'site'
                                  ? 5
                                  : 1,
                            s - 1
                          )
                        )
                      }
                      className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                      aria-label="Decrease seats"
                    >
                      −
                    </button>
                    <span
                      id="seat-count"
                      className="text-sm font-mono font-semibold tabular-nums"
                    >
                      {isEnterpriseOverMax
                        ? '50+ seats'
                        : `${seats} ${seats === 1 ? 'seat' : 'seats'}`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setSeats((s) =>
                          Math.min(
                            isEnterprise ? 50 : plan.id === 'studio' ? 20 : 49,
                            s + 1
                          )
                        )
                      }
                      className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                      aria-label="Increase seats"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Cloud+ Storage Tier Expansion (for paid plans with 10 GB base) */}
            {!isFree && !isUniversity && !isEnterpriseOverMax && (
              <div>
                <label
                  htmlFor="cloud-storage-tier"
                  className="block text-xs font-medium text-[#202427]/75 mb-1"
                >
                  Trace Cloud Storage ({plan.cloudStorage} included)
                </label>
                <select
                  id="cloud-storage-tier"
                  value={selectedCloudTierId}
                  onChange={(e) => setSelectedCloudTierId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                >
                  <option value="base">{plan.cloudStorage} (Included)</option>
                  {CLOUD_STORAGE_TIERS.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.label} ({tier.addedStorage}) — +€{tier.monthlyPrice}/mo
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Configurable Premium SLA Add-on for Trace Masterplan */}
            {isEnterprise && !isEnterpriseOverMax && (
              <label className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-[#A9AFB0]/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={premiumSla}
                  onChange={(e) => setPremiumSla(e.target.checked)}
                  className="mt-0.5 accent-[#202427] w-4 h-4 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-semibold text-[#202427] block">
                    Add Premium SLA (99.9% uptime · +10%)
                  </span>
                  <span className="text-[#202427]/65 font-mono">
                    Optional enterprise SLA upgrade over standard 99.5% uptime
                  </span>
                </div>
              </label>
            )}

            {/* Email & Organization (not needed if routing to Contact Us for 50+ seats) */}
            {!isEnterpriseOverMax && (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="work-email"
                    className="block text-xs font-medium text-[#202427]/75 mb-1"
                  >
                    {isUniversity
                      ? 'University Student Email (e.g. name@aalto.fi)'
                      : 'Work Email'}
                  </label>
                  <input
                    id="work-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      isUniversity ? 'anna@aalto.fi' : 'name@studio-nordic.fi'
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="org-name"
                    className="block text-xs font-medium text-[#202427]/75 mb-1"
                  >
                    {isUniversity ? 'University Name' : 'Company or Project Name'}
                  </label>
                  <input
                    id="org-name"
                    type="text"
                    required
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder={
                      isUniversity
                        ? 'Aalto University'
                        : 'Nordic Interior & MEP Partners'
                    }
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                  />
                </div>
              </div>
            )}

            {error && <p className="text-xs text-red-700 font-medium">{error}</p>}

            {/* Summary Strip */}
            <div className="p-4 rounded-lg bg-white border border-[#A9AFB0]/45 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs text-[#202427]/65">
                  {priceSummary.label}
                </div>
                <div className="text-sm font-semibold text-[#202427]">
                  {isEnterpriseOverMax
                    ? 'Enterprise Team (50+ seats)'
                    : hasTrial
                      ? 'Total after 14-day trial'
                      : 'Total (excl. VAT)'}
                </div>
                {priceSummary.annualNote && (
                  <div className="text-[11px] font-mono text-[#9A7218] mt-0.5">
                    {priceSummary.annualNote}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="text-2xl font-display font-semibold tabular-nums">
                  {priceSummary.amount}
                </span>
                <span className="text-xs text-[#202427]/65">
                  {' '}
                  {priceSummary.unit}
                </span>
              </div>
            </div>

            {isEnterpriseOverMax ? (
              <button
                type="button"
                onClick={() => onContactUs?.()}
                className="w-full py-3 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Please contact us</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                className="w-full py-3 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>
                  {hasTrial
                    ? 'Start 14-Day Free Trial'
                    : isFree
                      ? 'Activate Free Trace Sketch'
                      : isEnterprise
                        ? 'Request Masterplan Invoice'
                        : isUniversity
                          ? 'Verify Trace Academy'
                          : `Activate ${plan.name}`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}

            <div className="flex items-center justify-center gap-1.5 text-xs text-[#202427]/65 text-center">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>
                Yearly saves up to 30% · Weekly &amp; monthly cancel anytime · Prices excl. VAT
              </span>
            </div>
          </form>
        ) : (
          <div className="p-6 space-y-5">
            <div className="p-4 rounded-lg bg-[#202427] text-[#F7F6F2] flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[#E9B949] text-[#202427] flex items-center justify-center shrink-0 mt-0.5">
                <Check className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-base font-semibold">
                  {plan.name} activated for {organization}
                </h4>
                <p className="text-xs text-[#A9AFB0] mt-1">
                  {plan.tokensPerMonth} Tokens/mo · {plan.sheetsPerMonth} sheets/mo ·{' '}
                  {selectedCloudTier
                    ? `${plan.cloudStorage} + ${selectedCloudTier.label}`
                    : plan.cloudStorage}{' '}
                  for <span className="text-[#F7F6F2] font-mono">{email}</span>.
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-[#202427]/85">
              <p className="font-medium text-[#202427]">Included capabilities:</p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-[#202427] shrink-0" />
                  <span>
                    Geometry Core, Double Check, Proof Lens &amp; EU Trace Cloud
                  </span>
                </li>
                {plan.features.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-[#202427] shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={onLaunchWorkspace || onClose}
                className="flex-1 py-2.5 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Open Demo Version Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
