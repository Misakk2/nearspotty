"use client";
import { auth, db } from "@/lib/firebase";
import { signOut, updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import toast, { Toaster } from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
import ProtectedRoute from "@/components/protected-route";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calendar, CreditCard, LogOut } from "lucide-react";

export default function ProfilePage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!user) return;
        setLoading(true);
        const formData = new FormData(e.currentTarget);
        const name = formData.get("name") as string;

        try {
            await updateProfile(user, { displayName: name });
            await updateDoc(doc(db, "users", user.uid), { displayName: name });
            toast.success("Profile updated!");
        } catch (error: unknown) {
            console.error(error);
            toast.error("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            router.push("/");
            toast.success("Logged out successfully");
        } catch {
            toast.error("Failed to logout");
        }
    };

    return (
        <ProtectedRoute>
            <div className="container mx-auto py-10 px-4 min-h-screen">
                <Toaster position="top-center" />
                <Card className="max-w-md mx-auto">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center">Your Profile</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-24 w-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl font-bold uppercase text-gray-500 overflow-hidden border-4 border-white shadow-lg">
                                {user?.photoURL ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={user.photoURL} alt={user.displayName || "User"} className="h-full w-full object-cover" />
                                ) : (
                                    user?.displayName?.charAt(0) || user?.email?.charAt(0) || "U"
                                )}
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-xl">{user?.displayName || "User"}</p>
                                <p className="text-sm text-gray-500">{user?.email}</p>
                            </div>
                        </div>

                        <form onSubmit={handleUpdate} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Display Name</Label>
                                <Input id="name" name="name" defaultValue={user?.displayName || ""} placeholder="Your Name" />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>Update Profile</Button>
                        </form>

                        <div className="space-y-3 border-t pt-6">
                            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Account</h4>
                            <Link href="/reservations" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors">
                                <Calendar className="h-5 w-5 text-primary" />
                                <span className="flex-1 font-medium">My Reservations</span>
                            </Link>
                            <Link href="/subscription" className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 transition-colors">
                                <CreditCard className="h-5 w-5 text-primary" />
                                <span className="flex-1 font-medium">Subscription Plan</span>
                            </Link>
                        </div>

                        <div className="border-t pt-6">
                            <Button variant="outline" onClick={handleLogout} className="w-full hover:bg-destructive hover:text-white transition-colors">
                                <LogOut className="h-4 w-4 mr-2" /> Sign Out
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </ProtectedRoute>
    );
}
