import { motion } from "framer-motion";
import { Navbar } from "@/components/navbar";
import { Link } from "wouter";
import {
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Zap,
  LineChart,
  Eye,
  LayoutTemplate,
  Wallet,
  TrendingUp,
} from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-black font-sans text-white selection:bg-[#FDD000]/30">
      <Navbar />

      <main>
        {}
        <section className="relative overflow-hidden border-b border-white/10 bg-black pt-24 pb-28 lg:pt-32 lg:pb-32">
          <div className="container relative z-10 mx-auto px-4 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="mx-auto max-w-4xl"
            >
              <div className="mb-6 inline-flex items-center rounded-md border border-[#FDD000]/30 bg-[#FDD000]/10 px-3 py-1 text-sm font-medium text-[#FDD000]">
                <span className="mr-2 flex h-2 w-2 rounded-full bg-[#FDD000]"></span>
                Live market signals with simple confidence scores
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.1]">
                Clear market signals for <br className="hidden sm:block" />
                buy, hold, and sell decisions.
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-300 sm:text-xl">
                Signal Markets turns price data into plain actions, confidence
                scores, and risk context. It is designed to be readable even if
                you are new to investing.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                <Link
                  href="/dashboard"
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#FDD000] px-8 text-sm font-semibold text-black shadow-lg transition-all hover:-translate-y-0.5 hover:bg-[#ffe45c] sm:w-auto"
                >
                  Open dashboard
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </Link>
                <a
                  href="#philosophy"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/5 px-8 text-sm font-medium text-white transition-all hover:bg-white/10 sm:w-auto"
                >
                  View explanation
                </a>
              </div>
            </motion.div>
          </div>
        </section>

        {}
        <section className="bg-black py-12 pb-24">
          <div className="container mx-auto px-4">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="mx-auto max-w-5xl rounded-xl border border-white/10 bg-[#0f0f0f] p-2 shadow-2xl shadow-black/40"
            >
              <div className="rounded-lg border border-white/10 bg-black p-4 sm:p-8">
                <div className="mb-8 flex flex-col items-center justify-between gap-4 border-b border-white/10 pb-6 sm:flex-row">
                  <div className="flex w-full items-center gap-4 sm:w-auto">
                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#FDD000]">
                      <LayoutTemplate className="h-6 w-6 text-black" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">
                        Signal dashboard
                      </h3>
                      <p className="text-sm text-zinc-400">
                        Action, confidence, and context in one screen.
                      </p>
                    </div>
                  </div>
                  <div className="w-full sm:w-auto text-left sm:text-right">
                    <p className="mb-1 text-sm text-zinc-400">
                      Data status
                    </p>
                    <span className="inline-flex items-center rounded-md border border-[#FDD000]/30 bg-[#FDD000]/10 px-2.5 py-0.5 text-xs font-medium text-[#FDD000]">
                      Signals active
                    </span>
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-32 rounded-lg border border-white/10 bg-white/[0.06] animate-pulse"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    ></div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Value Prop Section */}
        <section className="border-y border-white/10 bg-[#0f0f0f] py-32">
          <div className="container mx-auto px-4">
            <div className="mb-16 text-center max-w-3xl mx-auto">
              <h2 className="mb-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                Decisions should be easy to understand.
              </h2>
              <p className="text-lg text-zinc-400">
                The app translates market movement into a clear action, a
                confidence score, and a short explanation.
              </p>
            </div>

            <div className="grid gap-12 lg:grid-cols-3 max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-black text-[#FDD000]">
                  <Eye size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-semibold tracking-tight text-white">
                  Clear actions
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Buy, hold, or sell labels update as market conditions change.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-black text-[#FDD000]">
                  <ShieldCheck size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-semibold tracking-tight text-white">
                  Readable confidence
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Each signal includes a score and a short reason.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="flex flex-col items-start"
              >
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-md border border-white/10 bg-black text-[#FDD000]">
                  <LineChart size={24} strokeWidth={1.5} />
                </div>
                <h3 className="mb-3 text-xl font-semibold tracking-tight text-white">
                  Market coverage
                </h3>
                <p className="leading-relaxed text-zinc-400">
                  Review markets across regions with clear open and closed
                  status.
                </p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Philosophy Section */}
        <section id="philosophy" className="bg-black py-32">
          <div className="container mx-auto px-4 max-w-4xl text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="mb-8 text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Markets move fast. <br className="hidden sm:block" />
                Decisions should stay clear.
              </h2>
              <div className="mx-auto max-w-3xl space-y-6 text-lg leading-relaxed text-zinc-400 md:text-xl">
                <p>
                  Signal Markets is built for investors who want simple,
                  objective information.
                </p>
                <p>
                  It highlights the signal, explains the reason, and keeps risk
                  visible.
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Testimonial / Social Proof */}
        <section className="border-t border-white/10 bg-[#0f0f0f] py-24">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="space-y-6"
              >
                <div className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-md bg-[#FDD000] text-black">
                  <Wallet size={24} strokeWidth={1.5} />
                </div>
                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  Built for review before action.
                </h2>
                <p className="text-lg leading-relaxed text-zinc-400">
                  The dashboard shows the action, the confidence level, and the
                  main risk checks before any decision.
                </p>
                <div className="border-t border-white/10 pt-4">
                  <p className="font-medium text-white">Research workflow</p>
                  <p className="text-sm text-zinc-500">Market signal review</p>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="rounded-xl border border-white/10 bg-black p-8 shadow-sm"
              >
                <h3 className="mb-6 text-lg font-semibold text-white">
                  What the dashboard checks
                </h3>
                <ul className="space-y-4 text-zinc-400">
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FDD000]" />
                    <span>
                      Signal direction with a confidence score.
                    </span>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FDD000]" />
                    <span>Market status and risk checks.</span>
                  </li>
                  <li className="flex gap-3">
                    <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FDD000]" />
                    <span>Plain explanations for each recommendation.</span>
                  </li>
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden border-t border-white/10 bg-black py-32">
          <div className="container relative z-10 mx-auto px-4 text-center max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="mb-6 text-4xl font-semibold tracking-tight text-white">
                Review the current market view.
              </h2>
              <p className="mb-10 text-xl text-zinc-400">
                See current signals, risk checks, and clear explanations.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-md bg-[#FDD000] px-10 text-base font-semibold text-black shadow-xl transition-all hover:-translate-y-0.5 hover:bg-[#ffe45c]"
              >
                View live signals
                <ArrowRight size={18} />
              </Link>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#0f0f0f] py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-zinc-400">
            <TrendingUp size={18} />
            <span className="font-medium">Signal Markets</span>
          </div>
          <p className="text-center text-sm text-zinc-500">
            © {new Date().getFullYear()} Signal Markets. Designed for the
            everyday investor.
          </p>
          <div className="flex gap-6 text-sm text-zinc-500">
            <a href="#" className="transition-colors hover:text-white">
              Privacy
            </a>
            <a href="#" className="transition-colors hover:text-white">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
