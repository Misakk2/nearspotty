"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import sk from "@/i18n/sk.json";
import en from "@/i18n/en.json";

type Locale = "sk" | "en";
const translations = { sk, en };

interface I18nContextType {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: string) => unknown;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocale] = useState<Locale>("sk"); // Default to SK

    // Load from localStorage if available
    useEffect(() => {
        const savedLocale = localStorage.getItem("locale") as Locale;
        if (savedLocale && (savedLocale === "sk" || savedLocale === "en")) {
            setLocale(savedLocale);
        }
    }, []);

    const handleSetLocale = (newLocale: Locale) => {
        setLocale(newLocale);
        localStorage.setItem("locale", newLocale);
        // Set cookie for server-side access
        document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
        // Refresh to apply changes to server components
        window.location.reload();
    };

    const t = (key: string): unknown => {
        const keys = key.split(".");
        let obj: unknown = translations[locale];
        for (const k of keys) {
            if (obj && typeof obj === 'object' && (obj as Record<string, unknown>)[k] !== undefined) {
                obj = (obj as Record<string, unknown>)[k];
            } else {
                console.warn(`Translation key not found: ${key} for locale: ${locale}`);
                return key;
            }
        }
        return obj;
    };

    return (
        <I18nContext.Provider value={{ locale, setLocale: handleSetLocale, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useI18n() {
    const context = useContext(I18nContext);
    if (context === undefined) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return context;
}
