import { type ButtonHTMLAttributes, forwardRef } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { hoverScale, tapScale } from "@/components/foundation/motion-primitives";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <motion.button
        ref={ref}
        whileHover={hoverScale}
        whileTap={tapScale}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          {
            "bg-[var(--brand-cta)] text-white hover:bg-[#B91C1C] shadow-[0_1px_3px_rgba(220,38,38,0.25)]":
              variant === "primary",
            "border border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]":
              variant === "secondary",
            "text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]":
              variant === "ghost",
            "bg-[var(--state-danger)] text-white hover:bg-[#B91C1C]": variant === "danger",
          },
          {
            "h-8 rounded-lg px-3 text-xs": size === "sm",
            "h-10 rounded-xl px-4 text-sm": size === "md",
            "h-12 rounded-xl px-6 text-base": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
