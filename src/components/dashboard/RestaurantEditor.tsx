"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Place } from "@/types/place";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Globe, Phone, DollarSign, Store, Image as ImageIcon } from "lucide-react";
import toast from "react-hot-toast";
import { ImageManager } from "./ImageManager";

interface RestaurantEditorProps {
    placeId: string;
}

const CUISINE_OPTIONS = [
    "Italian", "French", "Japanese", "Chinese", "Indian", "Mexican",
    "Thai", "Vietnamese", "Greek", "Spanish", "American", "Burger",
    "Pizza", "Seafood", "Steakhouse", "Vegetarian", "Vegan",
    "Cafe", "Bakery", "Bar", "Pub", "Czech", "Slovak"
];

export function RestaurantEditor({ placeId }: RestaurantEditorProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [data, setData] = useState<Partial<Place>>({});

    // Form states
    const [description, setDescription] = useState("");
    const [website, setWebsite] = useState("");
    const [phone, setPhone] = useState("");
    const [priceLevel, setPriceLevel] = useState(2);
    const [selectedCuisines, setSelectedCuisines] = useState<string[]>([]);
    const [customCuisine, setCustomCuisine] = useState("");

    const fetchData = async () => {
        if (!placeId) return;
        try {
            const docRef = doc(db, "restaurants", placeId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                // Define internal interface for Firestore document structure
                interface GooglePhotoEntry { photoReference: string; height: number; width: number; }
                interface RestaurantDoc extends Place {
                    images?: { google?: GooglePhotoEntry[]; owner?: { url: string }[] };
                    cuisineTypes?: string[];
                }

                const placeData = snap.data() as RestaurantDoc;

                // Map Google photos for ImageManager
                const googlePhotos = (placeData.images?.google || []).map((img: GooglePhotoEntry) => ({
                    height: img.height,
                    width: img.width,
                    photo_reference: img.photoReference,
                    proxyPhotoUrl: `/api/images/proxy?id=${placeId}&ref=${encodeURIComponent(img.photoReference)}&width=800`
                }));

                setData({
                    ...placeData,
                    photos: googlePhotos
                });

                // Initialize form only if not already modified or as a baseline
                setDescription(placeData.description || "");
                setWebsite(placeData.website || "");
                setPhone(placeData.formatted_phone_number || "");
                setPriceLevel(placeData.price_level || 2);

                // Handle types/cuisines
                // Filter standard Google types to find cuisine-like tags or use stored custom tags
                // For now, we'll try to use 'types' field but it might be messy coming from Google
                // So we might want to store a specific 'cuisineTypes' field in the future
                // checking for a custom field first
                const customCuisines = placeData.cuisineTypes || [];
                if (customCuisines.length > 0) {
                    setSelectedCuisines(customCuisines);
                } else {
                    // mapping from google types if no custom cuisines set
                    const googleTypes = placeData.types || [];
                    const mapped = googleTypes.filter((t: string) => CUISINE_OPTIONS.map(c => c.toLowerCase()).includes(t) || t === 'restaurant' || t === 'food');
                    // Start empty if only generic types
                    setSelectedCuisines(mapped.filter((t: string) => t !== 'restaurant' && t !== 'food'));
                }
            }
        } catch (error) {
            console.error("Error fetching restaurant details:", error);
            toast.error("Failed to load restaurant details");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [placeId]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            const docRef = doc(db, "restaurants", placeId);
            await updateDoc(docRef, {
                description,
                website,
                formatted_phone_number: phone,
                price_level: priceLevel,
                cuisineTypes: selectedCuisines, // Save our clean list
                updatedAt: new Date().toISOString()
            });
            toast.success("Restaurant details updated!");
        } catch (error) {
            console.error("Error updating restaurant:", error);
            toast.error("Failed to update details");
        } finally {
            setSaving(false);
        }
    };

    const toggleCuisine = (cuisine: string) => {
        if (selectedCuisines.includes(cuisine)) {
            setSelectedCuisines(prev => prev.filter(c => c !== cuisine));
        } else {
            if (selectedCuisines.length >= 3) {
                toast.error("Max 3 cuisines allowed");
                return;
            }
            setSelectedCuisines(prev => [...prev, cuisine]);
        }
    };

    const addCustomCuisine = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (customCuisine && !selectedCuisines.includes(customCuisine)) {
                if (selectedCuisines.length >= 3) {
                    toast.error("Max 3 cuisines allowed");
                    return;
                }
                setSelectedCuisines(prev => [...prev, customCuisine]);
                setCustomCuisine("");
            }
        }
    };


    if (loading) {
        return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;
    }

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Store className="h-5 w-5 text-primary" />
                    Edit Restaurant Details
                </CardTitle>
                <CardDescription>
                    Manage how your restaurant appears to customers.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSave} className="space-y-6">

                    {/* Description */}
                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            placeholder="Tell customers about your restaurant..."
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            rows={4}
                            className="resize-none"
                        />
                        <p className="text-xs text-muted-foreground text-right">
                            {description.length}/500 characters
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Contact Info */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="website">Website</Label>
                                <div className="relative">
                                    <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="website"
                                        placeholder="https://example.com"
                                        className="pl-9"
                                        value={website}
                                        onChange={e => setWebsite(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone Number</Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="phone"
                                        placeholder="+420 123 456 789"
                                        className="pl-9"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Price Level</Label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4].map((level) => (
                                        <Button
                                            key={level}
                                            type="button"
                                            variant={priceLevel === level ? "default" : "outline"}
                                            onClick={() => setPriceLevel(level)}
                                            className="flex-1"
                                        >
                                            <span className="flex">
                                                {Array(level).fill(0).map((_, i) => (
                                                    <DollarSign key={i} className="h-3 w-3" />
                                                ))}
                                            </span>
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Cuisines */}
                        <div className="space-y-2">
                            <Label>Cuisines (Max 3)</Label>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {selectedCuisines.map(c => (
                                    <Button
                                        key={c}
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => toggleCuisine(c)}
                                        className="group hover:bg-red-100 hover:text-red-700 transition-colors"
                                    >
                                        {c}
                                        <span className="ml-1 hidden group-hover:inline">×</span>
                                    </Button>
                                ))}
                            </div>

                            <Input
                                placeholder="Add custom cuisine (press Enter)"
                                value={customCuisine}
                                onChange={e => setCustomCuisine(e.target.value)}
                                onKeyDown={addCustomCuisine}
                                className="mb-3"
                            />

                            <div className="flex flex-wrap gap-1.5 h-48 overflow-y-auto p-2 border rounded-md">
                                {CUISINE_OPTIONS.map(cuisine => (
                                    <Button
                                        key={cuisine}
                                        type="button"
                                        variant={selectedCuisines.includes(cuisine) ? "default" : "ghost"}
                                        size="sm"
                                        onClick={() => toggleCuisine(cuisine)}
                                        className="text-xs h-7"
                                    >
                                        {cuisine}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t">
                        <div className="flex items-center gap-2 mb-4">
                            <ImageIcon className="h-5 w-5 text-primary" />
                            <h3 className="font-bold text-lg">Restaurant Photos</h3>
                        </div>
                        <ImageManager
                            placeId={placeId}
                            currentPhotos={data.photos}
                            customPhotos={data.customPhotos}
                            onUpdate={fetchData}
                        />
                    </div>

                    <Button type="submit" disabled={saving} className="w-full h-11 font-bold">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Changes
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
