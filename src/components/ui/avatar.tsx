import { cn } from "@/lib/utils";

interface AvatarProps {
  name?: string;
  imageUrl?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({ name, imageUrl, size = "md", className }: AvatarProps) {
  const sizeClass = {
    sm: "h-7 w-7 text-xs",
    md: "h-9 w-9 text-sm",
    lg: "h-12 w-12 text-base",
  }[size];

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-[var(--brand-primary)] font-semibold text-white select-none overflow-hidden",
        sizeClass,
        className
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={name ?? "User"}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span>{name ? getInitials(name) : "?"}</span>
      )}
    </div>
  );
}
