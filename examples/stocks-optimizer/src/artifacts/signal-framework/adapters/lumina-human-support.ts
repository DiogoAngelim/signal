/** Product wording and illustration commands stay outside the domain-neutral Signal core. */
import type * as Core from "../../signal-decision/src/human-support";

export type MeaningfulMoment =
  | "goal-saved"
  | "practice-saved"
  | "choice-revisited";

export type LuminaHumanSupportPlan = Core.HumanSupportPlan & { changesFinancialPolicy: false };
type CoreApi = Pick<typeof Core, "buildHumanSupportPlan" | "observeExplicitSupportCue" | "normalizeSupportPreferences" | "inspectSupportResponse" | "shouldUseSupportOnly">;

// Dependencies are passed from each consumer's installed public core package.
// No provider, persistence, trade permission, or browser global is used here.
export function createLuminaHumanSupport(core: CoreApi) {
  const patterns: Core.SupportCuePatterns = { pressure: [
    /\b(?:i (?:(?:need|have) to|must) (?:buy|invest) (?:now|today|immediately)|i (?:need|have|want) to (?:win|make|earn|get) my money back|preciso investir agora)\b/,
  ], celebration: [/\b(?:i finally paid off|consegui quitar)\b/] };
  function observeExplicitSupportCue(value: unknown): Core.SupportCue {
    return core.observeExplicitSupportCue(value, patterns);
  }
  function buildHumanSupportPlan(input: Parameters<CoreApi["buildHumanSupportPlan"]>[0] = {}): LuminaHumanSupportPlan {
    const plan = core.buildHumanSupportPlan(input, patterns);
    const pt = plan.locale === "pt-BR";
    const acknowledgement = plan.cue === "immediate-safety"
      ? pt ? "Sua seguran\u00e7a imediata importa mais que qualquer decis\u00e3o financeira." : "Your immediate safety matters more than any money decision."
      : plan.acknowledgement;
    const nextStep = plan.cue === "celebration"
      ? pt ? "Voc\u00ea descreveu uma conquista. Ela \u00e9 sua; n\u00e3o verifiquei um resultado financeiro de forma independente."
        : "You described a milestone. It is your achievement; I haven't independently verified a financial outcome."
      : plan.nextStep;
    return { ...plan, acknowledgement, nextStep,
      response: [acknowledgement, nextStep].filter(Boolean).join(" "),
      changesFinancialPolicy: false,
      explanation: pt
        ? "Apoio limitado ao texto desta mensagem e \u00e0s suas prefer\u00eancias. N\u00e3o \u00e9 diagn\u00f3stico, perfil ou recomenda\u00e7\u00e3o financeira."
        : "Support is limited to this message and your controls. It is not a diagnosis, profile or financial recommendation.",
      modelGuidance: plan.modelGuidance + " Financial policy and risk thresholds remain unchanged. Never use support to encourage a transaction. Saved goals are intentions, saved Practice is illustrative, and neither is a verified holding or achieved outcome.",
    };
  }
  function inspectSupportResponse(value: unknown): ReturnType<CoreApi["inspectSupportResponse"]> {
    const result = core.inspectSupportResponse(value);
    if (!result.acceptable || typeof value !== "string") return result;
    const text = value.normalize("NFKC").replace(/[\u2018\u2019]/g, "'").toLowerCase();
    if (/\b(?:i (?:bought|sold|placed (?:the|an|your) order)|guaranteed (?:profit|recovery|return)|you (?:will|can) (?:definitely|certainly) recover|lucro garantido)\b/.test(text)) {
      return { acceptable: false, reason: "false-authority" };
    }
    return result;
  }

/** The caller must invoke only after the corresponding operation succeeds. */
function describeMeaningfulMoment(
  moment: MeaningfulMoment,
  preferences?: unknown,
): string {
  const p = core.normalizeSupportPreferences(preferences);
  const direct = p.mode === "direct";
  if (p.locale === "pt-BR") {
    if (moment === "goal-saved")
      return direct
        ? "Objetivo salvo. Ainda n\u00e3o foi alcan\u00e7ado."
        : "Seu objetivo agora tem um lugar. Salv\u00e1-lo preserva sua inten\u00e7\u00e3o, n\u00e3o significa que ele foi alcan\u00e7ado.";
    if (moment === "practice-saved")
      return direct
        ? "Ideia ilustrativa salva. Nenhuma compra foi feita."
        : "Voc\u00ea deu forma a uma possibilidade. A ideia foi salva como ilustra\u00e7\u00e3o; nenhuma compra foi feita.";
    return "Esta \u00e9 a ideia que voc\u00ea salvou, n\u00e3o uma posi\u00e7\u00e3o verificada. Nenhum resultado de mercado foi acompanhado.";
  }
  if (moment === "goal-saved")
    return direct
      ? "Goal saved. It has not been achieved."
      : "Your goal now has a place. Saving it preserves your intention; it does not mean the goal has been achieved.";
  if (moment === "practice-saved")
    return direct
      ? "Illustrative idea saved. Nothing was purchased."
      : "You gave a possibility some shape. The idea is saved as an illustration; nothing was purchased.";
  return "This is the idea you saved, not a verified position. No market outcome has been tracked.";
}


/** Only an explicit allocation command may change an illustration. Never infer intent from an arbitrary percent. */
function parsePracticeAllocation(message: unknown): number | null {
  const text = normalizeText(message).replace(/[.!]$/, "").trim();
  const short = text.match(
    /^(\d{1,3})\s*%\s*(market|market-exposed|exposure|accessible|cash|reserve)$/,
  );
  const action = text.match(
    /^(?:set|keep|make)\s+(\d{1,3})\s*%\s*(market|market-exposed|exposure|accessible|cash|reserve)$/,
  );
  const long = text.match(
    /^set (?:the )?(market|market-exposed|exposure|accessible|cash|reserve)(?: portion)? to (\d{1,3})\s*%$/,
  );
  const match = short ?? action;
  const value = match ? Number(match[1]) : long ? Number(long[2]) : Number.NaN;
  const category = match ? match[2] : long?.[1];
  if (!Number.isFinite(value) || value < 0 || value > 100 || value % 5 !== 0)
    return null;
  return category === "accessible" ||
    category === "cash" ||
    category === "reserve"
    ? 100 - value
    : value;
}

  return { buildHumanSupportPlan, observeExplicitSupportCue, inspectSupportResponse,
    describeMeaningfulMoment, parsePracticeAllocation,
    normalizeSupportPreferences: core.normalizeSupportPreferences,
    shouldUseSupportOnly: core.shouldUseSupportOnly };
}

function normalizeText(value: unknown): string {
  return typeof value === "string"
    ? value
        .slice(0, 2000)
        .normalize("NFKC")
        .replace(/[\u2018\u2019]/g, "'")
        .toLowerCase()
        .trim()
    : "";
}

