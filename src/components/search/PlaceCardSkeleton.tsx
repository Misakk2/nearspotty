import { Card, CardContent } from "@/components/ui/card";

export const PlaceCardSkeleton = () => {
    return (
        <Card className="overflow-hidden border border-gray-100 shadow-sm animate-pulse">
            <div className="aspect-video bg-gray-200" />
            <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="h-5 w-2/3 bg-gray-200 rounded" />
                    <div className="h-5 w-10 bg-gray-200 rounded" />
                </div>
                <div className="h-4 w-full bg-gray-100 rounded" />
                <div className="h-4 w-5/6 bg-gray-100 rounded" />

                <div className="pt-2 flex gap-2">
                    <div className="h-6 w-20 bg-primary/10 rounded-full" />
                    <div className="h-6 w-20 bg-gray-100 rounded-full" />
                </div>
            </CardContent>
        </Card>
    );
};
