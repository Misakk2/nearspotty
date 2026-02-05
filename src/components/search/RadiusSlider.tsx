"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";

interface RadiusSliderProps {
    value: number; // in meters
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
}

/**
 * Slider component for selecting search radius
 * Displays value in km for UX, but internally uses meters
 */
export function RadiusSlider({
    value,
    onChange,
    min = 500,
    max = 15000,
    step = 500,
    disabled = false
}: RadiusSliderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const displayValue = value / 1000; // Convert to km for display

    return (
        <div className="w-full space-y-2">
            <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-600">Search Radius</span>
                <span className={`font-bold transition-all ${isDragging ? 'text-primary scale-110' : 'text-gray-900'}`}>
                    {displayValue.toFixed(1)} km
                </span>
            </div>
            <Slider
                value={[value]}
                onValueChange={(vals) => onChange(vals[0])}
                onPointerDown={() => setIsDragging(true)}
                onPointerUp={() => setIsDragging(false)}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                className="cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-gray-400">
                <span>{(min / 1000).toFixed(1)} km</span>
                <span>{(max / 1000).toFixed(0)} km</span>
            </div>
        </div>
    );
}
