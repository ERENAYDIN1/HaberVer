interface IconProps {
  className?: string;
}

const temelOzellikler = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconTree({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 3 6.5 11h2.7L5 18h6M12 3l5.5 8h-2.7L19 18h-6" />
      <path d="M12 14v7" />
    </svg>
  );
}

export function IconBench({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M3 9h18M3 12h18M5 12v7M19 12v7M3 19h4M17 19h4" />
    </svg>
  );
}

export function IconLamp({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 2v3M8.5 5h7l-1.3 4.5h-4.4L8.5 5z" />
      <path d="M12 9.5V21M9 21h6" />
    </svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 21s6.5-6.1 6.5-11a6.5 6.5 0 0 0-13 0C5.5 14.9 12 21 12 21z" />
      <circle cx="12" cy="10" r="2" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M12 3 3 8l9 5 9-5-9-5z" />
      <path d="M3 12.5 12 17.5l9-5" />
      <path d="M3 16.5 12 21.5l9-5" />
    </svg>
  );
}

export function IconLasso({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <rect x="4" y="4" width="16" height="16" strokeDasharray="3.2 3.2" />
    </svg>
  );
}

export function IconRuler({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <path d="M4 15 15 4l5 5-11 11-5-5z" />
      <path d="M8 11l1.5 1.5M11 8l1.5 1.5M14 5l1.5 1.5" />
    </svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M14 6l-6 6 6 6" />
    </svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M10 6l6 6-6 6" />
    </svg>
  );
}

export function IconX({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} strokeWidth={2} className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <svg {...temelOzellikler} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
