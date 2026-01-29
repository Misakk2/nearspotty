import Stripe from 'stripe';
import fs from 'fs';
import path from 'path';

// Simple .env.local parser since we can't rely on dotenv being installed/configured for standalone scripts
function loadEnv() {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
            const envConfig = fs.readFileSync(envPath, 'utf-8');
            envConfig.split('\n').forEach(line => {
                const match = line.match(/^([^=]+)=(.*)$/);
                if (match) {
                    const key = match[1].trim();
                    const value = match[2].trim().replace(/^["']|["']$/g, ''); // start/end quotes
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            });
        }
    } catch (e) {
        console.error('Error loading .env.local', e);
    }
}

loadEnv();

const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey) {
    console.error('ERROR: STRIPE_SECRET_KEY not found in environment or .env.local');
    process.exit(1);
}

const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-01-27.acacia' as any, // Using the version seen in the codebase
});

const productsToCreate = [
    {
        name: 'NearSpotty Premium (Diner)',
        key: 'diner_premium',
        amount: 999, // 9.99 EUR
        currency: 'eur',
        interval: 'month',
        metadata: { role: 'diner', plan: 'premium' }
    },
    {
        name: 'NearSpotty Business Basic',
        key: 'business_basic',
        amount: 2900, // 29.00 EUR
        currency: 'eur',
        interval: 'month',
        metadata: { role: 'business', plan: 'basic' }
    },
    {
        name: 'NearSpotty Business Pro',
        key: 'business_pro',
        amount: 7900, // 79.00 EUR
        currency: 'eur',
        interval: 'month',
        metadata: { role: 'business', plan: 'pro' }
    },
    {
        name: 'NearSpotty Business Enterprise',
        key: 'business_enterprise',
        amount: 19900, // 199.00 EUR
        currency: 'eur',
        interval: 'month',
        metadata: { role: 'business', plan: 'enterprise' }
    }
];

async function restoreProducts() {
    console.log('Starting Stripe Product Restoration...');
    const results: Record<string, string> = {};

    for (const item of productsToCreate) {
        try {
            console.log(`Creating product: ${item.name}...`);
            const product = await stripe.products.create({
                name: item.name,
                metadata: item.metadata,
                default_price_data: {
                    currency: item.currency,
                    unit_amount: item.amount,
                    recurring: {
                        interval: item.interval as Stripe.Price.Recurring.Interval,
                    }
                }
            });

            const priceId = typeof product.default_price === 'string'
                ? product.default_price
                : product.default_price?.id;

            if (!priceId) {
                throw new Error(`Failed to get price ID for product ${product.id}`);
            }

            console.log(`✅ Created. Product ID: ${product.id}, Price ID: ${priceId}`);
            results[item.key] = priceId;

        } catch (error) {
            console.error(`❌ Failed to create ${item.name}:`, error);
        }
    }

    console.log('\n--- NEW PRICE IDs ---');
    console.log(JSON.stringify(results, null, 2));
    console.log('---------------------');
}

restoreProducts();
