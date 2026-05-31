import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  Bell,
  Brain,
  CheckCircle2,
  Compass,
  Flag,
  Gauge,
  History,
  Layers,
  LineChart,
  Medal,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import type {
  CommandCenterBoss,
  CommandCenterMission,
  CommandCenterProgressMetric,
  CommandCenterSkillState,
  CommandCenterTone,
  CommandCenterViewModel,
} from "@/lib/command-center";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function boundedPct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return 0;
  return Math.min(100, Math.max(0, Number(value)));
}

function toneClasses(tone: CommandCenterTone) {
  if (tone === "good") return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  if (tone === "warn") return "border-[#FDD000]/30 bg-[#FDD000]/12 text-[#FDD000]";
  if (tone === "bad") return "border-red-300/25 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/[0.045] text-zinc-300";
}

function skillTone(state: CommandCenterSkillState) {
  if (state === "Mastered") return "border-emerald-300/30 bg-emerald-400/10 text-emerald-100";
  if (state === "Mature") return "border-cyan-300/25 bg-cyan-400/10 text-cyan-100";
  if (state === "Growing") return "border-[#FDD000]/30 bg-[#FDD000]/12 text-[#FDD000]";
  return "border-white/10 bg-white/[0.035] text-zinc-500";
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: CommandCenterTone;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
        toneClasses(tone),
      )}
    >
      {children}
    </span>
  );
}

function ProgressRail({
  value,
  tone = "warn",
}: {
  value: number;
  tone?: CommandCenterTone;
}) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500",
          tone === "good" && "bg-emerald-300",
          tone === "warn" && "bg-[#FDD000]",
          tone === "bad" && "bg-red-300",
          tone === "neutral" && "bg-cyan-300",
        )}
        style={{ width: `${boundedPct(value)}%` }}
      />
    </div>
  );
}

function Panel({
  title,
  eyebrow,
  icon,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "min-w-0 rounded-lg border border-white/[0.075] bg-[#0c0f12]/88 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.24)]",
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/70">
              {eyebrow}
            </div>
          ) : null}
          <h3 className="mt-1 text-base font-semibold tracking-tight text-white">
            {title}
          </h3>
        </div>
        {icon ? <div className="text-[#FDD000]">{icon}</div> : null}
      </div>
      {children}
    </section>
  );
}

function MissionRow({ mission }: { mission: CommandCenterMission }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-100">
            {mission.label}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {mission.current} / target {mission.target}
          </div>
        </div>
        <Pill tone={mission.tone}>{Math.round(mission.progressPct)}%</Pill>
      </div>
      <div className="mt-3">
        <ProgressRail value={mission.progressPct} tone={mission.tone} />
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-400">
        Unlock reward: {mission.reward}
      </div>
    </div>
  );
}

function BossRow({ boss }: { boss: CommandCenterBoss }) {
  const tone: CommandCenterTone =
    boss.threatLevel === "Critical" || boss.threatLevel === "High"
      ? "bad"
      : boss.threatLevel === "Medium"
        ? "warn"
        : "neutral";

  return (
    <div className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">{boss.name}</div>
          <div className="mt-1 text-xs text-zinc-500">
            Strength: {boss.strengthPct}%
          </div>
        </div>
        <Pill tone={tone}>{boss.threatLevel}</Pill>
      </div>
      <div className="mt-3">
        <ProgressRail value={boss.progressPct} tone={tone === "bad" ? "warn" : "good"} />
      </div>
      <div className="mt-2 text-xs leading-5 text-zinc-400">
        Defeat condition: {boss.defeatCondition}
      </div>
    </div>
  );
}

function useProgressGains(metrics: CommandCenterProgressMetric[]) {
  const previousRef = useRef<Record<string, number> | null>(null);
  const [gains, setGains] = useState<Array<{ id: string; label: string; gain: number }>>([]);

  useEffect(() => {
    const previous = previousRef.current;
    const current = Object.fromEntries(
      metrics.map((metric) => [metric.id, metric.value]),
    );

    if (previous) {
      const nextGains = metrics
        .map((metric) => ({
          id: metric.id,
          label: metric.label,
          gain: metric.value - (previous[metric.id] ?? metric.value),
        }))
        .filter((metric) => metric.gain > 0);

      setGains(nextGains);
      if (nextGains.length) {
        const timeout = window.setTimeout(() => setGains([]), 3600);
        previousRef.current = current;
        return () => window.clearTimeout(timeout);
      }
    }

    previousRef.current = current;
  }, [metrics]);

  return gains;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "Recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function useLegacyNotifications(model: CommandCenterViewModel) {
  const previousRef = useRef<{
    achievements: Set<string>;
    campaigns: Set<string>;
    rank: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: string; label: string; detail: string }>>([]);

  useEffect(() => {
    const current = {
      achievements: new Set(model.achievements.filter((achievement) => achievement.unlocked).map((achievement) => achievement.id)),
      campaigns: new Set(model.campaignHistory.filter((campaign) => campaign.status === "Completed").map((campaign) => campaign.id)),
      rank: model.reputation.rank,
    };
    const previous = previousRef.current;

    if (previous) {
      const nextNotifications = [
        ...model.achievements
          .filter((achievement) => achievement.unlocked && !previous.achievements.has(achievement.id))
          .map((achievement) => ({
            id: `achievement:${achievement.id}`,
            label: "Achievement Unlocked",
            detail: `${achievement.label} · ${achievement.rarity}`,
          })),
        ...model.campaignHistory
          .filter((campaign) => campaign.status === "Completed" && !previous.campaigns.has(campaign.id))
          .map((campaign) => ({
            id: `campaign:${campaign.id}`,
            label: "Campaign Complete",
            detail: `${campaign.name} · Reward unlocked`,
          })),
        ...(previous.rank !== model.reputation.rank
          ? [{
              id: `rank:${model.reputation.rank}`,
              label: "Rank Up",
              detail: `${previous.rank} -> ${model.reputation.rank}`,
            }]
          : []),
      ];

      if (nextNotifications.length) {
        setNotifications(nextNotifications);
        const timeout = window.setTimeout(() => setNotifications([]), 4200);
        previousRef.current = current;
        return () => window.clearTimeout(timeout);
      }
    }

    previousRef.current = current;
  }, [model]);

  return notifications;
}

export function CommandCenter({ model }: { model: CommandCenterViewModel }) {
  const gains = useProgressGains(model.progressMetrics);
  const notifications = useLegacyNotifications(model);
  const unlockedAchievements = model.achievements.filter(
    (achievement) => achievement.unlocked,
  );

  return (
    <section
      data-testid="command-center"
      className="mb-12 overflow-hidden rounded-lg border border-cyan-200/[0.12] bg-[linear-gradient(135deg,#081014,#090909_54%,#070b0d)] shadow-[0_28px_100px_rgba(0,0,0,0.42)]"
    >
      <div className="border-b border-white/[0.07] bg-white/[0.025] px-4 py-4 sm:px-5 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">Command Center</Pill>
              <Pill tone="neutral">{model.market}</Pill>
              <Pill tone="good">{model.operatorClass}</Pill>
              <Pill tone="neutral">{model.reputation.rank}</Pill>
            </div>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-5xl">
              Signal Command Center
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-zinc-400 md:text-base">
              {model.advisor.assessment}
            </p>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:w-[470px]">
            <div className="rounded-lg border border-white/[0.08] bg-black/25 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                <Gauge className="h-4 w-4 text-[#FDD000]" />
                Operator Level
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                Level {model.level.level}
              </div>
              <div className="mt-1 text-sm text-zinc-300">{model.level.title}</div>
              <div className="mt-4">
                <ProgressRail value={model.level.progressToNextPct} tone="warn" />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Next Rank: {model.level.nextTitle ?? "Maximum rank"}
              </div>
            </div>

            <div className="rounded-lg border border-white/[0.08] bg-black/25 p-4">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                <Sparkles className="h-4 w-4 text-cyan-200" />
                Operator XP
              </div>
              <div className="mt-3 text-3xl font-semibold text-white">
                {model.xp.current}
              </div>
              <div className="mt-1 text-sm text-zinc-300">
                {model.xp.nextRank ?? "All ranks unlocked"}
              </div>
              <div className="mt-4">
                <ProgressRail value={model.xp.progressToNextPct} tone="neutral" />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                {model.xp.nextRankXp == null
                  ? "XP track complete"
                  : `${model.xp.nextRankXp - model.xp.current} XP to next rank`}
              </div>
            </div>
          </div>
        </div>

        {gains.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {gains.map((gain) => (
              <span
                key={gain.id}
                className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100"
              >
                +{gain.gain} {gain.label}
              </span>
            ))}
          </div>
        ) : null}

        {notifications.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className="rounded-lg border border-[#FDD000]/30 bg-[#FDD000]/12 px-3 py-2 motion-safe:animate-pulse"
              >
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#FDD000]">
                  <Bell className="h-3.5 w-3.5" />
                  {notification.label}
                </div>
                <div className="mt-1 text-sm font-semibold text-white">
                  {notification.detail}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] lg:p-6">
        <div className="grid min-w-0 gap-4">
          <Panel
            eyebrow="Regions"
            title="World Map"
            icon={<Compass className="h-4 w-4" />}
          >
            <div className="grid gap-3 md:grid-cols-3">
              {model.regions.map((region) => (
                <div
                  key={region.id}
                  className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">
                        {region.label}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {region.status}
                      </div>
                    </div>
                    <Pill tone={region.tone}>{region.completionPct}%</Pill>
                  </div>
                  <div className="mt-3">
                    <ProgressRail value={region.completionPct} tone={region.tone} />
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <Panel
              eyebrow="Campaign"
              title="Campaign Progress"
              icon={<LineChart className="h-4 w-4" />}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    {model.campaign.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Current Chapter: {model.campaign.currentChapter}
                  </div>
                </div>
                <Pill tone={model.campaign.progressPct >= 100 ? "good" : "warn"}>
                  {Math.round(model.campaign.progressPct)}%
                </Pill>
              </div>
              <div className="mt-4">
                <ProgressRail
                  value={model.campaign.progressPct}
                  tone={model.campaign.progressPct >= 100 ? "good" : "warn"}
                />
              </div>
              <div className="mt-4 grid grid-cols-4 gap-2">
                {model.campaign.path.map((step) => (
                  <div
                    key={step.id}
                    className={cx(
                      "rounded-lg border px-2 py-2 text-center text-xs",
                      step.active &&
                        "border-[#FDD000]/30 bg-[#FDD000]/12 text-[#FDD000]",
                      step.passed &&
                        "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
                      !step.active &&
                        !step.passed &&
                        "border-white/10 bg-white/[0.035] text-zinc-500",
                    )}
                  >
                    {step.label}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-400">
                {model.campaign.summary}
              </p>
            </Panel>

            <Panel
              eyebrow="Objectives"
              title="Active Missions"
              icon={<Zap className="h-4 w-4" />}
            >
              <div className="grid gap-3 md:grid-cols-2">
                {model.missions.slice(0, 4).map((mission) => (
                  <MissionRow key={mission.id} mission={mission} />
                ))}
              </div>
            </Panel>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Panel
              eyebrow="Restrictions"
              title="Boss Battles"
              icon={<AlertTriangle className="h-4 w-4" />}
            >
              {model.bosses.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {model.bosses.map((boss) => (
                    <BossRow key={boss.id} boss={boss} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-4 py-4 text-sm text-emerald-100">
                  No active boss encounter. Restrictions are currently in monitoring mode.
                </div>
              )}
            </Panel>

            <Panel
              eyebrow="Capabilities"
              title="Skill Tree"
              icon={<Layers className="h-4 w-4" />}
            >
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {model.skills.map((skill) => (
                  <div
                    key={skill.id}
                    className={cx(
                      "rounded-lg border px-3 py-3",
                      skillTone(skill.state),
                    )}
                  >
                    <div className="text-sm font-semibold">{skill.label}</div>
                    <div className="mt-1 text-xs opacity-80">{skill.state}</div>
                    <div className="mt-3">
                      <ProgressRail value={skill.score ?? 0} tone="neutral" />
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>

        <aside className="grid min-w-0 content-start gap-4">
          <Panel
            eyebrow="Legacy"
            title="Reputation"
            icon={<Medal className="h-4 w-4" />}
          >
            <div className="rounded-lg border border-white/[0.07] bg-black/25 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    Reputation Rank
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {model.reputation.rank}
                  </div>
                </div>
                <Pill tone={model.reputation.score >= 80 ? "good" : model.reputation.score >= 60 ? "warn" : "neutral"}>
                  {Math.round(model.reputation.score)}
                </Pill>
              </div>
              <div className="mt-4">
                <ProgressRail
                  value={model.reputation.score}
                  tone={model.reputation.score >= 80 ? "good" : "warn"}
                />
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Identity"
            title="Operator Identity"
            icon={<Brain className="h-4 w-4" />}
          >
            <div className="rounded-lg border border-[#FDD000]/20 bg-[#FDD000]/10 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#FDD000]">
                Operator Class
              </div>
              <div className="mt-2 text-2xl font-semibold text-white">
                {model.operatorClass}
              </div>
              <div className="mt-1 text-sm text-zinc-400">
                {model.operatorMode}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Companion"
            title="Signal Advisor"
            icon={<Activity className="h-4 w-4" />}
          >
            <div className="space-y-4 text-sm leading-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Assessment
                </div>
                <p className="mt-1 text-zinc-300">{model.advisor.assessment}</p>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Threats
                </div>
                <ul className="mt-1 space-y-1 text-zinc-400">
                  {model.advisor.threats.slice(0, 3).map((threat) => (
                    <li key={threat}>{threat}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Next Objective
                </div>
                <p className="mt-1 text-zinc-300">{model.advisor.nextObjective}</p>
              </div>
              <Pill tone="warn">{model.advisor.campaignStatus}</Pill>
            </div>
          </Panel>

          <Panel
            eyebrow="Rewards"
            title="Unlock System"
            icon={<ShieldCheck className="h-4 w-4" />}
          >
            {model.unlocks.length ? (
              <div className="space-y-3">
                {model.unlocks.map((unlock) => (
                  <div
                    key={unlock.id}
                    className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-red-100/70">
                          Locked
                        </div>
                        <div className="mt-1 text-sm font-semibold text-zinc-100">
                          {unlock.currentLock}
                        </div>
                      </div>
                      <Pill tone={unlock.progressPct >= 100 ? "good" : "warn"}>
                        {Math.round(unlock.progressPct)}%
                      </Pill>
                    </div>
                    <div className="mt-3 space-y-1">
                      {unlock.requirements.slice(0, 4).map((requirement) => (
                        <div
                          key={requirement.label}
                          className="flex items-start gap-2 text-xs leading-5 text-zinc-400"
                        >
                          <CheckCircle2
                            className={cx(
                              "mt-0.5 h-3.5 w-3.5 shrink-0",
                              requirement.passed
                                ? "text-emerald-300"
                                : "text-zinc-600",
                            )}
                          />
                          <span>{requirement.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3">
                      <ProgressRail value={unlock.progressPct} tone="warn" />
                    </div>
                    <div className="mt-2 text-xs text-zinc-500">
                      Reward: {unlock.reward}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                No active locks are exposed by the current diagnostics.
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Legacy"
            title="Unlock History"
            icon={<History className="h-4 w-4" />}
          >
            {model.unlockHistory.length ? (
              <div className="grid gap-2">
                {model.unlockHistory.slice(0, 5).map((unlock) => (
                  <div
                    key={unlock.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">
                        {unlock.name}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {unlock.source}
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-zinc-500">
                      {formatShortDate(unlock.unlockedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                No permanent unlocks have been earned yet.
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Milestones"
            title="Achievements"
            icon={<Sparkles className="h-4 w-4" />}
          >
            <div className="grid gap-2">
              {model.achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={cx(
                    "rounded-lg border px-3 py-2",
                    achievement.unlocked
                      ? "border-emerald-300/25 bg-emerald-400/10"
                      : "border-white/[0.07] bg-black/25",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">
                        {achievement.label}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {achievement.description}
                      </div>
                    </div>
                    <Pill tone={achievement.unlocked ? "good" : "neutral"}>
                      {achievement.unlocked ? "Unlocked" : `${Math.round(achievement.progressPct)}%`}
                    </Pill>
                  </div>
                </div>
              ))}
            </div>
            {unlockedAchievements.length ? (
              <div className="mt-3 text-xs text-zinc-500">
                {unlockedAchievements.length} achievements active
              </div>
            ) : null}
          </Panel>

          <Panel
            eyebrow="Legacy"
            title="Badges"
            icon={<Award className="h-4 w-4" />}
          >
            {model.badges.length ? (
              <div className="grid gap-2">
                {model.badges.slice(0, 6).map((badge) => (
                  <div
                    key={badge.id}
                    className="rounded-lg border border-emerald-300/20 bg-emerald-400/10 px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-zinc-100">
                          {badge.name}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {formatShortDate(badge.earnedAt)}
                        </div>
                      </div>
                      <Pill tone="good">{badge.tier}</Pill>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                Permanent badges unlock as Legacy rules are earned.
              </div>
            )}
          </Panel>

          <Panel
            eyebrow="Legacy"
            title="Campaign History"
            icon={<Flag className="h-4 w-4" />}
          >
            <div className="grid gap-2">
              {model.campaignHistory.slice(0, 5).map((campaign) => (
                <div
                  key={campaign.id}
                  className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-zinc-100">
                        {campaign.name}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        Started {formatShortDate(campaign.startedAt)}
                      </div>
                    </div>
                    <Pill tone={campaign.status === "Completed" ? "good" : "warn"}>
                      {campaign.status}
                    </Pill>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            eyebrow="Legacy"
            title="Milestones"
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            {model.milestones.length ? (
              <div className="grid gap-2">
                {model.milestones.slice(0, 5).map((milestone) => (
                  <div
                    key={milestone.id}
                    className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-zinc-100">
                      {milestone.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {milestone.source} · {Math.round(milestone.value)} · {formatShortDate(milestone.reachedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-zinc-400">
                Milestones become permanent once their Legacy rule is reached.
              </div>
            )}
          </Panel>

          {model.streaks.length ? (
            <Panel
              eyebrow="Continuity"
              title="Streak System"
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              <div className="grid gap-2">
                {model.streaks.map((streak) => (
                  <div
                    key={streak.id}
                    className="rounded-lg border border-white/[0.07] bg-black/25 px-3 py-3"
                  >
                    <div className="text-sm font-semibold text-zinc-100">
                      {streak.label}
                    </div>
                    <div className="mt-1 text-xl font-semibold text-white">
                      {streak.value}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {streak.detail}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel
            eyebrow="Endgame"
            title="Prestige System"
            icon={<Sparkles className="h-4 w-4" />}
          >
            <div className="rounded-lg border border-white/[0.07] bg-black/25 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl font-semibold text-white">
                    {model.prestige.tier}
                  </div>
                  <div className="mt-1 text-sm text-zinc-400">
                    {model.prestige.title}
                  </div>
                </div>
                <Pill tone={model.prestige.enabled ? "good" : "neutral"}>
                  {model.prestige.enabled ? "Enabled" : "Locked"}
                </Pill>
              </div>
              <div className="mt-4">
                <ProgressRail
                  value={model.prestige.progressPct}
                  tone={model.prestige.enabled ? "good" : "neutral"}
                />
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                {model.prestige.requirement}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="XP Sources"
            title="Progress Ledger"
            icon={<Gauge className="h-4 w-4" />}
          >
            <div className="grid gap-2">
              {model.xp.sources.map((source) => (
                <div
                  key={source.label}
                  className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-200">
                      {source.label}
                    </div>
                    <div className="text-xs text-zinc-600">
                      {source.value}/100
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[#FDD000]">
                    +{source.xp} XP
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </section>
  );
}

export default CommandCenter;
