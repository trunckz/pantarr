/** Comparable form of a name: lower case, no accents, words separated by single spaces. */
export const key = (s: string) => s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
