
import { APP_CATEGORIES } from "@/config/categories";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface CategoryGridProps {
    onSelectCategory: (categoryId: string) => void;
    activeCategory: string | null;
    usageCount?: number;
    usageLimit?: number | string;
    isPremium?: boolean;
    disabled?: boolean;
}

export default function CategoryGrid({
    onSelectCategory,
    activeCategory,
    usageCount = 0,
    usageLimit = 5,
    isPremium = false,
    disabled = false
}: CategoryGridProps) {

    const limitParams = typeof usageLimit === 'number' ? usageLimit : 5;
    const isLimitReached = !isPremium && usageCount >= limitParams;

    // Calculate remaining searches for display in status bar (or parent)
    // but the requirement says "Status Bar: Ensure the 'X searches left' badge is clearly visible and updates in real-time when a category is clicked."
    // This component renders the grid. The parent handles the badge usually, but we can visualize the status here or rely on the parent.
    // The prompt says "Status Bar" - typically separate. But let's focus on the cards here.

    return (
        <div className="w-full">
            <div className="flex flex-col gap-3">
                {APP_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const isActive = activeCategory === category.id;

                    return (
                        <div
                            key={category.id}
                            onClick={() => !disabled && onSelectCategory(category.id)}
                            className={cn(
                                "group relative flex items-center p-3 rounded-xl cursor-pointer transition-all duration-300",
                                "w-full bg-white border",
                                "hover:shadow-md hover:border-primary/50",
                                isActive
                                    ? "border-primary ring-1 ring-primary shadow-sm bg-primary/5"
                                    : "border-gray-100",
                                disabled && "opacity-50 grayscale cursor-not-allowed hover:shadow-none hover:border-gray-100"
                            )}
                        >
                            <div className={cn(
                                "p-2 rounded-lg mr-4 transition-colors duration-300",
                                isActive ? "bg-primary text-white" : "bg-gray-100 text-gray-500 group-hover:bg-primary group-hover:text-white"
                            )}>
                                <Icon className="w-5 h-5" />
                            </div>

                            <div className="flex-1 text-left">
                                <h3 className={cn(
                                    "text-sm font-semibold transition-colors",
                                    isActive ? "text-primary" : "text-gray-700 group-hover:text-gray-900"
                                )}>
                                    {category.label}
                                </h3>
                            </div>

                            {isActive && (
                                <div className="w-1.5 h-1.5 rounded-full bg-primary ml-2" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Limit Reached Warning */}
            {isLimitReached && (
                <div className="mt-8 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center gap-3 text-amber-900 animate-in fade-in slide-in-from-bottom-2">
                    <Lock className="h-5 w-5 flex-shrink-0" />
                    <p className="text-sm font-medium">
                        You&apos;ve reached your free search limit. <span className="font-bold underline cursor-pointer">Upgrade to Premium</span> to continue.
                    </p>
                </div>
            )}
        </div>
    );
}
