/** Drapeaux dessinés (les émojis drapeaux ne s'affichent pas sous Windows). */
export default function Flag({ code, className = "w-5 h-3.5" }: { code: string; className?: string }) {
  const common = { className: `${className} rounded-[2px] shrink-0`, viewBox: "0 0 30 20", "aria-hidden": true } as const;
  switch (code) {
    case "FR":
      return <svg {...common}><rect width="10" height="20" fill="#0055A4" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#EF4135" /></svg>;
    case "IT":
      return <svg {...common}><rect width="10" height="20" fill="#009246" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#CE2B37" /></svg>;
    case "DE":
      return <svg {...common}><rect width="30" height="7" fill="#000" /><rect y="6.66" width="30" height="7" fill="#DD0000" /><rect y="13.33" width="30" height="6.67" fill="#FFCE00" /></svg>;
    case "UK":
      return (
        <svg {...common}>
          <rect width="30" height="20" fill="#012169" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#fff" strokeWidth="4" />
          <path d="M0,0 30,20 M30,0 0,20" stroke="#C8102E" strokeWidth="1.6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" stroke="#C8102E" strokeWidth="3.4" />
        </svg>
      );
    default:
      return null;
  }
}
