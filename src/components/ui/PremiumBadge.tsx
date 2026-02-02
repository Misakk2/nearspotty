import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PremiumBadgeProps {
    className?: string;
    showIcon?: boolean;
    text?: string;
    size?: 'sm' | 'md';
}

export function PremiumBadge({
    className,
    showIcon = true,
    text = "Premium Member",
    size = 'md'
}: PremiumBadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 bg-gradient-to-r from-amber-400 to-yellow-500 text-white font-bold uppercase tracking-wider shadow-sm rounded-full",
                size === 'sm' ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1",
                className
            )}
        >
            {showIcon && <Crown className={cn("fill-current", size === 'sm' ? "h-3 w-3" : "h-3.5 w-3.5")} />}
            {text}
        </span>
    );
}
