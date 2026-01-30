"use client";

import { auth, db } from "@/lib/firebase";
import { signOut, updateProfile } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, CreditCard, LogOut, LayoutDashboard } from "lucide-react";

const DIETARY_OPTIONS = [
    { id: "vegan", label: "Vegan" },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "gluten-free", label: "Gluten-Free" },
    { id: "lactose-free", label: "Lactose-Free" },
];

export default function ProfilePage() {
    const { user, userRole } = useAuth();
    const [loading, setLoading] = useState(false);
    const [dietary, setDietary] = useState<string[]>([]);
    const [allergies, setAllergies] = useState("");
    const [budget, setBudget] = useState<'low' | 'medium' | 'high' | 'any'>('any');
    const router = useRouter();

    useEffect(() => {
        if (user) {
            getDoc(doc(db, "users", user.uid)).then(snap => {
                if (snap.exists()) {
                    const data = snap.data();
                    setDietary(data.preferences?.dietary || []);
                    setAllergies(data.preferences?.allergies || "");
                    setBudget(data.preferences?.budget || 'any');
                }
            });
        }
    }, [user]);

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;

        try {
            await updateProfile(user, { displayName: name });
            await updateDoc(doc(db, "users", user.uid), {
                displayName: name,
                preferences: {
                    dietary,
                    allergies,
                    budget,
                }
            });
            toast.success("Profile updated!");
        } catch (error) {
            console.error("Profile update error:", error);
            toast.error("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const toggleDietary = (id: string) => {
        setDietary(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/");
        } catch (error) {
            console.error("Logout error:", error);
            toast.error("Failed to logout");
        }
    };

    return (
        <ProtectedRoute>
            <div className="container mx-auto py-10 px-4 min-h-screen">
                <div className="max-w-2xl mx-auto space-y-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal Information</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleUpdate} className="grid md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
                                            {user?.displayName?.charAt(0) || user?.email?.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg">{user?.displayName}</p>
                                            <p className="text-sm text-gray-500">{user?.email}</p>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">Full Name</Label>
                                            <Input id="name" name="name" defaultValue={user?.displayName || ""} />
                                        </div>
                                        <Button type="submit" disabled={loading} className="w-full">
                                            {loading ? "Saving..." : "Save Changes"}
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-6 border-l pl-8 border-gray-100">
                                    <h3 className="font-bold text-lg">Dietary Preferences</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        {DIETARY_OPTIONS.map(opt => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => toggleDietary(opt.id)}
                                                className={`px-4 py-2 rounded-full text-xs font-bold border-2 transition-all ${dietary.includes(opt.id) ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="allergies">Allergies</Label>
                                        <Input
                                            id="allergies"
                                            value={allergies}
                                            onChange={(e) => setAllergies(e.target.value)}
                                            placeholder="e.g. Nuts, Soy"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Budget Preference</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {(['any', 'low', 'medium', 'high'] as const).map((budgetOption) => {
                                                const isSelected = budget === budgetOption;
                                                const labels = {
                                                    any: '💰 Any',
                                                    low: '€ Budget',
                                                    medium: '€€ Mid-range',
                                                    high: '€€€ Fine dining'
                                                };
                                                return (
                                                    <button
                                                        key={budgetOption}
                                                        type="button"
                                                        onClick={() => setBudget(budgetOption)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${isSelected ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20' : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                                    >
                                                        {labels[budgetOption]}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </form>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Shortcuts</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {userRole === "owner" ? (
                                <Link href="/dashboard" className="p-6 rounded-3xl border-2 border-green-50 bg-green-50/20 hover:bg-green-50/40 transition-all text-center group col-span-full">
                                    <LayoutDashboard className="h-8 w-8 text-green-600 mx-auto mb-3 group-hover:scale-110 transition-transform" />
                                    <p className="font-bold text-green-700">Business Dashboard</p>
                                </Link>
                            ) : (
                                <Link href="/reservations" className="p-6 rounded-3xl border-2 border-gray-50 bg-gray-50/20 hover:bg-gray-50/40 transition-all text-center group">
                                    <Calendar className="h-8 w-8 text-primary mx-auto mb-3 group-hover:scale-110 transition-transform" />
                                    <p className="font-bold text-gray-700">My Reservations</p>
                                </Link>
                            )}
                            <Link href="/subscription" className={`p-6 rounded-3xl border-2 border-gray-50 bg-gray-50/20 hover:bg-gray-50/40 transition-all text-center group ${userRole === 'owner' ? 'col-span-full' : ''}`}>
                                <CreditCard className="h-8 w-8 text-primary mx-auto mb-3 group-hover:scale-110 transition-transform" />
                                <p className="font-bold text-gray-700">Subscription</p>
                            </Link>
                        </CardContent>
                    </Card>

                    <Button variant="outline" onClick={handleLogout} className="w-full h-14 rounded-full font-bold border-2 border-gray-100 text-gray-500 hover:bg-destructive hover:text-white transition-all">
                        <LogOut className="h-5 w-5 mr-3" /> Sign Out from NearSpotty
                    </Button>
                </div>
            </div>
        </ProtectedRoute>
    );
}
