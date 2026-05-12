import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "full" | "compact";
  className?: string;
  href?: string;
}

export function Logo({ variant = "full", className, href = "/app/home" }: LogoProps) {
  const content = (
    <div className={cn("flex items-center", className)}>
      {variant === "full" ? (
        <Image
          src="/images/slipwise-logo.png"
          alt="Slipwise"
          width={140}
          height={27}
          className="h-auto w-[110px] sm:w-[130px] object-contain"
          priority
        />
      ) : (
        <span
          className="inline-flex items-center justify-center rounded-lg px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-widest"
          style={{
            background: "var(--brand-primary)",
            color: "var(--text-inverse)",
          }}
        >
          SW
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return content;
}
