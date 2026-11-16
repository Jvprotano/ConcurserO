export async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': body instanceof File ? 'application/pdf' : 'application/json' },
      body: body instanceof File ? body : JSON.stringify(body),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Não foi possível concluir a operação.');
  return result as T;
}

export function pdfUrl(id: string, page: number) { return '/api/imports/' + id + '/pdf#page=' + page; }
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date.length === 10 ? date + 'T12:00:00' : date));
}
export function message(error: unknown) { return error instanceof Error ? error.message : 'Ocorreu uma falha.'; }
