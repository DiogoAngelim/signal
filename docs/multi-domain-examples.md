# Multi-Domain Examples

This document shows how Signal's decision-processing model applies across
multiple domains. These examples are illustrative — they explain
architectural generality, not implemented features.

Signal's core model:

```txt
Event → Evidence → Assessment → Decision → Learning → Memory → Action
```

This pattern is domain-agnostic. Trading is one instantiation. The examples
below demonstrate that the same architecture serves many domains.

---

## AI Agents

An AI agent receives a user request, gathers observations, assesses
confidence, and decides on an action.

### Decision Flow

```txt
User Request
→ Observation (evidence gathering)
→ Assessment (confidence, unknowns, assumptions)
→ Action Decision (with evidence and journal)
→ Outcome Observation (did the action help?)
→ Learning (what worked, what didn't)
→ Memory (surviving lessons for future requests)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| User request | Event |
| Observation data | Evidence (quality, reliability, freshness) |
| Confidence in response | Assessment (known, unknowns, assumptions) |
| Chosen action | Decision (with journal) |
| Action result | Outcome |
| What worked/didn't | Review |
| Improved behavior | Lesson |
| Past interactions | Decision Memory |

### Why Signal Fits

AI agents need auditable reasoning. When an agent takes an action, the
decision must carry evidence, acknowledge unknowns, and be reviewable after
the outcome. Signal's journal-before-outcome model prevents hindsight bias
in agent evaluation. Lesson survival ensures that agents improve from
reviewed experience rather than from unreviewed patterns.

---

## Recommendation Systems

A recommendation system observes behavior, gathers evidence about
preferences, and produces recommendations with assessed confidence.

### Decision Flow

```txt
Behavior Observation
→ Evidence (preference signals, interaction quality)
→ Assessment (confidence, unknowns about intent)
→ Recommendation (with evidence and caveats)
→ User Response (accepted, ignored, rejected)
→ Learning (which signals predicted acceptance)
→ Memory (surviving recommendation patterns)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| User behavior | Event |
| Preference signals | Evidence |
| Recommendation confidence | Assessment |
| Recommended item/action | Decision |
| User response | Outcome |
| Signal analysis | Review |
| Improved recommendation logic | Lesson |

### Why Signal Fits

Recommendation systems often operate as black boxes. Signal makes the
reasoning explicit: what evidence supported the recommendation, what was
assumed about the user, and what confidence was assigned. When a
recommendation fails, the review process identifies which signals were
misleading and what should change.

---

## Healthcare

A clinical system observes patient data, assesses conditions, and recommends
interventions with tracked uncertainty.

### Decision Flow

```txt
Patient Observation
→ Evidence (vitals, lab results, history)
→ Assessment (diagnosis confidence, unknowns, assumptions)
→ Intervention Decision (with evidence and journal)
→ Patient Outcome (did the intervention help?)
→ Clinical Review (what worked, what was missed)
→ Learning (surviving clinical lessons)
→ Memory (guidelines from reviewed cases)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| Patient observation | Event |
| Vitals, labs, history | Evidence (quality, reliability, freshness) |
| Diagnostic confidence | Assessment (known, unknowns, assumptions) |
| Treatment plan | Decision (with journal) |
| Patient outcome | Outcome |
| Clinical review | Review |
| Treatment protocol update | Lesson |

### Why Signal Fits

Healthcare decisions carry high stakes and significant uncertainty. Signal's
model ensures that diagnostic confidence is capped by evidence quality,
unknowns are visible before action, and assumptions are journaled before
outcomes. Clinical reviews connect outcomes to prior judgment, and surviving
lessons inform future diagnoses.

---

## Cybersecurity

A security system observes events, gathers evidence about threats, and
decides whether to escalate alerts.

### Decision Flow

```txt
Security Event
→ Evidence (log data, anomaly scores, correlation)
→ Assessment (threat confidence, unknowns, assumptions)
→ Alert Decision (escalate, monitor, dismiss)
→ Incident Outcome (was it a real threat?)
→ Post-Incident Review (what was missed, what was over-called)
→ Learning (surviving threat signatures)
→ Memory (threat patterns from reviewed incidents)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| Security event | Event |
| Log data, anomaly scores | Evidence |
| Threat confidence | Assessment |
| Alert escalation | Decision |
| Incident outcome | Outcome |
| Post-incident review | Review |
| Threat signature update | Lesson |

### Why Signal Fits

Security operations suffer from alert fatigue and missed threats. Signal's
model ensures that alert decisions carry evidence, acknowledge unknowns, and
are reviewable after the incident. Lesson survival ensures that threat
signatures improve from reviewed incidents, not just from volume.

---

## Education

An educational system observes student activity, assesses understanding, and
recommends learning interventions.

### Decision Flow

```txt
Student Activity
→ Evidence (performance data, engagement, context)
→ Assessment (understanding confidence, gaps, assumptions)
→ Learning Recommendation (with evidence and caveats)
→ Student Outcome (did the intervention help?)
→ Pedagogical Review (what worked, what was missed)
→ Learning (surviving pedagogical lessons)
→ Memory (guidelines from reviewed interventions)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| Student activity | Event |
| Performance data | Evidence |
| Understanding confidence | Assessment |
| Learning recommendation | Decision |
| Student outcome | Outcome |
| Pedagogical review | Review |
| Improved intervention | Lesson |

### Why Signal Fits

Educational decisions affect student trajectories. Signal's model ensures
that recommendations carry evidence, acknowledge what is unknown about the
student's context, and are reviewable after the outcome. Surviving lessons
inform future recommendations with reviewed experience rather than
assumption.

---

## Business Automation

A business automation system observes workflow events, evaluates conditions,
and decides on actions with tracked reasoning.

### Decision Flow

```txt
Workflow Event
→ Evidence (state data, policy compliance, constraints)
→ Assessment (action confidence, unknowns, assumptions)
→ Action Decision (approve, reject, escalate)
→ Action Outcome (did the action achieve the goal?)
→ Process Review (what worked, what was inefficient)
→ Learning (surviving process improvements)
→ Memory (guidelines from reviewed decisions)
```

### Signal Mapping

| Domain Concept | Signal Contract |
|---------------|-----------------|
| Workflow event | Event |
| State data, policy | Evidence |
| Action confidence | Assessment |
| Approved/rejected action | Decision |
| Action result | Outcome |
| Process review | Review |
| Process improvement | Lesson |

### Why Signal Fits

Business automation decisions often lack transparency. When an approval is
denied or an escalation is triggered, stakeholders need to understand why.
Signal's model ensures that every automation decision carries evidence,
acknowledges unknowns, and is reviewable after the outcome.

---

## Common Pattern

Across all domains, the same Signal contracts appear:

| Signal Contract | Universal Meaning |
|----------------|-------------------|
| **Event** | Something observable occurred |
| **Evidence** | The observation is characterized with quality metrics |
| **Assessment** | Uncertainty is made visible before action |
| **Decision** | Judgment is formed with evidence and journal |
| **Outcome** | What happened after the decision |
| **Review** | Why it happened and what should change |
| **Lesson** | Reusable learning extracted from review |
| **Memory** | Surviving lessons persist for future judgment |

This common pattern is why Signal is a decision-processing platform, not a
domain-specific tool. Any system that needs structured, auditable, learning
judgment can build on Signal.

## Building a New Domain

To apply Signal to a new domain:

1. **Identify your events** — What observable things happen in your domain?
2. **Define your evidence** — What characterizes those events? What quality
   dimensions matter?
3. **Map your assessment** — What is known, unknown, and assumed before
   action?
4. **Define your decisions** — What judgments does your domain require?
5. **Plan your outcomes** — How will you know what happened?
6. **Design your reviews** — How will you learn from outcomes?
7. **Store your memory** — What lessons should survive for future judgment?

Then implement using Signal's packages:

- `@signal/protocol` for contracts
- `@signal/runtime` for execution
- `@signal/decision` for reasoning
- `@signal/decision-memory` for persistence
- `@signal/ports` for dependency inversion

See [Architecture](architecture.md) for the full architectural model and
[Dependency Rules](dependency-rules.md) for package boundary rules.