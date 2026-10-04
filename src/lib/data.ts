import type { CountryCode, Language } from "../types";
export const countries: {
  code: CountryCode;
  name: string;
  flag: string;
  city: string;
  language: Language;
  lat: number;
  lng: number;
  region: string;
}[] = [
  {
    code: "BR",
    name: "Brasil",
    flag: "🇧🇷",
    city: "São Paulo",
    language: "pt-BR",
    lat: -23.5505,
    lng: -46.6333,
    region: "América do Sul",
  },
  {
    code: "ES",
    name: "Espanha",
    flag: "🇪🇸",
    city: "Madrid",
    language: "es-ES",
    lat: 40.4168,
    lng: -3.7038,
    region: "Europa",
  },
  {
    code: "IT",
    name: "Itália",
    flag: "🇮🇹",
    city: "Milano",
    language: "it-IT",
    lat: 45.4642,
    lng: 9.19,
    region: "Europa",
  },
  {
    code: "US",
    name: "Estados Unidos",
    flag: "🇺🇸",
    city: "New York",
    language: "en-US",
    lat: 40.7128,
    lng: -74.006,
    region: "América do Norte",
  },
  {
    code: "NL",
    name: "Holanda",
    flag: "🇳🇱",
    city: "Amsterdam",
    language: "nl-NL",
    lat: 52.3676,
    lng: 4.9041,
    region: "Europa",
  },
];
export const languages: { value: Language; label: string }[] = [
  { value: "pt-BR", label: "Português · Brasil" },
  { value: "es-ES", label: "Español · España" },
  { value: "it-IT", label: "Italiano" },
  { value: "en-US", label: "English · US" },
  { value: "nl-NL", label: "Nederlands" },
];
export const categories = [
  "Restaurantes",
  "Clínicas",
  "Academias",
  "Imobiliárias",
  "Salões de beleza",
  "Hotéis",
  "Lojas de roupas",
  "Outro segmento",
];
export function safeUrl(value?: string): string | undefined {
  if (!value) return;
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol) ? u.href : undefined;
  } catch {
    return;
  }
}
