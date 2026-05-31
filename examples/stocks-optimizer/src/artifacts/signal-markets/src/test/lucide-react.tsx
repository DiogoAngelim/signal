import * as React from "react";

type IconProps = React.SVGProps<SVGSVGElement> & {
  size?: string | number;
};

function createIcon(label: string) {
  return React.forwardRef<SVGSVGElement, IconProps>(function TestIcon(
    { children, size = 16, ...props },
    ref,
  ) {
    return (
      <svg
        ref={ref}
        data-lucide={label}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  });
}

export const Activity = createIcon("activity");
export const AlertCircle = createIcon("alert-circle");
export const AlertTriangle = createIcon("alert-triangle");
export const ArrowDownRight = createIcon("arrow-down-right");
export const ArrowLeft = createIcon("arrow-left");
export const ArrowRight = createIcon("arrow-right");
export const ArrowUpRight = createIcon("arrow-up-right");
export const Award = createIcon("award");
export const BarChart3 = createIcon("bar-chart-3");
export const Bell = createIcon("bell");
export const Bitcoin = createIcon("bitcoin");
export const BookOpen = createIcon("book-open");
export const Brain = createIcon("brain");
export const Check = createIcon("check");
export const CheckCircle2 = createIcon("check-circle-2");
export const ChevronDown = createIcon("chevron-down");
export const ChevronDownIcon = createIcon("chevron-down-icon");
export const ChevronLeft = createIcon("chevron-left");
export const ChevronLeftIcon = createIcon("chevron-left-icon");
export const ChevronRight = createIcon("chevron-right");
export const ChevronRightIcon = createIcon("chevron-right-icon");
export const ChevronUp = createIcon("chevron-up");
export const Circle = createIcon("circle");
export const CircleDashed = createIcon("circle-dashed");
export const CircleDollarSign = createIcon("circle-dollar-sign");
export const Clock = createIcon("clock");
export const Compass = createIcon("compass");
export const Database = createIcon("database");
export const Eye = createIcon("eye");
export const Flag = createIcon("flag");
export const Gauge = createIcon("gauge");
export const Gem = createIcon("gem");
export const Globe2 = createIcon("globe-2");
export const GripVertical = createIcon("grip-vertical");
export const History = createIcon("history");
export const Landmark = createIcon("landmark");
export const Layers = createIcon("layers");
export const LayoutTemplate = createIcon("layout-template");
export const LineChart = createIcon("line-chart");
export const ListChecks = createIcon("list-checks");
export const Loader2Icon = createIcon("loader-2-icon");
export const Medal = createIcon("medal");
export const Minus = createIcon("minus");
export const Moon = createIcon("moon");
export const MoreHorizontal = createIcon("more-horizontal");
export const PanelLeftIcon = createIcon("panel-left-icon");
export const Radio = createIcon("radio");
export const RefreshCw = createIcon("refresh-cw");
export const Search = createIcon("search");
export const Scale = createIcon("scale");
export const ShieldCheck = createIcon("shield-check");
export const SlidersHorizontal = createIcon("sliders-horizontal");
export const Sparkles = createIcon("sparkles");
export const Sun = createIcon("sun");
export const Target = createIcon("target");
export const TrendingUp = createIcon("trending-up");
export const Wallet = createIcon("wallet");
export const WifiOff = createIcon("wifi-off");
export const X = createIcon("x");
export const XCircle = createIcon("x-circle");
export const Zap = createIcon("zap");
