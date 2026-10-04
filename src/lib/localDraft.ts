import type { ApproachInput, Draft, Language } from "../types";
interface Copy {
  greeting: string;
  subject: string;
  intro: (name: string, service: string, audience: string) => string;
  benefit: (v: string) => string;
  proof: (v: string) => string;
  goal: (v: string) => string;
  follow: (name: string, previous: string) => string;
  objection: (name: string, v: string) => string;
  question: string;
  note: string;
}
const copy: Record<Language, Copy> = {
  "pt-BR": {
    greeting: "Olá",
    subject: "Uma conversa sobre",
    intro: (n, s, a) =>
      `Entro em contato com ${n} para apresentar ${s}, voltado a ${a}.`,
    benefit: (v) => `O benefício que buscamos oferecer é: ${v}.`,
    proof: (v) => `Uma informação que posso compartilhar: ${v}.`,
    goal: (v) => `Gostaria de ${v}. Faz sentido conversarmos?`,
    follow: (n, p) =>
      `Retomo meu contato com ${n} sobre a mensagem anterior:\n“${p}”`,
    objection: (n, v) =>
      `Agradeço a ${n} por compartilhar esta preocupação: “${v}”. Gostaria de entender melhor o contexto antes de sugerir um próximo passo.`,
    question: "Como vocês lidam com essa necessidade hoje?",
    note: "Aguardarei sua resposta. Obrigado pelo tempo.",
  },
  "es-ES": {
    greeting: "Hola",
    subject: "Una conversación sobre",
    intro: (n, s, a) =>
      `Me pongo en contacto con ${n} para presentar ${s}, dirigido a ${a}.`,
    benefit: (v) => `El beneficio que buscamos ofrecer es: ${v}.`,
    proof: (v) => `Un dato que puedo compartir: ${v}.`,
    goal: (v) => `Me gustaría ${v}. ¿Podríamos hablar?`,
    follow: (n, p) =>
      `Retomo mi contacto con ${n} sobre el mensaje anterior:\n«${p}»`,
    objection: (n, v) =>
      `Gracias a ${n} por compartir esta inquietud: «${v}». Me gustaría entender mejor el contexto antes de proponer un siguiente paso.`,
    question: "¿Cómo abordáis esta necesidad actualmente?",
    note: "Quedo pendiente de vuestra respuesta. Gracias por vuestro tiempo.",
  },
  "it-IT": {
    greeting: "Buongiorno",
    subject: "Una conversazione su",
    intro: (n, s, a) => `Contatto ${n} per presentare ${s}, rivolto a ${a}.`,
    benefit: (v) => `Il beneficio che intendiamo offrire è: ${v}.`,
    proof: (v) => `Un dato che posso condividere: ${v}.`,
    goal: (v) => `Vorrei ${v}. Possiamo parlarne?`,
    follow: (n, p) =>
      `Riprendo il contatto con ${n} riguardo al messaggio precedente:\n«${p}»`,
    objection: (n, v) =>
      `Grazie a ${n} per aver condiviso questa preoccupazione: «${v}». Vorrei comprendere meglio il contesto prima di suggerire il prossimo passo.`,
    question: "Come gestite questa esigenza oggi?",
    note: "Resto in attesa di una risposta. Grazie per il tempo dedicato.",
  },
  "en-US": {
    greeting: "Hello",
    subject: "A conversation about",
    intro: (n, s, a) =>
      `I'm reaching out to ${n} to introduce ${s}, intended for ${a}.`,
    benefit: (v) => `The benefit we aim to offer is: ${v}.`,
    proof: (v) => `One detail I can share: ${v}.`,
    goal: (v) => `I'd like to ${v}. Would a conversation make sense?`,
    follow: (n, p) =>
      `I'm following up with ${n} on my previous message:\n“${p}”`,
    objection: (n, v) =>
      `Thank you to ${n} for sharing this concern: “${v}”. I'd like to understand the context better before suggesting a next step.`,
    question: "How do you handle this need today?",
    note: "Thank you for your time. I look forward to your reply.",
  },
  "nl-NL": {
    greeting: "Goedendag",
    subject: "Een gesprek over",
    intro: (n, s, a) =>
      `Ik neem contact op met ${n} om ${s} voor te stellen, gericht op ${a}.`,
    benefit: (v) => `Het voordeel dat we willen bieden is: ${v}.`,
    proof: (v) => `Een gegeven dat ik kan delen: ${v}.`,
    goal: (v) => `Ik zou graag ${v}. Zullen we hierover spreken?`,
    follow: (n, p) => `Ik kom bij ${n} terug op mijn eerdere bericht:\n“${p}”`,
    objection: (n, v) =>
      `Bedankt aan ${n} voor het delen van deze zorg: “${v}”. Ik wil de context graag beter begrijpen voordat ik een volgende stap voorstel.`,
    question: "Hoe pakken jullie deze behoefte momenteel aan?",
    note: "Bedankt voor uw tijd. Ik zie uw reactie graag tegemoet.",
  },
};
export function localDraft(input: ApproachInput): Draft {
  const { company, offer, language, channel, tone, format } = input,
    c = copy[language];
  const opening =
    format === "followup"
      ? c.follow(company.name, input.previous || "")
      : format === "objection"
        ? c.objection(company.name, input.objection || "")
        : c.intro(company.name, offer.service, offer.audience);
  const sections = [
    `${c.greeting},`,
    opening,
    c.benefit(offer.benefit),
    offer.proof ? c.proof(offer.proof) : "",
    tone === "consultivo" || channel === "call" ? c.question : "",
    c.goal(offer.goal),
    tone === "formal" ? c.note : "",
  ].filter(Boolean);
  return {
    subject: channel === "email" ? `${c.subject} ${company.name}` : "",
    body: sections.join(channel === "whatsapp" ? "\n" : "\n\n"),
    source: "local",
  };
}
