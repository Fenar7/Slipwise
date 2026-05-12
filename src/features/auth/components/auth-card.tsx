import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthCard({ title, subtitle, children, className }: AuthCardProps) {
  return (
    <div
      className={cn(
        "w-full rounded-2xl bg-white p-6 sm:p-8 border",
        className
      )}
      style={{ borderColor: "#E0E0E0" }}
    >
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "#1C1B1F" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-1.5" style={{ color: "#49454F" }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}
