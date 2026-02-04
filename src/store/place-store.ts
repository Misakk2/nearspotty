import { create } from 'zustand';
import { Place } from '@/types/place';

interface PlaceStore {
    selectedPlace: Place | null;
    setPlace: (place: Place | null) => void;
}

export const usePlaceStore = create<PlaceStore>((set) => ({
    selectedPlace: null,
    setPlace: (place) => set({ selectedPlace: place }),
}));
