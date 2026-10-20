export const usernamePattern = /^[a-z0-9_-]{3,20}$/;
export const displayNamePattern = /^[A-Za-z0-9_-]{1,60}$/;
export const usernameHint = "Username must be 3-20 characters: letters, numbers, _ or - only.";
export const displayNameHint = "Display name must be 1-60 characters: letters, numbers, _ or - only.";
export const normalizeAccountName = value => typeof value === "string" ? value.trim() : "";
