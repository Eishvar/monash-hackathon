// Port lookup + map projection for the metrics route map (public/worldLow-pixels.svg).

export interface PortLocation {
  name: string;
  coordinates: [number, number]; // [longitude, latitude]
}

/** Keys are normalised upper-case names (letters/digits separated by single spaces). */
export const PORT_COORDINATES: Record<string, PortLocation> = {
  CALLAO: { name: "Callao, Peru", coordinates: [-77.15, -12.05] },
  FREMANTLE: { name: "Fremantle, Australia", coordinates: [115.75, -32.05] },
  SAVANNAH: { name: "Savannah, USA", coordinates: [-81.09, 32.08] },
  HOUSTON: { name: "Houston, USA", coordinates: [-95.27, 29.73] },
  KOPER: { name: "Koper, Slovenia", coordinates: [13.73, 45.55] },
  MERSIN: { name: "Mersin, Turkey", coordinates: [34.64, 36.8] },
  "JEBEL ALI": { name: "Jebel Ali, UAE", coordinates: [55.03, 25.01] },
  YANGON: { name: "Yangon, Myanmar", coordinates: [96.16, 16.77] },
  "NEW YORK": { name: "New York, USA", coordinates: [-74.04, 40.68] },
  BUSAN: { name: "Busan, South Korea", coordinates: [129.04, 35.1] },
  GDANSK: { name: "Gdansk, Poland", coordinates: [18.66, 54.35] },
  AQABA: { name: "Aqaba, Jordan", coordinates: [35.0, 29.53] },
  BRISBANE: { name: "Brisbane, Australia", coordinates: [153.03, -27.38] },
  APAPA: { name: "Apapa, Nigeria", coordinates: [3.36, 6.44] },
  BALTIMORE: { name: "Baltimore, USA", coordinates: [-76.58, 39.27] },
  CONAKRY: { name: "Conakry, Guinea", coordinates: [-13.71, 9.51] },
  ASHDOD: { name: "Ashdod, Israel", coordinates: [34.65, 31.8] },
  KARACHI: { name: "Karachi, Pakistan", coordinates: [66.98, 24.84] },
  CEBU: { name: "Cebu, Philippines", coordinates: [123.9, 10.3] },
  KLAIPEDA: { name: "Klaipeda, Lithuania", coordinates: [21.13, 55.71] },
  PYEONGTAEK: { name: "Pyeongtaek, South Korea", coordinates: [126.83, 36.97] },
  "HOCHIMINH CITY": { name: "Ho Chi Minh City, Vietnam", coordinates: [106.7, 10.77] },
  "HO CHI MINH": { name: "Ho Chi Minh City, Vietnam", coordinates: [106.7, 10.77] },
  MOMBASA: { name: "Mombasa, Kenya", coordinates: [39.66, -4.05] },
  TUTICORIN: { name: "Tuticorin, India", coordinates: [78.19, 8.76] },
  VALPARAISO: { name: "Valparaiso, Chile", coordinates: [-71.63, -33.04] },
  "LONG BEACH": { name: "Long Beach, USA", coordinates: [-118.19, 33.75] },
  "LOS ANGELES": { name: "Los Angeles, USA", coordinates: [-118.27, 33.74] },
  SINGAPORE: { name: "Singapore", coordinates: [103.85, 1.29] },
  "NHAVA SHEVA": { name: "Nhava Sheva, India", coordinates: [72.95, 18.95] },
  "LE HAVRE": { name: "Le Havre, France", coordinates: [0.11, 49.49] },
  ROTTERDAM: { name: "Rotterdam, Netherlands", coordinates: [4.48, 51.92] },
  HAMBURG: { name: "Hamburg, Germany", coordinates: [9.99, 53.55] },
  ANTWERP: { name: "Antwerp, Belgium", coordinates: [4.4, 51.22] },
  VALENCIA: { name: "Valencia, Spain", coordinates: [-0.38, 39.47] },
  SHANGHAI: { name: "Shanghai, China", coordinates: [121.47, 31.23] },
  NINGBO: { name: "Ningbo, China", coordinates: [121.55, 29.87] },
  QINGDAO: { name: "Qingdao, China", coordinates: [120.38, 36.07] },
  NANTONG: { name: "Nantong, China", coordinates: [120.89, 32.01] },
  SANTOS: { name: "Santos, Brazil", coordinates: [-46.33, -23.96] },
  JAKARTA: { name: "Jakarta, Indonesia", coordinates: [106.88, -6.1] },
  COLOMBO: { name: "Colombo, Sri Lanka", coordinates: [79.86, 6.93] },
  "PORT KLANG": { name: "Port Klang, Malaysia", coordinates: [101.4, 2.99] },
  "TANJUNG PELEPAS": { name: "Tanjung Pelepas, Malaysia", coordinates: [103.55, 1.36] },
  CHITTAGONG: { name: "Chittagong, Bangladesh", coordinates: [91.83, 22.34] },
};

const normalise = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

// Longest names first so "HO CHI MINH" wins over any shorter overlapping key.
const KEYS = Object.keys(PORT_COORDINATES).sort((a, b) => b.length - a.length);

function scan(text: string): PortLocation | null {
  const padded = ` ${normalise(text)} `;
  for (const key of KEYS) if (padded.includes(` ${key} `)) return PORT_COORDINATES[key];
  return null;
}

/**
 * Destination port of a BL-comparison email subject. Dataset subjects look like `TO CONFIRM DOCS _ 5RSG-00133 _ CALLAO_PERU _ CONSIGNEE _ REF`,
 * so the third " _ " segment is tried first; otherwise the whole subject is scanned for a known port name (whole words only).
 */
export function resolvePort(subject: string | null | undefined): PortLocation | null {
  if (!subject) return null;
  const segments = subject.split(/\s_\s/);
  return (segments.length >= 3 ? scan(segments[2]) : null) ?? scan(subject);
}

// Least-squares fit of the map's country dots (20 countries, mean error ≈ 2.5 px): the asset is a plain linear lon/lat grid, not Miller.
const X0 = 476.78;
const KX = 2.5501;
const Y0 = 247.36;
const KY = -3.0514;

/** lon/lat → coordinates in the SVG's viewBox space (viewBox="97.32 0.84 826.85 503.39"). */
export function project(lon: number, lat: number): [number, number] {
  return [X0 + KX * lon, Y0 + KY * lat];
}
