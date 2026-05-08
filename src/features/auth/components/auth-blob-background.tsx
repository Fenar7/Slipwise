"use client";

export function AuthBlobBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* SVG gooey filter */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>

      {/* Blob container — centered behind the form area */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]"
        style={{ filter: "url(#goo)" }}
      >
        {/* Blob 1 — large, slow drift */}
        <div
          className="absolute top-[20%] left-[25%] w-72 h-72 animate-blob-morph-1"
          style={{
            background: "radial-gradient(circle at 30% 30%, rgba(220,38,38,0.45), rgba(185,28,28,0.22))",
          }}
        />
        {/* Blob 2 — medium, offset drift */}
        <div
          className="absolute top-[35%] left-[50%] w-56 h-56 animate-blob-morph-2"
          style={{
            background: "radial-gradient(circle at 40% 40%, rgba(220,38,38,0.38), rgba(153,27,27,0.16))",
          }}
        />
        {/* Blob 3 — smaller, faster drift */}
        <div
          className="absolute top-[45%] left-[20%] w-48 h-48 animate-blob-morph-3"
          style={{
            background: "radial-gradient(circle at 50% 50%, rgba(220,38,38,0.32), rgba(185,28,28,0.14))",
          }}
        />
        {/* Blob 4 — accent drift */}
        <div
          className="absolute top-[30%] left-[40%] w-40 h-40 animate-blob-morph-4"
          style={{
            background: "radial-gradient(circle at 35% 35%, rgba(220,38,38,0.28), rgba(153,27,27,0.12))",
          }}
        />
      </div>
    </div>
  );
}
