"use client";

import { useEffect, useState, useCallback } from "react";
import confetti from "canvas-confetti";

interface PioneerOverlayProps {
    show: boolean;
    onComplete?: () => void;
}

/**
 * Full-screen celebration overlay for Pioneer Bonus.
 * Shows confetti animation and "+2 Credits" message.
 * Auto-dismisses after 4 seconds or on click.
 */
export function PioneerOverlay({ show, onComplete }: PioneerOverlayProps) {
    const [visible, setVisible] = useState(false);

    const handleDismiss = useCallback(() => {
        setVisible(false);
        onComplete?.();
    }, [onComplete]);

    useEffect(() => {
        if (show) {
            setVisible(true);

            // Fire confetti burst
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF6B6B', '#4CAF50', '#2196F3']
            });

            // Second burst after 500ms for extra celebration
            const secondBurst = setTimeout(() => {
                confetti({
                    particleCount: 75,
                    spread: 60,
                    origin: { y: 0.5 }
                });
            }, 500);

            // Auto-hide after 4 seconds
            const autoHide = setTimeout(handleDismiss, 4000);

            return () => {
                clearTimeout(secondBurst);
                clearTimeout(autoHide);
            };
        }
    }, [show, handleDismiss]);

    if (!visible) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-300 cursor-pointer"
            onClick={handleDismiss}
            role="button"
            aria-label="Dismiss celebration overlay"
        >
            <div className="text-center text-white p-8 animate-in zoom-in-95 duration-500">
                <div className="text-8xl mb-6 animate-bounce">🎉</div>
                <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-amber-300 to-yellow-500 bg-clip-text text-transparent">
                    New Zone Discovered!
                </h2>
                <p className="text-xl text-amber-300 font-semibold mb-2">
                    +2 Credits Reward
                </p>
                <p className="text-sm text-gray-400">
                    You&apos;re the first to explore this area!
                </p>
                <p className="text-xs text-gray-500 mt-4">
                    Click anywhere to continue
                </p>
            </div>
        </div>
    );
}
