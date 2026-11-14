import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  History,
  MessageSquare,
  Monitor,
  Plus,
  Send,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Upload,
  X,
} from 'lucide-react';
import {
  FixtureVerification,
  INITIAL_FIXTURES,
  LAYER_GUIDE,
  LayerId,
  QUERY_SCENARIOS,
  ScaleOption,
  VerificationStatus,
} from '../data/workspaceData';
import { Detailed3DViewer } from './Detailed3DViewer';
import { LargeExecutionPlan } from './LargeExecutionPlan';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  bigMetric?: string;
  scenarioId?: string;
  followUps?: { id: string; question: string; answer: string }[];
}

interface ChatSession {
  id: string;
  title: string;
  scenarioId: string | null;
  timestamp: string;
  messages: ChatMessage[];
}

const FLOOR_OPTIONS = [
  { id: 'L03', label: 'LEVEL 03', subtitle: 'Penthouse & Rooftop MEP' },
  { id: 'L02', label: 'LEVEL 02', subtitle: 'Office & WC Core (Active)' },
  { id: 'L01', label: 'LEVEL 01', subtitle: 'Atrium & Conference Wing' },
  { id: 'L00', label: 'GROUND', subtitle: 'Lobby & Main Entrance' },
];

const INITIAL_CHATS: ChatSession[] = [
  {
    id: 'chat-wc',
    title: QUERY_SCENARIOS[0].prompt,
    scenarioId: QUERY_SCENARIOS[0].id,
    timestamp: '14:28',
    messages: [
      {
        id: 'm-wc-1',
        role: 'user',
        text: QUERY_SCENARIOS[0].prompt,
      },
      {
        id: 'm-wc-2',
        role: 'assistant',
        bigMetric: String(QUERY_SCENARIOS[0].foundCount),
        text: QUERY_SCENARIOS[0].aiSummary,
        scenarioId: QUERY_SCENARIOS[0].id,
        followUps: QUERY_SCENARIOS[0].followUpQuestions,
      },
    ],
  },
  {
    id: 'chat-hvac',
    title: QUERY_SCENARIOS[1].prompt,
    scenarioId: QUERY_SCENARIOS[1].id,
    timestamp: '14:15',
    messages: [
      {
        id: 'm-hv-1',
        role: 'user',
        text: QUERY_SCENARIOS[1].prompt,
      },
      {
        id: 'm-hv-2',
        role: 'assistant',
        bigMetric: String(QUERY_SCENARIOS[1].foundCount),
        text: QUERY_SCENARIOS[1].aiSummary,
        scenarioId: QUERY_SCENARIOS[1].id,
        followUps: QUERY_SCENARIOS[1].followUpQuestions,
      },
    ],
  },
  {
    id: 'chat-door',
    title: QUERY_SCENARIOS[2].prompt,
    scenarioId: QUERY_SCENARIOS[2].id,
    timestamp: '13:52',
    messages: [
      {
        id: 'm-dr-1',
        role: 'user',
        text: QUERY_SCENARIOS[2].prompt,
      },
      {
        id: 'm-dr-2',
        role: 'assistant',
        bigMetric: String(QUERY_SCENARIOS[2].foundCount),
        text: QUERY_SCENARIOS[2].aiSummary,
        scenarioId: QUERY_SCENARIOS[2].id,
        followUps: QUERY_SCENARIOS[2].followUpQuestions,
      },
    ],
  },
];

export const TraceWorkspace: React.FC = () => {
  const [chats, setChats] = useState<ChatSession[]>(INITIAL_CHATS);
  const [activeChatId, setActiveChatId] = useState<string>('chat-wc');
  const [scale, setScale] = useState<ScaleOption>('1:50');
  const [activeLayers, setActiveLayers] = useState<Record<LayerId, boolean>>({
    architecture: true,
    sanitary: true,
    hvac: true,
    electrical: true,
    dimensions: true,
  });

  // Floor Switcher (1s hover or click on LEVEL 02)
  const [activeFloor, setActiveFloor] = useState<string>('LEVEL 02');
  const [floorMenuOpen, setFloorMenuOpen] = useState<boolean>(false);
  const floorHoverTimer = useRef<number | null>(null);

  const [fixtures, setFixtures] =
    useState<Record<string, FixtureVerification>>(INITIAL_FIXTURES);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'2d' | '3d-building' | '3d-room'>('2d');
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'tablet' | 'mobile'>(
    'desktop'
  );
  const [mobileTab, setMobileTab] = useState<'plan' | 'ask'>('plan');
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);

  const [questionInput, setQuestionInput] = useState<string>('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Verification Modal State
  const [verifyModalOpen, setVerifyModalOpen] = useState<boolean>(false);
  const [verifyTargetId, setVerifyTargetId] = useState<string>('wc-02');
  const [verifyAuthor, setVerifyAuthor] = useState<string>('');
  const [verifyStatus, setVerifyStatus] = useState<VerificationStatus>('Installed');
  const [verifyNote, setVerifyNote] = useState<string>('');
  const [verifyPhotoPreview, setVerifyPhotoPreview] = useState<string>('');
  const [downloadToast, setDownloadToast] = useState<boolean>(false);

  const activeChat = chats.find((c) => c.id === activeChatId) || chats[0];
  const activeScenarioId = activeChat.scenarioId || 'wc-count';
  const scenario =
    QUERY_SCENARIOS.find((s) => s.id === activeScenarioId) || QUERY_SCENARIOS[0];

  const scenarioFixtures = scenario.targetIds
    .map((id) => fixtures[id])
    .filter(Boolean);

  const active3DFixture =
    (selectedFixtureId && fixtures[selectedFixtureId]) || scenarioFixtures[0];

  const allTargetsVerified = scenarioFixtures.every((f) => f.verified);
  const unverifiedFixture = scenarioFixtures.find((f) => !f.verified);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages.length, activeChatId]);

  useEffect(() => {
    return () => {
      if (floorHoverTimer.current) window.clearTimeout(floorHoverTimer.current);
    };
  }, []);

  const handleFloorMouseEnter = () => {
    if (floorHoverTimer.current) window.clearTimeout(floorHoverTimer.current);
    floorHoverTimer.current = window.setTimeout(() => {
      setFloorMenuOpen(true);
    }, 950);
  };

  const handleFloorMouseLeave = () => {
    if (floorHoverTimer.current) {
      window.clearTimeout(floorHoverTimer.current);
      floorHoverTimer.current = null;
    }
  };

  // Switch between existing chats in History
  const handleSelectChat = (chat: ChatSession) => {
    setActiveChatId(chat.id);
    setViewMode('2d');
    setSelectedFixtureId(null);
    setMobileDrawerOpen(false);
    if (chat.scenarioId) {
      const sc = QUERY_SCENARIOS.find((s) => s.id === chat.scenarioId);
      if (sc) {
        setScale(sc.recommendedScale);
        setActiveLayers((prev) => {
          const updated = { ...prev };
          sc.requiredLayers.forEach((layer) => {
            updated[layer] = true;
          });
          return updated;
        });
      }
    }
  };

  // "+" Button: Start a brand-new empty chat thread
  const handleCreateNewChat = () => {
    const newId = `chat-${Date.now()}`;
    const newSession: ChatSession = {
      id: newId,
      title: 'New inspection chat',
      scenarioId: null,
      timestamp: 'Now',
      messages: [
        {
          id: `welcome-${Date.now()}`,
          role: 'assistant',
          text: `Ready on ${activeFloor}. Ask any question about toilets, fire dampers, doors, or clearances—or pick a quick prompt below.`,
        },
      ],
    };
    setChats((prev) => [newSession, ...prev]);
    setActiveChatId(newId);
    setMobileDrawerOpen(false);
    if (devicePreview === 'mobile') setMobileTab('ask');
  };

  // Append messages into the currently active chat session
  const appendToActiveChat = (
    userText: string,
    matchedScenarioId: string | null,
    assistantText: string,
    bigMetric?: string,
    followUps?: { id: string; question: string; answer: string }[]
  ) => {
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: userText,
    };
    const aiMsg: ChatMessage = {
      id: `a-${Date.now() + 1}`,
      role: 'assistant',
      text: assistantText,
      bigMetric,
      scenarioId: matchedScenarioId || undefined,
      followUps,
    };

    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== activeChatId) return c;
        const isFresh = c.title === 'New inspection chat';
        return {
          ...c,
          title: isFresh ? userText : c.title,
          scenarioId: matchedScenarioId || c.scenarioId,
          timestamp: 'Just now',
          messages: [...c.messages, userMsg, aiMsg],
        };
      })
    );
  };

  const runPromptInCurrentChat = (promptText: string) => {
    const lower = promptText.toLowerCase();
    let matchedId: string | null = null;
    if (
      lower.includes('toilet') ||
      lower.includes('wc') ||
      lower.includes('klosett') ||
      lower.includes('schüssel')
    ) {
      matchedId = 'wc-count';
    } else if (
      lower.includes('damper') ||
      lower.includes('hvac') ||
      lower.includes('lüftung') ||
      lower.includes('klappe')
    ) {
      matchedId = 'hvac-dampers';
    } else if (
      lower.includes('door') ||
      lower.includes('tür') ||
      lower.includes('fire')
    ) {
      matchedId = 'fire-doors';
    }

    if (matchedId) {
      const sc = QUERY_SCENARIOS.find((s) => s.id === matchedId)!;
      setScale(sc.recommendedScale);
      setViewMode('2d');
      setSelectedFixtureId(null);
      setActiveLayers((prev) => {
        const updated = { ...prev };
        sc.requiredLayers.forEach((l) => {
          updated[l] = true;
        });
        return updated;
      });
      appendToActiveChat(
        promptText,
        sc.id,
        sc.aiSummary,
        String(sc.foundCount),
        sc.followUpQuestions
      );
    } else {
      appendToActiveChat(
        promptText,
        scenario.id,
        `Scanned ${activeFloor} Sheet AR-OG2-208-D at ${scale}. Highlighting ${scenario.roomCode} (${scenario.roomArea}). Click any highlighted object to inspect the 3D room.`,
        String(scenario.foundCount),
        scenario.followUpQuestions
      );
    }
  };

  const handleAskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = questionInput.trim();
    if (!q) return;
    runPromptInCurrentChat(q);
    setQuestionInput('');
  };

  const handleFollowUpClick = (question: string, answer: string) => {
    appendToActiveChat(question, null, answer);
  };

  const toggleLayer = (layerId: LayerId) => {
    setActiveLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const openVerificationModal = () => {
    const defaultTarget = unverifiedFixture || scenarioFixtures[0];
    if (defaultTarget) {
      setVerifyTargetId(defaultTarget.id);
      setVerifyAuthor(defaultTarget.author || '');
      setVerifyStatus(defaultTarget.status);
      setVerifyNote(defaultTarget.note);
      setVerifyPhotoPreview(defaultTarget.photoDataUrl);
    }
    setVerifyModalOpen(true);
  };

  const handlePhotoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setVerifyPhotoPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveVerification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyTargetId || !verifyAuthor.trim()) return;
    setFixtures((prev) => {
      const existing = prev[verifyTargetId];
      if (!existing) return prev;
      return {
        ...prev,
        [verifyTargetId]: {
          ...existing,
          verified: true,
          author: verifyAuthor.trim(),
          status: verifyStatus,
          note: verifyNote.trim() || existing.note,
          capturedAt: 'Nov 14, 2026 · Just now',
          photoLabel: 'Newly Verified Site Photo',
          photoDataUrl: verifyPhotoPreview || existing.photoDataUrl,
        },
      };
    });
    setVerifyModalOpen(false);
  };

  const getStatusLabel = (status: VerificationStatus) => {
    if (status === 'Installed') {
      return (
        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          <span>Installed</span>
        </span>
      );
    }
    if (status === 'Issue Reported') {
      return (
        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          <span>Issue Reported</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[#9A7218] font-semibold">
        <Clock className="w-3.5 h-3.5 text-[#9A7218]" />
        <span>In Progress</span>
      </span>
    );
  };

  // Left Rail: History (+ New Chat button) + Scale (AI LoD) + Layer Guide
  const renderLeftRail = () => (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-[#9A7218]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427]">
              History
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCreateNewChat}
            title="Start new chat"
            aria-label="Start new chat"
            className="w-6 h-6 rounded-md bg-[#202427] text-[#E9B949] hover:bg-[#202427]/90 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1.5">
          {chats.map((chat) => {
            const isActive = chat.id === activeChatId;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => handleSelectChat(chat)}
                className={`w-full text-left p-2 rounded-md text-xs transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#E9B949]/40 text-[#202427] font-semibold'
                    : 'bg-white/75 text-[#202427]/80 hover:bg-white'
                }`}
              >
                <div className="line-clamp-2 leading-snug">{chat.title}</div>
                <div className="flex items-center justify-between text-[10px] font-mono text-[#202427]/55 mt-1">
                  <span>{chat.timestamp}</span>
                  <span>{chat.messages.length} msgs</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Scale Selector with true AI LoD adaptation */}
      <div className="pt-3.5 border-t border-[#A9AFB0]/35">
        <div className="flex items-center justify-between mb-1.5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427]">
            Scale (AI LoD)
          </h2>
          <span className="text-[10px] font-mono text-[#9A7218]">Auto</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {(['1:200', '1:100', '1:50', '1:20'] as ScaleOption[]).map((sc) => (
            <button
              key={sc}
              type="button"
              onClick={() => setScale(sc)}
              className={`py-1 text-xs font-mono rounded border transition-colors cursor-pointer ${
                scale === sc
                  ? 'bg-[#202427] text-[#E9B949] border-[#202427]'
                  : 'bg-white text-[#202427] border-[#A9AFB0]/45 hover:border-[#202427]'
              }`}
            >
              {sc}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-[#202427]/65 leading-snug">
          {scale === '1:200' && 'Overview Poché · Overall footprint only.'}
          {scale === '1:100' && 'Submission · Double walls & room stamps.'}
          {scale === '1:50' && 'Execution · Full hatches, MEP & dimensions.'}
          {scale === '1:20' && 'Detail · Pre-wall studs, DN pipes & bolts.'}
        </p>
      </div>

      {/* Layer Guide (Leitfaden) */}
      <div className="pt-3.5 border-t border-[#A9AFB0]/35">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#202427] mb-2">
          Layer Guide
        </h2>
        <div className="space-y-1">
          {LAYER_GUIDE.map((layer) => {
            const isOn = activeLayers[layer.id];
            return (
              <button
                key={layer.id}
                type="button"
                onClick={() => toggleLayer(layer.id)}
                className="w-full text-left py-1 px-1.5 rounded hover:bg-[#202427]/5 flex items-center justify-between gap-2 text-xs transition-colors cursor-pointer"
              >
                <span
                  className={`truncate ${
                    isOn
                      ? 'text-[#202427] font-medium'
                      : 'text-[#202427]/40 line-through'
                  }`}
                >
                  {layer.label}
                </span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                    isOn
                      ? 'bg-[#E9B949]/45 text-[#202427] font-semibold'
                      : 'bg-[#A9AFB0]/20 text-[#202427]/50'
                  }`}
                >
                  {isOn ? 'ON' : 'OFF'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Center Canvas
  const renderCenterCanvas = () => (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-[#202427]">Floor plan</span>
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md bg-[#F7F6F2] border border-[#A9AFB0]/35">
              <button
                type="button"
                onClick={() => setViewMode('2d')}
                className={`px-2.5 py-0.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                  viewMode === '2d'
                    ? 'bg-[#202427] text-[#F7F6F2]'
                    : 'text-[#202427]/70'
                }`}
              >
                2D
              </button>
              <button
                type="button"
                onClick={() => setViewMode('3d-building')}
                className={`px-2.5 py-0.5 text-xs font-medium rounded inline-flex items-center gap-1 transition-colors cursor-pointer ${
                  viewMode !== '2d'
                    ? 'bg-[#E9B949] text-[#202427] font-semibold'
                    : 'text-[#202427]/70'
                }`}
              >
                <Box className="w-3 h-3" />
                <span>3D</span>
              </button>
            </div>
          </div>
          <span className="text-xs font-mono text-[#202427]/60">
            {activeFloor} · M {scale}
          </span>
        </div>

        {/* Keynotes Strip */}
        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-xl border border-[#A9AFB0]/45 bg-[#F7F6F2]/70 px-3.5 py-2.5">
            <div className="text-[11px] font-mono font-semibold text-[#202427]/75">
              {scenario.roomCode}
            </div>
            <div className="text-lg font-display font-semibold tabular-nums text-[#202427]">
              {scenario.roomArea}
            </div>
            <div className="text-[10px] font-mono text-[#202427]/65 truncate">
              {scenario.roomDimensions}
            </div>
          </div>

          <div className="rounded-xl border border-[#A9AFB0]/45 bg-[#F7F6F2]/70 px-3.5 py-2.5">
            <div className="text-[11px] font-medium text-[#202427]/75">
              Objects found
            </div>
            <div className="text-2xl font-display font-semibold tabular-nums text-[#202427] leading-tight mt-0.5">
              {scenario.foundCount}
            </div>
          </div>

          <div
            className={`rounded-xl border px-3.5 py-2.5 ${
              scenario.overallStatus === 'Issue Reported'
                ? 'border-red-300 bg-red-50/70'
                : 'border-[#A9AFB0]/45 bg-[#F7F6F2]/70'
            }`}
          >
            <div className="text-[11px] font-medium text-[#202427]/75">
              Status
            </div>
            <div className="text-xs mt-1.5">
              {getStatusLabel(scenario.overallStatus)}
            </div>
            <div className="text-[10px] font-mono text-[#202427]/65 mt-1 truncate">
              {scenarioFixtures.filter((f) => f.verified).length}/
              {scenarioFixtures.length} verified
            </div>
          </div>
        </div>

        {/* 2D Execution Plan OR Whole-Building 3D OR Realistic WC 3D */}
        <div className="border border-[#A9AFB0]/40 rounded-xl overflow-hidden">
          {viewMode === '2d' ? (
            <LargeExecutionPlan
              scenario={scenario}
              activeLayers={activeLayers}
              scale={scale}
              activeFloor={activeFloor}
              fixtures={fixtures}
              selectedFixtureId={selectedFixtureId}
              onSelectFixtureFor3D={(id) => {
                setSelectedFixtureId(id);
                setViewMode('3d-room');
              }}
            />
          ) : (
            active3DFixture && (
              <Detailed3DViewer
                mode={viewMode === '3d-building' ? 'building' : 'room'}
                scenario={scenario}
                fixture={active3DFixture}
                allFixtures={fixtures}
                siblingFixtures={scenarioFixtures}
                onSwitchMode={(m) =>
                  setViewMode(m === 'building' ? '3d-building' : '3d-room')
                }
                onSelectSibling={(id) => setSelectedFixtureId(id)}
                onBackTo2D={() => setViewMode('2d')}
              />
            )
          )}
        </div>
      </div>

      {/* Bottom-Center Verify Action Button */}
      <div className="pt-3.5 flex flex-col items-center justify-center gap-1">
        <button
          type="button"
          onClick={openVerificationModal}
          className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer shadow-xs ${
            allTargetsVerified
              ? 'bg-[#202427] text-[#F7F6F2] border-[#202427] hover:bg-[#202427]/90'
              : 'bg-[#E9B949] text-[#202427] border-[#C98A12] hover:bg-[#E9B949]/90'
          }`}
        >
          <Camera className="w-3.5 h-3.5" />
          <span>
            {allTargetsVerified
              ? 'Update Verification'
              : 'Verify on Site · Add Photo'}
          </span>
          <ArrowDown className="w-3 h-3 opacity-70" />
        </button>
        <span className="text-[10px] font-mono text-[#202427]/60">
          {allTargetsVerified
            ? 'All targets verified — hover >1s over any mark for photo.'
            : `${unverifiedFixture?.code} (marked red) is awaiting site photo.`}
        </span>
      </div>
    </div>
  );

  // Right Rail: Chat Messages + Bottom Input Bar
  const renderRightRail = () => (
    <div className="flex flex-col h-full justify-between">
      <div className="px-4 pt-3.5 pb-2 border-b border-[#A9AFB0]/30 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-[#202427] truncate">
          {activeChat.title}
        </h2>
        <span className="text-[10px] font-mono text-[#9A7218] shrink-0">
          {activeFloor}
        </span>
      </div>

      {/* Scrollable Message Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {activeChat.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.role === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[94%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#202427] text-[#F7F6F2]'
                  : 'bg-white border border-[#A9AFB0]/45 text-[#202427]'
              }`}
            >
              {msg.bigMetric && (
                <div className="text-2xl font-display font-semibold text-[#202427] tabular-nums mb-1">
                  {msg.bigMetric}
                </div>
              )}
              <p>{msg.text}</p>

              {/* Interactive Evidence & Fixture Chips inside Assistant Message */}
              {msg.role === 'assistant' && msg.scenarioId && (
                <div className="mt-2.5 pt-2 border-t border-[#A9AFB0]/25 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedFixtureId && scenarioFixtures[0]) {
                        setSelectedFixtureId(scenarioFixtures[0].id);
                      }
                      setViewMode('3d-room');
                      if (devicePreview === 'mobile') setMobileTab('plan');
                    }}
                    className="w-full py-1.5 px-2.5 rounded bg-[#E9B949] hover:bg-[#E9B949]/90 text-[#202427] text-[11px] font-semibold transition-colors cursor-pointer text-left"
                  >
                    View {scenario.roomCode} in 3D →
                  </button>

                  {scenarioFixtures.map((fix) => (
                    <button
                      key={fix.id}
                      type="button"
                      onClick={() => {
                        setSelectedFixtureId(fix.id);
                        setViewMode('3d-room');
                        if (devicePreview === 'mobile') setMobileTab('plan');
                      }}
                      className={`w-full text-left px-2 py-1 rounded border flex items-center justify-between gap-1.5 text-[11px] cursor-pointer ${
                        !fix.verified
                          ? 'bg-red-50 border-red-300 text-red-900'
                          : 'bg-[#F7F6F2] border-[#A9AFB0]/35 text-[#202427]'
                      }`}
                    >
                      <span className="font-mono font-semibold">{fix.code}</span>
                      <span className="truncate flex-1">
                        {fix.verified ? fix.status : 'Unverified (Red)'}
                      </span>
                      <span className="font-medium underline">3D</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Proactive Follow-Up Questions */}
              {msg.role === 'assistant' &&
                msg.followUps &&
                msg.followUps.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#A9AFB0]/25 space-y-1.5">
                    <div className="text-[10px] font-semibold text-[#9A7218]">
                      Follow-up:
                    </div>
                    {msg.followUps.map((fu) => (
                      <button
                        key={fu.id}
                        type="button"
                        onClick={() =>
                          handleFollowUpClick(fu.question, fu.answer)
                        }
                        className="w-full text-left p-2 rounded-lg bg-[#F7F6F2] hover:bg-[#E9B949]/25 border border-[#A9AFB0]/40 text-[11px] text-[#202427] leading-snug transition-colors cursor-pointer"
                      >
                        {fu.question}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        ))}

        {/* Quick starter prompts when inside a brand new empty chat */}
        {activeChat.scenarioId === null && (
          <div className="space-y-1.5 pt-2">
            <div className="text-[10px] font-semibold text-[#202427]/65">
              Quick prompts:
            </div>
            {QUERY_SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => runPromptInCurrentChat(s.prompt)}
                className="w-full text-left p-2 rounded-lg bg-white hover:bg-[#E9B949]/20 border border-[#A9AFB0]/45 text-[11px] text-[#202427] transition-colors cursor-pointer"
              >
                {s.prompt}
              </button>
            ))}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Pinned Bottom Message Input Bar */}
      <form
        onSubmit={handleAskSubmit}
        className="p-3 border-t border-[#A9AFB0]/35 bg-[#F7F6F2] flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={questionInput}
          onChange={(e) => setQuestionInput(e.target.value)}
          placeholder="Message Trace. about this plan..."
          className="flex-1 px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg text-[#202427] focus:outline-none focus:border-[#202427]"
        />
        <button
          type="submit"
          aria-label="Send message"
          className="p-2 rounded-lg bg-[#202427] text-[#E9B949] hover:bg-[#202427]/90 transition-colors cursor-pointer shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );

  return (
    <div className="flex flex-col bg-[#E8E6DF] text-[#202427] min-h-[calc(100vh-4rem)]">
      {/* Native App Window Sub-Bar with 1-second hover/click Floor Switcher on LEVEL 02 */}
      <div className="bg-[#202427] text-[#A9AFB0] px-5 py-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs relative">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="text-[#F7F6F2] font-medium">
            TRACE DESKTOP APP · PROJECT 01 ·
          </span>
          <div
            className="relative"
            onMouseEnter={handleFloorMouseEnter}
            onMouseLeave={handleFloorMouseLeave}
          >
            <button
              type="button"
              onClick={() => setFloorMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-[#E9B949] hover:text-[#202427] text-[#E9B949] font-semibold transition-colors cursor-pointer"
              title="Hover 1s or click to switch floor"
            >
              <span>{activeFloor}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {floorMenuOpen && (
              <div
                onMouseLeave={() => setFloorMenuOpen(false)}
                className="absolute left-0 top-full mt-1.5 w-60 rounded-xl bg-[#202427] border border-[#E9B949]/60 shadow-xl py-1.5 z-50"
              >
                <div className="px-3 py-1 text-[10px] font-mono text-[#A9AFB0] border-b border-white/10">
                  Switch Building Floor
                </div>
                {FLOOR_OPTIONS.map((fl) => (
                  <button
                    key={fl.id}
                    type="button"
                    onClick={() => {
                      setActiveFloor(fl.label);
                      setFloorMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      activeFloor === fl.label
                        ? 'bg-[#E9B949]/20 text-[#E9B949]'
                        : 'text-[#F7F6F2] hover:bg-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-mono font-semibold">{fl.label}</div>
                      <div className="text-[10px] text-[#A9AFB0] font-sans">
                        {fl.subtitle}
                      </div>
                    </div>
                    {activeFloor === fl.label && (
                      <Check className="w-3.5 h-3.5 text-[#E9B949]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDownloadToast((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-[#F7F6F2] text-[11px] font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3 text-[#E9B949]" />
            <span>Download App</span>
          </button>

          <div className="flex items-center gap-1 bg-white/10 p-0.5 rounded-md">
            <button
              type="button"
              onClick={() => setDevicePreview('desktop')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                devicePreview === 'desktop'
                  ? 'bg-[#E9B949] text-[#202427]'
                  : 'text-[#A9AFB0] hover:text-[#F7F6F2]'
              }`}
            >
              <Monitor className="w-3 h-3" />
              <span>Desktop</span>
            </button>
            <button
              type="button"
              onClick={() => setDevicePreview('tablet')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                devicePreview === 'tablet'
                  ? 'bg-[#E9B949] text-[#202427]'
                  : 'text-[#A9AFB0] hover:text-[#F7F6F2]'
              }`}
            >
              <Tablet className="w-3 h-3" />
              <span>Tablet</span>
            </button>
            <button
              type="button"
              onClick={() => setDevicePreview('mobile')}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                devicePreview === 'mobile'
                  ? 'bg-[#E9B949] text-[#202427]'
                  : 'text-[#A9AFB0] hover:text-[#F7F6F2]'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Mobile</span>
            </button>
          </div>
        </div>
      </div>

      {downloadToast && (
        <div className="bg-[#E9B949] text-[#202427] px-5 py-2 text-xs font-medium flex items-center justify-between">
          <span>
            Trace. Native App installers: macOS Universal (.dmg), Windows x64 (.msi), iPadOS &amp; iOS Field Companion.
          </span>
          <button
            type="button"
            onClick={() => setDownloadToast(false)}
            className="font-semibold underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* DESKTOP APP SHELL */}
      {devicePreview === 'desktop' && (
        <div className="flex-1 overflow-x-auto bg-white">
          <div className="min-w-[740px] h-[calc(100vh-6.75rem)] min-h-[600px] grid grid-cols-[195px_minmax(0,1fr)_260px] md:grid-cols-[210px_minmax(0,1fr)_280px] xl:grid-cols-[240px_minmax(0,1fr)_320px]">
            <aside className="bg-[#F7F6F2] border-r border-[#A9AFB0]/35 px-3.5 py-4 overflow-y-auto">
              {renderLeftRail()}
            </aside>
            <section className="bg-white p-4 sm:p-5 overflow-y-auto flex flex-col justify-between">
              {renderCenterCanvas()}
            </section>
            <aside className="bg-[#F7F6F2] border-l border-[#A9AFB0]/35 overflow-hidden flex flex-col">
              {renderRightRail()}
            </aside>
          </div>
        </div>
      )}

      {/* TABLET APP SHELL */}
      {devicePreview === 'tablet' && (
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="w-full max-w-[920px] h-[680px] rounded-2xl border-4 border-[#202427] bg-white shadow-xl overflow-hidden grid grid-cols-[185px_minmax(0,1fr)_255px]">
            <aside className="bg-[#F7F6F2] border-r border-[#A9AFB0]/35 px-3 py-4 overflow-y-auto">
              {renderLeftRail()}
            </aside>
            <section className="bg-white p-4 overflow-y-auto">
              {renderCenterCanvas()}
            </section>
            <aside className="bg-[#F7F6F2] border-l border-[#A9AFB0]/35 overflow-hidden flex flex-col">
              {renderRightRail()}
            </aside>
          </div>
        </div>
      )}

      {/* SITE MOBILE APP SHELL: Top-Right Icon opens History/Layers Popup */}
      {devicePreview === 'mobile' && (
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="relative w-[390px] h-[700px] rounded-[28px] border-4 border-[#202427] bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 bg-[#202427] text-[#F7F6F2] flex items-center justify-between text-xs font-mono shrink-0">
              <span>TRACE. FIELD · {activeFloor}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#E9B949]">M {scale}</span>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen((v) => !v)}
                  aria-label="Open History and Layers"
                  title="History, Scale & Layers"
                  className="p-1.5 rounded-md bg-white/10 hover:bg-[#E9B949] hover:text-[#202427] text-[#E9B949] transition-colors cursor-pointer"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-white flex flex-col">
              {mobileTab === 'plan' && <div className="p-3.5">{renderCenterCanvas()}</div>}
              {mobileTab === 'ask' && <div className="flex-1 flex flex-col">{renderRightRail()}</div>}
            </div>

            <nav
              aria-label="Mobile app tabs"
              className="grid grid-cols-2 border-t border-[#A9AFB0]/40 bg-[#F7F6F2] shrink-0"
            >
              <button
                type="button"
                onClick={() => setMobileTab('plan')}
                className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium cursor-pointer ${
                  mobileTab === 'plan' ? 'text-[#202427] bg-[#E9B949]/35' : 'text-[#202427]/65'
                }`}
              >
                <Box className="w-4 h-4" />
                <span>Plan / 3D</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('ask')}
                className={`py-2.5 flex flex-col items-center gap-0.5 text-[11px] font-medium cursor-pointer ${
                  mobileTab === 'ask' ? 'text-[#202427] bg-[#E9B949]/35' : 'text-[#202427]/65'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Assistant</span>
              </button>
            </nav>

            {/* Mobile Popup for History (+), Scale & Layer Guide */}
            {mobileDrawerOpen && (
              <div
                className="absolute inset-0 z-30 bg-[#202427]/55 backdrop-blur-xs flex justify-end"
                role="dialog"
                aria-modal="true"
                aria-label="History and Layers"
              >
                <div className="w-[85%] h-full bg-[#F7F6F2] border-l border-[#A9AFB0]/50 flex flex-col overflow-hidden">
                  <div className="px-4 py-3 bg-[#202427] text-[#F7F6F2] flex items-center justify-between">
                    <span className="text-xs font-semibold">
                      History, Scale &amp; Layers
                    </span>
                    <button
                      type="button"
                      onClick={() => setMobileDrawerOpen(false)}
                      aria-label="Close popup"
                      className="p-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {renderLeftRail()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Site Photo Verification / Update Modal */}
      {verifyModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#202427]/65 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-modal-title"
        >
          <div className="w-full max-w-md rounded-xl bg-[#F7F6F2] text-[#202427] border border-[#A9AFB0]/60 shadow-xl overflow-hidden">
            <div className="px-5 py-4 bg-[#202427] text-[#F7F6F2] flex items-center justify-between">
              <div>
                <p className="text-[11px] font-mono text-[#E9B949]">
                  On-Site Ground Truth
                </p>
                <h3 id="verify-modal-title" className="text-base font-semibold">
                  {allTargetsVerified
                    ? 'Update Site Verification'
                    : 'Verify & Pin Site Photo'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setVerifyModalOpen(false)}
                aria-label="Close modal"
                className="p-1 rounded text-[#A9AFB0] hover:text-[#F7F6F2] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVerification} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Target Fixture
                </label>
                <select
                  value={verifyTargetId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setVerifyTargetId(id);
                    const f = fixtures[id];
                    if (f) {
                      setVerifyStatus(f.status);
                      setVerifyNote(f.note);
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-[#A9AFB0]/60 rounded-lg"
                >
                  {scenarioFixtures.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.code} — {f.label} ({f.verified ? 'Verified' : 'Unverified - Red'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Inspector Name
                  </label>
                  <input
                    type="text"
                    required
                    value={verifyAuthor}
                    onChange={(e) => setVerifyAuthor(e.target.value)}
                    placeholder="e.g. L. Saarinen"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Status</label>
                  <select
                    value={verifyStatus}
                    onChange={(e) =>
                      setVerifyStatus(e.target.value as VerificationStatus)
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg"
                  >
                    <option value="Installed">Installed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Issue Reported">Issue Reported</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Attach Site Photo
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg border border-dashed border-[#202427]/40 bg-white text-xs font-medium cursor-pointer hover:border-[#202427]">
                  <Upload className="w-4 h-4 text-[#9A7218]" />
                  <span>Upload photo from device / camera</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Verification Note
                </label>
                <textarea
                  rows={2}
                  value={verifyNote}
                  onChange={(e) => setVerifyNote(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#A9AFB0]/60 rounded-lg"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-[#E9B949] text-[#202427] text-sm font-semibold hover:bg-[#E9B949]/90 transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Save Verification to Coordinate</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
