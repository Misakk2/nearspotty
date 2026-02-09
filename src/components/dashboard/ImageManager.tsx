"use client";

import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { storage, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Loader2, X, Image as ImageIcon, Plus } from "lucide-react";
import toast from "react-hot-toast";

interface ImageManagerProps {
    placeId: string;
    currentPhotos?: { proxyPhotoUrl?: string; url?: string }[];
    customPhotos?: { url: string; category?: string; storagePath?: string }[];
    onUpdate?: () => void;
}

export function ImageManager({ placeId, currentPhotos = [], customPhotos = [], onUpdate }: ImageManagerProps) {
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validation
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image must be smaller than 5MB");
            return;
        }

        if (!file.type.startsWith("image/")) {
            toast.error("File must be an image");
            return;
        }

        setUploading(true);
        const imageId = `${Date.now()}-${file.name}`;
        const storageRef = ref(storage, `restaurants/${placeId}/owner-images/${imageId}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on(
            "state_changed",
            (snapshot) => {
                const p = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                setProgress(p);
            },
            (error) => {
                console.error("Upload error:", error);
                toast.error("Upload failed");
                setUploading(false);
            },
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                try {
                    const docRef = doc(db, "restaurants", placeId);
                    await updateDoc(docRef, {
                        customPhotos: arrayUnion({
                            url: downloadURL,
                            category: "owner",
                            storagePath: `restaurants/${placeId}/owner-images/${imageId}` // Store path for deletion
                        })
                    });
                    toast.success("Image uploaded!");
                    if (onUpdate) onUpdate();
                } catch (err) {
                    console.error("Firestore update error:", err);
                    toast.error("Failed to save image reference");
                } finally {
                    setUploading(false);
                    setProgress(0);
                }
            }
        );
    };

    const handleDelete = async (photo: { url: string; category?: string; storagePath?: string }) => {
        if (!confirm("Are you sure you want to delete this image?")) return;

        try {
            // 1. Delete from Storage if we have the path
            if (photo.storagePath) {
                const storageRef = ref(storage, photo.storagePath);
                await deleteObject(storageRef);
            }

            // 2. Remove from Firestore
            const docRef = doc(db, "restaurants", placeId);
            await updateDoc(docRef, {
                customPhotos: arrayRemove(photo)
            });
            toast.success("Image deleted");
            if (onUpdate) onUpdate();
        } catch (error) {
            console.error("Delete error:", error);
            toast.error("Failed to delete image");
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {/* Upload Button */}
                <label className="cursor-pointer group flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-200 rounded-2xl hover:border-primary/50 hover:bg-primary/5 transition-all">
                    <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} accept="image/*" />
                    {uploading ? (
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            <span className="text-[10px] font-bold text-primary">{Math.round(progress)}%</span>
                        </div>
                    ) : (
                        <>
                            <div className="h-10 w-10 bg-gray-50 rounded-full flex items-center justify-center group-hover:bg-white group-hover:scale-110 transition-all">
                                <Plus className="h-5 w-5 text-gray-400 group-hover:text-primary" />
                            </div>
                            <span className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-400 group-hover:text-primary">Add Photo</span>
                        </>
                    )}
                </label>

                {/* Custom Photos (Owner Uploaded) */}
                {customPhotos.map((photo, i) => (
                    <div key={i} className="relative group aspect-square rounded-2xl overflow-hidden border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.url} alt={`Restaurant photo ${i}`} className="h-full w-full object-cover transition-transform group-hover:scale-110" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={() => handleDelete(photo)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-[8px] font-bold uppercase tracking-widest rounded-full backdrop-blur-md">
                            Owner
                        </div>
                    </div>
                ))}

                {/* Legacy/Google Photos (Read-only) */}
                {currentPhotos.slice(0, 10).map((photo, i) => (
                    <div key={`google-${i}`} className="relative group aspect-square rounded-2xl overflow-hidden border bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={photo.proxyPhotoUrl || photo.url}
                            alt={`Google photo ${i}`}
                            className="h-full w-full object-cover grayscale group-hover:grayscale-0 transition-all opacity-60 group-hover:opacity-100"
                        />
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-white/80 text-gray-500 text-[8px] font-bold uppercase tracking-widest rounded-full backdrop-blur-md">
                            Google
                        </div>
                    </div>
                ))}
            </div>

            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ImageIcon className="h-3 w-3" />
                Google photos are read-only. Upload your own to showcase your restaurant.
            </p>
        </div>
    );
}
