import sk from "@/i18n/sk.json";
import en from "@/i18n/en.json";
import { cookies } from "next/headers";

const translations = { sk, en };

export async function getTranslation() {
    const cookieStore = await cookies();
    const locale = (cookieStore.get("locale")?.value || "en") as "sk" | "en";

    const t = (key: string): unknown => {
        const keys = key.split(".");
        let obj: unknown = translations[locale];
        for (const k of keys) {
            if (obj && typeof obj === 'object' && (obj as Record<string, unknown>)[k] !== undefined) {
                obj = (obj as Record<string, unknown>)[k];
            } else {
                return key;
            }
        }
        return obj;
    };

    return { t, locale };
}
