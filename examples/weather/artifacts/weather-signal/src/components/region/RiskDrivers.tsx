import { AlertTriangle, Info, Wind, CloudRain, ThermometerSun, Zap } from "lucide-react";

interface RiskDriversProps {
  drivers: string[];
}

export function RiskDrivers({ drivers }: RiskDriversProps) {
  // Simple heuristic to pick an icon based on text
  const getIcon = (text: string) => {
    const lower = text.toLowerCase();
    if (lower.includes("wind") || lower.includes("breeze")) return <Wind className="h-4 w-4" />;
    if (lower.includes("rain") || lower.includes("flood") || lower.includes("storm") || lower.includes("shower")) return <CloudRain className="h-4 w-4" />;
    if (lower.includes("heat") || lower.includes("temperature") || lower.includes("sky")) return <ThermometerSun className="h-4 w-4" />;
    if (lower.includes("lightning")) return <Zap className="h-4 w-4" />;
    return <Info className="h-4 w-4" />;
  };

  return (
    <div className="space-y-3">
      {drivers.map((driver, idx) => (
        <div key={idx} className="flex items-start gap-3 bg-muted/50 rounded-lg p-3">
          <div className="mt-0.5 text-muted-foreground">
            {getIcon(driver)}
          </div>
          <span className="text-sm font-medium text-foreground">{driver}</span>
        </div>
      ))}
    </div>
  );
}