"use client";

interface AuthIconProps {
  className?: string;
}

export function AuthIcon({ className }: AuthIconProps) {
  return (
    <div
      className={className}
      style={{
        background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="text-white"
      >
        <path
          d="M13 2L4.09 12.11C3.89 12.35 3.79 12.65 3.79 12.96C3.79 13.61 4.32 14.14 4.97 14.14H11V22L19.91 11.89C20.11 11.65 20.21 11.35 20.21 11.04C20.21 10.39 19.68 9.86 19.03 9.86H13V2Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}
