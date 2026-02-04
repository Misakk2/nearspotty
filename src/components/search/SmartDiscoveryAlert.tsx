
"use client";

import { AlertTriangle, Compass, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SmartDiscoveryAlertProps {
    keyword: string;
    message?: string | null;
    onIncreaseRadius: () => void;
}

export function SmartDiscoveryAlert({ keyword, message, onIncreaseRadius }: SmartDiscoveryAlertProps) {
    return (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 shadow-sm animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-start gap-4">
                <div className="rounded-full bg-amber-100 p-2 text-amber-600 shrink-0">
                    <Compass className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-2">
                    <div>
                        <h4 className="font-semibold text-amber-900 flex items-center gap-2">
                            Sorry, we couldn't find "{keyword}"
                        </h4>
                        <p className="text-sm text-amber-800/90 mt-1 leading-relaxed">
                            {message || `We didn't find any business matching "${keyword}" in this area.`}
                        </p>
                    </div>

                    <div className="pt-2">
                        <Button
                            onClick={onIncreaseRadius}
                            variant="outline"
                            size="sm"
                            className="bg-white hover:bg-amber-50 border-amber-200 text-amber-700 hover:text-amber-800 transition-colors w-full sm:w-auto"
                        >
                            <MapPin className="mr-2 h-3.5 w-3.5" />
                            Try larger circle (+5km)
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
