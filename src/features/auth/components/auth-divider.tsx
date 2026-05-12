export function AuthDivider({ text = "or" }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="flex-1 h-px" style={{ background: "#E0E0E0" }} />
      <span
        className="text-xs uppercase tracking-wide font-medium"
        style={{ color: "#79747E" }}
      >
        {text}
      </span>
      <div className="flex-1 h-px" style={{ background: "#E0E0E0" }} />
    </div>
  );
}
