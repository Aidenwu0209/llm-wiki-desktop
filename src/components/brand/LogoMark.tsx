type LogoMarkProps = {
  size?: number;
  className?: string;
  showWordmark?: boolean;
};

export function LogoMark({ size = 44, className = "", showWordmark = false }: LogoMarkProps) {
  return (
    <span className={`logo-lockup ${className}`.trim()} aria-label="LLM Wiki">
      <svg
        className="logo-mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="56" height="56" rx="15" fill="#172a31" />
        <path
          d="M16.5 19.5c0-2.2 1.8-4 4-4h9.6c2.6 0 4.7 2.1 4.7 4.7v25.1c0 2-1.9 3.5-3.8 2.9-3.4-1.1-7.2-1-11.2.4-1.6.6-3.3-.7-3.3-2.4V19.5Z"
          fill="#fff6df"
        />
        <path
          d="M34.8 20.2c0-2.6 2.1-4.7 4.7-4.7h8.1c2.2 0 4 1.8 4 4v26.7c0 1.7-1.7 3-3.3 2.4-3.9-1.4-7.7-1.5-11.2-.4-1.9.6-3.8-.9-3.8-2.9V20.2Z"
          fill="#ead8af"
        />
        <path d="M34.7 20v27.3" stroke="#b8965e" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M21.2 25.6h8.1M21.2 31h7M21.2 36.4h9" stroke="#92784f" strokeWidth="2" strokeLinecap="round" />
        <path d="M39.1 25.6h7.6M39.1 31h7.6M39.1 36.4h6.4" stroke="#7e6847" strokeWidth="2" strokeLinecap="round" />
        <path d="M25 30.4 32.4 36l8.9-7.7M32.4 36l8.8 5.6" fill="none" stroke="#c59b54" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="25" cy="30.4" r="3.1" fill="#f2c879" stroke="#fff3d2" strokeWidth="1.4" />
        <circle cx="32.4" cy="36" r="3.4" fill="#e8b85f" stroke="#fff3d2" strokeWidth="1.4" />
        <circle cx="41.3" cy="28.3" r="3.1" fill="#78a98b" stroke="#e7f4ec" strokeWidth="1.4" />
        <circle cx="41.2" cy="41.6" r="2.9" fill="#a7b894" stroke="#f1f7ec" strokeWidth="1.4" />
      </svg>
      {showWordmark && (
        <span className="logo-wordmark">
          <strong>LLM Wiki</strong>
          <em>Local-first research workspace</em>
        </span>
      )}
    </span>
  );
}
