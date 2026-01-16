
// We use dynamic imports to handle the different versions of the loader package
// and to avoid the "Loader class is no longer available" error.

let loaderPromise: Promise<void> | null = null;

export const loadGoogleMaps = async (): Promise<void> => {
    if (loaderPromise) return loaderPromise;

    loaderPromise = (async () => {
        // Use dynamic import to access the package
        const loaderModule = await import("@googlemaps/js-api-loader");

        // Check for functional API (v2+)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (loaderModule as any).setOptions === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (loaderModule as any).setOptions({
                apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
                version: "weekly",
                libraries: ["places", "geometry"],
            });
        } else if (loaderModule.Loader) {
            // Fallback to class (v1)
            const loader = new loaderModule.Loader({
                apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY as string,
                version: "weekly",
                libraries: ["places", "geometry"],
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (loader as any).load();
        }
    })();

    return loaderPromise;
};

// Also export a helper to get libraries
export const getMapLibrary = async (name: string) => {
    await loadGoogleMaps();
    const loaderModule = await import("@googlemaps/js-api-loader");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (loaderModule as any).importLibrary === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (loaderModule as any).importLibrary(name);
    }

    // If v1, importLibrary might not be exported directly, but available on google.maps
    // which should be loaded by now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).google.maps.importLibrary(name);
};

// Use a singleton object to mimic the old loader API for less refactoring in components
const loaderShim = {
    importLibrary: async (name: string) => {
        return getMapLibrary(name);
    }
};

export default loaderShim;
