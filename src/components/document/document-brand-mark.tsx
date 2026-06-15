import type { BrandingConfig } from "@/lib/branding";

type DocumentBrandMarkProps = {
  branding: BrandingConfig;
  className?: string;
  initialsClassName?: string;
  imageClassName?: string;
};

export function DocumentBrandMark({
  branding,
  className = "flex h-18 w-18 shrink-0 items-center justify-center rounded-[1.4rem] border border-[rgba(29,23,16,0.1)] bg-[rgba(255,255,255,0.88)] p-2",
  initialsClassName = "text-lg font-semibold text-[var(--voucher-accent)]",
  imageClassName = "h-full w-full rounded-[1rem] object-cover",
}: DocumentBrandMarkProps) {
  const initials = (branding.companyName || "BD")
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const size = branding.logoSize ?? 72;
  const fit = branding.logoFit ?? "contain";
  const isContain = fit === "contain";

  // Clean container class if logo is uploaded to remove box background, borders, and padding
  let finalClassName = className;
  if (branding.logoDataUrl) {
    finalClassName = className
      .split(" ")
      .filter((c) => {
        // Strip out border, bg, padding, and fixed h/w classes
        if (c === "border" || c.startsWith("border-") || c.startsWith("border/")) return false;
        if (c.startsWith("bg-") || c.startsWith("bg/")) return false;
        if (c.startsWith("p-") || c.startsWith("px-") || c.startsWith("py-")) return false;
        if (c.startsWith("h-") || c.startsWith("w-")) return false;
        // If fit mode is contain, also strip rounded corners so rectangular logos don't clip weirdly
        if (isContain && (c.startsWith("rounded-") || c.startsWith("rounded["))) return false;
        return true;
      })
      .join(" ");
    if (!finalClassName.includes("flex")) finalClassName += " flex";
    if (!finalClassName.includes("shrink-0")) finalClassName += " shrink-0";
  }

  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: branding.logoDataUrl && isContain ? "auto" : `${size}px`,
  };

  const imgStyle: React.CSSProperties = {
    objectFit: fit,
    width: "100%",
    height: branding.logoDataUrl && isContain ? "auto" : "100%",
  };

  return (
    <div className={finalClassName} style={containerStyle}>
      {branding.logoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={branding.logoDataUrl}
          alt={`${branding.companyName || "Company"} logo`}
          className={branding.logoFit === "cover" ? imageClassName : ""}
          style={imgStyle}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className={initialsClassName}>{initials}</span>
      )}
    </div>
  );
}
