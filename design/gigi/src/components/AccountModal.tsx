import React, { useState } from 'react';
import {
  Building2,
  Check,
  CreditCard,
  GraduationCap,
  LogOut,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenPlans: () => void;
  onOpenEducation: () => void;
  onOpenDemo: () => void;
  onSubscriptionChange?: (hasSub: boolean, planName?: string) => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  onOpenPlans,
  onOpenEducation,
  onOpenDemo,
  onSubscriptionChange,
}) => {
  const [signedInUser, setSignedInUser] = useState<{
    name: string;
    email: string;
    org: string;
    plan: string;
    seats: string;
    billing: string;
  } | null>({
    name: 'Elena Lindholm',
    email: 'elena@studio-nordic.fi',
    org: 'Nordic Interior & MEP Partners',
    plan: 'Trace Pro (Yearly · Save up to 30%)',
    seats: '1 seat · 500 Tokens / mo · 8 sheets / mo',
    billing: 'Renews 14 Nov 2027 · €39 / mo (€468 / year, excl. VAT)',
  });

  const [loginEmail, setLoginEmail] = useState('elena@studio-nordic.fi');
  const [loginPassword, setLoginPassword] = useState('••••••••••••');

  if (!isOpen) return null;

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.includes('@')) return;
    const planLabel = 'Trace Pro (Yearly · Save up to 30%)';
    setSignedInUser({
      name: loginEmail.split('@')[0].replace('.', ' '),
      email: loginEmail,
      org: 'Stoa Partner Studio',
      plan: planLabel,
      seats: '1 seat · 500 Tokens / mo · 8 sheets / mo',
      billing: 'Active · €39 / mo · €468 / year (excl. VAT)',
    });
    onSubscriptionChange?.(true, planLabel);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E9B949]/15 border border-[#E9B949]/40 flex items-center justify-center text-[#E9B949]">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-[#E9B949]">
                Stoa ID · Trace. Account
              </p>
              <h3 id="account-modal-title" className="text-base font-semibold">
                {signedInUser ? 'Account & Subscriptions' : 'Sign in to Trace.'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close account dialog"
            className="p-1.5 rounded-lg text-[#A9AFB0] hover:text-[#F7F6F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {signedInUser ? (
          <div className="p-6 space-y-5">
            {/* Profile Summary */}
            <div className="p-4 rounded-xl bg-white border border-[#A9AFB0]/45 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#202427] capitalize">
                  {signedInUser.name}
                </div>
                <div className="text-xs font-mono text-[#202427]/70 mt-0.5">
                  {signedInUser.email}
                </div>
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#202427]/75">
                  <Building2 className="w-3.5 h-3.5 text-[#9A7218]" />
                  <span>{signedInUser.org}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSignedInUser(null);
                  onSubscriptionChange?.(false);
                }}
                className="text-xs font-medium text-[#202427]/70 hover:text-[#202427] inline-flex items-center gap-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>

            {/* Active Subscription Box */}
            <div className="p-4 rounded-xl bg-[#202427] text-[#F7F6F2] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-mono text-[#E9B949] inline-flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5" />
                  ACTIVE SUBSCRIPTION
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#E9B949] text-[#202427] font-semibold">
                  Yearly · Save up to 30%
                </span>
              </div>
              <div>
                <div className="text-base font-semibold">{signedInUser.plan}</div>
                <div className="text-xs text-[#A9AFB0] mt-0.5">
                  {signedInUser.seats} · {signedInUser.billing}
                </div>
              </div>
              <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-[#F7F6F2]/85">
                  <Check className="w-3.5 h-3.5 text-[#E9B949]" />
                  <span>Geometry Core &amp; Proof Lens</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#F7F6F2]/85">
                  <Check className="w-3.5 h-3.5 text-[#E9B949]" />
                  <span>10 GB EU Trace Cloud</span>
                </div>
              </div>
            </div>

            {/* Quick Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPlans();
                }}
                className="py-2.5 px-3.5 rounded-lg bg-white border border-[#A9AFB0]/60 text-xs font-semibold text-[#202427] hover:border-[#202427] transition-colors cursor-pointer"
              >
                Manage Plans &amp; Seats
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEducation();
                }}
                className="py-2.5 px-3.5 rounded-lg bg-white border border-[#A9AFB0]/60 text-xs font-semibold text-[#202427] hover:border-[#202427] transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Verify Trace Academy</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenDemo();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors cursor-pointer"
            >
              Launch Demo Version Workspace
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignIn} className="p-6 space-y-4">
            <p className="text-xs text-[#202427]/75 leading-relaxed">
              Sign in with your Stoa or studio account to manage Trace Sketch, Pro, Studio, Site, Masterplan, or Trace Academy licences.
            </p>
            <div>
              <label
                htmlFor="stoa-account-email"
                className="block text-xs font-medium text-[#202427]/75 mb-1"
              >
                Work or University Email
              </label>
              <input
                id="stoa-account-email"
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
              />
            </div>
            <div>
              <label
                htmlFor="stoa-account-pw"
                className="block text-xs font-medium text-[#202427]/75 mb-1"
              >
                Password
              </label>
              <input
                id="stoa-account-pw"
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-[#202427] text-[#F7F6F2] text-sm font-semibold hover:bg-[#202427]/90 transition-colors cursor-pointer"
            >
              Sign in to Stoa / Trace.
            </button>
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#202427]/65">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>EU-hosted license &amp; drawing encryption</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
