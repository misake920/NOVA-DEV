export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("Não foi possível conectar ao serviço. Tente novamente.");
  }
  if (!response.ok)
    throw new Error(
      value.error?.message ||
        value.error ||
        value.message ||
        "Não foi possível concluir esta ação.",
    );
  return value as T;
}
