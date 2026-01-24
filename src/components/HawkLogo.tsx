interface HawkLogoProps {
  className?: string
  size?: number
}

export function HawkLogo({ className = '', size = 24 }: HawkLogoProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Hawk Head Silhouette */}
      <g>
        {/* Left Eye and Wing */}
        <path d="M15 35 C10 25, 5 35, 12 45 C15 50, 25 55, 35 50 L50 65 L35 75 C20 70, 10 50, 15 35 Z" />
        
        {/* Right Eye and Wing */}
        <path d="M85 35 C90 25, 95 35, 88 45 C85 50, 75 55, 65 50 L50 65 L65 75 C80 70, 90 50, 85 35 Z" />
        
        {/* Central Beak */}
        <path d="M50 65 L45 85 L50 90 L55 85 Z" />
        
        {/* Eye Details */}
        <ellipse cx="25" cy="40" rx="3" ry="5" fill="currentColor" />
        <ellipse cx="75" cy="40" rx="3" ry="5" fill="currentColor" />
        
        {/* Inner Eye Details */}
        <ellipse cx="27" cy="38" rx="1.5" ry="2" fill="white" />
        <ellipse cx="73" cy="38" rx="1.5" ry="2" fill="white" />
      </g>
    </svg>
  )
}
