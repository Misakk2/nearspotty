declare module 'fslightbox-react' {
    import { FC } from 'react';

    export interface FsLightboxProps {
        toggler: boolean;
        sources?: string[];
        type?: string;
        slide?: number;
        // Add other props as needed
    }

    const FsLightbox: FC<FsLightboxProps>;
    export default FsLightbox;
}
