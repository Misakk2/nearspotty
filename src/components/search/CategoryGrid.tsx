
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {APP_CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const isActive = activeCategory === category.id;

                    return (
                        <div
                            key={category.id}
                            onClick={() => !disabled && onSelectCategory(category.id)}
                            className={cn(
                                "group relative flex flex-col items-center justify-center p-8 rounded-2xl cursor-pointer transition-all duration-300",
                                "bg-white border hover:shadow-xl hover:-translate-y-1",
                                isActive
                                    ? "border-primary ring-2 ring-primary/20 shadow-lg"
                                    : "border-gray-100 hover:border-primary/30",
                                disabled && "opacity-50 grayscale cursor-not-allowed hover:transform-none hover:shadow-none"
                            )}
                        >
                            <div className={cn(
                                "p-4 rounded-full mb-4 transition-colors duration-300",
                                isActive ? "bg-primary text-white" : "bg-primary/5 text-primary group-hover:bg-primary group-hover:text-white"
                            )}>
                                <Icon className="w-8 h-8" />
                            </div>

                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-primary transition-colors">
                                {category.label}
                            </h3>

                            <p className="text-sm text-gray-500 mt-2 text-center group-hover:text-gray-700 transition-colors">
                                {category.description}
                            </p>

                            {/* Active Indicator Dot */}
                            {isActive && (
                                <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-primary" />
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
                        You've reached your free search limit. <span className="font-bold underline cursor-pointer">Upgrade to Premium</span> to continue.
                    </p>
                </div>
            )}
        </div>
    );
}
