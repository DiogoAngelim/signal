import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isDestructive = props.variant === "destructive";
        const Icon = isDestructive ? AlertTriangle : CheckCircle2;

        return (
          <Toast key={id} {...props}>
            <div
              className={cn(
                "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                isDestructive
                  ? "border-rose-400/30 bg-rose-400/10 text-rose-200"
                  : "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="grid min-w-0 flex-1 gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action && <div className="shrink-0 self-center">{action}</div>}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
