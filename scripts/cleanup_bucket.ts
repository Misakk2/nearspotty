import { Storage } from "@google-cloud/storage";

// Configuration
const BUCKET_NAME = "place-photos-cache";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "nearspotty-13f22";
// Note: This script runs in Node, so we grab emulators from env or default
const EMULATOR_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199";

const isEmulator = !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;

const storage = new Storage({
    projectId: PROJECT_ID,
    apiEndpoint: isEmulator ? `http://${EMULATOR_HOST}` : undefined,
});

const bucket = storage.bucket(BUCKET_NAME);

async function runCleanup() {
    console.log(`[Cleanup] 🧹 Auditing bucket: ${BUCKET_NAME}`);
    if (isEmulator) console.log(`[Cleanup] ⚠️ Running against EMULATOR at ${EMULATOR_HOST}`);

    try {
        const [files] = await bucket.getFiles();
        console.log(`[Cleanup] Found ${files.length} total files.`);

        const contentMap = new Map<string, string[]>(); // md5 -> [filenames]
        let duplicateCount = 0;
        let reclaimableBytes = 0;

        for (const file of files) {
            // GCS metadata usually has 'md5Hash' (base64 encoded)
            // If missing (emulator sometimes), we might need another strategy or just skip.
            const md5 = file.metadata.md5Hash || `size-${file.metadata.size}`;

            if (!contentMap.has(md5)) {
                contentMap.set(md5, []);
            }
            contentMap.get(md5)!.push(file.name);
        }

        console.log(`\n--- Analysis ---`);

        for (const [md5, filenames] of contentMap.entries()) {
            if (filenames.length > 1) {
                // We have duplicates!
                duplicateCount += filenames.length - 1;
                const size = parseInt(String(files.find(f => f.name === filenames[0])?.metadata.size || "0"), 10);
                reclaimableBytes += size * (filenames.length - 1);

                console.log(`\nDuplicate Group (${md5}):`);
                filenames.forEach(f => console.log(` - ${f}`));

                // Heuristic: Keep the one matching "photos/" (new schema), delete others?
                // Or keep the oldest?
                // For now, just listing them.
            }
        }

        console.log(`\n--- Summary ---`);
        console.log(`Unique Files: ${contentMap.size}`);
        console.log(`Duplicate Files: ${duplicateCount}`);
        console.log(`Reclaimable Space: ${(reclaimableBytes / 1024 / 1024).toFixed(2)} MB`);

    } catch (err) {
        console.error("[Cleanup] Error:", err);
    }
}

runCleanup().catch(console.error);
