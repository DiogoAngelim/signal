import type {
  AttentionLevel,
  AuthenticatedUser,
  LearningRecommendation,
  StudentLearningSummary,
} from "@/api/types";
import {
  AlertCircle,
  BookMarked,
  CalendarCheck,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  HeartHandshake,
  type Home,
  Lightbulb,
  LogOut,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo, useState } from "react";

export interface ParentDashboardProps {
  dashboards: StudentLearningSummary[];
  user: AuthenticatedUser | null;
  onSignOut: () => void;
}

type SectionId =
  | "overview"
  | "strengths"
  | "practice"
  | "monitor"
  | "discuss"
  | "support"
  | "review"
  | "next-step";

const sections: Array<{
  id: SectionId;
  label: string;
  description: string;
  icon: typeof Home;
}> = [
  {
    id: "overview",
    label: "Student overview",
    description: "Current context",
    icon: UserRound,
  },
  {
    id: "strengths",
    label: "What is going well",
    description: "Encourage",
    icon: Sparkles,
  },
  {
    id: "practice",
    label: "What needs practice",
    description: "Repeat gently",
    icon: BookMarked,
  },
  {
    id: "monitor",
    label: "What to monitor",
    description: "Watch calmly",
    icon: AlertCircle,
  },
  {
    id: "discuss",
    label: "What to discuss",
    description: "Conversation",
    icon: MessageCircle,
  },
  {
    id: "support",
    label: "Where to give support",
    description: "Home plan",
    icon: HeartHandshake,
  },
  {
    id: "review",
    label: "Learning review",
    description: "What changed",
    icon: ClipboardList,
  },
  {
    id: "next-step",
    label: "Recommended next step",
    description: "One action",
    icon: CheckCircle2,
  },
];

function formatDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

function attentionLabel(level: AttentionLevel): string {
  if (level === "needs-support") return "Needs support";
  if (level === "watch") return "Watch";
  return "Steady";
}

function attentionClass(level: AttentionLevel): string {
  return `attention attention--${level}`;
}

function RecommendationList({ items }: { items: LearningRecommendation[] }) {
  return (
    <div className="recommendation-grid">
      {items.map((item) => (
        <article className="recommendation-card" key={item.id}>
          <div className="recommendation-header">
            <span className={attentionClass(item.attentionLevel)}>
              {attentionLabel(item.attentionLevel)}
            </span>
            <span className="evidence-count">{item.evidenceCount} notes</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.explanation}</p>
          <div className="parent-action">
            <Lightbulb aria-hidden="true" />
            <span>{item.parentAction}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export function StudentOverview({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  const { student } = dashboard;
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Student overview</p>
          <h2>{student.childName}</h2>
        </div>
        <span className="verified-pill">
          <ShieldCheck aria-hidden="true" />
          Parent access validated
        </span>
      </div>

      <div className="overview-grid">
        <div className="overview-item">
          <span>Grade and class</span>
          <strong>
            {student.grade} - {student.className}
          </strong>
        </div>
        <div className="overview-item">
          <span>Teacher</span>
          <strong>{student.teacher.name}</strong>
        </div>
        <div className="overview-item">
          <span>Last update</span>
          <strong>{formatDate(student.lastUpdate)}</strong>
        </div>
        <div className="overview-item">
          <span>Access email</span>
          <strong>{dashboard.dashboardPermissions.validatedParentEmail}</strong>
        </div>
      </div>

      <div className="subject-grid">
        {dashboard.subjects.map((subject) => (
          <article key={subject.subject} className="subject-card">
            <div className="subject-card__top">
              <h3>{subject.subject}</h3>
              <span className={`confidence confidence--${subject.confidence}`}>
                {subject.confidence.replace("-", " ")}
              </span>
            </div>
            <p className="subject-focus">{subject.currentFocus}</p>
            <p>{subject.progressNote}</p>
            <ul>
              {subject.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function LearningStrengths({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">What is going well</p>
          <h2>Strengths to encourage</h2>
        </div>
      </div>
      <RecommendationList items={dashboard.strengths} />
    </section>
  );
}

export function PracticeNeeds({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">What needs practice</p>
          <h2>Skills for gentle repetition</h2>
        </div>
      </div>
      <RecommendationList items={dashboard.practiceNeeds} />
    </section>
  );
}

export function MonitorAreas({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">What to monitor</p>
          <h2>Patterns to watch calmly</h2>
        </div>
      </div>
      <RecommendationList items={dashboard.monitorAreas} />
    </section>
  );
}

export function DiscussionPrompts({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">What to discuss</p>
          <h2>Conversation prompts</h2>
        </div>
      </div>
      <div className="two-column">
        <div className="prompt-panel">
          <h3>With your child</h3>
          <ul>
            {dashboard.discussionPrompts.child.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
        <div className="prompt-panel">
          <h3>With the teacher</h3>
          <ul>
            {dashboard.discussionPrompts.teacher.map((prompt) => (
              <li key={prompt}>{prompt}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function SupportPlan({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Where to give support</p>
          <h2>Practical care plan</h2>
        </div>
      </div>
      <RecommendationList items={dashboard.supportPlan} />
    </section>
  );
}

export function LearningReview({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  const groups = [
    ["What changed", dashboard.learningReview.changed],
    ["What improved", dashboard.learningReview.improved],
    ["What stayed stable", dashboard.learningReview.stable],
    ["Still needs more evidence", dashboard.learningReview.stillNeedsProof],
  ] as const;
  const qualityGroups = [
    ["Supporting evidence", dashboard.decisionQuality.supportingEvidence],
    ["Assumptions", dashboard.decisionQuality.assumptions],
    [
      "Contradictory indicators",
      dashboard.decisionQuality.contradictoryIndicators,
    ],
    ["Unknowns", dashboard.decisionQuality.unknowns],
    ["Lessons", dashboard.decisionQuality.lessons],
    ["Next actions", dashboard.decisionQuality.nextActions],
  ] as const;

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Learning review</p>
          <h2>What the evidence says</h2>
        </div>
      </div>
      <div className="review-grid">
        {groups.map(([title, items]) => (
          <article className="review-panel" key={title}>
            <h3>{title}</h3>
            <ul>
              {items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="decision-quality-panel">
        <div className="decision-quality-panel__header">
          <div>
            <p className="eyebrow">Decision quality</p>
            <h3>What AlgAI knows and still needs to check</h3>
          </div>
          <span>{dashboard.decisionQuality.nextBestEvidence.title}</span>
        </div>
        <div className="decision-quality-grid">
          {qualityGroups.map(([title, items]) => (
            <article className="quality-column" key={title}>
              <h4>{title}</h4>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="next-evidence">
          <strong>Next best evidence</strong>
          <p>{dashboard.decisionQuality.nextBestEvidence.whyItMatters}</p>
          <span>
            {dashboard.decisionQuality.nextBestEvidence.expectedImpact}
          </span>
        </div>
      </div>

      <div className="timeline">
        {dashboard.recentChanges.map((change) => (
          <article key={change.id} className="timeline-item">
            <CalendarCheck aria-hidden="true" />
            <div>
              <div className="timeline-meta">
                <span>{formatDate(change.date)}</span>
                <span className={attentionClass(change.attentionLevel)}>
                  {attentionLabel(change.attentionLevel)}
                </span>
              </div>
              <h3>{change.label}</h3>
              <p>{change.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function RecommendedNextStep({
  dashboard,
}: { dashboard: StudentLearningSummary }) {
  return (
    <section className="dashboard-section">
      <div className="next-step-panel">
        <div>
          <p className="eyebrow">Recommended next step</p>
          <h2>{dashboard.recommendedNextStep.title}</h2>
          <p>{dashboard.recommendedNextStep.detail}</p>
          <span>{dashboard.recommendedNextStep.whyNow}</span>
        </div>
        <CheckCircle2 aria-hidden="true" />
      </div>
    </section>
  );
}

export function ParentDashboard({
  dashboards,
  user,
  onSignOut,
}: ParentDashboardProps) {
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState(
    dashboards[0]?.student.id ?? "",
  );
  const dashboard = useMemo(
    () =>
      dashboards.find((item) => item.student.id === activeStudentId) ??
      dashboards[0],
    [activeStudentId, dashboards],
  );

  const activeIndex = useMemo(
    () => sections.findIndex((section) => section.id === activeSection),
    [activeSection],
  );

  if (!dashboard) {
    return (
      <main className="access-shell">
        <section className="access-panel access-panel--compact">
          <img
            src="/logo.png"
            alt="AlgAI"
            className="access-mark access-mark--logo"
          />
          <p>No parent dashboard data is available for this AlgAI login.</p>
        </section>
      </main>
    );
  }

  return (
    <div className="dashboard-shell">
      <aside
        className={
          railCollapsed
            ? "section-rail section-rail--collapsed"
            : "section-rail"
        }
      >
        <div className="rail-brand">
          <img src="/logo.png" alt="AlgAI" />
          {!railCollapsed ? (
            <div>
              <strong>AlgAI</strong>
              <span>Parent view</span>
            </div>
          ) : null}
        </div>
        <button
          className="rail-toggle"
          onClick={() => setRailCollapsed((value) => !value)}
          aria-label={
            railCollapsed ? "Expand section rail" : "Collapse section rail"
          }
        >
          {railCollapsed ? (
            <PanelLeftOpen aria-hidden="true" />
          ) : (
            <PanelLeftClose aria-hidden="true" />
          )}
        </button>
        <nav aria-label="Parent dashboard sections">
          {sections.map((section, index) => {
            const Icon = section.icon;
            const selected = section.id === activeSection;
            const complete = index < activeIndex;
            return (
              <button
                key={section.id}
                className={
                  selected ? "rail-item rail-item--active" : "rail-item"
                }
                onClick={() => setActiveSection(section.id)}
                aria-current={selected ? "step" : undefined}
              >
                <Icon aria-hidden="true" />
                {!railCollapsed ? (
                  <>
                    <span>
                      <strong>{section.label}</strong>
                      <small>{section.description}</small>
                    </span>
                    {complete ? (
                      <CheckCircle2 aria-hidden="true" className="rail-done" />
                    ) : (
                      <ChevronRight aria-hidden="true" />
                    )}
                  </>
                ) : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Parent dashboard</p>
            <h1>{dashboard.student.childName}'s learning summary</h1>
            <p>
              Live AlgAI learning data for the students connected to this parent
              email.
            </p>
          </div>
          <div className="header-actions">
            <span className="user-pill">
              {user?.email ??
                dashboard.dashboardPermissions.validatedParentEmail}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh learning summary"
            >
              <RefreshCw aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              onClick={onSignOut}
              aria-label="Sign out"
            >
              <LogOut aria-hidden="true" />
            </button>
          </div>
        </header>

        {dashboards.length > 1 ? (
          <div className="student-switcher" aria-label="Associated students">
            <div className="student-switcher__label">
              <UsersRound aria-hidden="true" />
              <span>{dashboards.length} associated students</span>
            </div>
            <div className="student-switcher__buttons">
              {dashboards.map((item) => {
                const selected = item.student.id === dashboard.student.id;
                return (
                  <button
                    key={item.student.id}
                    className={
                      selected
                        ? "student-tab student-tab--active"
                        : "student-tab"
                    }
                    onClick={() => {
                      setActiveStudentId(item.student.id);
                      setActiveSection("overview");
                    }}
                    aria-pressed={selected}
                  >
                    <strong>{item.student.childName}</strong>
                    <span>{item.student.className}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="summary-band">
          <div>
            <p className="eyebrow">Start here</p>
            <h2>{dashboard.recommendedNextStep.title}</h2>
            <p>{dashboard.recommendedNextStep.whyNow}</p>
          </div>
          <button
            className="primary-button"
            onClick={() => setActiveSection("next-step")}
          >
            <CheckCircle2 aria-hidden="true" />
            View action
          </button>
        </div>

        {activeSection === "overview" ? (
          <StudentOverview dashboard={dashboard} />
        ) : null}
        {activeSection === "strengths" ? (
          <LearningStrengths dashboard={dashboard} />
        ) : null}
        {activeSection === "practice" ? (
          <PracticeNeeds dashboard={dashboard} />
        ) : null}
        {activeSection === "monitor" ? (
          <MonitorAreas dashboard={dashboard} />
        ) : null}
        {activeSection === "discuss" ? (
          <DiscussionPrompts dashboard={dashboard} />
        ) : null}
        {activeSection === "support" ? (
          <SupportPlan dashboard={dashboard} />
        ) : null}
        {activeSection === "review" ? (
          <LearningReview dashboard={dashboard} />
        ) : null}
        {activeSection === "next-step" ? (
          <RecommendedNextStep dashboard={dashboard} />
        ) : null}
      </main>
    </div>
  );
}
