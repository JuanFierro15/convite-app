import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'event-photos';
const PAGE_LIMIT = 100;
const REMOVE_BATCH_SIZE = 100;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadEnvFileIfNeeded() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY) {
    return;
  }

  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile('.env');
    } catch {
      // Se ignora si .env no existe o falla la carga nativa
    }
    return;
  }

  if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed
          .slice(idx + 1)
          .trim()
          .replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

export function parseArgs(argv) {
  if (!Array.isArray(argv)) {
    return { ok: false, error: 'Argumentos inválidos.' };
  }

  let eventId = null;
  let borrar = false;
  let nombre = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--borrar') {
      if (borrar) {
        return { ok: false, error: '--borrar se indicó más de una vez.' };
      }
      borrar = true;
      continue;
    }

    if (arg === '--nombre') {
      if (nombre !== null) {
        return { ok: false, error: '--nombre se indicó más de una vez.' };
      }
      const next = argv[i + 1];
      if (
        next === undefined ||
        next.trim() === '' ||
        next.startsWith('--')
      ) {
        return { ok: false, error: 'Falta el valor para --nombre.' };
      }
      nombre = next;
      i += 1;
      continue;
    }

    if (arg.startsWith('--nombre=')) {
      if (nombre !== null) {
        return { ok: false, error: '--nombre se indicó más de una vez.' };
      }
      const value = arg.slice('--nombre='.length);
      if (value.trim() === '') {
        return { ok: false, error: 'Falta el valor para --nombre.' };
      }
      nombre = value;
      continue;
    }

    if (arg.startsWith('-')) {
      return { ok: false, error: `Argumento desconocido: ${arg}` };
    }

    if (eventId !== null) {
      return { ok: false, error: `Argumento desconocido: ${arg}` };
    }

    eventId = arg;
  }

  if (!eventId) {
    return { ok: false, error: 'Falta el id del evento.' };
  }

  if (!UUID_REGEX.test(eventId)) {
    return { ok: false, error: 'El id del evento no es un UUID válido.' };
  }

  return { ok: true, eventId: eventId.toLowerCase(), borrar, nombre };
}

function formatErrorMessage(err) {
  if (!err) {
    return 'Error desconocido';
  }
  if (typeof err === 'string') {
    return err;
  }
  return err.message ?? String(err);
}

async function listEventFiles(client, eventId) {
  const paths = [];
  const seen = new Set();
  let offset = 0;

  while (true) {
    let response;
    try {
      response = await client.storage
        .from(BUCKET_NAME)
        .list(eventId, { limit: PAGE_LIMIT, offset });
    } catch (err) {
      return {
        paths: null,
        error: `Error al listar los archivos de ${eventId}/: ${formatErrorMessage(err)}`,
      };
    }

    const { data, error } = response ?? {};
    if (error) {
      return {
        paths: null,
        error: `Error al listar los archivos de ${eventId}/: ${formatErrorMessage(error)}`,
      };
    }

    const items = Array.isArray(data) ? data : [];
    for (const item of items) {
      if (!item?.name || item.name === '.emptyFolderPlaceholder') {
        continue;
      }
      if (
        item.id === null ||
        item.name.includes('/') ||
        item.name.includes('\\') ||
        item.name === '..' ||
        item.name === '.'
      ) {
        return {
          paths: null,
          error: `Se encontró una entrada inesperada en ${eventId}/: ${item.name}. No se borró nada.`,
        };
      }
      const fullPath = `${eventId}/${item.name}`;
      if (!seen.has(fullPath)) {
        seen.add(fullPath);
        paths.push(fullPath);
      }
    }

    if (items.length < PAGE_LIMIT) {
      break;
    }

    offset += PAGE_LIMIT;
  }

  return { paths, error: null };
}

async function countEventRows(client, table, eventId) {
  const { count, error } = await client
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  if (error) {
    return {
      count: null,
      error: `Error al contar filas en ${table}: ${formatErrorMessage(error)}`,
    };
  }

  return { count: count ?? 0, error: null };
}

async function removeFilesInBatches(client, filePaths, log, logError) {
  if (filePaths.length === 0) {
    return true;
  }

  const totalBatches = Math.ceil(filePaths.length / REMOVE_BATCH_SIZE);
  let failedBatches = 0;

  for (let i = 0; i < filePaths.length; i += REMOVE_BATCH_SIZE) {
    const batch = filePaths.slice(i, i + REMOVE_BATCH_SIZE);
    const batchNumber = Math.floor(i / REMOVE_BATCH_SIZE) + 1;

    try {
      const { error } = await client.storage.from(BUCKET_NAME).remove(batch);
      if (error) {
        failedBatches += 1;
        logError(
          `Error al borrar el lote ${batchNumber}/${totalBatches} de archivos: ${formatErrorMessage(error)}`
        );
      } else {
        log(
          `Lote ${batchNumber}/${totalBatches} borrado (${batch.length} archivo(s)).`
        );
      }
    } catch (err) {
      failedBatches += 1;
      logError(
        `Error al borrar el lote ${batchNumber}/${totalBatches} de archivos: ${formatErrorMessage(err)}`
      );
    }
  }

  if (failedBatches > 0) {
    logError(
      'No se pudieron borrar todos los archivos. Puedes volver a correr el script con el mismo id para terminar.'
    );
    return false;
  }

  return true;
}

export async function run({
  client,
  args,
  log = console.log,
  logError = console.error,
}) {
  if (
    !args?.ok ||
    typeof args.eventId !== 'string' ||
    !UUID_REGEX.test(args.eventId)
  ) {
    logError(args?.error ?? 'El id del evento no es un UUID válido.');
    return 1;
  }

  const eventId = args.eventId.toLowerCase();
  const { borrar, nombre } = args;

  const { data: event, error: eventError } = await client
    .from('events')
    .select('id, name')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) {
    logError(`Error al leer el evento: ${formatErrorMessage(eventError)}`);
    return 1;
  }

  if (!event) {
    const { paths: orphanPaths, error: listError } = await listEventFiles(
      client,
      eventId
    );
    if (listError) {
      logError(listError);
      return 1;
    }

    if (orphanPaths.length === 0) {
      log('No hay nada que borrar.');
      return 0;
    }

    if (!borrar) {
      log(`El evento ${eventId} ya no existe en la base de datos.`);
      log(
        `Archivos huérfanos encontrados en ${eventId}/: ${orphanPaths.length}`
      );
      log('Simulacro: no se realizaron cambios.');
      return 0;
    }

    log(
      `El evento ${eventId} ya no existe; se borrarán ${orphanPaths.length} archivo(s) huérfano(s) de ${eventId}/.`
    );
    const removedAll = await removeFilesInBatches(
      client,
      orphanPaths,
      log,
      logError
    );
    if (!removedAll) {
      return 1;
    }

    log(`Archivos huérfanos borrados: ${orphanPaths.length}`);
    return 0;
  }

  if (!borrar) {
    const photosRes = await countEventRows(client, 'event_photos', eventId);
    if (photosRes.error) {
      logError(photosRes.error);
      return 1;
    }

    const invitationsRes = await countEventRows(client, 'invitations', eventId);
    if (invitationsRes.error) {
      logError(invitationsRes.error);
      return 1;
    }

    const guestsRes = await countEventRows(client, 'guests', eventId);
    if (guestsRes.error) {
      logError(guestsRes.error);
      return 1;
    }

    const { paths: filePaths, error: listError } = await listEventFiles(
      client,
      eventId
    );
    if (listError) {
      logError(listError);
      return 1;
    }

    log(`Simulacro de borrado del evento ${eventId} (sin cambios):`);
    log(`- Nombre del evento: ${event.name}`);
    log(`- Filas en event_photos: ${photosRes.count}`);
    log(`- Filas en invitations: ${invitationsRes.count}`);
    log(`- Filas en guests: ${guestsRes.count}`);
    log(`- Archivos en ${eventId}/: ${filePaths.length}`);
    return 0;
  }

  const providedName = typeof nombre === 'string' ? nombre.trim() : '';
  if (!providedName) {
    logError('Falta --nombre para confirmar el borrado del evento.');
    return 1;
  }

  const expectedName = (event.name ?? '').trim();
  if (providedName !== expectedName) {
    logError(
      'El nombre indicado en --nombre no coincide con el nombre del evento.'
    );
    return 1;
  }

  // Se listan todas las rutas antes de borrar la fila en events para no perder el rastro de archivos huérfanos si falla algo.
  const { paths: filePaths, error: listError } = await listEventFiles(
    client,
    eventId
  );
  if (listError) {
    logError(listError);
    return 1;
  }

  const { data: deletedRows, error: deleteError } = await client
    .from('events')
    .delete()
    .eq('id', eventId)
    .select('id');

  if (deleteError) {
    logError(`Error al borrar el evento: ${formatErrorMessage(deleteError)}`);
    return 1;
  }

  if (!Array.isArray(deletedRows) || deletedRows.length !== 1) {
    logError(
      `No se borró exactamente una fila del evento (filas borradas: ${deletedRows?.length ?? 0}).`
    );
    return 1;
  }

  const removedAll = await removeFilesInBatches(
    client,
    filePaths,
    log,
    logError
  );
  if (!removedAll) {
    return 1;
  }

  log(
    `Evento "${event.name}" (${eventId}) borrado junto con ${filePaths.length} archivo(s) de Storage.`
  );
  return 0;
}

async function main() {
  loadEnvFileIfNeeded();

  const args = parseArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    process.exit(1);
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

  if (!supabaseUrl || !supabaseSecretKey) {
    console.error(
      'Faltan variables de entorno requeridas: SUPABASE_URL, SUPABASE_SECRET_KEY.'
    );
    process.exit(1);
  }

  const client = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const code = await run({ client, args });
  process.exit(code);
}

const isEntryPoint =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  main().catch((err) => {
    console.error(`Error inesperado: ${formatErrorMessage(err)}`);
    process.exit(1);
  });
}
