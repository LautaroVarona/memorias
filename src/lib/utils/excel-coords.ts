/** Convierte índice de columna 0-based a letra Excel (0 → A, 25 → Z, 26 → AA). */
export function columnIndexToLetter(index: number): string {
  if (index < 0) return "";
  let n = index + 1;
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
