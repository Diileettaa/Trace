import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import Site from './site/Site.tsx'
import CommunityHub from './components/CommunityHub.tsx'

// Gigi's site (landing, products, cases, education, support, Demo Version = live workspace) is the front door;
// our project tools (files, schedule, collaboration, full 3D) open at #projects.
function Root() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => { const h = () => setHash(window.location.hash); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h) }, [])
  const legacy = new URLSearchParams(window.location.search).get('legacy') === '1'
  if (hash === '#community') return <CommunityHub onBack={() => { window.location.hash = '#home' }} />
  // The legacy project/3D workbench stays out of the normal product navigation.
  if (legacy && hash !== '#off') return <App />
  return <Site onOpenProjects={() => {
    window.location.hash = '#community'
  }} />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
