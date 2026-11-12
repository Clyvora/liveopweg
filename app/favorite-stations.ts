export function parseFavoriteStations(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter((code): code is string => typeof code === "string").map(code => code.trim().toUpperCase()).filter(code => /^[A-Z0-9]{1,8}$/.test(code)))] : [];
  } catch { return []; }
}

export function toggleFavoriteStation(current: string[], code: string): string[] {
  return current.includes(code) ? current.filter(item => item !== code) : [...current, code];
}
