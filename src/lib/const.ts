
export const URL = "http://localhost:3000"

export const MAX_SAFE_EDIT_BYTES = 1 * 1024 * 1024; // 1 MB
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024 * 1024; // 10 GB

export const EXPIRY_OPTIONS: Record<string, number> = {
    never: -1,
    '5 mins': 5 * 60,
    '10 mins': 10 * 60,
    '30 mins': 30 * 60,
    '1 hour': 60 * 60,
    '1 day': 24 * 60 * 60,
    '1 week': 7 * 24 * 60 * 60,
    '1 month': 30 * 24 * 60 * 60,
    '1 year': 365 * 24 * 60 * 60,
};
