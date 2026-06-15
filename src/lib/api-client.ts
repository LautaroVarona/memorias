const DEFAULT_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch con reintentos y mensajes de error claros.
 */
export async function apiFetch<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    try {
      const res = await fetch(input, init);

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Error del servidor (${res.status})`);
      }

      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err;
      if (attempt < DEFAULT_RETRIES && isNetworkError(err)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  if (lastError instanceof Error && !isNetworkError(lastError)) {
    throw lastError;
  }

  throw new Error(
    `No se pudo conectar con el servidor. Comprueba que npm run dev está activo en http://localhost:3000`
  );
}
