import React, { useState } from 'react';
import { ArrowLeft, Check, GraduationCap, Search } from 'lucide-react';
import { CAMPUS_WORKSHOPS, PARTNER_UNIVERSITIES } from '../data/traceData';

interface EducationPortalProps {
  onBackToCommercial: () => void;
}

export const EducationPortal: React.FC<EducationPortalProps> = ({
  onBackToCommercial,
}) => {
  const [universityInput, setUniversityInput] = useState<string>('aalto.fi');
  const [studentEmail, setStudentEmail] = useState<string>('');
  const [activationResult, setActivationResult] = useState<
    | { status: 'verified'; university: string }
    | { status: 'request'; domain: string }
    | null
  >(null);
  const [imgFailed, setImgFailed] = useState(false);

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
    } else {
      setActivationResult({ status: 'request', domain: domainPart });
    }
  };

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
            <span>Back to Trace. Commercial</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div>
                <p className="text-xs font-mono text-[#202427]/70 mb-3">
                  Trace Campus · Academic &amp; Student Edition
                </p>
                <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[#202427] [text-wrap:balance] leading-[1.08]">
                  Free for architecture &amp; engineering students.
                </h1>
                <p className="mt-4 text-base text-[#202427]/80 leading-relaxed max-w-xl">
                  When your university holds an institutional Trace. license, every enrolled student receives full access to Trace Complete—including 2D-to-3D drawing verification, site photo labs, and hands-on workshops at zero cost.
                </p>
              </div>

              {/* University Eligibility Quick Checker */}
              <div className="mt-8 p-5 rounded-xl bg-white/85 border border-[#A9AFB0]/50 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#202427]">
                    Check university license &amp; activate
                  </span>
                  <span className="text-xs font-mono text-[#202427]/65">
                    €0 / Student Seat
                  </span>
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
                    Not listed yet? Faculty departments can request a 30-day pilot license below.
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
                    Verify Student Email
                  </button>
                </form>

                {activationResult?.status === 'verified' && (
                  <div className="p-3 rounded-lg bg-[#202427] text-[#F7F6F2] text-xs flex items-start gap-2.5">
                    <Check className="w-4 h-4 text-[#E9B949] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#E9B949]">
                        Free Access Unlocked for {activationResult.university}.
                      </span>{' '}
                      Your Trace Complete student pass and workshop seat confirmation are ready.
                    </div>
                  </div>
                )}

                {activationResult?.status === 'request' && (
                  <div className="p-3 rounded-lg bg-[#F7F6F2] border border-[#A9AFB0]/60 text-xs text-[#202427]">
                    No institutional agreement detected yet for{' '}
                    <span className="font-mono font-medium">@{activationResult.domain}</span>. We logged an academic onboarding request for your faculty.
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

      {/* Workshops & Certification Syllabus */}
      <section className="py-16">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#202427]">
              Included workshops &amp; practical training modules
            </h2>
            <p className="mt-2 text-sm text-[#202427]/75 leading-relaxed">
              Every campus license includes guided labs co-designed with practicing interior architects, site engineers, and MEP coordinators.
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
                    <span className="text-xs font-mono text-[#202427]/65">{w.duration}</span>
                  </div>
                  <h3 className="text-lg font-semibold text-[#202427] leading-snug">
                    {w.title}
                  </h3>
                  <p className="mt-2.5 text-sm text-[#202427]/75 leading-relaxed">
                    {w.summary}
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-[#A9AFB0]/25 text-xs font-medium text-[#202427]">
                  Included with Campus License
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
