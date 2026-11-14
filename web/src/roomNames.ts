const TERMS: Record<string, string> = {
  ELUTUBA: 'Living room', KÖÖK: 'Kitchen', ESIK: 'Hallway', TUALETTRUUM: 'WC', VANNITUBA: 'Bathroom', MAGAMISTUBA: 'Bedroom', KORIDOR: 'Corridor', TREPIKODA: 'Staircase', PANIPAIK: 'Storage', RÕDU: 'Balcony', SAUN: 'Sauna', TEHNOSEADMED: 'Technical room',
  BAD: 'Bathroom', KÜCHE: 'Kitchen', FLUR: 'Hallway', ZIMMER: 'Room', BÜRO: 'Office',
  ABIRUUM: 'Utility room', HUMANITAARRUUM: 'Shelter room', LIFT: 'Lift', KELDER: 'Basement', PESURUUM: 'Laundry', KONTOR: 'Office', LAOS: 'Storage', GARDEROOB: 'Wardrobe', KATUS: 'Roof',
  WOHNEN: 'Living room', SCHLAFEN: 'Bedroom', KOCHEN: 'Kitchen', ABSTELLRAUM: 'Storage', TREPPENHAUS: 'Staircase', REDUIT: 'Storage', BALKON: 'Balcony', TERRASSE: 'Terrace', DUSCHE: 'Shower', LOGGIA: 'Loggia',
  STANZA: 'Room', BAGNO: 'Bathroom', CUCINA: 'Kitchen', SOGGIORNO: 'Living room', CAMERA: 'Bedroom', CORRIDOIO: 'Corridor', DISIMPEGNO: 'Hallway', RIPOSTIGLIO: 'Storage',
  CHAMBRE: 'Bedroom', CUISINE: 'Kitchen', SÉJOUR: 'Living room', SALLE: 'Room', ENTRÉE: 'Entrance',
}
/** English only (judges must be able to read every label); the original stays available as a tooltip. */
export function roomEnglish(name: string) {
  if (!name) return name
  const parts = name.split('+').map(part => part.trim()).filter(Boolean)
  return parts.map(part => TERMS[part.toLocaleUpperCase()] || (/^[A-ZÄÖÜÕ]{3,}$/.test(part) ? part.charAt(0) + part.slice(1).toLowerCase() : part)).join(' + ')
}
export function englishRoomName(name: string) {
  const parts = name.split('+').map(part => part.trim()).filter(Boolean)
  const translated = parts.map(part => TERMS[part.toLocaleUpperCase()] || part)
  const english = translated.join(' + ')
  return english !== name ? english : name  // English only on screen
}

/** "2.korrus", "1. Obergeschoss", "Erdgeschoss", "Katus" -> English storey names */
export function storeyEnglish(name: string) {
  if (!name) return name
  const n = name.match(/(-?\d+)\s*\.?\s*(korrus|og|obergeschoss|floor|level|piano|étage|krs)/i) || name.match(/^(-?\d+)$/)
  if (n) return `Floor ${n[1]}`
  const map: Record<string, string> = { katus: 'Roof', vundament: 'Foundation', kelder: 'Basement', erdgeschoss: 'Ground floor', eg: 'Ground floor', keller: 'Basement', dachgeschoss: 'Attic', dachboden: 'Attic', 'piano terra': 'Ground floor', 'rez-de-chaussée': 'Ground floor' }
  return map[name.trim().toLowerCase()] || name
}
