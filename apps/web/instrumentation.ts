/** Exécuté une fois au démarrage du serveur : lance la récupération planifiée des flux. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startScheduler } = await import("@flash-info/core");
  try {
    await startScheduler();
  } catch (e) {
    console.error("[flash-info] Échec du démarrage de la récupération :", e);
  }
}
