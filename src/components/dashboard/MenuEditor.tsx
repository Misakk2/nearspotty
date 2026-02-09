"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/components/auth-provider";
import toast from "react-hot-toast";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Badge } from "@/components/ui/badge";

interface MenuItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    weight?: string;
    imageUrl?: string;
    allergens?: string[];
    dietary?: string[];
    category: string;
}

const CATEGORIES = ["Starters", "Mains", "Desserts", "Drinks", "Specials"];
const ALLERGENS = ["Gluten", "Dairy", "Nuts", "Soy", "Eggs", "Fish", "Shellfish"];
const DIETARY = ["Vegetarian", "Vegan", "Gluten-Free", "Spicy", "Paleo", "Keto", "Lactose-Free", "Kosher", "Halal"];

export function MenuEditor({ placeId }: { placeId: string }) {
    const { user } = useAuth();
    const [items, setItems] = useState<MenuItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
    const [uploadingImage, setUploadingImage] = useState(false);

    // Form State
    const [formData, setFormData] = useState<Partial<MenuItem>>({
        category: "Mains",
        allergens: [],
        dietary: []
    });

    useEffect(() => {
        const fetchMenu = async () => {
            if (!placeId) return;

            try {
                // 1. Try to fetch from subcollection
                const menuRef = collection(db, "restaurants", placeId, "menu");
                const menuSnap = await getDocs(menuRef);

                if (!menuSnap.empty) {
                    // Subcollection has data, use it
                    const loadedItems = menuSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
                    setItems(loadedItems);
                } else {
                    // 2. Fallback: Check for legacy array in parent doc
                    const docRef = doc(db, "restaurants", placeId);
                    const snap = await getDoc(docRef);

                    if (snap.exists()) {
                        const data = snap.data();
                        const legacyItems = data.menu?.items || [];

                        if (legacyItems.length > 0) {
                            console.log("Found legacy menu items, migrating...");
                            // 3. Lazy Migration: Move to subcollection
                            const batch = writeBatch(db);

                            legacyItems.forEach((item: MenuItem) => {
                                const newDocRef = doc(menuRef, item.id || crypto.randomUUID());
                                batch.set(newDocRef, item);
                            });

                            // Optionally purge legacy array to avoid confusion? 
                            // Let's iterate: For now, we prefer keeping data safe. 
                            // We will just write to new location. 
                            // Future cleanup can remove 'menu.items'.

                            await batch.commit();
                            setItems(legacyItems);
                            toast.success("Menu optimized for new version");
                        } else {
                            setItems([]);
                        }
                    }
                }
            } catch (error) {
                console.error("Error fetching menu:", error);
                toast.error("Failed to load menu");
            } finally {
                setLoading(false);
            }
        };

        if (placeId) {
            fetchMenu();
        }
    }, [placeId]);

    const handleSave = async () => {
        if (!formData.name || !formData.price || !formData.category) {
            toast.error("Please fill in required fields (Name, Price, Category)");
            return;
        }

        try {
            const newItem: MenuItem = {
                id: editingItem?.id || crypto.randomUUID(),
                name: formData.name,
                description: formData.description || "",
                price: Number(formData.price),
                weight: formData.weight || "",
                imageUrl: formData.imageUrl || "",
                category: formData.category,
                allergens: formData.allergens || [],
                dietary: formData.dietary || []
            };

            // New Subcollection Logic
            const itemRef = doc(db, "restaurants", placeId, "menu", newItem.id);
            await setDoc(itemRef, newItem);

            if (editingItem) {
                setItems(items.map(i => i.id === editingItem.id ? newItem : i));
                toast.success("Item updated");
            } else {
                setItems([...items, newItem]);
                toast.success("Item added");
            }

            setIsDialogOpen(false);
            resetForm();
        } catch (error) {
            console.error("Error saving menu item:", error);
            toast.error("Failed to save item");
        }
    };

    const handleDelete = async (item: MenuItem) => {
        if (!confirm("Are you sure you want to delete this item?")) return;
        try {
            const itemRef = doc(db, "restaurants", placeId, "menu", item.id);
            await deleteDoc(itemRef);

            setItems(items.filter(i => i.id !== item.id));
            toast.success("Item deleted");
        } catch (error) {
            console.error("Error deleting item:", error);
            toast.error("Failed to delete item");
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!user) {
            toast.error("You must be logged in to upload images");
            return;
        }

        // 1. Validate File Size (Max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error("Image size must be less than 5MB");
            return;
        }

        // 2. Validate File Type
        if (!file.type.startsWith('image/')) {
            toast.error("File must be an image");
            return;
        }

        setUploadingImage(true);
        try {
            // 3. Sanitize Filename
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storageRef = ref(storage, `restaurants/${placeId}/menu/${Date.now()}_${sanitizedName}`);

            const metadata = {
                contentType: file.type,
            };

            const snapshot = await uploadBytes(storageRef, file, metadata);
            const url = await getDownloadURL(snapshot.ref);
            setFormData(prev => ({ ...prev, imageUrl: url }));
            toast.success("Image uploaded");
        } catch (error) {
            console.error("Upload failed", error);
            toast.error("Image upload failed");
        } finally {
            setUploadingImage(false);
        }
    };

    const resetForm = () => {
        setFormData({ category: "Mains", allergens: [], dietary: [] });
        setEditingItem(null);
    };

    const openEdit = (item: MenuItem) => {
        setEditingItem(item);
        setFormData(item);
        setIsDialogOpen(true);
    };

    const toggleSelection = (field: 'allergens' | 'dietary', value: string) => {
        setFormData(prev => {
            const current = prev[field] || [];
            if (current.includes(value)) {
                return { ...prev, [field]: current.filter(i => i !== value) };
            } else {
                return { ...prev, [field]: [...current, value] };
            }
        });
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

    // Group items by category
    const groupedItems = items.reduce((acc, item) => {
        if (!acc[item.category]) acc[item.category] = [];
        acc[item.category].push(item);
        return acc;
    }, {} as Record<string, MenuItem[]>);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-semibold tracking-tight">Menu Management</h2>
                    <p className="text-muted-foreground">Manage your dishes, drinks, and specials.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button><Plus className="h-4 w-4 mr-2" /> Add Item</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingItem ? 'Edit Item' : 'Add New Item'}</DialogTitle>
                            <DialogDescription>Add details about your dish.</DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Name *</Label>
                                    <Input value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Margherita Pizza" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Price (€) *</Label>
                                    <Input type="number" value={formData.price || ''} onChange={e => setFormData({ ...formData, price: Number(e.target.value) })} placeholder="12.50" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Textarea value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Tomato sauce, mozzarella, basil..." />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Category *</Label>
                                    <Select value={formData.category} onValueChange={(val: string) =>
                                        setFormData({ ...formData, category: val })
                                    }>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Weight/Portion (optional)</Label>
                                    <Input value={formData.weight || ''} onChange={e => setFormData({ ...formData, weight: e.target.value })} placeholder="350g / 0.3l" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Image</Label>
                                <div className="flex items-center gap-4">
                                    {formData.imageUrl && (
                                        <>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={formData.imageUrl} alt="Preview" className="h-16 w-16 object-cover rounded-md border" />
                                        </>
                                    )}
                                    <div className="flex-1">
                                        <Input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} />
                                        {uploadingImage && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Allergens</Label>
                                <div className="flex flex-wrap gap-2">
                                    {ALLERGENS.map(allergen => (
                                        <Badge
                                            key={allergen}
                                            variant={formData.allergens?.includes(allergen) ? "default" : "outline"}
                                            className="cursor-pointer select-none"
                                            onClick={() => toggleSelection('allergens', allergen)}
                                        >
                                            {allergen}
                                        </Badge>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Dietary</Label>
                                <div className="flex flex-wrap gap-2">
                                    {DIETARY.map(diet => (
                                        <Badge
                                            key={diet}
                                            variant={formData.dietary?.includes(diet) ? "secondary" : "outline"}
                                            className="cursor-pointer select-none"
                                            onClick={() => toggleSelection('dietary', diet)}
                                        >
                                            {diet}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSave} disabled={loading}>{editingItem ? 'Save Changes' : 'Add Item'}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {items.length === 0 ? (
                <Card className="border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                        <p>No items found.</p>
                        <p className="text-sm">Start by adding items to your menu.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-8">
                    {CATEGORIES.map(category => {
                        const catItems = groupedItems[category];
                        if (!catItems) return null;
                        return (
                            <div key={category} className="space-y-4">
                                <h3 className="text-xl font-medium border-b pb-2">{category}</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {catItems.map(item => (
                                        <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow">
                                            <div className="flex h-full">
                                                {item.imageUrl && (
                                                    <div className="w-32 h-auto bg-muted">
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                                    </div>
                                                )}
                                                <div className="flex-1 p-4 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start">
                                                            <h4 className="font-semibold">{item.name}</h4>
                                                            <span className="font-bold text-primary">€{item.price.toFixed(2)}</span>
                                                        </div>
                                                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{item.description}</p>
                                                        <div className="flex flex-wrap gap-1 mt-2">
                                                            {item.weight && <Badge variant="outline" className="text-xs">{item.weight}</Badge>}
                                                            {item.dietary?.map(d => <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>)}
                                                            {item.allergens?.map(a => <Badge key={a} variant="outline" className="text-xs border-destructive/50 text-destructive">{a}</Badge>)}
                                                        </div>
                                                    </div>
                                                    <div className="flex justify-end gap-2 mt-4">
                                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(item)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    );
}
