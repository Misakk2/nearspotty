/**
 * MatchScoreBadge - Circular progress indicator showing AI match score.
 * 
 * Displays a 0-100% match score with color coding:
 * - 75-100%: Green (excellent match)
 * - 50-74%: Yellow/Orange (good match)  
 * - 0-49%: Red (poor match)
 */

import { cn } from "@/lib/utils";

interface MatchScoreBadgeProps {
    score: number; // 0-100
    size?: "sm" | "md" | "lg";
    className?: string;
}

export function MatchScoreBadge({ score, size = "md", className }: MatchScoreBadgeProps) {
    // Clamp score to valid range
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

    // Calculate stroke dash for circular progress
    const radius = size === "sm" ? 16 : size === "md" ? 20 : 28;
    const strokeWidth = size === "sm" ? 3 : size === "md" ? 4 : 5;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

    // Size configurations
    const sizeConfig = {
        sm: { width: 40, fontSize: "text-[10px]", viewBox: 40 },
        md: { width: 52, fontSize: "text-xs", viewBox: 52 },
        lg: { width: 72, fontSize: "text-base", viewBox: 72 },
    };

    const config = sizeConfig[size];

    // Color based on score
    const getScoreColor = (s: number): { stroke: string; text: string; bg: string } => {
        if (s >= 75) return { stroke: "#22c55e", text: "text-green-600", bg: "bg-green-50" };
        if (s >= 50) return { stroke: "#f59e0b", text: "text-amber-600", bg: "bg-amber-50" };
        return { stroke: "#ef4444", text: "text-red-600", bg: "bg-red-50" };
    };

    const colors = getScoreColor(clampedScore);

    return (
        <div
            className={cn(
                "relative inline-flex items-center justify-center rounded-full",
                colors.bg,
                className
            )}
            style={{ width: config.width, height: config.width }}
        >
            <svg
                width={config.width}
                height={config.width}
                viewBox={`0 0 ${config.viewBox} ${config.viewBox}`}
                className="transform -rotate-90"
            >
                {/* Background circle */}
                <circle
                    cx={config.viewBox / 2}
                    cy={config.viewBox / 2}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-gray-200"
                />
                {/* Progress circle */}
                <circle
                    cx={config.viewBox / 2}
                    cy={config.viewBox / 2}
                    r={radius}
                    fill="none"
                    stroke={colors.stroke}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={strokeDashoffset}
                    className="transition-all duration-500 ease-out"
                />
            </svg>
            <span
                className={cn(
                    "absolute font-bold",
                    config.fontSize,
                    colors.text
                )}
            >
                {clampedScore}%
            </span>
        </div>
    );
}
