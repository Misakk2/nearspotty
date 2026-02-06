"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star, MapPin, ArrowRight, Search } from "lucide-react";

/**
 * Decision choices returned by backend when no perfect matches found
 */
export interface DecisionChoices {
    survivalOption: {
        id: string;
        name: string;
        rating?: number;
        distance?: number;
        reason: string;
    } | null;
    expandOption: {
        label: string;
        newRadius: number;
    };
}

interface DecisionViewProps {
    message: string;
    choices: DecisionChoices;
    onSelectSurvival: (id: string) => void;
    onExpandRadius: (newRadius: number) => void;
    isLoading?: boolean;
}

/**
 * DecisionView: Displayed when no perfect dietary matches found.
 * User must explicitly choose: use survival option OR expand search radius.
 * This prevents automatic API costs.
 */
export function DecisionView({
    message,
    choices,
    onSelectSurvival,
    onExpandRadius,
    isLoading = false
}: DecisionViewProps) {
    const { survivalOption, expandOption } = choices;

    return (
        <div className="flex flex-col gap-6 p-4 max-w-md mx-auto">
            {/* Header Message */}
            <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-600 mx-auto">
                    <Search className="h-6 w-6" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{message}</h2>
                <p className="text-sm text-muted-foreground">
                    Choose one of the options below:
                </p>
            </div>

            {/* Survival Option Card */}
            {survivalOption && (
                <Card className="border-2 border-amber-200 bg-amber-50/50 hover:border-amber-400 transition-colors">
                    <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                            <div>
                                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide mb-1">
                                    🎯 Best Alternative
                                </span>
                                <h3 className="font-semibold text-base">{survivalOption.name}</h3>
                            </div>
                            {survivalOption.rating && (
                                <div className="flex items-center text-sm text-yellow-600 font-medium">
                                    <Star className="h-4 w-4 fill-current mr-0.5" />
                                    {survivalOption.rating.toFixed(1)}
                                </div>
                            )}
                        </div>

                        <p className="text-xs text-amber-700 italic mb-3">
                            &ldquo;{survivalOption.reason}&rdquo;
                        </p>

                        {survivalOption.distance && (
                            <div className="flex items-center text-xs text-muted-foreground mb-4">
                                <MapPin className="h-3 w-3 mr-1" />
                                {survivalOption.distance < 1000
                                    ? `${Math.round(survivalOption.distance)}m`
                                    : `${(survivalOption.distance / 1000).toFixed(1)}km`}
                            </div>
                        )}

                        <Button
                            onClick={() => onSelectSurvival(survivalOption.id)}
                            disabled={isLoading}
                            className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                        >
                            {isLoading ? "Loading..." : "View Details"}
                            <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Divider */}
            <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">or</span>
                <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Expand Radius Option */}
            <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors">
                <CardContent className="p-4">
                    <div className="text-center space-y-3">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary">
                            <Search className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-base">{expandOption.label}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                We&apos;ll expand the search to {(expandOption.newRadius / 1000).toFixed(0)}km radius
                            </p>
                        </div>
                        <Button
                            onClick={() => onExpandRadius(expandOption.newRadius)}
                            disabled={isLoading}
                            variant="outline"
                            className="w-full border-primary text-primary hover:bg-primary hover:text-white"
                        >
                            {isLoading ? "Searching..." : "Expand Search"}
                            <Search className="h-4 w-4 ml-2" />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
