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
}
