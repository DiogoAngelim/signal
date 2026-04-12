import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Activity, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background selection:bg-primary/20">
      <main className="flex-1 flex flex-col">
        {/* Hero Section */}
        <section className="relative px-6 pt-24 pb-32 md:pt-32 md:pb-48 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />

          <div className="container mx-auto max-w-4xl relative z-10 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/50 border text-sm font-medium text-muted-foreground mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live operational weather intelligence
              </div>

              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-foreground leading-[1.1] mb-6">
                Weather risk decisions,<br className="hidden md:block" /> delivered in <span className="text-primary">plain language</span>.
              </h1>

              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
                Monitor storms, heat, wind, and flood risk across regions. Know what is safe, what is at risk, and what needs action.
              </p>

              <Link href="/dashboard">
                <Button size="lg" className="rounded-full px-8 h-14 text-base shadow-sm hover:shadow-md transition-all gap-2 group">
                  Open Risk Dashboard
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
            </motion.div>
          </div>
        </section>

        {/* Value Props */}
        <section className="py-24 bg-muted/30 border-t">
          <div className="container mx-auto max-w-5xl px-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="space-y-4"
              >
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Clear Risk Status</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Immediate region status with readable impact summaries, so teams know where to focus.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="space-y-4"
              >
                <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <Activity className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Impact-First Alerts</h3>
                <p className="text-muted-foreground leading-relaxed">
                  We translate forecasts into operational impact: downtime risk, safety thresholds, and recovery windows.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="space-y-4"
              >
                <div className="h-12 w-12 rounded-2xl bg-teal-500/10 flex items-center justify-center text-teal-600">
                  <Globe className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-semibold text-foreground">Global Coverage</h3>
                <p className="text-muted-foreground leading-relaxed">
                  A single dashboard for global facilities, with timelines and risk drivers for every region.
                </p>
              </motion.div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}