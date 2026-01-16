export interface Place {
    place_id: string;
    name: string;
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
        photo_reference: string;
        height: number;
        width: number;
    }[];
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
}
