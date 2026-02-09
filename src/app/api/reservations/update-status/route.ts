import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
    try {
        const { reservationId, status, rejectionReason } = await request.json();

        if (!reservationId || !status) {
            return NextResponse.json({ error: "Missing reservationId or status" }, { status: 400 });
        }

        if (!['confirmed', 'rejected', 'finished', 'cancelled'].includes(status)) {
            return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }

        // 1. Authenticate user
        const token = request.headers.get("Authorization")?.split("Bearer ")[1];
        if (!token) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const decodedToken = await getAdminAuth().verifyIdToken(token);
        const uid = decodedToken.uid;

        // 2. Fetch Reservation to verify ownership
        const db = getAdminDb();
        const resRef = db.collection("reservations").doc(reservationId);
        const resSnap = await resRef.get();

        if (!resSnap.exists) {
            return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
        }

        const reservation = resSnap.data();

        // 3. Verify Owner owns the restaurant
        // Fetch restaurant to check ownerId
        const restaurantRef = db.collection("restaurants").doc(reservation?.placeId);
        const restaurantSnap = await restaurantRef.get();
        const restaurant = restaurantSnap.data();

        if (restaurant?.ownerId !== uid) {
            // Also allow admin? For now only owner.
            return NextResponse.json({ error: "You are not the owner of this restaurant" }, { status: 403 });
        }

        // 4. Update Status
        const updateData: Record<string, unknown> = {
            status,
            updatedAt: new Date().toISOString()
        };

        if (status === 'rejected' && rejectionReason) {
            updateData.rejectionReason = rejectionReason;
        }

        await resRef.update(updateData);

        return NextResponse.json({ success: true, status });

    } catch (error) {
        console.error("Reservation Update Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
