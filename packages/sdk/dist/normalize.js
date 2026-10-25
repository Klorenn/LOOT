/** Trim, lowercase, strip accents — used before hashing answers. */
export function normalizeAnswer(answer) {
    return answer
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/\s+/g, "");
}
