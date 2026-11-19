const QUOTA_ERROR_MESSAGE =
  'Cuota de almacenamiento llena. No se pudieron guardar los cambios; libera espacio o exporta un respaldo.';
const IDB_UNAVAILABLE_MESSAGE = 'IndexedDB no está disponible en este entorno.';

const DOM_EXCEPTION_MESSAGES: Readonly<Record<string, string>> = {
  InvalidStateError:
    'La base de datos local no está disponible en este momento.',
  TransactionInactiveError:
    'La transacción de almacenamiento se cerró antes de completarse.',
  AbortError: 'Se interrumpió la operación de almacenamiento local.',
  ReadOnlyError:
    'El almacenamiento local está en modo de solo lectura y no permite guardar.',
  VersionError:
    'La versión de la base de datos local no es compatible con esta sesión.',
  UnknownError: 'Error interno al acceder al almacenamiento local.',
};

/**
 * Convierte errores de almacenamiento del navegador (`QuotaExceededError`, IndexedDB no disponible
 * u otros `DOMException`) en mensajes claros en español sin perder mensajes propios ya localizados.
 */
export function formatStorageErrorMessage(
  err: unknown,
  fallbackMessage: string,
): string {
  if (typeof err !== 'object' || err === null) {
    return typeof err === 'string' && err.trim().length > 0
      ? err
      : fallbackMessage;
  }

  const record = err as { name?: unknown; message?: unknown; code?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  const message = typeof record.message === 'string' ? record.message : '';
  const code = typeof record.code === 'number' ? record.code : undefined;

  if (
    name === 'QuotaExceededError' ||
    name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    code === 22 ||
    code === 1014 ||
    /quota/i.test(message)
  ) {
    return QUOTA_ERROR_MESSAGE;
  }

  if (
    name === 'SecurityError' ||
    (/indexeddb/i.test(message) &&
      /(not available|unavailable|disabled|denied|no está disponible)/i.test(
        message,
      ))
  ) {
    return IDB_UNAVAILABLE_MESSAGE;
  }

  const mappedDomMessage = DOM_EXCEPTION_MESSAGES[name];
  if (mappedDomMessage) {
    return mappedDomMessage;
  }

  if (message.trim().length > 0) {
    return message;
  }

  return fallbackMessage;
}
