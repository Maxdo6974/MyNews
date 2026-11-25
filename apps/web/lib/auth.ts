/** Protection par mot de passe de l'environnement de test (variable STAGING_PASSWORD). */
export const AUTH_COOKIE = "fi_auth";

export async function tokenFor(password: string): Promise<string> {
  const data = new TextEncoder().encode(`flash-info:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
