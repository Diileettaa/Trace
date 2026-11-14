interface Props { onLaunch: () => void; onHowItWorks: () => void }

function PlanPreview() {
  return <svg className="landing-plan" viewBox="0 0 920 340" role="img" aria-label="Sample drawing with evidence highlighted in room R101">
    <defs><pattern id="plan-grid" width="72" height="54" patternUnits="userSpaceOnUse"><path d="M 72 0 L 0 0 0 54" fill="none" stroke="#e3e2dc" strokeWidth="1" /></pattern></defs>
    <rect x="1" y="1" width="918" height="338" fill="url(#plan-grid)" stroke="#d4d7d4" />
    <g fill="none" stroke="#697274" strokeWidth="8" strokeLinecap="square">
      <path d="M52 48H870V294H52Z M258 48V294 M586 48V294 M52 166H870" />
    </g>
    <g fill="none" stroke="#a9afb0" strokeWidth="3"><path d="M258 166h66a66 66 0 0 0-66-66 M586 222h68a68 68 0 0 0-68-68" /></g>
    <g fill="#7d8585" fontFamily="system-ui, sans-serif" fontSize="23"><text x="104" y="115">R101</text><text x="390" y="230">R102</text><text x="690" y="230">R103</text></g>
    <rect x="218" y="129" width="76" height="88" fill="#e9b949" fillOpacity=".22" stroke="#e9b949" strokeWidth="5" strokeDasharray="11 8" />
    <path d="M294 135L390 67" stroke="#c29422" strokeWidth="4" />
    <rect x="382" y="35" width="205" height="56" rx="12" fill="#e9b949" />
    <text x="404" y="71" fill="#202427" fontFamily="system-ui, sans-serif" fontSize="21" fontWeight="650">Evidence found</text>
  </svg>
}

export default function LandingPage({ onLaunch, onHowItWorks }: Props) {
  return <main className="landing-page">
    <section className="landing-hero">
      <p className="landing-eyebrow">CONSTRUCTION INTELLIGENCE</p>
      <h1>Every answer.<br />Backed by evidence.</h1>
      <p className="landing-copy">Ask your construction drawings anything. Get precise answers with visual proof you can verify.</p>
      <div className="landing-actions"><button className="landing-primary" onClick={onLaunch}>Try Live Demo <span aria-hidden="true">→</span></button><button className="landing-secondary" onClick={onHowItWorks}>How it works</button></div>
      <article className="sample-card">
        <div className="sample-card-heading"><h2>Drawing analysis</h2><span>Sample project</span></div>
        <PlanPreview />
      </article>
    </section>
    <section className="how-section" id="how-it-works">
      <p className="landing-eyebrow">HOW TRACE WORKS</p><h2>From question to proof in three steps.</h2>
      <div className="steps-grid">
        <article><span>01</span><h3>Ask</h3><p>Ask a natural-language question about a construction drawing or model.</p></article>
        <article><span>02</span><h3>Measure</h3><p>Gemini calls precise tools that read the drawing or query the model.</p></article>
        <article><span>03</span><h3>Verify</h3><p>See the evidence highlighted on the drawing or in the 3D model.</p></article>
      </div>
      <button className="landing-primary" onClick={onLaunch}>Launch Demo <span aria-hidden="true">→</span></button>
    </section>
  </main>
}
