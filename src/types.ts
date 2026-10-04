export type CountryCode = "BR" | "ES" | "IT" | "US" | "NL";
export type Language = "pt-BR" | "es-ES" | "it-IT" | "en-US" | "nl-NL";
export interface Place {
  id: string;
  name: string;
  category: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  website?: string;
  phone?: string;
  source: "google" | "manual";
  attributions?: { displayName: string; uri?: string }[];
}
export interface Offer {
  service: string;
  benefit: string;
  audience: string;
  proof: string;
  goal: string;
}
export interface Config {
  mapsEnabled: boolean;
  placesEnabled: boolean;
  aiEnabled: boolean;
  mapsBrowserKey: string | null;
  model: string | null;
  liveSearchAllowed: boolean;
}
export type Channel = "email" | "whatsapp" | "call";
export type Tone = "consultivo" | "direto" | "formal" | "proximo";
export type Format = "first" | "followup" | "objection";
export interface Draft {
  subject: string;
  body: string;
  source: "ai" | "local" | "saved";
}
export interface ApproachInput {
  company: Place;
  offer: Offer;
  channel: Channel;
  tone: Tone;
  language: Language;
  format: Format;
  previous?: string;
  objection?: string;
  instruction?: string;
}
