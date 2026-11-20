import { useId } from "react";
import type { HumanSupportPlan, SupportMode, SupportPreferences } from "@signal/decision/core";

export function LuminaSupportControls({ value, onChange }: {
  value: SupportPreferences; onChange: (next: SupportPreferences) => void;
}) {
  const id = useId();
  const pt = value.locale === "pt-BR";
  const labels: Array<[SupportMode, string]> = [
    ["balanced", pt ? "Equilibrada" : "Balanced"],
    ["direct", pt ? "Direta" : "Direct"],
    ["step-by-step", pt ? "Passo a passo" : "Step by step"],
  ];
  return <details className="l-support-settings">
    <summary>{pt ? "Prefer\u00eancias de resposta" : "Response preferences"}</summary>
    <div className="l-support-options">
      <fieldset>
        <legend>{pt ? "Como prefere explorar?" : "How would you like to explore?"}</legend>
        <div className="l-support-modes">
          {labels.map(([mode, label]) => <label key={mode}>
            <input type="radio" name={id + "-mode"} value={mode} checked={value.mode === mode}
              onChange={() => onChange({ ...value, mode })} />{label}
          </label>)}
        </div>
      </fieldset>
      <label className="l-support-language" htmlFor={id + "-language"}>
        {pt ? "Idioma do apoio" : "Support language"}
        <select id={id + "-language"} value={value.locale}
          onChange={event => onChange({ ...value, locale: event.target.value === "pt-BR" ? "pt-BR" : "en" })}>
          <option value="en">English</option><option value="pt-BR">{"Portugu\u00eas (Brasil)"}</option>
        </select>
      </label>
      <label className="l-support-toggle">
        <input type="checkbox" checked={value.adaptToExplicitCues}
          onChange={event => onChange({ ...value, adaptToExplicitCues: event.target.checked })} />
        {pt ? "Adaptar o apoio ao que digo nesta mensagem" : "Adapt support to what I explicitly say in this message"}
      </label>
      <p>{pt ? "Estas prefer\u00eancias ficam nesta p\u00e1gina e s\u00e3o redefinidas em Nova conversa. N\u00e3o criamos um perfil emocional. O idioma se aplica ao apoio e ao chat de IA, n\u00e3o a todo o aplicativo."
        : "These preferences stay on this page and reset with New thought. No emotional profile is created. Language applies to support and AI chat, not the entire app."}</p>
    </div>
  </details>;
}

export function LuminaSupportExplanation({ plan, onCorrect, showAcknowledgement = false }: {
  plan: HumanSupportPlan; onCorrect: () => void; showAcknowledgement?: boolean;
}) {
  const pt = plan.locale === "pt-BR";
  return <aside className="l-support-explanation" aria-label={pt ? "Sobre esta resposta" : "About this response"}>
    {showAcknowledgement && plan.acknowledgement ? <p>{plan.acknowledgement}</p> : null}
    <details><summary>{pt ? "Por que esta resposta?" : "Why this response?"}</summary>
      <p>{plan.explanation}</p>
      <p>{pt ? "O apoio n\u00e3o altera investimentos, permiss\u00f5es ou evid\u00eancias." : "Support does not change investments, permissions or evidence."}</p>
      <button type="button" onClick={onCorrect}>
        {pt ? "Corrigir: usar respostas diretas" : "That interpretation is not right: use Direct responses"}
      </button>
    </details>
  </aside>;
}
