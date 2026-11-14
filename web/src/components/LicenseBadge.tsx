// Dataset attribution shown under every drawing. Texts taken from data/<source>/LICENSE.md in the Stoa dataset.
const SOURCES: Record<string, string> = {
  cubicasa5k: 'CubiCasa5k',
  swiss_dwellings: 'Swiss Dwellings',
  ifc_models: 'IFC sample models',
  ifc_bench: 'IFC bench',
  opening_design: 'Opening Design',
}
const LICENSES: Record<string, string> = {
  cubicasa5k: '© 2019 CubiCasa, CC BY-NC-SA 4.0',
  swiss_dwellings: 'Swiss Dwellings v3.0.0, Archilyse AG, CC BY 4.0',
  ifc_models: 'licence per model, see data/ifc_models/LICENSE.md',
  ifc_bench: 'IFC-Bench v2, licence per model, see LICENSE.md',
  opening_design: 'OpeningDesign, CC BY-SA 4.0 / MIT per file',
}

export default function LicenseBadge({ path }: { path: string }) {
  const key = Object.keys(SOURCES).find((k) => path.includes(`/${k}/`) || path.startsWith(`${k}/`))
  if (!key) return null
  return (
    <div className="license">
      Source: {SOURCES[key]}{LICENSES[key] ? ` (${LICENSES[key]})` : ''} · via Stoa Junction 2026 dataset
    </div>
  )
}
