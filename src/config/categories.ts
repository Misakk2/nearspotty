
import { UtensilsCrossed, Coffee, Beer } from "lucide-react";

export interface Category {
    id: string;
    label: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any; // Lucide icon component
    description?: string;
    keywords?: string;
}

export const APP_CATEGORIES: Category[] = [
    {
        id: "restaurant",
        label: "Restaurants",
        icon: UtensilsCrossed,
        description: "Fine dining & local favorites",
        keywords: "restaurant"
    },
    {
        id: "cafe",
        label: "Cafes",
        icon: Coffee,
        description: "Coffee shops & bakeries",
        keywords: "cafe coffee shop"
    },
    {
        id: "bar",
        label: "Bars & Pubs",
        icon: Beer,
        description: "Cocktail bars & nightlife",
        keywords: "bar pub"
    }
];

// For backward compatibility if needed, though we should migrate usages
export const SEARCH_CATEGORIES = APP_CATEGORIES;
