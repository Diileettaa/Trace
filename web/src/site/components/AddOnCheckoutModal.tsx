// @ts-nocheck -- Gigi's design code copied from design/gigi (AI Studio), kept as-is
import React, { useState } from 'react';
import { ArrowRight, Check, CreditCard, ShieldCheck, X } from 'lucide-react';

export interface SelectedAddOnCheckout {
  kind: 'token-pack' | 'cloud-plus';
  title: string;
  subtitle: string;
  price: number;
  billingLabel: string;
}

interface AddOnCheckoutModalProps {
  item: SelectedAddOnCheckout | null;
  onClose: () => void;
}

const PAYMENT_METHODS = [
  { id: 'card', label: 'Credit / Debit Card', detail: 'Visa, Mastercard, Amex' },
  { id: 'sepa', label: 'SEPA Direct Debit', detail: 'Instant EU IBAN mandate' },
  { id: 'paypal', label: 'PayPal', detail: 'Express checkout' },
  { id: 'invoice', label: 'Company Invoice', detail: 'Net 14 days (B2B)' },
];

export const AddOnCheckoutModal: React.FC<AddOnCheckoutModalProps> = ({
  item,
  onClose,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<string>('card');
  const [email, setEmail] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isPurchased, setIsPurchased] = useState<boolean>(false);

  if (!item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || !email.includes('.')) {
      setError('Please enter your Trace account email address.');
      return;
    }
    setError('');
    setIsPurchased(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="addon-checkout-title"
    >
      <div className="w-full max-w-md rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#E9B949]/15 border border-[#E9B949]/40 flex items-center justify-center text-[#E9B949]">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-[#E9B949]">
                Trace Add-on Checkout
              </p>
              <h3 id="addon-checkout-title" className="text-base font-semibold">
                {isPurchased ? 'Add-on Activated' : item.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add-on checkout"
            className="p-1.5 rounded-lg text-[#A9AFB0] hover:text-[#F7F6F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {!isPurchased ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Selected Package Summary */}
            <div className="p-4 rounded-lg bg-white border border-[#A9AFB0]/50 flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#202427]">
                  {item.title}
                </div>
                <div className="text-xs text-[#202427]/65 mt-0.5">
                  {item.subtitle}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-display font-semibold tabular-nums text-[#202427]">
                  €{item.price}
                </div>
                <div className="text-[11px] font-mono text-[#9A7218]">
                  {item.billingLabel} · excl. VAT
                </div>
              </div>
            </div>

            {/* Payment Options */}
            <div>
              <span className="block text-xs font-medium text-[#202427]/75 mb-2">
                Select Payment Option
              </span>
              <div className="grid grid-cols-2 gap-2">
                {PAYMENT_METHODS.map((pm) => {
                  const selected = paymentMethod === pm.id;
                  return (
                    <button
                      key={pm.id}
                      type="button"
                      onClick={() => setPaymentMethod(pm.id)}
                      className={`p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#202427] text-[#F7F6F2] border-[#202427]'
                          : 'bg-white text-[#202427] border-[#A9AFB0]/50 hover:border-[#202427]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{pm.label}</div>
                      <div
                        className={`text-[10px] mt-0.5 ${
                          selected ? 'text-[#E9B949]' : 'text-[#202427]/60'
                        }`}
                      >
                        {pm.detail}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Account Email */}
            <div>
              <label
                htmlFor="addon-account-email"
                className="block text-xs font-medium text-[#202427]/75 mb-1"
              >
                Trace Account Email
              </label>
              <input
                id="addon-account-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@studio-nordic.fi"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
              />
            </div>

            {error && <p className="text-xs text-red-700 font-medium">{error}</p>}

            <button
              type="submit"
              className="w-full py-3 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>
                Complete Purchase · €{item.price}{' '}
                {item.kind === 'cloud-plus' ? '/ mo' : ''}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-center gap-1.5 text-xs text-[#202427]/65">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Prices exclude VAT · Instant activation on your paid plan</span>
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
                  {item.title} added to your account
                </h4>
                <p className="text-xs text-[#A9AFB0] mt-1">
                  Assigned to <span className="text-[#F7F6F2] font-mono">{email}</span> via{' '}
                  {PAYMENT_METHODS.find((m) => m.id === paymentMethod)?.label} (€
                  {item.price} {item.billingLabel}, excl. VAT).
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-lg bg-[#202427] text-[#F7F6F2] text-sm font-semibold hover:bg-[#202427]/90 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
