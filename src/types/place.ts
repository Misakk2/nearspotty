export interface Place {
    place_id: string;
    name: string;
    description?: string; // fallback if needed
    vicinity?: string;
    formatted_address?: string;
    rating?: number;
    user_ratings_total?: number;
    geometry: {
        location: {
            lat: number;
            lng: number;
        };
    };
    photos?: {
        name?: string; // V1 API resource name
        /** @deprecated Use proxyPhotoUrl instead */
        photo_reference?: string;
        height: number;
        width: number;
        /** @deprecated Use proxyPhotoUrl instead */
        url?: string;
        proxyPhotoUrl?: string; // New Standard
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        author_attributions?: any[];
    }[];
    /** @deprecated Use proxyPhotoUrl instead */
    imageSrc: string;

    // NEW STRICT FIELD
    proxyPhotoUrl?: string;

    fallbackImageCategory?: string;
    opening_hours?: {
        open_now: boolean;
        weekday_text?: string[];
    };
    types: string[];
    formatted_phone_number?: string;
    website?: string;
    reviews?: {
        author_name: string;
        rating: number;
        text: string;
        time: number;
        relative_time_description: string;
        profile_photo_url: string;
    }[];
    price_level?: number;
    isExactMatch?: boolean;
    isGeneric?: boolean;

    // Claimed Status & Managed Content
    isClaimed?: boolean;
    menu?: {
        items: {
            id: string;
            name: string;
            description?: string;
            price: number;
            weight?: string; // e.g. "300g"
            imageUrl?: string;
            allergens?: string[];
            dietary?: string[]; // e.g. "vegan", "gluten-free"
            category: string; // e.g. "Starters"
        }[];
    };
    tableConfig?: {
        totalTables: number;
        seatsPerTable: number; // Simplified for now, can be array of tables later
        bookableTables?: number;
    };
    customPhotos?: {
        url: string;
        category?: string;
    }[];
}
