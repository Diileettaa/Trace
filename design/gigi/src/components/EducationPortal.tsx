import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  GraduationCap,
  Lock,
  MapPin,
  Search,
  Video,
} from 'lucide-react';
import {
  CAMPUS_WORKSHOPS,
  EDUCATION_EVENTS,
  PARTNER_UNIVERSITIES,
} from '../data/traceData';

interface EducationPortalProps {
  hasActiveSubscription: boolean;
  activePlanName?: string;
  scrollToSeminars?: boolean;
  onScrolledToSeminars?: () => void;
  onBackToCommercial: () => void;
  onOpenPlans: () => void;
  onOpenAccount: () => void;
  onUnlockSubscription?: (planName: string) => void;
}

export const EducationPortal: React.FC<EducationPortalProps> = ({
  hasActiveSubscription,
  activePlanName,
  scrollToSeminars = false,
  onScrolledToSeminars,
  onBackToCommercial,
  onOpenPlans,
  onOpenAccount,
  onUnlockSubscription,
}) => {
  const seminarsSectionRef = useRef<HTMLElement>(null);
  const [universityInput, setUniversityInput] = useState<string>('aalto.fi');
  const [studentEmail, setStudentEmail] = useState<string>('');
  const [activationResult, setActivationResult] = useState<
    | { status: 'verified'; university: string }
    | { status: 'request'; domain: string }
    | null
  >(null);

  // University Outreach Request ("Your university not found?")
  const [requestedUniName, setRequestedUniName] = useState<string>('');
  const [requestedUniEmail, setRequestedUniEmail] = useState<string>('');
  const [uniOutreachSent, setUniOutreachSent] = useState<string | null>(null);

  // Seminars, Events & Trainings (Online / On-Site, Subscription-gated)
  const [eventFilter, setEventFilter] = useState<'All' | 'Online' | 'On-Site'>(
    'All'
  );
  const [registeredEventIds, setRegisteredEventIds] = useState<string[]>([]);
  const [subscriptionNoticeEventId, setSubscriptionNoticeEventId] = useState<
    string | null
  >(null);

  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    if (scrollToSeminars && seminarsSectionRef.current) {
      seminarsSectionRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      onScrolledToSeminars?.();
    }
  }, [scrollToSeminars, onScrolledToSeminars]);

  const matchedUniversity = PARTNER_UNIVERSITIES.find(
    (u) =>
      universityInput.toLowerCase().includes(u.domain) ||
      universityInput.toLowerCase().includes(u.name.toLowerCase())
  );

  const handleActivateStudent = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = studentEmail.trim().toLowerCase();
    if (!cleaned.includes('@') || !cleaned.includes('.')) return;

    const domainPart = cleaned.split('@')[1] || '';
    const found = PARTNER_UNIVERSITIES.find((u) => domainPart.endsWith(u.domain));
    if (found) {
      setActivationResult({ status: 'verified', university: found.name });
      onUnlockSubscription?.(`Trace Academy (${found.name})`);
    } else {
      setActivationResult({ status: 'request', domain: domainPart });
    }
  };

  const handleUniversityOutreachSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requestedUniName.trim().length < 2) return;
    setUniOutreachSent(requestedUniName.trim());
    setRequestedUniName('');
    setRequestedUniEmail('');
  };

  const handleEventRegister = (eventId: string) => {
    if (!hasActiveSubscription) {
      setSubscriptionNoticeEventId(eventId);
      return;
    }
    setSubscriptionNoticeEventId(null);
    setRegisteredEventIds((prev) =>
      prev.includes(eventId) ? prev : [...prev, eventId]
    );
  };

  const filteredEvents = EDUCATION_EVENTS.filter((evt) =>
    eventFilter === 'All' ? true : evt.format === eventFilter
  );

  return (
    <div className="min-h-[82vh] bg-[#F7F6F2] text-[#202427]">
      {/* Campus Hero */}
      <section className="py-12 sm:py-16 border-b border-[#A9AFB0]/35 blueprint-grid-bg">
        <div className="max-w-[1200px] mx-auto px-6">
          <button
            type="button"
            onClick={onBackToCommercial}
            className="inline-flex items-center gap-2 text-sm font-medium text-[#202427]/75 hover:text-[#202427] mb-8 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Trace. Overview</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-mono text-[#202427]/70 mb-3">
                  University · Trace Academy
                </p>

                {/* Highlighted Price Callout: €49/mo crossed out with yellow pen stroke -> €0 highlighted */}
                <div className="inline-flex flex-wrap items-center gap-3.5 mb-4 px-4 py-2.5 rounded-xl bg-[#202427] text-[#F7F6F2] border border-[#202427]">
                  <span className="relative inline-block text-xl sm:text-2xl font-display font-semibold text-[#A9AFB0] tabular-nums px-1">
                    €49/mo
                    <svg
                      viewBox="0 0 100 28"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    >
                      <path
                        d="M3 21 Q 48 11 97 7"
                        stroke="#E9B949"
                        strokeWidth="4.2"
                        strokeLinecap="round"
                        fill="none"
                      />
                    </svg>
                  </span>
                  <ArrowRight className="w-4 h-4 text-[#E9B949] shrink-0" />
                  <span className="inline-flex items-baseline gap-1.5 bg-[#E9B949] text-[#202427] px-3 py-0.5 rounded-lg">
                    <span className="text-3xl sm:text-4xl font-display font-bold tabular-nums leading-none">
                      €0
                    </span>
                    <span className="text-xs font-mono font-semibold">
                      / Student ID
                    </span>
                  </span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#202427] [text-wrap:balance] leading-[1.08]">
                  €0 per Student ID at registered universities.
                </h1>
                <p className="mt-4 text-base text-[#202427]/80 leading-relaxed max-w-xl">
                  Trace Academy is €0 per student ID (1 student: 100 Tokens/mo, 10 sheets/mo, 10 GB Trace Cloud) — exclusively if your university has registered. If your university is not registered yet, you must use an Individual plan (Trace Sketch or Trace Pro).
                </p>
              </div>

              {/* University Eligibility Quick Checker */}
              <div className="mt-8 p-5 rounded-xl bg-white/90 border border-[#A9AFB0]/50 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#202427]">
                    Verify Trace Academy university registration
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="relative text-xs font-mono text-[#202427]/50 px-0.5">
                      €49
                      <span
                        aria-hidden="true"
                        className="absolute left-0 right-0 top-1/2 -rotate-12 h-[2px] bg-[#E9B949]"
                      />
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#E9B949] text-[#202427] text-sm font-display font-bold">
                      €0 / Student ID
                    </span>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-4 h-4 text-[#202427]/50 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={universityInput}
                    onChange={(e) => setUniversityInput(e.target.value)}
                    placeholder="Type university name or domain (e.g. aalto.fi, tum.de)"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-[#F7F6F2] border border-[#A9AFB0]/50 rounded-lg text-[#202427] focus:outline-none focus:border-[#202427]"
                  />
                </div>

                {matchedUniversity ? (
                  <div className="text-xs text-[#202427] flex items-center justify-between gap-2 bg-[#E9B949]/20 px-3 py-2 rounded-lg">
                    <span className="font-medium">
                      {matchedUniversity.name} ({matchedUniversity.city}) — Campus License Active
                    </span>
                    <span className="font-mono tabular-nums">
                      {matchedUniversity.activeSeats} students
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-[#202427]/70 px-1">
                    Not listed yet? Request university outreach below so Trace can register your campus.
                  </div>
                )}

                <form onSubmit={handleActivateStudent} className="flex flex-col sm:flex-row gap-2.5">
                  <input
                    type="email"
                    required
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    placeholder="Enter your university email (e.g. anna@aalto.fi)"
                    className="flex-1 px-3 py-2 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg text-[#202427] focus:outline-none focus:border-[#202427]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-[#202427] text-[#F7F6F2] text-sm font-semibold hover:bg-[#202427]/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Verify Trace Academy
                  </button>
                </form>

                {activationResult?.status === 'verified' && (
                  <div className="p-3 rounded-lg bg-[#202427] text-[#F7F6F2] text-xs flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#E9B949] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#E9B949]">
                        Trace Academy Verified for {activationResult.university}.
                      </span>{' '}
                      Your 1-student account (€0/student ID · 100 Tokens/mo · 10 sheets/mo · 10 GB Trace Cloud) is ready.
                    </div>
                  </div>
                )}

                {activationResult?.status === 'request' && (
                  <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/60 text-xs text-[#202427]">
                    <span className="font-mono font-medium">@{activationResult.domain}</span> is not registered for Trace Academy yet. Until your university registers, please use an Individual plan (Trace Sketch or Trace Pro) or submit your university below.
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] rounded-xl overflow-hidden border border-[#A9AFB0]/50 bg-[#202427] relative">
                {!imgFailed ? (
                  <img
                    src="/src/assets/images/campus_architecture_studio_1794662440156.jpg"
                    alt="Architecture and civil engineering students reviewing floorplans in a Nordic studio"
                    referrerPolicy="no-referrer"
                    onError={() => setImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center text-[#F7F6F2]">
                    <GraduationCap className="w-10 h-10 text-[#E9B949] mb-3" />
                    <p className="font-semibold">Trace. Academic Studio Lab</p>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent p-5 text-[#F7F6F2]">
                  <p className="text-xs font-mono text-[#E9B949]">
                    Academic Curriculum · Studio &amp; Field Lab
                  </p>
                  <p className="text-sm mt-1">
                    Bringing real MEP coordination, site photo verification, and trade scheduling into university design studios.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* University Not Found / Request Registration Section */}
      <section className="py-12 border-b border-[#A9AFB0]/35 bg-white/60">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="rounded-2xl border border-[#A9AFB0]/50 bg-white p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
                <Building2 className="w-4 h-4" />
                <span>University Not Registered Yet?</span>
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[#202427]">
                Didn&apos;t find your university? Request campus onboarding.
              </h2>
              <p className="mt-2 text-sm text-[#202427]/75 leading-relaxed">
                Enter the name of your university or faculty below. Our Academic Desk will reach out directly to your university administration so students can unlock Trace Academy for €0 per student ID.
              </p>
            </div>

            <div className="lg:col-span-6">
              {uniOutreachSent ? (
                <div className="p-5 rounded-xl bg-[#202427] text-[#F7F6F2] space-y-2.5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[#E9B949]">
                    <Check className="w-4 h-4" />
                    <span>Outreach requested for {uniOutreachSent}</span>
                  </div>
                  <p className="text-xs text-[#A9AFB0] leading-relaxed">
                    Thank you! Stoa&apos;s Trace Academy team will contact {uniOutreachSent} to set up university verification. In the meantime, you can start with Trace Sketch (€0) or Trace Pro.
                  </p>
                  <button
                    type="button"
                    onClick={() => setUniOutreachSent(null)}
                    className="text-xs font-mono text-[#E9B949] underline cursor-pointer pt-1"
                  >
                    Submit another university
                  </button>
                </div>
              ) : (
                <form
                  onSubmit={handleUniversityOutreachSubmit}
                  className="space-y-3"
                >
                  <div>
                    <label
                      htmlFor="uni-request-name"
                      className="block text-xs font-medium text-[#202427]/75 mb-1"
                    >
                      University Name
                    </label>
                    <input
                      id="uni-request-name"
                      type="text"
                      required
                      value={requestedUniName}
                      onChange={(e) => setRequestedUniName(e.target.value)}
                      placeholder="e.g. Technical University of Berlin / Politecnico di Milano"
                      className="w-full px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="email"
                      value={requestedUniEmail}
                      onChange={(e) => setRequestedUniEmail(e.target.value)}
                      placeholder="Optional: Your student or faculty email for updates"
                      className="flex-1 px-3.5 py-2.5 text-sm bg-[#F7F6F2] border border-[#A9AFB0]/60 rounded-lg focus:outline-none focus:border-[#202427]"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2.5 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Request University Contact
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Seminars, Events & Trainings (Online or On-Site, Subscription Required) */}
      <section
        id="education-seminars"
        ref={seminarsSectionRef}
        className="py-16 border-b border-[#A9AFB0]/35 scroll-mt-16"
      >
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
            <div className="max-w-2xl">
              <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#9A7218] mb-2">
                Seminars, Events &amp; Trainings · Online &amp; On-Site
              </p>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202427]">
                Attend live workshops, events &amp; hands-on trainings.
              </h2>
              <p className="mt-2 text-sm text-[#202427]/75 leading-relaxed">
                Join online webinars or on-site studio trainings with practicing architects and MEP leads. Registration is available exclusively with an active Trace subscription (Individual, Business, or verified Trace Academy).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 self-start lg:self-auto">
              {/* Subscription Status Pill/Box */}
              <div
                className={`px-3.5 py-2 rounded-lg border text-xs font-mono flex items-center gap-2 ${
                  hasActiveSubscription
                    ? 'bg-[#202427] text-[#F7F6F2] border-[#202427]'
                    : 'bg-white text-[#202427] border-[#A9AFB0]/60'
                }`}
              >
                {hasActiveSubscription ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#E9B949]" />
                    <span>
                      Subscription active: {activePlanName || 'Trace Pro'}
                    </span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-[#9A7218]" />
                    <span>Subscription required to register</span>
                  </>
                )}
              </div>

              {/* Format Filter */}
              <div className="inline-flex items-center p-1 rounded-lg bg-white border border-[#A9AFB0]/50">
                {(['All', 'Online', 'On-Site'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setEventFilter(fmt)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                      eventFilter === fmt
                        ? 'bg-[#202427] text-[#E9B949]'
                        : 'text-[#202427]/75 hover:text-[#202427]'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredEvents.map((evt) => {
              const isRegistered = registeredEventIds.includes(evt.id);
              const showLockWarning = subscriptionNoticeEventId === evt.id;

              return (
                <article
                  key={evt.id}
                  className="p-6 rounded-xl border border-[#A9AFB0]/50 bg-white flex flex-col justify-between gap-5"
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-[#9A7218]">
                        {evt.format === 'Online' ? (
                          <Video className="w-3.5 h-3.5" />
                        ) : (
                          <MapPin className="w-3.5 h-3.5" />
                        )}
                        {evt.format} · {evt.category}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-mono text-[#202427]/65">
                        <Calendar className="w-3.5 h-3.5" />
                        {evt.date} · {evt.duration}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-[#202427] leading-snug">
                      {evt.title}
                    </h3>
                    <p className="text-xs font-mono text-[#202427]/65 mt-1">
                      {evt.location}
                    </p>
                    <p className="mt-3 text-sm text-[#202427]/80 leading-relaxed">
                      {evt.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-[#A9AFB0]/25 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-[#202427]/65">
                        {hasActiveSubscription
                          ? 'Included in your subscription'
                          : 'Active Trace subscription required'}
                      </span>

                      {isRegistered ? (
                        <span className="px-4 py-2 rounded-lg bg-[#202427] text-[#E9B949] text-xs font-semibold inline-flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>Registered</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEventRegister(evt.id)}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer inline-flex items-center gap-1.5 ${
                            hasActiveSubscription
                              ? 'bg-[#E9B949] text-[#202427] hover:bg-[#E9B949]/90'
                              : 'bg-[#A9AFB0]/35 text-[#202427]/70 hover:bg-[#A9AFB0]/50'
                          }`}
                        >
                          {!hasActiveSubscription && (
                            <Lock className="w-3.5 h-3.5" />
                          )}
                          <span>Register for {evt.category}</span>
                        </button>
                      )}
                    </div>

                    {showLockWarning && !hasActiveSubscription && (
                      <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#E9B949] text-xs text-[#202427] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span>
                          Registration requires an active Trace subscription (or verified Trace Academy).
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={onOpenAccount}
                            className="font-semibold underline cursor-pointer"
                          >
                            Sign in
                          </button>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={onOpenPlans}
                            className="font-semibold text-[#9A7218] underline cursor-pointer"
                          >
                            View Plans
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Included for 1 Student in Trace Academy */}
      <section className="py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202427]">
              Included for 1 Student in Trace Academy
            </h2>
            <p className="mt-2 text-sm text-[#202427]/75 leading-relaxed">
              Every verified student ID at a registered university receives a personal Trace Academy seat with 100 Tokens/mo, 10 sheets/mo, and 10 GB Trace Cloud.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {CAMPUS_WORKSHOPS.map((w) => (
              <div
                key={w.number}
                className="p-6 rounded-xl border border-[#A9AFB0]/50 bg-white/75 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2 mb-3">
                    <span className="text-sm font-mono font-semibold text-[#202427]">
                      {w.number}
                    </span>
                    <span className="text-xs font-mono text-[#202427]/65">
                      {w.duration}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#202427] leading-snug">
                    {w.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-[#202427]/75 leading-relaxed">
                    {w.summary}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#A9AFB0]/25 text-xs font-medium text-[#202427]">
                  Included with Trace Academy
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
