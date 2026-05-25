import React, { useState, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  useGetExchanges,
  useGetSignals,
  useGetTradeHistory,
  type Condition,
  type Exchange,
  type Metric,
  type MetricGroup,
  type Signal
} from "@workspace/api-client-react";
import { CSVLink } from "react-csv";
import { 
  RefreshCw, ChevronDown, Check, Sun, Moon, Printer, Download,
  ArrowUp, ArrowDown, ArrowRight, X, Check as CheckIcon, DollarSign, Percent, Hash
} from "lucide-react";
import { format } from "date-fns";
import { DashboardAdapter } from "@/lib/dashboard-adapter";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, flexRender,
  type ColumnDef, type SortingState
} from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const CHART_COLORS = {
  blue: "#0079F2",
  purple: "#795EFF",
  green: "#009118",
  red: "#A60808",
  pink: "#ec4899",
  yellow: "#d97706",
};

const DATA_SOURCES = ["App DB", "Bloomberg", "Internal Models"];

type ThresholdStatus = "pass" | "warn" | "fail";
type MetricDirection = "higher" | "lower";
type AuditCategory = "Performance" | "Risk" | "Data Quality" | "Model Trust";

type ThresholdAuditRow = {
  metric: string;
  value: string;
  required: string;
  status: ThresholdStatus;
  group: AuditCategory;
  delta?: string | null;
};

type AuditMetricConfig = {
  category: AuditCategory;
  direction: MetricDirection;
};

type NormalizedAuditMetric = ThresholdAuditRow & {
  id: string;
  category: AuditCategory;
  direction: MetricDirection;
};

type AuditRadarPoint = {
  category: AuditCategory;
  score: number;
};

const AUDIT_CATEGORY_ORDER: AuditCategory[] = ["Performance", "Risk", "Data Quality", "Model Trust"];

const AUDIT_METRIC_CONFIG: Record<string, AuditMetricConfig> = {
  "Sharpe Ratio": { category: "Performance", direction: "higher" },
  "Win Rate": { category: "Performance", direction: "higher" },
  "Avg Return / Trade": { category: "Performance", direction: "higher" },
  "Profit Factor": { category: "Performance", direction: "higher" },
  "Annualised Return": { category: "Performance", direction: "higher" },
  "Max Drawdown": { category: "Risk", direction: "higher" },
  "Volatility (Ann.)": { category: "Risk", direction: "lower" },
  "VaR 95% (1-day)": { category: "Risk", direction: "higher" },
  "Calmar Ratio": { category: "Risk", direction: "higher" },
  "Beta vs SPY": { category: "Risk", direction: "lower" },
  Coverage: { category: "Data Quality", direction: "higher" },
  "Staleness (avg hrs)": { category: "Data Quality", direction: "lower" },
  "Feature Completeness": { category: "Data Quality", direction: "higher" },
  "Outlier Rate": { category: "Data Quality", direction: "lower" },
  "OOS Accuracy": { category: "Model Trust", direction: "higher" },
  "Backtest / Live Drift": { category: "Model Trust", direction: "lower" },
  "Signal Correlation": { category: "Model Trust", direction: "higher" },
  "Model Age (days)": { category: "Model Trust", direction: "lower" },
  "Confidence Score": { category: "Model Trust", direction: "higher" },
};

function normalizeAuditRows(rows: ThresholdAuditRow[] = []): NormalizedAuditMetric[] {
  return rows
    .map((row) => {
      const config = AUDIT_METRIC_CONFIG[row.metric] ?? {
        category: row.group,
        direction: row.required.trim().startsWith("≤") ? "lower" : "higher",
      };

      return {
        ...row,
        id: `${config.category}:${row.metric}`,
        category: config.category,
        direction: config.direction,
      };
    })
    .sort((a, b) => {
      const groupDelta = AUDIT_CATEGORY_ORDER.indexOf(a.category) - AUDIT_CATEGORY_ORDER.indexOf(b.category);
      return groupDelta !== 0 ? groupDelta : a.metric.localeCompare(b.metric);
    });
}

function getAuditStatusClass(status: ThresholdStatus): string {
  if (status === "pass") return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  if (status === "warn") return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
  return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
}

function getAuditStatusLabel(status: ThresholdStatus): string {
  if (status === "pass") return "Meets";
  if (status === "warn") return "Near";
  return "Misses";
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseMetricNumber(value: string): number | null {
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function getAuditMetricScore(row: NormalizedAuditMetric): number {
  const value = parseMetricNumber(row.value);
  const threshold = parseMetricNumber(row.required);

  if (value === null || threshold === null || !Number.isFinite(value) || !Number.isFinite(threshold)) {
    if (row.status === "pass") return 1;
    if (row.status === "warn") return 0.5;
    return 0;
  }

  const thresholdMagnitude = Math.max(Math.abs(threshold), 1);
  const distance = row.direction === "higher" ? value - threshold : threshold - value;
  return clampUnit(0.5 + distance / thresholdMagnitude / 0.5);
}

function getAuditScoreColor(score: number): string {
  const hue = Math.round(clampUnit(score) * 120);
  return `hsl(${hue} 72% 44%)`;
}

function getSvgTextAnchor(x: number, center: number): "start" | "middle" | "end" {
  if (Math.abs(x - center) < 16) return "middle";
  return x > center ? "start" : "end";
}

function StrategyRadarChart({ points, isDark }: { points: AuditRadarPoint[]; isDark: boolean }) {
  if (points.length === 0) {
    return (
      <div className="h-[320px] rounded border border-dashed border-border/70 flex items-center justify-center text-sm text-muted-foreground">
        No strategy data available.
      </div>
    );
  }

  const size = 520;
  const center = size / 2;
  const radius = 150;
  const labelRadius = 190;
  const startAngle = -Math.PI / 2;
  const angleStep = (Math.PI * 2) / points.length;
  const gridRings = [0.25, 0.5, 0.75, 1];
  const gridStroke = isDark ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.12)";
  const spokeStroke = isDark ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.1)";

  const getPoint = (index: number, value: number, pointRadius = radius) => {
    const angle = startAngle + index * angleStep;
    return {
      x: center + Math.cos(angle) * pointRadius * value,
      y: center + Math.sin(angle) * pointRadius * value,
    };
  };

  const gridPolygons = gridRings.map((ring) =>
    points.map((_, index) => {
      const point = getPoint(index, ring);
      return `${point.x},${point.y}`;
    }).join(" ")
  );
  const dataPoints = points.map((point, index) => ({ ...getPoint(index, point.score), ...point }));
  const polygonPoints = dataPoints.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="flex justify-center overflow-hidden rounded border border-border/70 bg-background/40 px-2 py-4">
      <svg
        className="h-auto w-full max-w-[620px]"
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Strategy radar by audit category"
      >
        <defs>
          <radialGradient id="strategyRadarFill" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.04)"} />
            <stop offset="100%" stopColor="rgba(34,197,94,0.18)" />
          </radialGradient>
        </defs>
        {gridPolygons.map((pointsString) => (
          <polygon key={pointsString} points={pointsString} fill="none" stroke={gridStroke} strokeWidth="2" />
        ))}
        {points.map((_, index) => {
          const outer = getPoint(index, 1);
          return (
            <line
              key={`spoke-${index}`}
              x1={center}
              y1={center}
              x2={outer.x}
              y2={outer.y}
              stroke={spokeStroke}
              strokeWidth="2"
            />
          );
        })}
        <polygon points={polygonPoints} fill="url(#strategyRadarFill)" stroke="none" />
        {dataPoints.map((point, index) => {
          const next = dataPoints[(index + 1) % dataPoints.length];
          return (
            <line
              key={`edge-${point.category}`}
              x1={point.x}
              y1={point.y}
              x2={next.x}
              y2={next.y}
              stroke={getAuditScoreColor((point.score + next.score) / 2)}
              strokeWidth="5"
              strokeLinecap="round"
            />
          );
        })}
        {dataPoints.map((point) => (
          <circle
            key={`dot-${point.category}`}
            cx={point.x}
            cy={point.y}
            r="7"
            fill={getAuditScoreColor(point.score)}
            stroke={isDark ? "#09090b" : "#ffffff"}
            strokeWidth="3"
          />
        ))}
        {points.map((point, index) => {
          const labelPoint = getPoint(index, 1, labelRadius);
          const lines = point.category.split(" ");
          return (
            <text
              key={`label-${point.category}`}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor={getSvgTextAnchor(labelPoint.x, center)}
              dominantBaseline="middle"
              fill={getAuditScoreColor(point.score)}
              fontSize="22"
              fontWeight="700"
            >
              {lines.map((line, lineIndex) => (
                <tspan key={line} x={labelPoint.x} dy={lineIndex === 0 ? 0 : 26}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function parseLocalDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return d;
}

function formatDate(dateStr: string, fmt = "MMM d, yyyy"): string {
  if (!dateStr) return "";
  return format(parseLocalDate(dateStr), fmt);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 1 }).format(value / 100);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: "6px",
        padding: "10px 14px",
        border: "1px solid #e0e0e0",
        color: "#1a1a1a",
        fontSize: "13px",
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
      }}
    >
      <div style={{ marginBottom: "6px", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
        {payload.length === 1 && payload[0].color && payload[0].color !== "#ffffff" && (
          <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: payload[0].color, flexShrink: 0 }} />
        )}
        {label}
      </div>
      {payload.map((entry: any, index: number) => (
        <div key={index} style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
          {payload.length > 1 && entry.color && entry.color !== "#ffffff" && (
            <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", backgroundColor: entry.color, flexShrink: 0 }} />
          )}
          <span style={{ color: "#444" }}>{entry.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 600 }}>
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [isDark, setIsDark] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSpinning, setIsSpinning] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // New States
  const [selectedExchange, setSelectedExchange] = useState("nasdaq");
  const [investorMode, setInvestorMode] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [budget, setBudget] = useState(0);
  const [amountDisplay, setAmountDisplay] = useState<"pct" | "units">("pct");

  const queryClient = useQueryClient();

  const exchangesQuery = useGetExchanges();
  const signalsQuery = useGetSignals({ exchange: selectedExchange, mode: investorMode, budget });
  const historyQuery = useGetTradeHistory({ exchange: selectedExchange, mode: investorMode });

  const loading = 
    exchangesQuery.isLoading || exchangesQuery.isFetching ||
    signalsQuery.isLoading || signalsQuery.isFetching ||
    historyQuery.isLoading || historyQuery.isFetching;

  const dashboardState = useMemo(
    () =>
      DashboardAdapter({
        signals: signalsQuery.data,
        tradeHistory: historyQuery.data,
        selectedExchange,
        investorMode,
        budget,
      }),
    [
      budget,
      historyQuery.data,
      investorMode,
      selectedExchange,
      signalsQuery.data,
    ],
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (loading) {
      setIsSpinning(true);
      return undefined;
    } else {
      const t = setTimeout(() => setIsSpinning(false), 600);
      return () => clearTimeout(t);
    }
  }, [loading]);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (autoRefresh) {
      interval = setInterval(() => {
        handleRefresh();
      }, 5 * 60 * 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    }
  }, [autoRefresh]);

  useEffect(() => {
    if (exchangesQuery.data && exchangesQuery.data.length > 0 && !exchangesQuery.data.find((e: Exchange) => e.id === selectedExchange)) {
      setSelectedExchange(exchangesQuery.data[0].id);
    }
  }, [exchangesQuery.data]);

  function handleRefresh() {
    queryClient.invalidateQueries();
  }

  const lastRefreshed = historyQuery.dataUpdatedAt || signalsQuery.dataUpdatedAt
    ? (() => {
        const d = new Date(historyQuery.dataUpdatedAt || signalsQuery.dataUpdatedAt);
        const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).toLowerCase();
        return time;
      })()
    : null;

  const normalizedAuditRows = useMemo(
    () => normalizeAuditRows((dashboardState.thresholds || []) as ThresholdAuditRow[]),
    [dashboardState.thresholds]
  );

  const auditRowsByCategory = useMemo(() => {
    return AUDIT_CATEGORY_ORDER.map((category) => {
      const rows = normalizedAuditRows.filter((row) => row.category === category);
      return {
        category,
        rows,
        passCount: rows.filter((row) => row.status === "pass").length,
        warnCount: rows.filter((row) => row.status === "warn").length,
        failCount: rows.filter((row) => row.status === "fail").length,
      };
    }).filter((group) => group.rows.length > 0);
  }, [normalizedAuditRows]);

  const strategyRadarPoints = useMemo(() => {
    return auditRowsByCategory.map(({ category, rows }) => ({
      category,
      score: rows.reduce((sum, row) => sum + getAuditMetricScore(row), 0) / Math.max(rows.length, 1),
    }));
  }, [auditRowsByCategory]);

  const auditTotals = useMemo(() => ({
    total: normalizedAuditRows.length,
    pass: normalizedAuditRows.filter((row) => row.status === "pass").length,
    warn: normalizedAuditRows.filter((row) => row.status === "warn").length,
    fail: normalizedAuditRows.filter((row) => row.status === "fail").length,
  }), [normalizedAuditRows]);

  const auditCsvRows = normalizedAuditRows.map((row) => ({
    category: row.category,
    metric: row.metric,
    current: row.value,
    rule: row.required,
    gap: row.delta || "",
    result: getAuditStatusLabel(row.status),
    direction: row.direction === "higher" ? "higher is better" : "lower is better",
    delta: row.delta || "",
  }));

  // Sorting for trade history table
  const [tradeSorting, setTradeSorting] = useState<SortingState>([{ id: "openedAt", desc: true }]);
  const tradeColumns: ColumnDef<any>[] = [
    { accessorKey: "ticker", header: "Ticker", cell: ({ row }) => <span className="font-mono font-bold">{row.original.ticker}</span> },
    { 
      accessorKey: "direction", 
      header: "Direction",
      cell: ({ row }) => {
        const dir = row.original.direction;
        return <Badge variant="outline" className={`border-0 rounded-sm uppercase tracking-wider text-[10px] ${dir === 'long' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'}`}>{dir}</Badge>
      }
    },
    { accessorKey: "openedAt", header: "Opened", cell: ({ row }) => <span className="text-xs">{formatDate(row.original.openedAt)}</span> },
    { accessorKey: "closedAt", header: "Closed", cell: ({ row }) => <span className="text-xs">{formatDate(row.original.closedAt)}</span> },
    { accessorKey: "entryPrice", header: "Entry Price", cell: ({ row }) => <span className="font-mono text-xs">{formatCurrency(row.original.entryPrice)}</span> },
    { accessorKey: "exitPrice", header: "Exit Price", cell: ({ row }) => <span className="font-mono text-xs">{formatCurrency(row.original.exitPrice)}</span> },
    { accessorKey: "units", header: "Units", cell: ({ row }) => <span className="font-mono text-xs">{row.original.units}</span> },
    { 
      accessorKey: "pnl", 
      header: "P&L", 
      cell: ({ row }) => {
        const val = row.original.pnl;
        const color = val >= 0 ? CHART_COLORS.green : CHART_COLORS.red;
        return <span className="font-mono font-medium text-xs" style={{ color }}>{formatCurrency(val)}</span>
      }
    },
    { 
      accessorKey: "pnlPct", 
      header: "P&L %", 
      cell: ({ row }) => {
        const val = row.original.pnlPct;
        const color = val >= 0 ? CHART_COLORS.green : CHART_COLORS.red;
        return <span className="font-mono font-medium text-xs" style={{ color }}>{formatPercent(val)}</span>
      }
    }
  ];

  const tradeTable = useReactTable({
    data: historyQuery.data?.trades || [],
    columns: tradeColumns,
    state: { sorting: tradeSorting },
    onSortingChange: setTradeSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });


  const getStatusColor = (status: string) => {
    if (status === "pass") return CHART_COLORS.green;
    if (status === "fail") return CHART_COLORS.red;
    if (status === "warn") return CHART_COLORS.yellow;
    return "inherit";
  };

  const getDecisionColorClass = (color?: string) => {
    switch(color) {
      case "green": return "border-green-500/50 bg-green-500/5 dark:bg-green-500/10 text-green-700 dark:text-green-400";
      case "red": return "border-red-500/50 bg-red-500/5 dark:bg-red-500/10 text-red-700 dark:text-red-400";
      case "yellow":
      case "orange": return "border-orange-500/50 bg-orange-500/5 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400";
      default: return "border-border";
    }
  };

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "#e5e5e5";
  const tickColor = isDark ? "#98999C" : "#71717a";

  const pnlColor = (historyQuery.data?.totalPnl ?? 0) >= 0 ? CHART_COLORS.green : CHART_COLORS.red;

  return (
    <div className="min-h-screen bg-background text-foreground px-5 py-4 pt-[32px] pb-[32px] pl-[24px] pr-[24px]">
      <div className="max-w-[1400px] mx-auto">
        
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="pt-2">
            <h1 className="font-bold text-[32px] tracking-tight">Stocks Capital Desk</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px]">Institutional Allocation Terminal</p>
            {DATA_SOURCES.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[12px] text-muted-foreground shrink-0 uppercase tracking-widest font-semibold">Sources:</span>
                {DATA_SOURCES.map((source) => (
                  <span
                    key={source}
                    className="text-[10px] uppercase tracking-wider font-bold rounded px-1.5 py-0.5 truncate print:!bg-[rgb(229,231,235)] print:!text-[rgb(75,85,99)] border border-border"
                    title={source}
                    style={{
                      maxWidth: "20ch",
                      backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
                      color: isDark ? "#c8c9cc" : "rgb(75, 85, 99)",
                    }}
                  >
                    {source}
                  </span>
                ))}
              </div>
            )}
            {lastRefreshed && <p className="text-[11px] font-mono text-muted-foreground mt-2">UPDATED {lastRefreshed}</p>}
          </div>

          <div className="flex items-center gap-3 pt-2 print:hidden">
            {/* Split Refresh */}
            <div className="relative" ref={dropdownRef}>
              <div
                className="flex items-center rounded border overflow-hidden h-[26px] text-[12px] shadow-sm font-mono uppercase tracking-wider font-medium"
                style={{
                  backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff",
                  color: isDark ? "#c8c9cc" : "#111827",
                  borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)",
                }}
              >
                <button onClick={handleRefresh} disabled={loading} className="flex items-center gap-1.5 px-3 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${isSpinning ? "animate-spin" : ""}`} />
                  Refresh
                </button>
                <div className="w-px h-full shrink-0" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />
                <button onClick={() => setDropdownOpen((o) => !o)} className="flex items-center justify-center px-2 h-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-popover border shadow-md rounded flex flex-col p-1 z-50 text-[12px]">
                  <button 
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-muted rounded text-left"
                    onClick={() => setAutoRefresh(false)}
                  >
                    <span>Manual refresh only</span>
                    {!autoRefresh && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button 
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-muted rounded text-left"
                    onClick={() => setAutoRefresh(true)}
                  >
                    <span>Auto-refresh (5m)</span>
                    {autoRefresh && <Check className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center justify-center w-[26px] h-[26px] rounded border shadow-sm transition-colors"
              style={{ 
                backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", 
                color: isDark ? "#c8c9cc" : "#4b5563",
                borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", 
              }}
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsDark((d) => !d)}
              className="flex items-center justify-center w-[26px] h-[26px] rounded border shadow-sm transition-colors"
              style={{ 
                backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", 
                color: isDark ? "#c8c9cc" : "#4b5563",
                borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", 
              }}
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Global Controls */}
        <div className="mb-6 flex flex-wrap items-end gap-4 p-4 rounded border bg-card/50 shadow-sm print:hidden">
          <div className="flex-1 min-w-[200px] max-w-[300px]">
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1.5 block">Exchange</label>
            <select 
              value={selectedExchange} 
              onChange={e => setSelectedExchange(e.target.value)}
              className="w-full h-9 px-3 rounded border bg-background text-sm font-medium focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {exchangesQuery.data?.map((ex: Exchange) => (
                <option key={ex.id} value={ex.id}>{ex.name} ({ex.region})</option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 min-w-[250px] max-w-[350px]">
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1.5 block">Investor Mode</label>
            <div className="flex h-9 p-1 rounded border bg-muted/50">
              {["conservative", "balanced", "aggressive"].map(mode => (
                <button
                  key={mode}
                  onClick={() => setInvestorMode(mode as any)}
                  className={`flex-1 text-xs font-medium uppercase tracking-wider rounded-sm transition-colors ${investorMode === mode ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-[200px] max-w-[250px]">
            <label className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1.5 flex justify-between">
              <span>Budget</span>
              <span className="text-primary">{budget >= 0 ? "Investment" : "Withdrawal"}</span>
            </label>
            <div className="relative">
              <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                type="number"
                value={budget || ""}
                onChange={e => setBudget(Number(e.target.value))}
                placeholder="0"
                className="w-full h-9 pl-8 pr-3 rounded border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Top: Decision Card */}
        <div className="mb-6">
          <Card className={`overflow-hidden border-2 ${dashboardState.decisionCard ? getDecisionColorClass(dashboardState.decisionCard.decisionColor) : ''}`}>
            <CardContent className="p-8">
              {signalsQuery.isLoading || historyQuery.isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-1/3" />
                  <Skeleton className="h-6 w-1/2" />
                </div>
              ) : dashboardState.decisionCard ? (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <h2 className="text-4xl md:text-5xl font-extrabold uppercase tracking-tight">{dashboardState.decisionCard.decision}</h2>
                    {dashboardState.decisionCard.reasoning && (
                      <p className="mt-3 text-lg opacity-90 font-medium">{dashboardState.decisionCard.reasoning}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-8 md:text-right border-l border-current/20 pl-8 shrink-0">
                    <div>
                      <p className="text-[11px] uppercase tracking-widest font-semibold opacity-70 mb-1">Confidence</p>
                      <p className="text-3xl font-mono font-bold">{dashboardState.decisionCard.confidence.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-widest font-semibold opacity-70 mb-1">Target Allocation</p>
                      <p className="text-3xl font-mono font-bold">{dashboardState.decisionCard.allocationPct.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* Signals Section */}
        <div className="mb-6">
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm uppercase tracking-wider">Trading Signals</CardTitle>
              <div className="flex items-center gap-3">
                <div className="flex items-center h-[26px] border rounded bg-muted/50 p-0.5">
                  <button 
                    onClick={() => setAmountDisplay('pct')} 
                    className={`px-2 h-full rounded-sm text-xs flex items-center transition-colors ${amountDisplay === 'pct' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  >
                    <Percent className="w-3 h-3 mr-1" /> %
                  </button>
                  <button 
                    onClick={() => setAmountDisplay('units')} 
                    className={`px-2 h-full rounded-sm text-xs flex items-center transition-colors ${amountDisplay === 'units' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
                  >
                    <Hash className="w-3 h-3 mr-1" /> Units
                  </button>
                </div>
                {!signalsQuery.isLoading && signalsQuery.data?.signals && signalsQuery.data.signals.length > 0 && (
                  <CSVLink 
                    data={signalsQuery.data.signals} 
                    filename="signals.csv" 
                    className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded border transition-colors hover:opacity-80" 
                    style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", color: isDark ? "#c8c9cc" : "#4b5563", borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} 
                  >
                    <Download className="w-3.5 h-3.5" />
                  </CSVLink>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-5 pt-0">
              {signalsQuery.isLoading || signalsQuery.isFetching ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
              ) : signalsQuery.data?.signals?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {signalsQuery.data.signals.map((signal: Signal) => (
                    <div key={signal.id} className="p-4 rounded border bg-card/50 flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <span className="font-mono font-bold text-lg">{signal.ticker}</span>
                        <Badge variant="outline" className={`border-0 uppercase tracking-wider text-[10px] ${signal.direction === 'buy' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'}`}>
                          {signal.direction}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Price: <span className="font-mono text-foreground font-medium">{formatCurrency(signal.price)}</span></span>
                        <span className="text-muted-foreground">Amount: <span className="font-mono text-foreground font-medium">{amountDisplay === 'pct' ? `${signal.amountPct.toFixed(1)}%` : signal.amountUnits}</span></span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                          <span>Confidence</span>
                          <span>{signal.confidence.toFixed(1)}%</span>
                        </div>
                        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-primary/20">
                          <div
                            className="h-full transition-all"
                            style={{
                              width: `${signal.confidence}%`,
                              backgroundColor: signal.direction === 'buy' ? CHART_COLORS.green : CHART_COLORS.red,
                            }}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground italic leading-tight mt-1">"{signal.rationale}"</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-28 flex items-center justify-center text-sm text-muted-foreground border border-dashed rounded">
                  No signals found for this configuration.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Middle: Metrics Grid & Activation Conditions */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2 space-y-6">
            {signalsQuery.isLoading || historyQuery.isLoading ? (
               <Card>
                 <CardContent className="p-6 space-y-4">
                   <Skeleton className="h-6 w-48" />
                   <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
                   </div>
                 </CardContent>
               </Card>
            ) : dashboardState.metricsGroups?.groups.map((group: MetricGroup) => (
              <div key={group.group} className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <div className="w-1 h-3 bg-primary rounded-sm"></div>
                  {group.group}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {group.metrics.map((metric: Metric) => (
                    <Card key={metric.label} className="rounded border-border/50 bg-card/50">
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-[11px] uppercase tracking-wide text-muted-foreground truncate pr-2" title={metric.label}>{metric.label}</p>
                          <div 
                            className="w-2 h-2 rounded-full mt-0.5 shrink-0" 
                            style={{ backgroundColor: getStatusColor(metric.status) }}
                          />
                        </div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-lg font-mono font-medium">{metric.displayValue || metric.value}</p>
                          {metric.trend && (
                            <span className="text-[10px] text-muted-foreground">
                              {metric.trend === 'up' && <ArrowUp className="w-3 h-3" />}
                              {metric.trend === 'down' && <ArrowDown className="w-3 h-3" />}
                              {metric.trend === 'flat' && <ArrowRight className="w-3 h-3" />}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="xl:col-span-1">
             <Card className="h-full">
              <CardHeader className="px-5 pt-5 pb-3">
                <CardTitle className="text-sm uppercase tracking-wider">Activation Conditions</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {signalsQuery.isLoading || historyQuery.isLoading ? (
                  <div className="space-y-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : dashboardState.activationConditions ? (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 text-[11px] font-mono uppercase text-muted-foreground">
                      <span>{dashboardState.activationConditions.currentDecision}</span>
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-primary font-bold">{dashboardState.activationConditions.targetDecision}</span>
                    </div>
                    <div className="space-y-3">
                      {dashboardState.activationConditions.conditions.map((cond: Condition, i: number) => (
                        <div key={i} className={`p-3 border rounded text-sm flex flex-col gap-2 ${cond.met ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                          <div className="flex items-start gap-2">
                            {cond.met ? <CheckIcon className="w-4 h-4 text-green-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                            <span className="font-medium text-[13px]">{cond.label}</span>
                          </div>
                          <div className="flex justify-between font-mono text-[11px] pl-6 text-muted-foreground">
                            <span>Curr: {cond.current}</span>
                            <span>Req: {cond.required}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Trade History Chart & KPIs */}
        <div className="mb-6">
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0 border-b">
              <div>
                <CardTitle className="text-sm uppercase tracking-wider">Cumulative P&L</CardTitle>
              </div>
              {!historyQuery.isLoading && historyQuery.data?.chartData && historyQuery.data.chartData.length > 0 && (
                <CSVLink 
                  data={historyQuery.data.chartData} 
                  filename="pnl-history.csv" 
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded border transition-colors hover:opacity-80" 
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", color: isDark ? "#c8c9cc" : "#4b5563", borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} 
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {historyQuery.isLoading || historyQuery.isFetching ? (
                <div className="p-6">
                  <div className="flex gap-6 mb-6">
                    <Skeleton className="h-12 w-24" />
                    <Skeleton className="h-12 w-24" />
                    <Skeleton className="h-12 w-24" />
                  </div>
                  <Skeleton className="w-full h-[300px]" />
                </div>
              ) : historyQuery.data ? (
                <>
                  <div className="flex flex-wrap items-center gap-8 px-6 py-4 bg-muted/20 border-b">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1">Total P&L</p>
                      <p className="text-2xl font-mono font-bold" style={{ color: pnlColor }}>
                        {formatCurrency(historyQuery.data.totalPnl)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1">Return</p>
                      <p className="text-2xl font-mono font-bold" style={{ color: pnlColor }}>
                        {formatPercent(historyQuery.data.totalPnlPct)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1">Win Rate</p>
                      <p className="text-2xl font-mono font-bold">
                        {historyQuery.data.winCount + historyQuery.data.lossCount > 0 
                          ? ((historyQuery.data.winCount / (historyQuery.data.winCount + historyQuery.data.lossCount)) * 100).toFixed(1) + '%' 
                          : '0%'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70 mb-1">Trades</p>
                      <p className="text-2xl font-mono font-bold">{historyQuery.data.winCount + historyQuery.data.lossCount}</p>
                    </div>
                  </div>
                  <div className="p-6 pt-8">
                    <ResponsiveContainer width="100%" height={300} debounce={0}>
                      <AreaChart data={historyQuery.data.chartData}>
                        <defs>
                          <linearGradient id="colorPnl" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={pnlColor} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={pnlColor} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12, fill: tickColor }} 
                          stroke={tickColor}
                          tickFormatter={(val) => formatDate(val, 'MMM d')}
                          minTickGap={30}
                        />
                        <YAxis 
                          tick={{ fontSize: 12, fill: tickColor }} 
                          stroke={tickColor}
                          tickFormatter={(val) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(val)}
                        />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} cursor={{ fill: 'rgba(0,0,0,0.05)', stroke: 'none' }} />
                        <Area 
                          type="monotone" 
                          dataKey="cumulativePnl" 
                          name="Cumulative P&L"
                          stroke={pnlColor} 
                          fillOpacity={1} 
                          fill="url(#colorPnl)" 
                          isAnimationActive={false} 
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                  No trade history available.
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Trade History Table */}
        <div className="mb-6">
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm uppercase tracking-wider">Trade Execution Log</CardTitle>
              {!historyQuery.isLoading && historyQuery.data?.trades && historyQuery.data.trades.length > 0 && (
                <CSVLink 
                  data={historyQuery.data.trades} 
                  filename="trades.csv" 
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded border transition-colors hover:opacity-80" 
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", color: isDark ? "#c8c9cc" : "#4b5563", borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} 
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {historyQuery.isLoading || historyQuery.isFetching ? (
                <div className="p-5 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm">
                    <TableHeader className="bg-muted/50">
                      {tradeTable.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id}>
                          {headerGroup.headers.map((header) => (
                            <TableHead key={header.id} onClick={header.column.getToggleSortingHandler()} className="h-9 cursor-pointer select-none text-[11px] uppercase tracking-wider">
                              <div className="flex items-center gap-1.5">
                                {flexRender(header.column.columnDef.header, header.getContext())}
                                {{ asc: <ArrowUp className="w-3 h-3"/>, desc: <ArrowDown className="w-3 h-3"/> }[header.column.getIsSorted() as string] ?? null}
                              </div>
                            </TableHead>
                          ))}
                        </TableRow>
                      ))}
                    </TableHeader>
                    <TableBody>
                      {tradeTable.getRowModel().rows.length > 0 ? (
                        tradeTable.getRowModel().rows.map((row) => (
                          <TableRow key={row.id} className="h-10 border-b border-border/50 hover:bg-muted/30">
                            {row.getVisibleCells().map((cell) => (
                              <TableCell key={cell.id} className="py-2">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={tradeColumns.length} className="h-24 text-center text-muted-foreground">
                            No trades found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>


        {/* Bottom: Audit Matrix */}
        <div className="mb-6">
          <Card>
            <CardHeader className="px-5 pt-5 pb-3 flex-row items-start justify-between gap-4 space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold">Audit Trail</CardTitle>
                <p className="text-xs text-muted-foreground">Strategy radar and indicator matrix.</p>
              </div>
              {!signalsQuery.isLoading && !historyQuery.isLoading && dashboardState.thresholds && dashboardState.thresholds.length > 0 && (
                <CSVLink 
                  data={auditCsvRows} 
                  filename="threshold-audit-matrix.csv" 
                  className="print:hidden flex items-center justify-center w-[26px] h-[26px] rounded border transition-colors hover:opacity-80" 
                  style={{ backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "#ffffff", color: isDark ? "#c8c9cc" : "#4b5563", borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} 
                  aria-label="Export table data as CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </CSVLink>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {signalsQuery.isLoading || historyQuery.isLoading ? (
                <div className="p-5 space-y-2">
                  <Skeleton className="h-10 w-full" />
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              ) : (
                <Tabs defaultValue="strategy" className="px-5 pb-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-3">
                    <TabsList className="h-8 rounded bg-muted/60">
                      <TabsTrigger value="strategy" className="h-6 rounded-sm px-3 text-xs">Strategy</TabsTrigger>
                      <TabsTrigger value="indicators" className="h-6 rounded-sm px-3 text-xs">Indicators</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="strategy" className="mt-4">
                    <StrategyRadarChart points={strategyRadarPoints} isDark={isDark} />
                  </TabsContent>

                  <TabsContent value="indicators" className="mt-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{auditTotals.total} metrics</span>
                      <span className="text-border">/</span>
                      <span className="text-green-700 dark:text-green-300">{auditTotals.pass} meet</span>
                      <span className="text-yellow-700 dark:text-yellow-300">{auditTotals.warn} near</span>
                      <span className="text-red-700 dark:text-red-300">{auditTotals.fail} miss</span>
                    </div>
                    {auditRowsByCategory.length > 0 ? (
                      <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4">
                        {auditRowsByCategory.map(({ category, rows, passCount, warnCount, failCount }) => (
                          <section key={category} className="overflow-hidden rounded border border-border/70 bg-background/40">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-muted/30 px-4 py-3">
                              <div>
                                <h3 className="text-sm font-semibold">{category}</h3>
                                <p className="text-xs text-muted-foreground">{rows.length} metrics</p>
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px]">
                                <span className="rounded-sm bg-green-100 px-2 py-1 text-green-800 dark:bg-green-900/30 dark:text-green-300">{passCount} meet</span>
                                <span className="rounded-sm bg-yellow-100 px-2 py-1 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">{warnCount} near</span>
                                <span className="rounded-sm bg-red-100 px-2 py-1 text-red-800 dark:bg-red-900/30 dark:text-red-300">{failCount} miss</span>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <Table className="min-w-[620px] text-sm">
                                <TableHeader>
                                  <TableRow className="border-b border-border/60">
                                    <TableHead className="h-9 min-w-[190px] text-xs font-medium">Metric</TableHead>
                                    <TableHead className="h-9 text-right text-xs font-medium">Current</TableHead>
                                    <TableHead className="h-9 text-right text-xs font-medium">Rule</TableHead>
                                    <TableHead className="h-9 text-right text-xs font-medium">Gap</TableHead>
                                    <TableHead className="h-9 text-right text-xs font-medium">Result</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {rows.map((row) => (
                                    <TableRow key={row.id} className="h-10 border-b border-border/40 last:border-0 hover:bg-muted/25">
                                      <TableCell className="py-2 font-medium">{row.metric}</TableCell>
                                      <TableCell className="py-2 text-right font-mono">{row.value}</TableCell>
                                      <TableCell className="py-2 text-right font-mono text-muted-foreground">{row.required}</TableCell>
                                      <TableCell className="py-2 text-right font-mono text-xs">{row.delta || "-"}</TableCell>
                                      <TableCell className="py-2 text-right">
                                        <Badge variant="outline" className={`border-0 rounded-sm text-[11px] ${getAuditStatusClass(row.status)}`}>
                                          {getAuditStatusLabel(row.status)}
                                        </Badge>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <div className="h-24 rounded border border-dashed border-border/70 flex items-center justify-center text-sm text-muted-foreground">
                        No data available.
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer: System State */}
        {dashboardState.systemState && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 border rounded bg-card text-[11px] uppercase tracking-wider font-mono text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Mode</span>
              <Badge variant="secondary" className="rounded-sm border-0 font-mono text-[10px]">{dashboardState.systemState.lifecycleMode}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Maturity</span>
              <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${dashboardState.systemState.maturityScore}%` }} />
              </div>
              <span>{dashboardState.systemState.maturityScore}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Coverage</span>
              <span>{dashboardState.systemState.coveragePct}%</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">Trades</span>
              <span>{dashboardState.systemState.closedTrades}</span>
            </div>
            {dashboardState.systemState.notes && (
              <div className="flex items-center gap-2 truncate max-w-sm ml-auto">
                <span className="font-semibold text-primary/70">Note:</span>
                <span className="truncate normal-case tracking-normal">{dashboardState.systemState.notes}</span>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
