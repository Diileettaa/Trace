// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
import React, { useState } from 'react';
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react';
import { type ProductPlan } from '../data/traceData';

interface CheckoutModalProps {
  plan: ProductPlan | null;
  initialBilling: 'annual' | 'monthly';
  onClose: () => void;
  onLaunchWorkspace?: () => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  plan,
  initialBilling,
  onClose,
  onLaunchWorkspace,
}) => {
  const [billing, setBilling] = useState<'annual' | 'monthly'>(initialBilling);
  const [seats, setSeats] = useState<number>(3);
  const [email, setEmail] = useState<string>('');
  const [organization, setOrganization] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isProvisioned, setIsProvisioned] = useState<boolean>(false);

  if (!plan) return null;

  const unitPrice = billing === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  const totalMonthly = unitPrice * seats;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter a valid work email address.');
      return;
    }
    if (organization.trim().length < 2) {
      setError('Please enter your company or studio name.');
      return;
    }
    setError('');
    setIsProvisioned(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-modal-title"
    >
      <div className="w-full max-w-lg rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-[#E9B949]">
              Stoa / Trace. Subscription
            </p>
            <h3 id="checkout-modal-title" className="text-lg font-semibold">
              {isProvisioned ? 'Workspace Ready' : `Activate ${plan.name}`}
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
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Billing Toggle + Seats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#202427]/75 mb-1.5">
                  Billing Cycle
                </label>
                <div className="grid grid-cols-2 p-1 rounded-lg bg-[#202427]/5 border border-[#A9AFB0]/40">
                  <button
                    type="button"
                    onClick={() => setBilling('annual')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      billing === 'annual'
                        ? 'bg-[#202427] text-[#F7F6F2]'
                        : 'text-[#202427]/75'
                    }`}
                  >
                    Yearly · Save 30%
                  </button>
                  <button
                    type="button"
                    onClick={() => setBilling('monthly')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                      billing === 'monthly'
                        ? 'bg-[#202427] text-[#F7F6F2]'
                        : 'text-[#202427]/75'
                    }`}
                  >
                    Monthly
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="seat-count"
                  className="block text-xs font-medium text-[#202427]/75 mb-1.5"
                >
                  Team Seats
                </label>
                <div className="flex items-center justify-between border border-[#A9AFB0]/50 bg-white rounded-lg px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setSeats((s) => Math.max(1, s - 1))}
                    className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                    aria-label="Decrease seats"
                  >
                    −
                  </button>
                  <span
                    id="seat-count"
                    className="text-sm font-mono font-semibold tabular-nums"
                  >
                    {seats} {seats === 1 ? 'seat' : 'seats'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSeats((s) => Math.min(50, s + 1))}
                    className="w-6 h-6 rounded text-sm font-semibold hover:bg-[#202427]/10 cursor-pointer"
                    aria-label="Increase seats"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Email & Organization */}
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="work-email"
                  className="block text-xs font-medium text-[#202427]/75 mb-1"
                >
                  Work Email
                </label>
                <input
                  id="work-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@studio-nordic.fi"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                />
              </div>
              <div>
                <label
                  htmlFor="org-name"
                  className="block text-xs font-medium text-[#202427]/75 mb-1"
                >
                  Company or Project Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  required
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="Nordic Interior & MEP Partners"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-700 font-medium">{error}</p>}

            {/* Summary Strip */}
            <div className="p-4 rounded-lg bg-white border border-[#A9AFB0]/45 flex items-center justify-between">
              <div>
                <div className="text-xs text-[#202427]/65">
                  14-day free trial · Then €{unitPrice}/seat/mo
                </div>
                <div className="text-sm font-semibold text-[#202427]">
                  Total after trial
                </div>
              </div>
              <div className="text-right">
                <span className="text-2xl font-display font-semibold tabular-nums">
                  €{totalMonthly}
                </span>
                <span className="text-xs text-[#202427]/65"> / mo</span>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Start 14-Day Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-[#202427]/65">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Cancel anytime during trial · No upfront charge today</span>
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
                  {seats} {seats === 1 ? 'seat' : 'seats'} provisioned for{' '}
                  <span className="text-[#F7F6F2] font-mono">{email}</span> ({billing === 'annual' ? 'yearly · save 30%' : 'monthly'} billing after 14-day trial).
                </p>
              </div>
            </div>

            <div className="space-y-2 text-sm text-[#202427]/85">
              <p className="font-medium text-[#202427]">Unlocked capabilities:</p>
              <ul className="space-y-1.5 text-xs">
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
