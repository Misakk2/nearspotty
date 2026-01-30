#!/usr/bin/env npx ts-node
/**
 * Admin Subscription Toggle Script
 * 
 * Use this script to manually set a user's subscription tier for testing.
 * 
 * Usage:
 *   npx ts-node scripts/admin-subscription.ts <uid> <tier>
 * 
 * Examples:
 *   npx ts-node scripts/admin-subscription.ts abc123 premium
 *   npx ts-node scripts/admin-subscription.ts abc123 free
 */

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// Manual .env.local loading (avoids dotenv dependency)
const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && !key.startsWith('#')) {
            const value = valueParts.join('=').trim();
            if (value && !process.env[key.trim()]) {
                process.env[key.trim()] = value.replace(/^["']|["']$/g, '');
            }
        }
    });
}

// Initialize Firebase Admin
if (!admin.apps.length) {
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!privateKey || !process.env.FIREBASE_ADMIN_PROJECT_ID || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL) {
        console.error('❌ Missing Firebase Admin credentials in .env.local');
        console.error('Required: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY');
        process.exit(1);
    }

    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: privateKey,
        }),
    });
}

const db = admin.firestore();

async function setSubscriptionTier(uid: string, tier: 'free' | 'premium') {
    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            console.error(`❌ User ${uid} not found in Firestore`);
            process.exit(1);
        }

        await userRef.update({
            subscriptionTier: tier,
            subscriptionStatus: tier === 'premium' ? 'active' : 'canceled',
            updatedAt: new Date().toISOString(),
        });

        console.log(`✅ User ${uid} subscription tier set to: ${tier}`);

        // Reset AI usage if downgrading to free (optional)
        if (tier === 'free') {
            console.log('   (AI usage count preserved. To reset, run with --reset-usage flag)');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error updating subscription:', error);
        process.exit(1);
    }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log('Usage: npx ts-node scripts/admin-subscription.ts <uid> <tier>');
    console.log('');
    console.log('Arguments:');
    console.log('  uid   - Firebase user UID');
    console.log('  tier  - "free" or "premium"');
    console.log('');
    console.log('Examples:');
    console.log('  npx ts-node scripts/admin-subscription.ts abc123xyz premium');
    console.log('  npx ts-node scripts/admin-subscription.ts abc123xyz free');
    process.exit(1);
}

const [uid, tierArg] = args;

if (tierArg !== 'free' && tierArg !== 'premium') {
    console.error('❌ Invalid tier. Must be "free" or "premium"');
    process.exit(1);
}

setSubscriptionTier(uid, tierArg as 'free' | 'premium');
