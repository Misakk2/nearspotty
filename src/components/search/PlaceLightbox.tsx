"use client";

import React from "react";
import FsLightbox from "fslightbox-react";

interface PlaceLightboxProps {
    isOpen: boolean; // Controls logic for opening (can use a toggle boolean or specific state)
    onToggle?: () => void; // Optional callback if parent needs to toggle
    images: string[];
    initialIndex: number;
}

/**
 * PlaceLightbox
 * A 'dumb' wrapper around FsLightbox that purely displays provided image URLs.
 * Does NOT perform any fetching or API calls.
 */
export const PlaceLightbox = ({ isOpen, images, initialIndex }: PlaceLightboxProps) => {
    return (

        <FsLightbox
            toggler={isOpen}
            slide={initialIndex + 1}
            sources={images}
            type="image"
        />
    );
};

export default PlaceLightbox;
