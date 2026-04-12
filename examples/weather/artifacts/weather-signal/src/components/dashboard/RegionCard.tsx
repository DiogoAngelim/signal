import type { Region } from "@/types/weather";
import { formatRelativeTime, getStatusConfig } from "@/lib/utils";
import { StatusBadge } from "../region/StatusBadge";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { AlertCircle, Clock } from "lucide-react";

interface RegionCardProps {
  region: Region;
  index: number;
}

export function RegionCard({ region, index }: RegionCardProps) {
  const config = getStatusConfig(region.status);

  return (
    <Link href={`/dashboard/region/${region.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: index * 0.1, ease: "easeOut" }}
        className="group relative flex flex-col h-full bg-card rounded-xl border p-5 cursor-pointer shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1 overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-[0.02] group-hover:opacity-[0.04] transition-opacity pointer-events-none"
          style={{ backgroundColor: config.color }}
        />

        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground tracking-tight flex items-center gap-2">
              {region.name} <span>{region.countryFlag}</span>
            </h3>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <span>Risk: {region.riskScore}/100</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span>Trend: {region.trend}</span>
            </div>
          </div>
          <StatusBadge status={region.status} />
        </div>

        <div className="flex-grow">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" style={{ color: config.color }} />
            <p className="text-sm font-medium text-foreground leading-snug">
              {region.topConcern}
            </p>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 pl-6">
            {region.summary}
          </p>
        </div>

        <div className="mt-5 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span>Updated {formatRelativeTime(region.lastUpdated)}</span>
          </div>
          <span className="font-medium group-hover:text-primary transition-colors">
            View details &rarr;
          </span>
        </div>
      </motion.div>
    </Link>
  );
}