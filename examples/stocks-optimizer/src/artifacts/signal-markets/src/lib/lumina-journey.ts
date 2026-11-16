/**
 * Lúmina first-journey demo engine.
 *
 * This reducer is deliberately deterministic and offline. Its outputs are never
 * brokerage operations, verified positions, AI-generated advice, or market forecasts.
 */
export type EvidenceSource = "user-provided" | "illustrative" | "verified-external" | "unavailable";
export type JourneyStep = "welcome" | "horizon" | "amount" | "visual";
export type Horizon = "soon" | "middle" | "later" | "unsure";
export type MessageKind = "user" | "text" | "horizon" | "amount" | "scenario" | "saved" | "unsupported";

export interface JourneyMessage {
  id: number;
  kind: MessageKind;
  text?: string;
}
export interface PracticeChoice {
  id: string;
  at: string;
  amount: number;
  exposedPercent: number;
  accessiblePercent: number;
  goal: string;
  horizon: Horizon | null;
  provenance: "illustrative";
  executed: false;
}
export interface JourneyState {
  step: JourneyStep;
  goal: string;
  amount: number | null;
  horizon: Horizon | null;
  exposedPercent: number;
  messages: JourneyMessage[];
  nextId: number;
  choices: PracticeChoice[];
}
export type JourneyEvent =
  | { type: "START"; text: string }
  | { type: "SUBMIT"; text: string }
  | { type: "PICK_HORIZON"; value: Horizon }
  | { type: "PICK_AMOUNT"; value: number }
  | { type: "EXPOSURE"; value: number }
  | { type: "SAVE"; at: string; id: string }
  | { type: "RESET" }
  | { type: "CLEAR_HISTORY" };

export const HORIZON_LABELS: Record<Horizon, string> = {
  soon: "Within a year",
  middle: "In 1–3 years",
  later: "Not anytime soon",
  unsure: "I'm not sure yet",
};
export const HORIZON_EXPLANATIONS: Record<Horizon, string> = {
  soon: "You may need this money within a year.",
  middle: "You may need this money in the next few years.",
  later: "You don't expect to need this money soon.",
  unsure: "You aren't sure when you'll need this money.",
};

export function newJourney(choices: PracticeChoice[] = []): JourneyState {
  return {
    step: "welcome", goal: "your money", amount: null, horizon: null,
    exposedPercent: 20, messages: [], nextId: 1, choices,
  };
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function resolveMoney(text: string): number | null {
  const numberPattern = "(\d{1,3}(?:[.,]\d{3})+|\d{3,8})";
  const patterns = [
    new RegExp("(?:R\\$\\s*|BRL\\s*)" + numberPattern + "\\b", "i"),
    new RegExp("\\b" + numberPattern + "\\s*(?:reais|BRL)\\b", "i"),
    new RegExp("^\\s*(?:about|around|roughly)?\\s*" + numberPattern + "\\s*$", "i"),
    new RegExp("\\b(?:have|invest|available|use|with)\\s*(?:about|around|roughly)?\\s*" + numberPattern + "\\b", "i"),
  ];
  const found = patterns.map((pattern) => text.match(pattern)).find(Boolean);
  if (!found) return null;
  const value = Number(found[1].replace(/[.,]/g, ""));
  return Number.isFinite(value) && value >= 100 && value <= 10_000_000 ? value : null;
}

export function resolveHorizon(text: string): Horizon | null {
  const value = text.toLowerCase();
  if (/\b(this year|within a year|this month|next month|very soon|few months|6 months|soon|emergency|short.term)\b/.test(value)) return "soon";
  if (/\b(1\s*[-–to]+\s*3|1 to 3|couple of years|two years|three years|2 years|3 years)\b/.test(value)) return "middle";
  if (/\b(5\+|5 years|five years|ten years|10 years|long.term|many years|not anytime soon|retirement|far away)\b/.test(value)) return "later";
  if (/\b(not sure|don't know|unsure|no idea)\b/.test(value)) return "unsure";
  return null;
}

export function resolveGoal(text: string): string {
  if (/\b(home|house|apartment|mortgage|casa)\b/i.test(text)) return "your home";
  if (/\b(retir|future|aposent)/i.test(text)) return "your future";
  if (/\b(travel|trip|vacation)/i.test(text)) return "your travels";
  return "your money";
}

export function scenario(amount: number, exposedPercent: number) {
  const exposed = Math.max(0, Math.min(100, exposedPercent));
  const accessiblePercent = 100 - exposed;
  const exposedValue = amount * exposed / 100;
  return {
    accessiblePercent,
    exposedPercent: exposed,
    accessibleValue: amount * accessiblePercent / 100,
    exposedValue,
    hypotheticalLoss20: exposedValue * 0.2,
    provenance: "illustrative" as const,
  };
}

function add(state: JourneyState, ...items: Array<{ kind: MessageKind; text?: string }>): JourneyState {
  let nextId = state.nextId;
  const messages = items.map((item) => ({ ...item, id: nextId++ }));
  return { ...state, nextId, messages: [...state.messages, ...messages] };
}

function start(state: JourneyState, text: string): JourneyState {
  const amount = resolveMoney(text);
  const horizon = resolveHorizon(text);
  const explore = /just explore|just curious|simple example/i.test(text);
  const next: JourneyState = {
    ...newJourney(state.choices),
    goal: resolveGoal(text),
    amount: explore ? 5_000 : amount,
    horizon: explore ? "unsure" : horizon,
    step: explore || (horizon && amount !== null) ? "visual" : horizon ? "amount" : "horizon",
  };
  if (explore) return add(next, { kind: "user", text }, { kind: "text", text: "We can start with a made-up R$ 5,000. Nothing needs to be real to explore." }, { kind: "scenario" });
  return add(next, { kind: "user", text }, { kind: next.step === "visual" ? "scenario" : next.step });
}

export function journeyReducer(state: JourneyState, event: JourneyEvent): JourneyState {
  switch (event.type) {
    case "RESET": return newJourney(state.choices);
    case "CLEAR_HISTORY": return { ...state, choices: [] };
    case "START": return start(state, event.text);
    case "PICK_HORIZON": {
      if (state.step !== "horizon") return state;
      const step = state.amount === null ? "amount" : "visual";
      return add({ ...state, horizon: event.value, step }, { kind: "user", text: HORIZON_LABELS[event.value] }, { kind: step === "visual" ? "scenario" : "amount" });
    }
    case "PICK_AMOUNT": {
      if (state.step !== "amount" || !Number.isFinite(event.value) || event.value < 100 || event.value > 10_000_000) return state;
      return add({ ...state, amount: event.value, step: "visual" }, { kind: "user", text: formatBRL(event.value) }, { kind: "scenario" });
    }
    case "EXPOSURE":
      if (state.step !== "visual" || !Number.isFinite(event.value)) return state;
      return { ...state, exposedPercent: Math.max(0, Math.min(100, Math.round(event.value / 5) * 5)) };
    case "SAVE": {
      if (state.step !== "visual" || state.amount === null) return state;
      const choice: PracticeChoice = {
        id: event.id, at: event.at, amount: state.amount,
        exposedPercent: state.exposedPercent,
        accessiblePercent: 100 - state.exposedPercent,
        goal: state.goal, horizon: state.horizon,
        provenance: "illustrative", executed: false,
      };
      return add({ ...state, choices: [choice, ...state.choices] }, { kind: "saved" });
    }
    case "SUBMIT": {
      const text = event.text.trim();
      if (!text) return state;
      if (/^(new thought|start over|restart|reset)$/i.test(text)) return newJourney(state.choices);
      if (state.step === "welcome") return start(state, text);
      if (state.step === "horizon") {
        const horizon = resolveHorizon(text);
        if (horizon) return add(
          { ...state, horizon, step: state.amount === null ? "amount" : "visual" },
          { kind: "user", text }, { kind: state.amount === null ? "amount" : "scenario" },
        );
        const amount = resolveMoney(text);
        return add(
          { ...state, amount: amount ?? state.amount },
          { kind: "user", text },
          { kind: "text", text: amount !== null
            ? "Got it. I'll use " + formatBRL(amount) + " as an example, without assuming it's real. I still need one thing:"
            : "Knowing when you might need the money helps this illustration. Which timeframe feels closest?" },
          { kind: "horizon" },
        );
      }
      if (state.step === "amount") {
        const amount = resolveMoney(text);
        if (amount !== null) return add(
          { ...state, amount, step: "visual" }, { kind: "user", text }, { kind: "scenario" },
        );
        return add(state, { kind: "user", text }, { kind: "amount" });
      }
      const percent = text.match(/\b(\d{1,3})\s*%/);
      if (percent) {
        let value = Number(percent[1]);
        if (value > 100) return add(state, { kind: "user", text }, { kind: "text", text: "An allocation can be between 0% and 100%. What share would you like to explore?" });
        if (/accessible|cash|reserve/i.test(text)) value = 100 - value;
        const exposedPercent = Math.round(value / 5) * 5;
        return add({ ...state, exposedPercent },
          { kind: "user", text },
          { kind: "text", text: "This example now keeps " + (100 - exposedPercent) + "% accessible and " + exposedPercent + "% market-exposed. Nothing was purchased." });
      }
      if (/\b(less risk|safer|more accessible|reduce exposure|less exposure)\b/i.test(text)) {
        const exposedPercent = Math.max(0, state.exposedPercent - 10);
        return add({ ...state, exposedPercent },
          { kind: "user", text }, { kind: "text", text: "The example now has " + exposedPercent + "% market exposure. This changes no real holdings." });
      }
      if (/\b(more risk|more exposure|more aggressive|more market)\b/i.test(text)) {
        const exposedPercent = Math.min(100, state.exposedPercent + 10);
        return add({ ...state, exposedPercent },
          { kind: "user", text }, { kind: "text", text: "The example now has " + exposedPercent + "% market exposure. More exposure means more potential gains and losses, not a guaranteed return." });
      }
      const amount = resolveMoney(text);
      if (amount !== null) return add({ ...state, amount }, { kind: "user", text }, { kind: "text", text: "Updated the hypothetical amount to " + formatBRL(amount) + ". This is not a real balance." });
      return add(state, { kind: "user", text }, { kind: "unsupported" });
    }
  }
}
