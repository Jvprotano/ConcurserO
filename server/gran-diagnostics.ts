function errorCodes(error: unknown) {
  const pending = [error];
  const seen = new Set<unknown>();
  const codes = new Set<string>();
  while (pending.length && seen.size < 10) {
    const current = pending.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if ('code' in current && typeof current.code === 'string' &&
        /^(?:E[A-Z]|UND_ERR_|CERT_|DEPTH_|SELF_SIGNED_|UNABLE_)[A-Z0-9_]{1,60}$/.test(current.code)) {
      codes.add(current.code);
    }
    if ('cause' in current) pending.push(current.cause);
    if (current instanceof AggregateError) pending.push(...current.errors.slice(0, 8));
  }
  return [...codes];
}

export function granTransportError(error: unknown) {
  const codes = errorCodes(error);
  let detail = 'Falha de transporte';
  if (codes.some(code => code === 'ENOTFOUND' || code === 'EAI_AGAIN')) {
    detail = 'Falha ao resolver o endereço do Gran no DNS';
  } else if (codes.some(code => /^(?:ERR_(?:TLS|SSL)_|CERT_|DEPTH_|SELF_SIGNED_|UNABLE_)/.test(code))) {
    detail = 'Falha na conexão TLS ou na validação do certificado';
  } else if ((error instanceof Error && error.name === 'TimeoutError') || codes.some(code => /TIMEOUT|ETIMEDOUT/.test(code))) {
    detail = 'Tempo limite excedido';
  } else if (codes.includes('ECONNREFUSED')) {
    detail = 'A conexão foi recusada';
  } else if (codes.includes('ECONNRESET') || codes.includes('UND_ERR_SOCKET')) {
    detail = 'A conexão foi encerrada durante a solicitação';
  } else if (error instanceof Error && error.name === 'AbortError') {
    detail = 'A solicitação foi abortada';
  }
  return codes.length ? detail + ' (' + codes.join(', ') + ')' : detail;
}

export function granStorageError(error: unknown) {
  const sqlite = {
    5: 'banco ocupado', 6: 'banco bloqueado', 8: 'banco somente para leitura', 10: 'falha de leitura ou gravação',
    13: 'armazenamento cheio', 14: 'banco não pôde ser aberto', 19: 'restrição de integridade',
  };
  const number = error && typeof error === 'object' && 'errcode' in error ? error.errcode : undefined;
  const codes = errorCodes(error);
  if (typeof number === 'number' && Number.isSafeInteger(number) && number > 0) {
    const description = sqlite[(number & 255) as keyof typeof sqlite];
    codes.push('SQLite ' + number + (description ? ' · ' + description : ''));
  }
  return codes.length ? ' (' + codes.join(', ') + ')' : '';
}

export function granRetryAfter(value: string | null) {
  if (!value) return undefined;
  if (/^\d{1,8}$/.test(value)) return value + ' s';
  if (!/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isFinite(date) ? new Date(date).toISOString() : undefined;
}
