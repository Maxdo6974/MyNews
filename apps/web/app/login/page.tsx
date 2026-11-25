export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  return (
    <div className="max-w-sm mx-auto mt-10">
      <h1 className="text-2xl font-semibold tracking-tight">Environnement de test</h1>
      <p className="text-sm text-ink-soft mt-2">Saisissez le mot de passe qui vous a été communiqué.</p>
      <form action="/api/login" method="post" className="mt-6 space-y-3">
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="block text-sm font-medium" htmlFor="password">Mot de passe</label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          className="w-full rounded-lg border border-line bg-card px-3 py-2.5"
        />
        {error && <p className="text-sm text-accent">Mot de passe incorrect.</p>}
        <button className="w-full rounded-lg bg-ink text-paper py-2.5 font-medium hover:opacity-90">Entrer</button>
      </form>
    </div>
  );
}
