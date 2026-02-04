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
        photo_reference?: string; // Legacy API reference
        height: number;
        width: number;
        url?: string; // Pre-generated URL from server
        author_attributions?: any[];
    }[];
    imageSrc: string; // Legacy field, now populated with proxyPhotoUrl

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
