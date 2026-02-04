#!/bin/bash

# Operation Production Secrets: Migration Script
# Severity: CRITICAL
# Role: DevOps

echo "=================================================="
echo "   🕵️  NEARSPOTTY SECRETS MIGRATION UTILITY  🕵️"
echo "=================================================="
echo "This script will securely upload your environment variables"
echo "to Google Cloud Secret Manager for Firebase Functions."
echo ""
echo "It effectively 'Productionizes' your local .env file."
echo "=================================================="

# Check for Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Please install it with 'npm install -g firebase-tools'"
    exit 1
fi

# List of secrets to migrate
secrets=(
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "GEMINI_API_KEY"
    "NEXT_PUBLIC_GOOGLE_MAPS_KEY"
    "NEXT_PUBLIC_FIREBASE_API_KEY"
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
    "NEXT_PUBLIC_FIREBASE_APP_ID"
    "NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID"
)

echo "You will be prompted for each key. Paste the value (hidden) and press Enter."
echo "Press Enter to skip if you want to keep the existing value on the server."
echo ""

for key in "${secrets[@]}"; do
    echo "--------------------------------------------------"
    read -s -p "Enter value for $key: " value
    echo "" # Newline

    if [ -n "$value" ]; then
        echo "⚡ Uploading $key..."
        # Use echo to pipe value to standard input of firebase command to avoid history logging
        # We redirect stdout/stderr to avoid clutter, unless there's an error
        echo "$value" | firebase functions:secrets:set "$key"
        if [ $? -eq 0 ]; then
             echo "✅ $key set successfully."
        else
             echo "❌ Failed to set $key. Please try manual command: firebase functions:secrets:set $key"
        fi
    else
        echo "⏭️  Skipping $key (No input provided)."
    fi
done

echo "=================================================="
echo "   🎉  SECRETS MIGRATION COMPLETE  🎉"
echo "=================================================="
echo "Next Steps:"
echo "1. Run 'firebase deploy'"
echo "2. Your production environment should now have access to these keys."
