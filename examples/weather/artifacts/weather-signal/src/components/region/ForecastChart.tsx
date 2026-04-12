import type { ForecastPoint } from "@/types/weather";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { getStatusConfig } from "@/lib/utils";

interface ForecastChartProps {
  points: ForecastPoint[];
}

export function ForecastChart({ points }: ForecastChartProps) {
  if (!points || points.length === 0) return null;

  // Use a generic color for the chart to remain calm
  const chartColor = "hsl(var(--primary))";

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as ForecastPoint;
      const config = getStatusConfig(data.label as any);
      return (
        <div className="bg-popover border rounded-lg p-2 shadow-md text-xs">
          <p className="font-semibold text-foreground mb-1">{data.hour}</p>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />
            <span className="text-muted-foreground font-medium">{data.label}</span>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[120px] w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={chartColor} stopOpacity={0.2} />
              <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="hour"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            dy={10}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1, strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey="riskScore"
            stroke={chartColor}
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorScore)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}