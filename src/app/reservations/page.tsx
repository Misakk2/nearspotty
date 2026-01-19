"use client";

import { useEffect, useState } from "react";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import RoleGuard from "@/components/RoleGuard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Users, Clock, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";

import { Timestamp } from "firebase/firestore";

interface Reservation {
    id: string;
    placeId: string;
    placeName: string;
    date: Timestamp;
    time: string;
    guests: number;
    status: string;
    createdAt: Timestamp;
}

export default function ReservationsPage() {
    const { user } = useAuth();
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReservations = async () => {
            if (!user) return;
            try {
                const q = query(
                    collection(db, "reservations"),
                    where("userId", "==", user.uid),
                    orderBy("date", "desc")
                );
                const querySnapshot = await getDocs(q);
                const list: Reservation[] = [];
                querySnapshot.forEach((doc) => {
                    list.push({ id: doc.id, ...doc.data() } as Reservation);
                });
                setReservations(list);
            } catch (error) {
                console.error("Error fetching reservations:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchReservations();
    }, [user]);

    return (
        <ProtectedRoute>
            <RoleGuard allowedRole="diner">
                <div className="min-h-screen bg-gray-50 py-10 px-4">
                    <div className="max-w-4xl mx-auto space-y-8">
                        <div className="flex justify-between items-center">
                            <h1 className="text-3xl font-bold text-gray-900">My Reservations</h1>
                            <Link href="/search">
                                <Button variant="outline">Find More Places</Button>
                            </Link>
                        </div>

                        {loading ? (
                            <div className="flex justify-center p-12">
                                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            </div>
                        ) : reservations.length === 0 ? (
                            <Card className="p-12 text-center">
                                <div className="flex flex-col items-center space-y-4">
                                    <Calendar className="h-12 w-12 text-gray-300" />
                                    <h2 className="text-xl font-medium">No reservations yet</h2>
                                    <p className="text-muted-foreground">Book your first dining experience through NearSpotty!</p>
                                    <Link href="/search">
                                        <Button size="lg">Explore Restaurants</Button>
                                    </Link>
                                </div>
                            </Card>
                        ) : (
                            <div className="grid gap-4">
                                {reservations.map((res) => (
                                    <Card key={res.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                        <div className="flex flex-col md:flex-row">
                                            <div className="md:w-1/4 bg-primary/5 p-6 flex flex-col items-center justify-center text-center border-b md:border-b-0 md:border-r border-primary/10">
                                                <p className="text-sm font-semibold uppercase text-primary/60 tracking-wider">
                                                    {format(res.date.toDate(), "MMM")}
                                                </p>
                                                <p className="text-4xl font-bold text-primary">
                                                    {format(res.date.toDate(), "dd")}
                                                </p>
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {format(res.date.toDate(), "EEEE")}
                                                </p>
                                            </div>
                                            <CardContent className="flex-1 p-6">
                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                    <div className="space-y-3">
                                                        <div className="flex items-center gap-2">
                                                            <h3 className="text-xl font-bold text-gray-900">{res.placeName}</h3>
                                                            <Badge variant="outline" className="capitalize bg-green-50 text-green-700 border-green-200">
                                                                {res.status}
                                                            </Badge>
                                                        </div>

                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
                                                            <div className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4 text-gray-400" />
                                                                <span>Time: <strong>{res.time}</strong></span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <Users className="h-4 w-4 text-gray-400" />
                                                                <span>Guests: <strong>{res.guests}</strong></span>
                                                            </div>
                                                            <Link href={`/place/${res.placeId}`} className="flex items-center gap-2 text-primary hover:underline col-span-full">
                                                                <ExternalLink className="h-4 w-4" />
                                                                View Details
                                                            </Link>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        {/* Mock actions */}
                                                        <Button variant="outline" size="sm" className="flex-1 md:flex-none">Cancel</Button>
                                                        <Button size="sm" className="flex-1 md:flex-none">Modify</Button>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </RoleGuard>
        </ProtectedRoute>
    );
}
