"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, Users, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/components/auth-provider";
import toast from "react-hot-toast";

interface ReservationModalProps {
    placeId?: string;
    placeName: string;
    trigger?: React.ReactNode;
    isOpen?: boolean;
    onClose?: () => void;
}

export function ReservationModal({ placeId, placeName, trigger, isOpen, onClose }: ReservationModalProps) {
    const { user } = useAuth();
    const [internalOpen, setInternalOpen] = useState(false);

    // Controlled vs Uncontrolled
    const isControlled = isOpen !== undefined;
    const open = isControlled ? isOpen : internalOpen;
    const setOpen = (val: boolean) => {
        if (!isControlled) setInternalOpen(val);
        if (!val && onClose) onClose();
    };

    const [date, setDate] = useState<Date | undefined>(new Date());
    const [time, setTime] = useState("19:00");
    const [guests, setGuests] = useState(2);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Form fields
    const [name, setName] = useState(user?.displayName || "");
    const [phone, setPhone] = useState("");

    const handleBook = async () => {
        if (!date || !time || !name || !phone) {
            toast.error("Please fill in all fields");
            return;
        }

        setLoading(true);
        try {
            await addDoc(collection(db, "reservations"), {
                userId: user?.uid || "anonymous",
                placeId,
                placeName,
                customerName: name,
                customerEmail: user?.email || "",
                customerPhone: phone,
                date: date, // Firestore will convert Date
                time,
                guests,
                status: "pending", // Requires owner confirmation
                createdAt: serverTimestamp(),
            });

            setSuccess(true);
            toast.success("Reservation submitted!");
        } catch (error) {
            console.error(error);
            toast.error("Failed to make reservation");
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setSuccess(false);
        setOpen(false);
        // Reset form if needed, or keep values for next time
    };

    if (success) {
        return (
            <Dialog open={open} onOpenChange={reset}>
                {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
                <DialogContent className="sm:max-w-[425px]">
                    <div className="flex flex-col items-center justify-center p-6 space-y-4 text-center">
                        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <CheckCircle2 className="h-6 w-6 text-green-600" />
                        </div>
                        <DialogTitle className="text-xl">Reservation Submitted!</DialogTitle>
                        <DialogDescription>
                            Your reservation at <strong>{placeName}</strong> for {guests} people on {date && format(date, "PPP")} at {time} is pending confirmation from the restaurant.
                        </DialogDescription>
                        <Button onClick={reset} className="w-full">Done</Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Book a Table</DialogTitle>
                    <DialogDescription>
                        Reservation at <span className="font-semibold text-primary">{placeName}</span>
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    {/* Date Picker */}
                    <div className="flex flex-col space-y-2">
                        <Label>Date</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                        "justify-start text-left font-normal",
                                        !date && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    initialFocus
                                    disabled={(d: Date) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                />
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col space-y-2">
                            <Label>Time</Label>
                            <div className="relative">
                                <Clock className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="pl-9" />
                            </div>
                        </div>
                        <div className="flex flex-col space-y-2">
                            <Label>Guests</Label>
                            <div className="relative">
                                <Users className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input type="number" min={1} max={20} value={guests} onChange={(e) => setGuests(parseInt(e.target.value))} className="pl-9" />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your Name" />
                    </div>
                    <div className="space-y-2">
                        <Label>Phone</Label>
                        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 234 567 890" type="tel" />
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleBook} disabled={loading} className="w-full">
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirm Booking
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
