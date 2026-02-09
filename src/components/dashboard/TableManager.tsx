"use client";

import { useState, useEffect } from "react";
import { Loader2, Plus, Minus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
// import { useAuth } from "@/components/auth-provider";
import toast from "react-hot-toast";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";

interface TableConfig {
    totalTables: number;
    seatsPerTable: number; // Avg or Default
    bookableTables: number;
    // Future: Array of specific tables { id, seats, shape }
}

export function TableManager({ placeId }: { placeId: string }) {
    // const { user: _user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [config, setConfig] = useState<TableConfig>({
        totalTables: 10,
        seatsPerTable: 4,
        bookableTables: 5
    });

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const docRef = doc(db, "restaurants", placeId);
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.tableConfig) {
                        setConfig(data.tableConfig);
                    }
                }
            } catch (error) {
                console.error("Error fetching table config:", error);
                toast.error("Failed to load table settings");
            } finally {
                setLoading(false);
            }
        };

        if (placeId) {
            fetchConfig();
        }
    }, [placeId]);

    const handleSave = async () => {
        if (!config.totalTables || config.totalTables < 1) {
            toast.error("Total tables must be at least 1");
            return;
        }

        setSaving(true);
        try {
            const docRef = doc(db, "restaurants", placeId);
            await updateDoc(docRef, {
                tableConfig: config,
                updatedAt: new Date().toISOString()
            });
            toast.success("Table configuration saved");
        } catch (error) {
            console.error("Error saving table config:", error);
            toast.error("Failed to save settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    const totalCapacity = config.totalTables * config.seatsPerTable;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-semibold tracking-tight">Table Management</h2>
                <p className="text-muted-foreground">Configure your restaurant&apos;s capacity and reservation limits.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Capacity Settings</CardTitle>
                        <CardDescription>Define your general seating arrangement.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Total Tables</Label>
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, totalTables: Math.max(1, prev.totalTables - 1) }))}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                    type="number"
                                    className="text-center font-bold text-lg"
                                    value={config.totalTables}
                                    onChange={(e) => setConfig({ ...config, totalTables: parseInt(e.target.value) || 0 })}
                                />
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, totalTables: prev.totalTables + 1 }))}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Average Seats per Table</Label>
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, seatsPerTable: Math.max(1, prev.seatsPerTable - 1) }))}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                    type="number"
                                    className="text-center font-bold text-lg"
                                    value={config.seatsPerTable}
                                    onChange={(e) => setConfig({ ...config, seatsPerTable: parseInt(e.target.value) || 0 })}
                                />
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, seatsPerTable: prev.seatsPerTable + 1 }))}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">Estimated Total Capacity: <span className="font-bold text-primary">{totalCapacity} people</span></p>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Reservation Limits</CardTitle>
                        <CardDescription>Control how many tables are available for app bookings.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Bookable Tables</Label>
                            <div className="flex items-center gap-2">
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, bookableTables: Math.max(0, prev.bookableTables - 1) }))}>
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                    type="number"
                                    className="text-center font-bold text-lg"
                                    value={config.bookableTables}
                                    onChange={(e) => setConfig({ ...config, bookableTables: Math.min(config.totalTables, parseInt(e.target.value) || 0) })}
                                />
                                <Button size="icon" variant="outline" onClick={() => setConfig(prev => ({ ...prev, bookableTables: Math.min(prev.totalTables, prev.bookableTables + 1) }))}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {config.bookableTables > 0
                                    ? `Allowing bookings for approx ${config.bookableTables * config.seatsPerTable} people.`
                                    : "Online bookings disabled."}
                            </p>
                        </div>

                        <div className="bg-muted p-4 rounded-md flex items-center gap-3">
                            <Users className="h-5 w-5 text-muted-foreground" />
                            <div className="text-sm">
                                <p className="font-medium">Why limit?</p>
                                <p className="text-muted-foreground">Keep some tables for walk-ins or phone reservations to avoid overbooking.</p>
                            </div>
                        </div>

                        <Button className="w-full mt-4" onClick={handleSave} disabled={saving}>
                            {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : "Save Configuration"}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
