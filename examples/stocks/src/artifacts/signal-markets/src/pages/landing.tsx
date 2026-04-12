import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Link } from "wouter";
import { ArrowRight, BarChart3, ShieldCheck, Zap, LineChart, Eye, LayoutTemplate, Wallet, TrendingUp } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20 overflow-x-hidden">
      <Navbar />
      
      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden pt-24 pb-32 lg:pt-36 lg:pb-40">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
          
          <div className="container relative z-10 mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mx-auto max-w-4xl"
            >
              <div className="mb-6 inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-medium text-primary">
                <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
                Live market signals with confidence scoring
              </div>
              <h1 className="text-4xl font-medium tracking-tight text-foreground sm:text-6xl lg:text-7xl leading-[1.1]">
                Signals that tell you when to <br className="hidden sm:block" />
                <span className="text-primary italic font-serif pr-2">buy, hold,</span> or sell.
              </h1>
              <p className="mt-8 text-lg leading-relaxed text-muted-foreground sm:text-xl max-w-2xl mx-auto">
                Signal Markets blends TradingView data with the market-signals model to turn global tickers into clear actions, confidence levels, and risk context.
              </p>
              
              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-medium text-primary-foreground shadow-lg transition-all hover:bg-primary/90 hover:shadow-primary/20 sm:w-auto hover:-translate-y-0.5"
                >
                  Open Signal Dashboard
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <a
                  href="#philosophy"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-muted/50 px-8 text-sm font-medium text-foreground transition-all hover:bg-muted sm:w-auto"
                >
                  How signals work
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Feature UI Preview Section */}
        <section className="py-12 pb-24">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mx-auto max-w-5xl rounded-2xl border border-border/60 bg-card p-2 shadow-2xl shadow-black/5"
            >
              <div className="rounded-xl bg-background/50 border border-border/40 p-4 sm:p-8 backdrop-blur-sm">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 pb-6 border-b border-border/40">
                  <div className="flex items-center gap-4 w-full sm:w-auto">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <LayoutTemplate className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium text-lg">Signal-First Dashboard</h3>
                      <p className="text-sm text-muted-foreground">Action, confidence, and context in one view.</p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto text-left sm:text-right">
                    <p className="text-sm text-muted-foreground mb-1">Model Status</p>
                    <span className="inline-flex items-center rounded-full bg-[#e8f5e9] dark:bg-[#1b5e20]/20 px-2.5 py-0.5 text-xs font-medium text-[#2e7d32] dark:text-[#81c784] border border-[#c8e6c9] dark:border-[#2e7d32]/30">
                      Signal Engine Active
                    </span>
                  </div>
                </div>
                <div className="grid sm:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 rounded-lg bg-muted/30 border border-border/40 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }}></div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Value Prop Section */}
        <section className="bg-muted/30 py-32 border-y border-border/40">
          <div className="container mx-auto px-4">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-medium tracking-tight mb-4">Decisions should not be guesswork.</h2>
              <p className="text-lg text-muted-foreground">We translate market movement into a clear action signal, backed by model confidence and readable rationale.</p>
            </div>
            
            <div className="grid gap-12 lg:grid-cols-3 max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm border border-border/60 text-primary">
                  <Eye size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-medium tracking-tight">Actionable Signals</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Buy, hold, or sell indicators update as market conditions shift, so you can act without decoding charts.
                </p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm border border-border/60 text-primary">
                  <ShieldCheck size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-medium tracking-tight">Confidence You Can Read</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Every signal includes confidence and a short rationale, so you understand the "why" behind the change.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-background shadow-sm border border-border/60 text-primary">
                  <LineChart size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-medium tracking-tight">Global Coverage</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Monitor markets across regions with schedules and signal changes that stay accurate even after hours.
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section id="philosophy" className="py-32">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl md:text-5xl font-medium tracking-tight mb-8">
                The market moves fast. <br className="hidden sm:block" />
                <span className="text-muted-foreground">Your decision should not be rushed.</span>
              </h2>
              <div className="space-y-6 text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto font-serif">
                <p>
                  Signal Markets is built for investors who want clear guidance, not noisy dashboards or stress-driven alerts.
                </p>
                <p>
                  We surface the most important signal change, explain it in plain language, and keep you focused on long-term outcomes.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Testimonial / Social Proof */}
        <section className="bg-muted/20 py-24 border-t border-border/40">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="space-y-6"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                  <Wallet size={24} strokeWidth={1.5} />
                </div>
                <h2 className="text-3xl font-medium tracking-tight">Built for decisive investors.</h2>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  "I get a clear buy/hold/sell signal with confidence instead of doom-scrolling charts. It keeps me focused on the right move."
                </p>
                <div className="pt-4 border-t border-border/60">
                  <p className="font-medium text-foreground">Ravi Patel</p>
                  <p className="text-sm text-muted-foreground">Portfolio Manager</p>
                </div>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="bg-card rounded-2xl border border-border/60 p-8 shadow-sm"
              >
                <h3 className="font-medium text-lg mb-6">The Signal Markets Promise</h3>
                <ul className="space-y-4 text-muted-foreground">
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>Signals backed by model confidence and rationale.</span>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>Global market coverage with clear status.</span>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    <span>Only the changes that matter.</span>
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-32 relative overflow-hidden">
          <div className="absolute inset-0 bg-primary/5" />
          <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-4xl font-medium tracking-tight mb-6">Ready to act with confidence?</h2>
              <p className="text-xl text-muted-foreground mb-10">
                See your next signal, understand the rationale, and move with intent.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-primary px-10 text-base font-medium text-primary-foreground shadow-xl transition-all hover:bg-primary/90 hover:shadow-primary/20 hover:-translate-y-0.5"
              >
                View Live Signals
                <ArrowRight size={18} />
              </Link>
            </motion.div>
          </div>
        </section>

      </main>

      <footer className="border-t border-border/50 py-12 bg-card">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <TrendingUp size={18} />
            <span className="font-medium">Signal Markets</span>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} Signal Markets. Designed for the everyday investor.
          </p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
          </div>
        </div>
      </footer>
    </div>
  );
}