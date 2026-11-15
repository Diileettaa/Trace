import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { FACT_SLIDES } from '../data/traceData';

interface FactSlidesCarouselProps {
  onAction: (target: 'demo' | 'plans' | 'education') => void;
}

export const FactSlidesCarousel: React.FC<FactSlidesCarouselProps> = ({
  onAction,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isPaused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FACT_SLIDES.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const slide = FACT_SLIDES[activeIndex];

  return (
    <div
      aria-label="Key Trace. benchmarks and offers"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Slide Navigation Tabs + Playback Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div className="flex flex-wrap items-center gap-1.5 bg-white p-1 rounded-xl border border-[#A9AFB0]/45">
          {FACT_SLIDES.map((s, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-[#202427] text-[#E9B949]'
                    : 'text-[#202427]/75 hover:text-[#202427]'
                }`}
              >
                {s.indexLabel}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsPaused((p) => !p)}
            aria-label={isPaused ? 'Resume slide loop' : 'Pause slide loop'}
            className="p-2 rounded-lg bg-white border border-[#A9AFB0]/45 text-[#202427] hover:border-[#202427] transition-colors cursor-pointer"
          >
            {isPaused ? (
              <Play className="w-3.5 h-3.5" />
            ) : (
              <Pause className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveIndex(
                (prev) => (prev - 1 + FACT_SLIDES.length) % FACT_SLIDES.length
              )
            }
            aria-label="Previous slide"
            className="p-2 rounded-lg bg-white border border-[#A9AFB0]/45 text-[#202427] hover:border-[#202427] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() =>
              setActiveIndex((prev) => (prev + 1) % FACT_SLIDES.length)
            }
            aria-label="Next slide"
            className="p-2 rounded-lg bg-white border border-[#A9AFB0]/45 text-[#202427] hover:border-[#202427] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Active Fact Slide Card */}
      <div className="rounded-2xl border border-[#A9AFB0]/50 bg-[#202427] text-[#F7F6F2] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch shadow-sm">
        {/* Left Content & Concrete Facts */}
        <div className="lg:col-span-7 p-7 sm:p-11 flex flex-col justify-between min-h-[360px]">
          <div>
            <p className="text-xs font-mono font-semibold uppercase tracking-wider text-[#E9B949] mb-2.5">
              {slide.kicker}
            </p>
            <h2 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-semibold tracking-tight leading-[1.08] [text-wrap:balance]">
              {slide.headline}
            </h2>
            <p className="mt-4 text-sm sm:text-base text-[#A9AFB0] leading-relaxed max-w-xl">
              {slide.subheadline}
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-5">
            {slide.facts.map((f) => (
              <div key={f.value}>
                <div className="text-xl sm:text-2xl font-display font-semibold tabular-nums text-[#E9B949]">
                  {f.value}
                </div>
                <div className="text-xs text-[#F7F6F2]/80 mt-1 leading-snug">
                  {f.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => onAction(slide.ctaTarget)}
              className="px-5 py-2.5 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{slide.ctaLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono text-[#A9AFB0] tabular-nums">
              Slide {activeIndex + 1} / {FACT_SLIDES.length}
            </span>
          </div>
        </div>

        {/* Right Architectural Visual */}
        <div className="lg:col-span-5 relative min-h-[300px] lg:min-h-[400px] bg-[#181B1D]">
          {!imgErrors[slide.id] ? (
            <img
              src={slide.imageUrl}
              alt={slide.imageAlt}
              referrerPolicy="no-referrer"
              onError={() =>
                setImgErrors((prev) => ({ ...prev, [slide.id]: true }))
              }
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-8 text-center text-sm text-[#A9AFB0]">
              {slide.headline}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-4 left-4 right-4 text-xs font-mono text-[#F7F6F2]/90">
            {slide.indexLabel} · Stoa / Trace.
          </div>
        </div>
      </div>
    </div>
  );
};
