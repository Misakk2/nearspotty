"use client";

import { MapPin, Globe } from "lucide-react";

export type LocationMode = 'near_me' | 'custom';

interface LocationToggleProps {
    mode: LocationMode;
    onChange: (mode: LocationMode) => void;
    selectedCityName?: string | null;
    disabled?: boolean;
}

/**
 * Toggle switch for selecting between "Near Me" (GPS) and "Custom Location"
 */
export function LocationToggle({
    mode,
    onChange,
    selectedCityName,
    disabled = false
}: LocationToggleProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-full">
                <button
                    type="button"
                    onClick={() => onChange('near_me')}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${mode === 'near_me'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-200'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <MapPin className="h-3.5 w-3.5" />
                    Near Me
                </button>
                <button
                    type="button"
                    onClick={() => onChange('custom')}
                    disabled={disabled}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all ${mode === 'custom'
                            ? 'bg-primary text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-200'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Globe className="h-3.5 w-3.5" />
                    City
                </button>
            </div>
            {/* Show selected city name when in custom mode */}
            {mode === 'custom' && selectedCityName && (
                <div className="text-xs text-gray-500 px-2">
                    📍 {selectedCityName}
                </div>
            )}
        </div>
    );
}
