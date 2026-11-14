const TERMS: Record<string, string> = {
  ELUTUBA: 'Living room', KÖÖK: 'Kitchen', ESIK: 'Hallway', TUALETTRUUM: 'WC', VANNITUBA: 'Bathroom', MAGAMISTUBA: 'Bedroom', KORIDOR: 'Corridor', TREPIKODA: 'Staircase', PANIPAIK: 'Storage', RÕDU: 'Balcony', SAUN: 'Sauna', TEHNOSEADMED: 'Technical room',
  BAD: 'Bathroom', KÜCHE: 'Kitchen', FLUR: 'Hallway', ZIMMER: 'Room', BÜRO: 'Office',
}
export function englishRoomName(name: string) {
  const parts = name.split('+').map(part => part.trim()).filter(Boolean)
  const translated = parts.map(part => TERMS[part.toLocaleUpperCase()] || part)
  const english = translated.join(' + ')
  return english !== name ? `${english} · ${name}` : name
}
