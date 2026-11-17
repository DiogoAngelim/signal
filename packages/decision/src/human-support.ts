/**
 * Current-interaction support, not emotion recognition or decision authority.
 * This module is deliberately pure, domain-neutral and storage-free. Cues are
 * bounded textual observations, never diagnoses or facts about a person.
 */
export const HUMAN_SUPPORT_VERSION = "1.0.0" as const;
export type SupportMode = "balanced" | "direct" | "step-by-step";
export type SupportLocale = "en" | "pt-BR";
export type SupportCue = "none" | "pause" | "correction" | "overload" | "uncertainty" | "loss" | "pressure" | "celebration" | "immediate-safety";
export interface SupportPreferences {
  mode: SupportMode;
  locale: SupportLocale;
  adaptToExplicitCues: boolean;
}
export interface HumanSupportPlan {
  version: typeof HUMAN_SUPPORT_VERSION;
  cue: SupportCue;
  provenance: "explicit-current-message" | "user-control" | "none";
  mode: SupportMode;
  locale: SupportLocale;
  handled: boolean;
  acknowledgement: string;
  nextStep: string;
  response: string;
  explanation: string;
  modelGuidance: string;
  maxQuestions: 0 | 1;
  actionPermission: "none";
  changesFinancialPolicy: false;
  retainDerivedContext: false;
}
export const DEFAULT_SUPPORT_PREFERENCES: Readonly<SupportPreferences> = Object.freeze({
  mode: "balanced", locale: "en", adaptToExplicitCues: true,
});

/** Whitelist wire input; an unknown/malformed value never becomes permission. */
export function normalizeSupportPreferences(value: unknown): SupportPreferences {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  return {
    mode: input.mode === "direct" || input.mode === "step-by-step" ? input.mode : "balanced",
    locale: input.locale === "pt-BR" ? "pt-BR" : "en",
    adaptToExplicitCues: input.adaptToExplicitCues === undefined ? true : input.adaptToExplicitCues === true,
  };
}
function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 2000).normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'").toLowerCase().trim() : "";
}

/** Conservative EN/PT-BR phrase support, not a general emotion classifier. */
export function observeExplicitSupportCue(value: unknown): SupportCue {
  const text = normalizeText(value);
  if (!text) return "none";
  const plain = text.replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ").replace(/["\u201c][^"\u201d]*["\u201d]/g, " ");
  if (/^(?:stop|pause|not now|that's enough|leave it|let's stop|parar|pare|pausa|agora n[a\u00e3]o|chega)[.!\s]*$/.test(plain)) return "pause";
  if (/\b(?:you misunderstood|that's not what i meant|don't assume|do not assume|you got that wrong|n[a\u00e3]o foi isso|voc[e\u00ea] entendeu errado|n[a\u00e3]o presuma)\b/.test(plain)) return "correction";
  if (/\b(?:i(?:'m| am) not|i don't feel|i do not feel|n[a\u00e3]o (?:estou|me sinto))\s+(?:anxious|worried|overwhelmed|afraid|panicking|upset|confused|ansios[oa]|preocupad[oa]|sobrecarregad[oa]|confus[oa])\b/.test(plain)) return "correction";
  const statements = plain.split(/[.!?;\n]+/).map(s => s.trim()).filter(Boolean);
  const asserts = (pattern: RegExp): boolean => statements.some(s => {
    if (/\b(?:what if|suppose|imagine|pretend|roleplay|translate|example|my friend|he said|she said|they said|e se|suponha|imagine|traduza|exemplo|meu amigo|minha amiga|ele disse|ela disse)\b/.test(s)) return false;
    if (/\b(?:not|never|no longer|don't|do not|n[a\u00e3]o|nunca)\b/.test(s)) return false;
    return pattern.test(s);
  });
  if (asserts(/\b(?:i (?:want to|am going to|plan to|will) (?:kill myself|hurt myself|end my life)|vou me matar|quero me matar|quero acabar com minha vida)\b/)) return "immediate-safety";
  if (asserts(/\b(?:i (?:lost|have lost|regret)|i'm regretting|eu perdi|perdi (?:dinheiro|minhas economias)|me arrependo)\b/)) return "loss";
  if (asserts(/\b(?:i (?:need|have|must|want) to (?:win|make|earn|get) (?:it|everything|my money) back|i (?:(?:need|have) to|must) (?:act|buy|invest) (?:now|today|immediately)|i(?:'m| am) (?:afraid of missing out|feeling pressured)|preciso (?:recuperar|investir agora)|tenho que recuperar|estou (?:pressionad[oa]|com medo de ficar de fora))\b/)) return "pressure";
  if (asserts(/\b(?:i(?:'m| am| feel) (?:overwhelmed|anxious|worried|panicking|afraid|upset)|i feel (?:lost|under pressure)|this is too much for me|estou (?:sobrecarregad[oa]|ansios[oa]|preocupad[oa])|me sinto (?:perdid[oa]|sobrecarregad[oa]))\b/)) return "overload";
  if (asserts(/\b(?:i(?:'m| am| feel) (?:unsure|uncertain|confused)|i need clarity|i need help understanding|estou (?:confus[oa]|em d[u\u00fa]vida)|preciso de clareza)\b/)) return "uncertainty";
  if (asserts(/\b(?:i (?:reached|achieved|completed) my goal|i finally (?:saved|finished|paid off)|i(?:'m| am) proud of|alcancei (?:minha|meu)|consegui (?:guardar|quitar)|estou orgulhos[oa])\b/)) return "celebration";
  return "none";
}

const COPY: Record<SupportLocale, Record<Exclude<SupportCue, "none">, [string, string]>> = {
  en: {
    pause: ["We can leave this here.", "Nothing needs to be decided now."],
    correction: ["Thank you for correcting that. I won't carry that interpretation forward.", "You can restate the question, or use Direct responses."],
    overload: ["We can make this smaller, without assuming how you feel.", "Start with what needs protecting. We can look at one fact at a time; pausing is also an option."],
    uncertainty: ["We can separate what is known from what is still uncertain.", "Which part would be most useful to make clearer?"],
    loss: ["A loss or a decision you regret can be difficult to revisit.", "Let's separate what happened from what is verified before considering another decision. There is no need to recover it through a rushed choice."],
    pressure: ["A sense of urgency does not make the evidence stronger.", "Before choosing, separate a real deadline from pressure and check what you can afford to put at risk. Waiting remains an option."],
    celebration: ["That sounds meaningful to you.", "You described a milestone. It is your achievement; I haven't independently verified a financial outcome."],
    "immediate-safety": ["Your immediate safety matters more than any money decision.", "Please contact local emergency services if you may act on this now, and reach out to someone you trust who can stay with you. This app is not emergency or clinical care."],
  },
  "pt-BR": {
    pause: ["Podemos deixar isso por aqui.", "Nada precisa ser decidido agora."],
    correction: ["Obrigado por corrigir. N\u00e3o vou manter essa interpreta\u00e7\u00e3o.", "Voc\u00ea pode reformular a pergunta ou usar respostas diretas."],
    overload: ["Podemos simplificar, sem presumir como voc\u00ea se sente.", "Comece pelo que precisa proteger. Podemos olhar um fato por vez; fazer uma pausa tamb\u00e9m \u00e9 uma op\u00e7\u00e3o."],
    uncertainty: ["Podemos separar o que sabemos do que ainda \u00e9 incerto.", "Qual parte seria mais \u00fatil esclarecer?"],
    loss: ["Uma perda ou decis\u00e3o da qual voc\u00ea se arrepende pode ser dif\u00edcil de revisitar.", "Vamos separar o ocorrido do que est\u00e1 verificado antes de outra decis\u00e3o. N\u00e3o \u00e9 preciso tentar recuperar tudo com pressa."],
    pressure: ["A urg\u00eancia n\u00e3o torna a evid\u00eancia mais forte.", "Antes de escolher, separe um prazo real da press\u00e3o e confira o que pode colocar em risco. Esperar continua sendo uma op\u00e7\u00e3o."],
    celebration: ["Isso parece ter significado para voc\u00ea.", "Voc\u00ea descreveu uma conquista. Ela \u00e9 sua; n\u00e3o verifiquei um resultado financeiro de forma independente."],
    "immediate-safety": ["Sua seguran\u00e7a imediata importa mais que qualquer decis\u00e3o financeira.", "Procure o servi\u00e7o de emerg\u00eancia local se houver risco de agir agora e algu\u00e9m de confian\u00e7a que possa ficar com voc\u00ea. Este aplicativo n\u00e3o presta atendimento de emerg\u00eancia ou cl\u00ednico."],
  },
};

/** No raw message, inferred profile, confidence score or permission is emitted. */
export function buildHumanSupportPlan(input: { message?: unknown; preferences?: unknown } = {}): HumanSupportPlan {
  const preferences = normalizeSupportPreferences(input.preferences);
  const observed = observeExplicitSupportCue(input.message);
  const unconditional = observed === "pause" || observed === "correction" || observed === "immediate-safety";
  const cue = unconditional || preferences.adaptToExplicitCues ? observed : "none";
  const pair = cue === "none" ? ["", ""] : COPY[preferences.locale][cue];
  const acknowledgement = preferences.mode === "direct" && !unconditional ? "" : pair[0]!;
  const nextStep = pair[1]!;
  const response = [acknowledgement, nextStep].filter(Boolean).join(" ");
  const explanation = preferences.locale === "pt-BR"
    ? "Apoio limitado ao texto desta mensagem e \u00e0s suas prefer\u00eancias. N\u00e3o \u00e9 diagn\u00f3stico, perfil ou recomenda\u00e7\u00e3o financeira."
    : "Support is limited to this message and your controls. It is not a diagnosis, profile or financial recommendation.";
  return {
    version: HUMAN_SUPPORT_VERSION, cue,
    provenance: cue === "none" ? "none" : "explicit-current-message",
    mode: preferences.mode, locale: preferences.locale,
    handled: cue !== "none", acknowledgement, nextStep, response, explanation,
    modelGuidance: [
      "Preserve the user's agency, facts, uncertainty, risk disclosures and right to stop.",
      "Never infer a diagnosis, personality, emotional dependency or sensitive trait.",
      "Never use fear, guilt, flattery, urgency, attachment or praise to encourage a transaction.",
      "Never claim affection, lived feelings, guaranteed recovery, monitoring or an unverified achievement.",
      preferences.mode === "direct" ? "Use factual, direct language without emotional interpretation."
        : preferences.mode === "step-by-step" ? "Give one small next step; make detail optional without hiding risk."
        : "Be warm and restrained; acknowledge only what the user explicitly expressed.",
      preferences.adaptToExplicitCues ? "Use only the current message for tentative situational support; do not carry old cues forward."
        : "Emotional adaptation is disabled. Do not interpret or label the user's emotional state.",
      preferences.locale === "pt-BR" ? "Respond in Brazilian Portuguese." : "Respond in English.",
      "At most one necessary question. Do not add a call to action merely to prolong the conversation.",
    ].join(" "),
    maxQuestions: cue === "pause" || cue === "immediate-safety" ? 0 : 1,
    actionPermission: "none", changesFinancialPolicy: false, retainDerivedContext: false,
  };
}

export type MeaningfulMoment = "goal-saved" | "practice-saved" | "choice-revisited";
/** The caller must invoke only after the corresponding operation succeeds. */
export function describeMeaningfulMoment(moment: MeaningfulMoment, preferences?: unknown): string {
  const p = normalizeSupportPreferences(preferences);
  const direct = p.mode === "direct";
  if (p.locale === "pt-BR") {
    if (moment === "goal-saved") return direct ? "Objetivo salvo. Ainda n\u00e3o foi alcan\u00e7ado."
      : "Seu objetivo agora tem um lugar. Salv\u00e1-lo preserva sua inten\u00e7\u00e3o, n\u00e3o significa que ele foi alcan\u00e7ado.";
    if (moment === "practice-saved") return direct ? "Ideia ilustrativa salva. Nenhuma compra foi feita."
      : "Voc\u00ea deu forma a uma possibilidade. A ideia foi salva como ilustra\u00e7\u00e3o; nenhuma compra foi feita.";
    return "Esta \u00e9 a ideia que voc\u00ea salvou, n\u00e3o uma posi\u00e7\u00e3o verificada. Nenhum resultado de mercado foi acompanhado.";
  }
  if (moment === "goal-saved") return direct ? "Goal saved. It has not been achieved."
    : "Your goal now has a place. Saving it preserves your intention; it does not mean the goal has been achieved.";
  if (moment === "practice-saved") return direct ? "Illustrative idea saved. Nothing was purchased."
    : "You gave a possibility some shape. The idea is saved as an illustration; nothing was purchased.";
  return "This is the idea you saved, not a verified position. No market outcome has been tracked.";
}

/** Reject pressure/dependency/false execution phrasing; not a semantic safety proof. */
export function inspectSupportResponse(value: unknown): { acceptable: boolean; reason: "ok" | "invalid" | "coercion" | "dependency" | "false-authority" } {
  if (typeof value !== "string" || !value.trim() || value.length > 8000) return { acceptable: false, reason: "invalid" };
  const text = value.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").toLowerCase();
  if (/\b(?:don't let me down|do not let me down|you'll regret (?:not|waiting)|you will regret (?:not|waiting)|act now or|prove (?:yourself|your worth)|n[a\u00e3]o me decepcione)\b/.test(text)) return { acceptable: false, reason: "coercion" };
  if (/\b(?:only i understand you|you only need me|i need you|i missed you|i love you|s[o\u00f3] eu (?:te entendo|entendo voc[e\u00ea]))\b/.test(text)) return { acceptable: false, reason: "dependency" };
  if (/\b(?:i (?:bought|sold|placed (?:the|an|your) order)|guaranteed (?:profit|recovery|return)|you (?:will|can) (?:definitely|certainly) recover|lucro garantido)\b/.test(text)) return { acceptable: false, reason: "false-authority" };
  return { acceptable: true, reason: "ok" };
}

/** Preserve a concrete informational task instead of replacing it with reassurance. */
export function shouldUseSupportOnly(plan: HumanSupportPlan, message: unknown): boolean {
  if (!plan.handled) return false;
  if (["pause", "correction", "immediate-safety", "pressure"].includes(plan.cue)) return true;
  const text = normalizeText(message);
  const hasTask = /\b(?:explain|show|compare|calculate|define|what is|what are|how does|how do|why is|why does|expli(?:que|car)|mostr(?:e|ar)|compar(?:e|ar)|calcul(?:e|ar)|o que (?:e|\u00e9|sao|s\u00e3o)|como funciona)\b/.test(text);
  return !hasTask;
}

/** Only an explicit allocation command may change an illustration. Never infer intent from an arbitrary percent. */
export function parsePracticeAllocation(message: unknown): number | null {
  const text = normalizeText(message).replace(/[.!]$/, "").trim();
  const short = text.match(/^(\d{1,3})\s*%\s*(market|market-exposed|exposure|accessible|cash|reserve)$/);
  const action = text.match(/^(?:set|keep|make)\s+(\d{1,3})\s*%\s*(market|market-exposed|exposure|accessible|cash|reserve)$/);
  const long = text.match(/^set (?:the )?(market|market-exposed|exposure|accessible|cash|reserve)(?: portion)? to (\d{1,3})\s*%$/);
  const match = short ?? action;
  const value = match ? Number(match[1]) : long ? Number(long[2]) : NaN;
  const category = match ? match[2] : long?.[1];
  if (!Number.isFinite(value) || value < 0 || value > 100 || value % 5 !== 0) return null;
  return category === "accessible" || category === "cash" || category === "reserve" ? 100 - value : value;
}
