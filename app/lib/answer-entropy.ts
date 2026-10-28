/**
 * Coarse offline-guessing estimate for a typed answer. It is a heuristic, not a measurement: it exists to stop
 * obviously weak answers, not to certify strong ones. Input is the NORMALIZED key (lowercase, no accents,
 * no spaces; see normalizeAnswer / typedAnswerKey).
 *
 * Rules, in order:
 *  1. empty                                  -> 0 bits
 *  2. very common word / password            -> 8 bits  (an attacker tries these first)
 *  3. keyboard or alphabet run (abcdef, qwerty, 123456) of 4+ chars -> 10 bits
 *  4. digits only                            -> log2(10) per digit
 *     letters only                           -> 2.3 bits per letter (natural language, not random letters)
 *     anything else                          -> 4 bits per character
 *  5. low variety (distinct characters < 30% of the length, e.g. "aaaaaaaa", "abababab") is capped at
 *     4 bits per distinct character + 0.5 per repeat.
 *
 * Rule 4 matches the estimate lib/quiz.ts already used for quiz answers (same numbers, same 48-bit floor).
 * Reference points: 48 bits = 2.8e14 guesses. At ~1e8 guesses/s on one GPU (SHA-256 + Poseidon, public salt)
 * that is about a month; 64 bits is out of reach for a single attacker.
 */
const COMMON = new Set(
  [
    "yes", "no", "true", "false", "ok", "okay", "maybe", "none", "null", "nothing", "something", "answer", "answers",
    "password", "passw0rd", "password1", "password123", "admin", "root", "secret", "test", "testing", "hello", "world",
    "helloworld", "love", "iloveyou", "welcome", "letmein", "qwerty", "abc123", "monkey", "dragon", "master", "login",
    "red", "blue", "green", "yellow", "black", "white", "orange", "purple", "pink", "gold", "silver",
    "cat", "dog", "fish", "bird", "horse", "lion", "tiger", "bear",
    "water", "fire", "earth", "air", "sun", "moon", "star", "stars", "sky", "sea", "tree", "house", "home", "car",
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "paris", "london", "madrid", "lisbon", "lisboa", "rome", "berlin", "tokyo", "newyork", "barcelona", "buenosaires",
    "bitcoin", "btc", "ethereum", "eth", "stellar", "xlm", "lumens", "usdc", "usdt", "soroban", "crypto", "blockchain", "loot",
    "john", "mary", "david", "maria", "juan", "jose", "anna", "peter", "michael", "alex",
  ].map((w) => w.toLowerCase()),
);

const RUNS = ["abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "0123456789"];
const isRun = (k: string) => k.length >= 4 && RUNS.some((r) => r.includes(k) || [...r].reverse().join("").includes(k));

export function estimateAnswerBits(key: string): number {
  if (!key) return 0;
  if (COMMON.has(key)) return 8;
  if (isRun(key)) return 10;
  const len = [...key].length;
  const digits = /^\d+$/.test(key);
  const perChar = digits ? Math.log2(10) : /^\p{L}+$/u.test(key) ? 2.3 : 4;
  let bits = len * perChar;
  const distinct = new Set(key).size;
  if (len >= 4 && distinct < len * 0.3) bits = Math.min(bits, distinct * 4 + (len - distinct) * 0.5);
  return bits;
}
