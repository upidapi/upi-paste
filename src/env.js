import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here.
     */
    server: {
        PORT: z.coerce.number().default(3000),
        URL: z.string().url().optional(),
        DATA_DIR: z.string(),
        TOKEN_SECRET: z.string(),
        // Use z.coerce.number() because process.env variables are strings
        MAX_UPLOAD_BYTES: z.coerce.number().optional(),
        NODE_ENV: z.enum(['development', 'test', 'production']),
    },

    /**
     * Client-side variables (prefixed with NEXT_PUBLIC_).
     */
    client: {
        // Give it a default or make it optional so builds don't fail without it
        NEXT_PUBLIC_URL: z.string().url().optional(),
    },

    /**
     * Destructure manually here (required for client-side and edge runtimes).
     */
    runtimeEnv: {
        PORT: process.env.PORT,
        URL: process.env.URL,
        DATA_DIR: process.env.DATA_DIR,
        TOKEN_SECRET: process.env.TOKEN_SECRET,
        MAX_UPLOAD_BYTES: process.env.MAX_UPLOAD_BYTES,
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_URL: process.env.NEXT_PUBLIC_URL,
    },

    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,

    /**
     * Makes it so that empty strings are treated as undefined.
     */
    emptyStringAsUndefined: true,
});
