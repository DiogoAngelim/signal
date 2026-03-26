import { Zap, BookOpen, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="relative border-t border-border py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary via-secondary to-accent">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">Signal</span>
            <span className="text-muted-foreground text-sm">Protocol v1</span>
          </div>

          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a
              href="https://github.com/DiogoAngelim/signal"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              Repository
            </a>
            <a
              href="/docs/reference/envelope"
              className="hover:text-foreground transition-colors"
            >
              Envelope
            </a>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>Maintained by</span>
            <Heart className="w-4 h-4 text-brain-core-rose fill-brain-core-rose" />
            <a
              href="https://github.com/DiogoAngelim"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors"
            >
              Diogo Angelim
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
