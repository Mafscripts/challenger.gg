// Free 8s starts after a one-minute reshuffle window. Money 8s keeps five.
export const eightsReshuffleWindowMs = (matchType) => (matchType === "8s" ? 1 : 5) * 60 * 1000;
