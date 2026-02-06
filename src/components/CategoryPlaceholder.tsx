import React from 'react';
import { Pizza, Coffee, Beer, Utensils, Sandwich, Croissant, Fish, Wine, Cookie } from 'lucide-react';

interface CategoryConfig {
    icon: React.ReactNode;
    color: string;
    label: string;
}

/**
 * Get category-specific styling and icon based on place types.
 * Used for Basic/Free users who don't get actual photos.
 */
export const getCategoryConfig = (types: string[] = []): CategoryConfig => {
    // Pizza
    if (types.includes('pizza_meal') || types.includes('pizza_restaurant') || types.includes('pizza')) {
        return { icon: <Pizza />, color: 'bg-orange-100 text-orange-600', label: 'Pizza' };
    }
    // Coffee/Cafe
    if (types.includes('cafe') || types.includes('coffee_shop')) {
        return { icon: <Coffee />, color: 'bg-amber-100 text-amber-700', label: 'Coffee' };
    }
    // Nightlife
    if (types.includes('bar') || types.includes('night_club') || types.includes('pub')) {
        return { icon: <Beer />, color: 'bg-purple-100 text-purple-600', label: 'Nightlife' };
    }
    // Bakery
    if (types.includes('bakery')) {
        return { icon: <Croissant />, color: 'bg-yellow-100 text-yellow-600', label: 'Bakery' };
    }
    // Burgers
    if (types.includes('burger') || types.includes('hamburger_restaurant')) {
        return { icon: <Sandwich />, color: 'bg-red-100 text-red-600', label: 'Burgers' };
    }
    // Sushi/Japanese
    if (types.includes('sushi') || types.includes('japanese_restaurant')) {
        return { icon: <Fish />, color: 'bg-rose-100 text-rose-600', label: 'Sushi' };
    }
    // Wine
    if (types.includes('winery') || types.includes('wine_bar')) {
        return { icon: <Wine />, color: 'bg-fuchsia-100 text-fuchsia-700', label: 'Wine' };
    }
    // Dessert
    if (types.includes('dessert') || types.includes('ice_cream_shop')) {
        return { icon: <Cookie />, color: 'bg-pink-100 text-pink-500', label: 'Dessert' };
    }

    // Default fallback
    return { icon: <Utensils />, color: 'bg-slate-100 text-slate-500', label: 'Restaurant' };
};

interface CategoryPlaceholderProps {
    types: string[];
    className?: string;
}

/**
 * Visual placeholder for Basic/Free users without restaurant photos.
 * Displays category-specific icon and color scheme.
 */
export const CategoryPlaceholder: React.FC<CategoryPlaceholderProps> = ({
    types,
    className = "w-full h-full"
}) => {
    const config = getCategoryConfig(types);

    return (
        <div className={`${className} ${config.color} flex flex-col items-center justify-center transition-colors p-4`}>
            <div className="w-12 h-12 mb-2 opacity-80 flex items-center justify-center">
                {React.cloneElement(config.icon as React.ReactElement, { size: 40, strokeWidth: 1.5 })}
            </div>
            <span className="font-medium text-xs opacity-75 uppercase tracking-wider text-center">
                {config.label}
            </span>
        </div>
    );
};

export default CategoryPlaceholder;
