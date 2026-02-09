"use client";

import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Clock, Copy, Save } from "lucide-react";
import toast from "react-hot-toast";
import { Place } from "@/types/place";

interface OpeningHoursEditorProps {
    placeId: string;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface DaySchedule {
    day: string;
    isOpen: boolean;
    open: string;
    close: string;
}

export function OpeningHoursEditor({ placeId }: OpeningHoursEditorProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [schedule, setSchedule] = useState<DaySchedule[]>(
        DAYS.map(day => ({ day, isOpen: true, open: "09:00", close: "22:00" }))
    );

    useEffect(() => {
        const fetchHours = async () => {
            if (!placeId) return;
            try {
                const docRef = doc(db, "restaurants", placeId);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    const data = snap.data() as Place;

                    if (data.openingHoursSpecification && data.openingHoursSpecification.length > 0) {
                        // Load from structured data
                        const newSchedule = DAYS.map(day => {
                            const spec = data.openingHoursSpecification?.find(s => s.dayOfWeek.includes(day));
                            if (spec) {
                                return {
                                    day,
                                    isOpen: true,
                                    open: spec.opens,
                                    close: spec.closes
                                };
                            }
                            return { day, isOpen: false, open: "09:00", close: "22:00" };
                        });
                        setSchedule(newSchedule);
                    } else if (data.opening_hours?.weekday_text) {
                        // Attempt to parse existing text (fallback, simple parsing)
                        const newSchedule = DAYS.map(day => {
                            const line = data.opening_hours?.weekday_text?.find(t => t.startsWith(day));
                            if (line && !line.includes("Closed")) {
                                try {
                                    // Format: "Monday: 09:00 – 22:00" or "Monday: 9:00 AM – 10:00 PM"
                                    const timePart = line.split(": ")[1];
                                    const [openStr, closeStr] = timePart.split(/[–-]/).map(s => s.trim());

                                    // Basic normalization to HH:MM if it has AM/PM
                                    const parseTime = (t: string) => {
                                        if (t.includes("AM") || t.includes("PM")) {
                                            const [time, modifier] = t.split(" ");
                                            const [hoursStr, minutesStr] = time.split(":");
                                            let hours = Number(hoursStr);
                                            const minutes = Number(minutesStr || 0);
                                            if (modifier === "PM" && hours < 12) hours += 12;
                                            if (modifier === "AM" && hours === 12) hours = 0;
                                            return `${String(hours).padStart(2, '0')}:${String(minutes || 0).padStart(2, '0')}`;
                                        }
                                        return t.padStart(5, '0'); // Already HH:MM
                                    };

                                    return {
                                        day,
                                        isOpen: true,
                                        open: parseTime(openStr),
                                        close: parseTime(closeStr)
                                    };
                                } catch (err) {
                                    console.warn(`Failed to parse time for ${day}:`, line, err);
                                }
                            }
                            return { day, isOpen: false, open: "09:00", close: "22:00" };
                        });
                        setSchedule(newSchedule);
                    }
                }
            } catch (error) {
                console.error("Error fetching hours:", error);
                toast.error("Failed to load opening hours");
            } finally {
                setLoading(false);
            }
        };

        fetchHours();
    }, [placeId]);

    const handleTimeChange = (index: number, field: 'open' | 'close', value: string) => {
        const newSchedule = [...schedule];
        newSchedule[index][field] = value;
        setSchedule(newSchedule);
    };

    const toggleOpen = (index: number) => {
        const newSchedule = [...schedule];
        newSchedule[index].isOpen = !newSchedule[index].isOpen;
        setSchedule(newSchedule);
    };

    const copyToAll = (index: number) => {
        const source = schedule[index];
        const newSchedule = schedule.map(d => ({
            ...d,
            isOpen: source.isOpen,
            open: source.open,
            close: source.close
        }));
        setSchedule(newSchedule);
        toast.success(`Copied ${source.day}'s hours to all days`);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1. Create formatted strings for Google-like display
            const weekdayText = schedule.map(s => {
                if (!s.isOpen) return `${s.day}: Closed`;
                return `${s.day}: ${s.open} – ${s.close}`;
            });

            // 2. Create structured specification (grouping same hours could be an optimization, but flat list is fine for now)
            // Actually, let's group by day for simple storage: standard Google JSON-LD uses dayOfWeek as array
            // But Firestore usage -> we can just store array of specs.

            // Let's store compact specs: group identical days
            // OR just store flat list of specs for simplicity in editing
            const specs = schedule
                .filter(s => s.isOpen)
                .map(s => ({
                    dayOfWeek: [s.day],
                    opens: s.open,
                    closes: s.close
                }));

            const docRef = doc(db, "restaurants", placeId);
            await updateDoc(docRef, {
                opening_hours: {
                    open_now: false, // Calculated on read usually, but required by type
                    weekday_text: weekdayText
                },
                openingHoursSpecification: specs,
                updatedAt: new Date().toISOString()
            });

            toast.success("Opening hours saved!");
        } catch (error) {
            console.error("Error saving hours:", error);
            toast.error("Failed to save opening hours");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="p-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>;

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    Opening Hours
                </CardTitle>
                <CardDescription>
                    Set your restaurant&apos;s weekly schedule.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {schedule.map((day, index) => (
                        <div key={day.day} className="flex flex-col sm:flex-row sm:items-center gap-4 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200">
                            <div className="w-32 font-medium flex items-center gap-2">
                                <Switch
                                    checked={day.isOpen}
                                    onCheckedChange={() => toggleOpen(index)}
                                />
                                <span className={!day.isOpen ? "text-muted-foreground" : ""}>{day.day}</span>
                            </div>

                            {day.isOpen ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <Input
                                        type="time"
                                        value={day.open}
                                        onChange={(e) => handleTimeChange(index, 'open', e.target.value)}
                                        className="w-32"
                                    />
                                    <span className="text-muted-foreground">–</span>
                                    <Input
                                        type="time"
                                        value={day.close}
                                        onChange={(e) => handleTimeChange(index, 'close', e.target.value)}
                                        className="w-32"
                                    />
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => copyToAll(index)}
                                        title="Copy to all days"
                                        className="text-muted-foreground hover:text-primary"
                                    >
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            ) : (
                                <div className="flex-1 text-muted-foreground italic py-2">
                                    Closed
                                </div>
                            )}
                        </div>
                    ))}

                    <div className="pt-4 flex justify-end">
                        <Button onClick={handleSave} disabled={saving} className="min-w-[150px] font-bold">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Save Schedule
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
