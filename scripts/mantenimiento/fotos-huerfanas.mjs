import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile('.env');
    } catch {
      // Se ignora si no existe o falla la carga nativa
    }
  } else if (fs.existsSync('.env')) {
    const lines = fs.readFileSync('.env', 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY?.trim();

if (!supabaseUrl || !supabaseSecretKey) {
  console.error(
    'Faltan variables de entorno requeridas: SUPABASE_URL, SUPABASE_SECRET_KEY'
  );
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const shouldDelete = process.argv.includes('--borrar');
const ONE_HOUR_MS = 60 * 60 * 1000;
const now = Date.now();

async function listFilesInFolder(folder) {
  const files = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const { data, error } = await adminClient.storage
      .from('event-photos')
      .list(folder, { limit, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) {
      throw new Error(`Error listando Storage en '${folder}': ${error.message}`);
    }
    if (!data || data.length === 0) {
      break;
    }
    files.push(...data);
    if (data.length < limit) {
      break;
    }
    offset += limit;
  }
  return files;
}

async function listAllPhotoFiles() {
  const rootItems = await listFilesInFolder('');
  const allFiles = [];

  for (const item of rootItems) {
    if (!item.name || item.name === '.emptyFolderPlaceholder') {
      continue;
    }

    if (item.id !== null && item.name.includes('.')) {
      allFiles.push({
        path: item.name,
        created_at: item.created_at,
      });
      continue;
    }

    const folderFiles = await listFilesInFolder(item.name);
    for (const subItem of folderFiles) {
      if (!subItem.name || subItem.name === '.emptyFolderPlaceholder') {
        continue;
      }
      allFiles.push({
        path: `${item.name}/${subItem.name}`,
        created_at: subItem.created_at,
      });
    }
  }

  return allFiles;
}

async function getAllKnownPhotoPaths() {
  const knownPaths = new Set();
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await adminClient
      .from('event_photos')
      .select('photo_path, thumb_path')
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      throw new Error(`Error consultando event_photos: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      if (row.photo_path) knownPaths.add(row.photo_path);
      if (row.thumb_path) knownPaths.add(row.thumb_path);
    }

    if (data.length < pageSize) {
      break;
    }
    page += 1;
  }

  return knownPaths;
}

async function main() {
  console.log('Buscando archivos en el bucket event-photos...');
  const storageFiles = await listAllPhotoFiles();
  console.log(`Archivos encontrados en Storage: ${storageFiles.length}`);

  console.log('Consultando rutas registradas en event_photos...');
  const knownPaths = await getAllKnownPhotoPaths();
  console.log(`Rutas registradas en la base de datos: ${knownPaths.size}`);

  const orphanedFiles = [];
  for (const file of storageFiles) {
    if (knownPaths.has(file.path)) {
      continue;
    }
    const createdAtMs = file.created_at ? new Date(file.created_at).getTime() : 0;
    const ageMs = now - createdAtMs;

    if (ageMs > ONE_HOUR_MS) {
      orphanedFiles.push({
        path: file.path,
        created_at: file.created_at,
        ageMinutes: Math.round(ageMs / (60 * 1000)),
      });
    }
  }

  console.log(
    `\nArchivos huerfanos con mas de 1 hora de antiguedad: ${orphanedFiles.length}`
  );
  for (const f of orphanedFiles) {
    console.log(
      `- ${f.path} (creado: ${f.created_at}, hace ${f.ageMinutes} min)`
    );
  }

  if (shouldDelete) {
    if (orphanedFiles.length === 0) {
      console.log('\nNo hay archivos huerfanos para borrar.');
      return;
    }

    console.log(
      `\nBorrando ${orphanedFiles.length} archivo(s) mediante la API de Storage...`
    );
    const pathsToDelete = orphanedFiles.map((f) => f.path);

    for (let i = 0; i < pathsToDelete.length; i += 100) {
      const batch = pathsToDelete.slice(i, i + 100);
      const { error } = await adminClient.storage
        .from('event-photos')
        .remove(batch);

      if (error) {
        console.error(`Error borrando lote: ${error.message}`);
      } else {
        console.log(`Lote de ${batch.length} archivo(s) borrado con exito.`);
      }
    }
    console.log('Operacion de borrado finalizada.');
  } else if (orphanedFiles.length > 0) {
    console.log(
      '\nPara borrar estos archivos huerfanos, ejecuta el script con el argumento --borrar'
    );
  }
}

main().catch((err) => {
  console.error('Error durante la ejecucion:', err.message);
  process.exit(1);
});
