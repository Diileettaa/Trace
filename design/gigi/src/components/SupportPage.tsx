import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  HelpCircle,
  Mail,
  Send,
} from 'lucide-react';
import { SUPPORT_QA } from '../data/traceData';

interface SupportPageProps {
  onBackHome: () => void;
  onOpenEducation: () => void;
}

export const SupportPage: React.FC<SupportPageProps> = ({
  onBackHome,
  onOpenEducation,
}) => {
  const [openQaId, setOpenQaId] = useState<string>(SUPPORT_QA[0].id);
  const [contactEmail, setContactEmail] = useState('');
  const [contactTopic, setContactTopic] = useState('General Support & CAD Formats');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitted, setContactSubmitted] = useState(false);

  const handleSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.includes('@') || contactMessage.trim().length < 4) return;
    setContactSubmitted(true);
    setContactEmail('');
    setContactMessage('');
  };

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

          <div className="max-w-2xl mb-10">
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
              Learning &amp; Support · Stoa Help Center
            </p>
            <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#202427] leading-[1.08] [text-wrap:balance]">
              Q&amp;As, onboarding guides &amp; direct engineering support.
            </h1>
            <p className="mt-3 text-base text-[#202427]/75 leading-relaxed">
              Learn how to set up AI Scale LoD, verify rough-in photos on site, or reach the Stoa team for enterprise &amp; university rollouts.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left: Interactive Q&A Accordion + Learning Quick Cards */}
            <div className="lg:col-span-7 space-y-6">
              <div className="space-y-3">
                {SUPPORT_QA.map((item) => {
                  const isOpen = openQaId === item.id;
                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#A9AFB0]/50 bg-white overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenQaId((prev) => (prev === item.id ? '' : item.id))
                        }
                        className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F7F6F2]/60 transition-colors cursor-pointer"
                      >
                        <div>
                          <span className="text-[11px] font-mono text-[#9A7218] block mb-0.5">
                            {item.topic}
                          </span>
                          <span className="text-sm sm:text-base font-semibold text-[#202427]">
                            {item.question}
                          </span>
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-[#202427]/65 shrink-0 transition-transform ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 pt-1 text-sm text-[#202427]/80 leading-relaxed border-t border-[#A9AFB0]/20">
                          {item.answer}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Training / Education Link Banner */}
              <div className="p-6 rounded-xl border border-[#A9AFB0]/50 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-[#9A7218] mt-0.5 shrink-0" />
                  <div>
                    <h2 className="text-base font-semibold text-[#202427]">
                      Looking for live seminars &amp; BIM workshops?
                    </h2>
                    <p className="text-sm text-[#202427]/75 mt-0.5">
                      Weekly 90-minute training tracks are included free with Trace Campus &amp; yearly team seats.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenEducation}
                  className="px-4 py-2 rounded-lg border border-[#202427] text-xs font-semibold text-[#202427] hover:bg-[#202427] hover:text-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  View Seminars &amp; Education
                </button>
              </div>
            </div>

            {/* Right: Direct Stoa & Trace. Support Contact Form */}
            <div className="lg:col-span-5">
              <div className="p-7 rounded-2xl bg-[#202427] text-[#F7F6F2] border border-[#202427]">
                <div className="flex items-center gap-2 text-xs font-mono text-[#E9B949] mb-2">
                  <HelpCircle className="w-4 h-4" />
                  <span>Contact Stoa Engineering Desk</span>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Message our team directly.
                </h2>
                <p className="mt-2 text-sm text-[#A9AFB0] leading-relaxed">
                  Ask about DWG/IFC imports, Trace Masterplan ERP connectors, or onboarding your construction site.
                </p>

                {contactSubmitted ? (
                  <div className="mt-6 p-4 rounded-xl bg-white/10 border border-[#E9B949]/50 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#E9B949]">
                      <Check className="w-4 h-4" />
                      <span>Support request sent to Stoa</span>
                    </div>
                    <p className="text-xs text-[#F7F6F2]/80">
                      Our Helsinki / Munich engineering desk will reply within one business day.
                    </p>
                    <button
                      type="button"
                      onClick={() => setContactSubmitted(false)}
                      className="text-xs font-mono text-[#E9B949] underline cursor-pointer pt-1"
                    >
                      Send another message
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSupportSubmit} className="mt-6 space-y-3.5">
                    <div>
                      <label
                        htmlFor="support-topic"
                        className="block text-xs font-medium text-[#A9AFB0] mb-1"
                      >
                        Topic
                      </label>
                      <select
                        id="support-topic"
                        value={contactTopic}
                        onChange={(e) => setContactTopic(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm bg-[#2D3236] border border-white/20 rounded-lg text-[#F7F6F2] focus:outline-none focus:border-[#E9B949]"
                      >
                        <option>General Support &amp; CAD Formats</option>
                        <option>Trace Business (Studio / Site / Masterplan)</option>
                        <option>University &amp; Education License</option>
                        <option>Site Photo Verification &amp; Hardware</option>
                      </select>
                    </div>
                    <div>
                      <label
                        htmlFor="support-email"
                        className="block text-xs font-medium text-[#A9AFB0] mb-1"
                      >
                        Work or University Email
                      </label>
                      <input
                        id="support-email"
                        type="email"
                        required
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="name@company-or-uni.fi"
                        className="w-full px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 rounded-lg text-[#F7F6F2] placeholder:text-[#A9AFB0]/60 focus:outline-none focus:border-[#E9B949]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="support-msg"
                        className="block text-xs font-medium text-[#A9AFB0] mb-1"
                      >
                        Your Question
                      </label>
                      <textarea
                        id="support-msg"
                        rows={4}
                        required
                        value={contactMessage}
                        onChange={(e) => setContactMessage(e.target.value)}
                        placeholder="Tell us about your project, drawing formats, or team size..."
                        className="w-full px-3.5 py-2.5 text-sm bg-white/10 border border-white/20 rounded-lg text-[#F7F6F2] placeholder:text-[#A9AFB0]/60 focus:outline-none focus:border-[#E9B949]"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2.5 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Support Request</span>
                    </button>
                  </form>
                )}

                <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-[#A9AFB0]">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#E9B949]" />
                    support@stoabuild.com
                  </span>
                  <span>Helsinki · Munich</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
