
import { NextResponse } from "next/server";
import { getAdminStorage } from "@/lib/firebase-admin";

export async function GET() {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "place-photos-cache";
    const fileName = "debug-test.txt";

    try {
        const bucket = getAdminStorage().bucket(bucketName);

        // 1. Check Bucket Existence
        const [exists] = await bucket.exists();
        if (!exists) {
            // Try creating if in emulator mode, otherwise fail
            if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
                await bucket.create();
                await bucket.makePublic();
            } else {
                return NextResponse.json({
                    status: "error",
                    code: "BUCKET_NOT_FOUND",
                    message: `Bucket ${bucketName} does not exist.`
                }, { status: 404 });
            }
        }

        // 2. Write Test
        const file = bucket.file(fileName);
        await file.save("This is a write test.", {
            metadata: {
                contentType: "text/plain",
                cacheControl: "no-cache"
            },
            public: true,
            validation: false
        });

        // 3. Read Metadata to verify public access link
        const [metadata] = await file.getMetadata();

        // Construct public URL
        let publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
        if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
            publicUrl = `http://127.0.0.1:9199/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/${bucketName}/${fileName}`;
        }

        return NextResponse.json({
            status: "ok",
            message: "Write successful",
            bucket: bucketName,
            file: fileName,
            publicUrl: publicUrl,
            metadata: {
                timeCreated: metadata.timeCreated,
                updated: metadata.updated
            }
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        console.error("STORAGE WRITES FAILED:", error);
        return NextResponse.json({
            status: "error",
            message: error.message,
            code: error.code || "UNKNOWN_STORAGE_ERROR",
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 });
    }
}
