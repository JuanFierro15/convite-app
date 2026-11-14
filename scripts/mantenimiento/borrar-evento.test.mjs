import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { parseArgs, run } from './borrar-evento.mjs';

const EVENT_ID = '11111111-2222-4333-8444-555555555555';
const OTHER_EVENT_ID = '99999999-8888-4777-8666-555555555555';
const UPPER_EVENT_ID = 'A1B2C3D4-E5F6-4789-ABCD-EF0123456789';
const SCRIPT_PATH = path.resolve('scripts/mantenimiento/borrar-evento.mjs');

function createFakeClient({
  events = [],
  counts = {},
  storageFolders = {},
  eventReadError = null,
  countErrors = {},
  listError = null,
  listResponse = null,
  deleteError = null,
  deleteResponse = null,
  deleteRowCount = null,
  removeError = null,
} = {}) {
  const eventsMap = new Map(events.map((ev) => [ev.id, { ...ev }]));
  const countsMap = new Map(
    Object.entries(counts).map(([id, value]) => [id, { ...value }])
  );
  const foldersMap = new Map(
    Object.entries(storageFolders).map(([folder, files]) => [folder, [...files]])
  );
  const calls = [];
  let listCallCount = 0;
  let removeCallCount = 0;

  function record(entry) {
    calls.push(entry);
  }

  function createTableQueryBuilder(table) {
    const state = {
      table,
      op: null,
      columns: null,
      selectOptions: null,
      eqFilters: [],
      singleMode: null,
    };

    const builder = {
      select(columns, options) {
        if (!state.op) {
          state.op = 'select';
        }
        state.columns = columns;
        state.selectOptions = options ?? null;
        record({
          target: 'from',
          table,
          method: 'select',
          args: options ? [columns, options] : [columns],
        });
        return builder;
      },
      delete() {
        state.op = 'delete';
        record({
          target: 'from',
          table,
          method: 'delete',
          args: [],
        });
        return builder;
      },
      eq(column, value) {
        state.eqFilters.push([column, value]);
        record({
          target: 'from',
          table,
          method: 'eq',
          args: [column, value],
        });
        return builder;
      },
      maybeSingle() {
        state.singleMode = 'maybeSingle';
        record({
          target: 'from',
          table,
          method: 'maybeSingle',
          args: [],
        });
        return execute();
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    async function execute() {
      const idFilter = state.eqFilters.find(
        ([col]) => col === 'id' || col === 'event_id'
      )?.[1];

      if (state.op === 'select' && table === 'events') {
        if (eventReadError) {
          return { data: null, error: eventReadError };
        }
        const row = eventsMap.get(idFilter) ?? null;
        if (state.singleMode === 'maybeSingle') {
          return { data: row ? { ...row } : null, error: null };
        }
        return { data: row ? [{ ...row }] : [], error: null };
      }

      if (state.op === 'select' && state.selectOptions?.head === true) {
        if (countErrors[table]) {
          return { count: null, data: null, error: countErrors[table] };
        }
        const eventCounts = countsMap.get(idFilter) ?? {};
        return {
          count: eventCounts[table] ?? 0,
          data: null,
          error: null,
        };
      }

      if (state.op === 'delete' && table === 'events') {
        if (deleteError) {
          return { data: null, error: deleteError };
        }
        if (deleteResponse !== null) {
          return typeof deleteResponse === 'function'
            ? deleteResponse(idFilter)
            : deleteResponse;
        }
        if (deleteRowCount === 0) {
          return { data: [], error: null };
        }
        const existing = eventsMap.get(idFilter);
        if (!existing) {
          return { data: [], error: null };
        }
        eventsMap.delete(idFilter);
        countsMap.delete(idFilter);
        return { data: [{ id: existing.id }], error: null };
      }

      throw new Error(
        `Consulta no soportada en cliente falso: ${table} (${state.op})`
      );
    }

    return builder;
  }

  return {
    calls,
    state: {
      events: eventsMap,
      counts: countsMap,
      folders: foldersMap,
    },
    from(table) {
      record({ target: 'from', table, method: 'from', args: [table] });
      return createTableQueryBuilder(table);
    },
    storage: {
      from(bucket) {
        record({ target: 'storage', bucket, method: 'from', args: [bucket] });
        return {
          async list(folder, options = {}) {
            listCallCount += 1;
            record({
              target: 'storage',
              bucket,
              method: 'list',
              args: [folder, options],
            });
            const err =
              typeof listError === 'function'
                ? listError(listCallCount, folder, options)
                : listError;
            if (err) {
              return { data: null, error: err };
            }
            if (listResponse !== null) {
              return typeof listResponse === 'function'
                ? listResponse(listCallCount, folder, options)
                : listResponse;
            }
            const files = foldersMap.get(folder) ?? [];
            const offset = options.offset ?? 0;
            const limit = options.limit ?? 100;
            const slice = files
              .slice(offset, offset + limit)
              .map((entry) =>
                typeof entry === 'string'
                  ? { id: `file-${entry}`, name: entry }
                  : { ...entry }
              );
            return { data: slice, error: null };
          },
          async remove(paths) {
            removeCallCount += 1;
            record({
              target: 'storage',
              bucket,
              method: 'remove',
              args: [paths],
            });
            const err =
              typeof removeError === 'function'
                ? removeError(removeCallCount, paths)
                : removeError;
            if (err) {
              return { data: null, error: err };
            }
            for (const fullPath of paths) {
              const slashIdx = fullPath.indexOf('/');
              if (slashIdx === -1) {
                continue;
              }
              const folder = fullPath.slice(0, slashIdx);
              const fileName = fullPath.slice(slashIdx + 1);
              const current = foldersMap.get(folder);
              if (current) {
                foldersMap.set(
                  folder,
                  current.filter((entry) => {
                    const entryName =
                      typeof entry === 'string' ? entry : entry.name;
                    return entryName !== fileName;
                  })
                );
              }
            }
            return {
              data: paths.map((name) => ({ name })),
              error: null,
            };
          },
        };
      },
    },
  };
}

function createLoggers() {
  const logs = [];
  const errors = [];
  return {
    logs,
    errors,
    log: (msg) => logs.push(String(msg)),
    logError: (msg) => errors.push(String(msg)),
  };
}

function makeFileNames(count, { includePlaceholderAt = -1 } = {}) {
  const names = [];
  for (let i = 0; i < count; i += 1) {
    if (i === includePlaceholderAt) {
      names.push('.emptyFolderPlaceholder');
    }
    const index = String(i + 1).padStart(4, '0');
    names.push(`foto-${index}.jpg`);
  }
  if (includePlaceholderAt >= count) {
    names.push('.emptyFolderPlaceholder');
  }
  return names;
}

describe('parseArgs', () => {
  test('rechaza cuando falta el id', () => {
    const empty = parseArgs([]);
    assert.equal(empty.ok, false);
    assert.ok(empty.error.includes('Falta el id del evento'));

    const onlyFlag = parseArgs(['--borrar']);
    assert.equal(onlyFlag.ok, false);
    assert.ok(onlyFlag.error.includes('Falta el id del evento'));
  });

  test('rechaza un id que no es UUID', () => {
    for (const invalid of [
      'no-es-uuid',
      '12345',
      '11111111-2222-4333-8444-55555555555',
      'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
    ]) {
      const res = parseArgs([invalid]);
      assert.equal(res.ok, false);
      assert.ok(res.error.includes('no es un UUID válido'));
    }
  });

  test('acepta un UUID en mayúsculas y lo normaliza a minúsculas', () => {
    const res = parseArgs([UPPER_EVENT_ID]);
    assert.deepEqual(res, {
      ok: true,
      eventId: UPPER_EVENT_ID.toLowerCase(),
      borrar: false,
      nombre: null,
    });
  });

  test('acepta --borrar sin --nombre en parseArgs y run lo rechaza con código 1', async () => {
    const parsed = parseArgs([EVENT_ID, '--borrar']);
    assert.deepEqual(parsed, {
      ok: true,
      eventId: EVENT_ID,
      borrar: true,
      nombre: null,
    });

    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Baby Shower Ejemplo' }],
    });
    const loggers = createLoggers();
    const code = await run({
      client,
      args: parsed,
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((line) => line.includes('Falta --nombre')),
      `Se esperaba mensaje por falta de --nombre, recibido: ${loggers.errors.join(' | ')}`
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'delete' || c.method === 'remove')
        .length,
      0
    );
  });

  test('rechaza --nombre sin valor en todas sus variantes, incluso seguido de otra bandera', () => {
    for (const argv of [
      [EVENT_ID, '--nombre'],
      [EVENT_ID, '--borrar', '--nombre='],
      [EVENT_ID, '--borrar', '--nombre', ''],
      [EVENT_ID, '--borrar', '--nombre', '   '],
      [EVENT_ID, '--nombre', '--borrar'],
      [EVENT_ID, '--nombre', '--nombre=X'],
      [EVENT_ID, '--nombre', '--otra'],
      ['--nombre', '--otra', EVENT_ID],
    ]) {
      const res = parseArgs(argv);
      assert.equal(res.ok, false);
      assert.equal(res.error, 'Falta el valor para --nombre.');
    }
  });

  test('rechaza --nombre repetido en cualquier combinación', () => {
    for (const argv of [
      [EVENT_ID, '--nombre', 'A', '--nombre', 'B'],
      [EVENT_ID, '--nombre=A', '--nombre=B'],
      [EVENT_ID, '--nombre', 'A', '--nombre=B'],
      [EVENT_ID, '--nombre=A', '--nombre', 'B'],
      [EVENT_ID, '--borrar', '--nombre', 'A', '--nombre'],
    ]) {
      const res = parseArgs(argv);
      assert.equal(res.ok, false);
      assert.equal(res.error, '--nombre se indicó más de una vez.');
    }
  });

  test('rechaza --borrar repetido', () => {
    for (const argv of [
      [EVENT_ID, '--borrar', '--borrar'],
      ['--borrar', EVENT_ID, '--borrar', '--nombre=Mi Evento'],
    ]) {
      const res = parseArgs(argv);
      assert.equal(res.ok, false);
      assert.equal(res.error, '--borrar se indicó más de una vez.');
    }
  });

  test('acepta --nombre=X y flags antes o después del id', () => {
    const res1 = parseArgs([EVENT_ID, '--borrar', '--nombre=Mi Evento']);
    assert.deepEqual(res1, {
      ok: true,
      eventId: EVENT_ID,
      borrar: true,
      nombre: 'Mi Evento',
    });

    const res2 = parseArgs(['--nombre', 'Otro Evento', '--borrar', EVENT_ID]);
    assert.deepEqual(res2, {
      ok: true,
      eventId: EVENT_ID,
      borrar: true,
      nombre: 'Otro Evento',
    });
  });

  test('rechaza un argumento desconocido o posicional extra', () => {
    const unknownFlag = parseArgs([EVENT_ID, '--forzar']);
    assert.equal(unknownFlag.ok, false);
    assert.ok(unknownFlag.error.includes('Argumento desconocido: --forzar'));

    const extraPos = parseArgs([EVENT_ID, 'extra']);
    assert.equal(extraPos.ok, false);
    assert.ok(extraPos.error.includes('Argumento desconocido: extra'));
  });
});

describe('run: simulacro y validación de nombre', () => {
  test('simulacro muestra nombre, conteos y archivos sin llamar a delete ni a remove', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Baby Shower Ejemplo' }],
      counts: {
        [EVENT_ID]: {
          event_photos: 4,
          invitations: 12,
          guests: 27,
        },
      },
      storageFolders: {
        [EVENT_ID]: [
          '.emptyFolderPlaceholder',
          'foto-1.jpg',
          'foto-1_thumb.jpg',
          'foto-2.jpg',
        ],
        [OTHER_EVENT_ID]: ['ajena.jpg'],
      },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: false, nombre: null },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 0);
    assert.equal(loggers.errors.length, 0);

    const output = loggers.logs.join('\n');
    assert.ok(output.includes('Baby Shower Ejemplo'));
    assert.ok(output.includes('event_photos: 4'));
    assert.ok(output.includes('invitations: 12'));
    assert.ok(output.includes('guests: 27'));
    assert.ok(output.includes(`${EVENT_ID}/: 3`));

    const countSelectCalls = client.calls.filter(
      (c) =>
        c.target === 'from' &&
        c.table !== 'events' &&
        c.method === 'select'
    );
    assert.equal(countSelectCalls.length, 3);
    for (const call of countSelectCalls) {
      assert.deepEqual(call.args, ['id', { count: 'exact', head: true }]);
    }

    const eqEventIdCalls = client.calls.filter(
      (c) =>
        c.target === 'from' &&
        c.table !== 'events' &&
        c.method === 'eq'
    );
    assert.deepEqual(
      eqEventIdCalls.map((c) => [c.table, ...c.args]),
      [
        ['event_photos', 'event_id', EVENT_ID],
        ['invitations', 'event_id', EVENT_ID],
        ['guests', 'event_id', EVENT_ID],
      ]
    );

    assert.equal(
      client.calls.filter((c) => c.method === 'delete' || c.method === 'remove')
        .length,
      0
    );
    const listCalls = client.calls.filter((c) => c.method === 'list');
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].args[0], EVENT_ID);
  });

  test('con --borrar rechaza nombre distinto o cambio de mayúsculas sin borrar nada', async () => {
    for (const wrongName of ['Otro Nombre', 'baby shower ejemplo', '   ']) {
      const client = createFakeClient({
        events: [{ id: EVENT_ID, name: 'Baby Shower Ejemplo' }],
        storageFolders: { [EVENT_ID]: ['a.jpg'] },
      });
      const loggers = createLoggers();

      const code = await run({
        client,
        args: { ok: true, eventId: EVENT_ID, borrar: true, nombre: wrongName },
        log: loggers.log,
        logError: loggers.logError,
      });

      assert.equal(code, 1);
      const expectedText =
        wrongName.trim() === '' ? 'Falta --nombre' : 'no coincide';
      assert.ok(
        loggers.errors.some((line) => line.includes(expectedText)),
        `Se esperaba "${expectedText}" para "${wrongName}", recibido: ${loggers.errors.join(' | ')}`
      );
      assert.equal(
        client.calls.filter(
          (c) => c.method === 'delete' || c.method === 'remove'
        ).length,
        0
      );
    }
  });

  test('con --borrar acepta el nombre con espacios alrededor tras aplicar trim', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: '  Baby Shower Ejemplo  ' }],
      storageFolders: { [EVENT_ID]: ['foto-1.jpg', 'foto-1_thumb.jpg'] },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: '   Baby Shower Ejemplo ',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 0);
    assert.equal(client.state.events.has(EVENT_ID), false);
    assert.deepEqual(client.state.folders.get(EVENT_ID), []);
  });
});

describe('run: orden, paginación y lotes', () => {
  test('todas las llamadas a list ocurren antes de delete y delete antes del primer remove', async () => {
    const files = makeFileNames(105);
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Orden' }],
      storageFolders: { [EVENT_ID]: files },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Orden',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 0);

    const indexed = client.calls.map((c, idx) => ({ ...c, idx }));
    const listIndices = indexed
      .filter((c) => c.method === 'list')
      .map((c) => c.idx);
    const deleteIndices = indexed
      .filter((c) => c.method === 'delete')
      .map((c) => c.idx);
    const removeIndices = indexed
      .filter((c) => c.method === 'remove')
      .map((c) => c.idx);

    assert.equal(listIndices.length, 2);
    assert.equal(deleteIndices.length, 1);
    assert.equal(removeIndices.length, 2);
    assert.ok(
      Math.max(...listIndices) < deleteIndices[0],
      'Todas las llamadas a list deben ocurrir antes de delete'
    );
    assert.ok(
      deleteIndices[0] < Math.min(...removeIndices),
      'delete debe ocurrir antes del primer remove'
    );
  });

  test('pagina y arma lotes correctamente con 0, 1, 100, 101 y 200 archivos, ignorando .emptyFolderPlaceholder', async () => {
    const cases = [
      {
        count: 0,
        files: ['.emptyFolderPlaceholder'],
        expectedListOffsets: [0],
        expectedBatchSizes: [],
      },
      {
        count: 1,
        files: makeFileNames(1),
        expectedListOffsets: [0],
        expectedBatchSizes: [1],
      },
      {
        count: 100,
        files: makeFileNames(100),
        expectedListOffsets: [0, 100],
        expectedBatchSizes: [100],
      },
      {
        count: 101,
        files: makeFileNames(101, { includePlaceholderAt: 0 }),
        expectedListOffsets: [0, 100],
        expectedBatchSizes: [100, 1],
      },
      {
        count: 200,
        files: makeFileNames(200),
        expectedListOffsets: [0, 100, 200],
        expectedBatchSizes: [100, 100],
      },
    ];

    for (const tc of cases) {
      const client = createFakeClient({
        events: [{ id: EVENT_ID, name: 'Evento Lotes' }],
        storageFolders: {
          [EVENT_ID]: tc.files,
          [OTHER_EVENT_ID]: ['otro-1.jpg', 'otro-2.jpg'],
        },
      });
      const loggers = createLoggers();

      const code = await run({
        client,
        args: {
          ok: true,
          eventId: EVENT_ID,
          borrar: true,
          nombre: 'Evento Lotes',
        },
        log: loggers.log,
        logError: loggers.logError,
      });

      assert.equal(code, 0, `Fallo en caso de ${tc.count} archivos`);

      const listCalls = client.calls.filter((c) => c.method === 'list');
      assert.deepEqual(
        listCalls.map((c) => c.args[1].offset),
        tc.expectedListOffsets,
        `Offsets inesperados para ${tc.count} archivos`
      );
      for (const call of listCalls) {
        assert.equal(call.bucket, 'event-photos');
        assert.equal(call.args[0], EVENT_ID);
        assert.equal(call.args[1].limit, 100);
      }

      const removeCalls = client.calls.filter((c) => c.method === 'remove');
      assert.deepEqual(
        removeCalls.map((c) => c.args[0].length),
        tc.expectedBatchSizes,
        `Lotes inesperados para ${tc.count} archivos`
      );

      const removedPaths = removeCalls.flatMap((c) => c.args[0]);
      const expectedPaths = tc.files
        .filter((name) => name !== '.emptyFolderPlaceholder')
        .map((name) => `${EVENT_ID}/${name}`);

      assert.equal(new Set(removedPaths).size, removedPaths.length);
      assert.deepEqual(removedPaths, expectedPaths);
      for (const p of removedPaths) {
        assert.ok(p.startsWith(`${EVENT_ID}/`));
        assert.equal(p.endsWith('.emptyFolderPlaceholder'), false);
      }
      assert.deepEqual(client.state.folders.get(OTHER_EVENT_ID), [
        'otro-1.jpg',
        'otro-2.jpg',
      ]);
    }
  });
});

describe('run: fallos', () => {
  test('error al leer el evento sale con código 1 sin delete ni remove', async () => {
    const client = createFakeClient({
      eventReadError: { message: 'conexión rechazada' },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: false, nombre: null },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((l) =>
        l.includes('Error al leer el evento: conexión rechazada')
      )
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'delete' || c.method === 'remove')
        .length,
      0
    );
  });

  test('error al contar en simulacro sale con código 1 sin delete ni remove', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Simulacro Error' }],
      countErrors: { invitations: { message: 'timeout al contar' } },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: false, nombre: null },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((l) =>
        l.includes('Error al contar filas en invitations: timeout al contar')
      )
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'delete' || c.method === 'remove')
        .length,
      0
    );
  });

  test('error al borrar la fila del evento sale con código 1 y cero llamadas a remove', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Error Delete' }],
      storageFolders: { [EVENT_ID]: ['a.jpg', 'a_thumb.jpg'] },
      deleteError: { message: 'violación de clave foránea' },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Error Delete',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((l) =>
        l.includes('Error al borrar el evento: violación de clave foránea')
      )
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'remove').length,
      0
    );
    assert.equal(client.state.folders.get(EVENT_ID).length, 2);
  });

  test('si delete borra cero filas sale con código 1 y cero llamadas a remove', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Cero Filas' }],
      storageFolders: { [EVENT_ID]: ['a.jpg'] },
      deleteRowCount: 0,
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Cero Filas',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((l) =>
        l.includes('No se borró exactamente una fila del evento (filas borradas: 0)')
      )
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'remove').length,
      0
    );
    assert.equal(client.state.folders.get(EVENT_ID).length, 1);
  });

  test('si falla el primero de dos lotes, intenta el segundo y sale con código 1 indicando reintento', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Lote Fallido' }],
      storageFolders: { [EVENT_ID]: makeFileNames(150) },
      removeError: (callNum) =>
        callNum === 1 ? { message: 'fallo temporal en lote 1' } : null,
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Lote Fallido',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    const removeCalls = client.calls.filter((c) => c.method === 'remove');
    assert.equal(removeCalls.length, 2);
    assert.equal(removeCalls[0].args[0].length, 100);
    assert.equal(removeCalls[1].args[0].length, 50);

    const errOutput = loggers.errors.join('\n');
    assert.ok(
      errOutput.includes('Error al borrar el lote 1/2 de archivos: fallo temporal en lote 1')
    );
    assert.ok(
      errOutput.includes('Puedes volver a correr el script con el mismo id para terminar')
    );
    assert.equal(client.state.events.has(EVENT_ID), false);
    assert.equal(client.state.folders.get(EVENT_ID).length, 100);
  });

  test('error al listar sale con código 1 y sin delete ni remove', async () => {
    for (const borrar of [false, true]) {
      const client = createFakeClient({
        events: [{ id: EVENT_ID, name: 'Evento Error Lista' }],
        listError: { message: 'storage no disponible' },
      });
      const loggers = createLoggers();

      const code = await run({
        client,
        args: {
          ok: true,
          eventId: EVENT_ID,
          borrar,
          nombre: borrar ? 'Evento Error Lista' : null,
        },
        log: loggers.log,
        logError: loggers.logError,
      });

      assert.equal(code, 1);
      assert.ok(
        loggers.errors.some((l) =>
          l.includes(`Error al listar los archivos de ${EVENT_ID}/: storage no disponible`)
        )
      );
      assert.equal(
        client.calls.filter(
          (c) => c.method === 'delete' || c.method === 'remove'
        ).length,
        0
      );
    }
  });

  test('subcarpeta (id: null), nombre con / o \\, y . o .. fallan con código 1 y cero delete o remove', async () => {
    const unexpectedEntries = [
      { entry: { id: null, name: 'subcarpeta' }, name: 'subcarpeta' },
      { entry: 'sub/foto.jpg', name: 'sub/foto.jpg' },
      { entry: 'sub\\foto.jpg', name: 'sub\\foto.jpg' },
      { entry: '..', name: '..' },
      { entry: '.', name: '.' },
    ];

    for (const eventExists of [true, false]) {
      for (const { entry, name } of unexpectedEntries) {
        const client = createFakeClient({
          events: eventExists
            ? [{ id: EVENT_ID, name: 'Evento Entrada Rara' }]
            : [],
          storageFolders: {
            [EVENT_ID]: [
              { id: null, name: '.emptyFolderPlaceholder' },
              'foto-valida.jpg',
              entry,
            ],
          },
        });
        const loggers = createLoggers();

        const code = await run({
          client,
          args: {
            ok: true,
            eventId: EVENT_ID,
            borrar: true,
            nombre: eventExists ? 'Evento Entrada Rara' : null,
          },
          log: loggers.log,
          logError: loggers.logError,
        });

        const expectedError = `Se encontró una entrada inesperada en ${EVENT_ID}/: ${name}. No se borró nada.`;
        assert.equal(
          code,
          1,
          `Se esperaba código 1 para "${name}" (eventExists=${eventExists})`
        );
        assert.ok(
          loggers.errors.some((l) => l === expectedError),
          `Se esperaba "${expectedError}", recibido: ${loggers.errors.join(' | ')}`
        );
        assert.equal(
          client.calls.filter(
            (c) => c.method === 'delete' || c.method === 'remove'
          ).length,
          0
        );
        assert.equal(client.state.events.has(EVENT_ID), eventExists);
        assert.equal(client.state.folders.get(EVENT_ID).length, 3);
      }
    }
  });

  test('si list devuelve { data: null, error: null }, se trata como carpeta vacía', async () => {
    const dryClient = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento List Nulo' }],
      listResponse: { data: null, error: null },
    });
    const dryLoggers = createLoggers();
    const dryCode = await run({
      client: dryClient,
      args: { ok: true, eventId: EVENT_ID, borrar: false, nombre: null },
      log: dryLoggers.log,
      logError: dryLoggers.logError,
    });
    assert.equal(dryCode, 0);
    assert.ok(
      dryLoggers.logs.some((l) => l.includes(`- Archivos en ${EVENT_ID}/: 0`))
    );
    assert.equal(
      dryClient.calls.filter(
        (c) => c.method === 'delete' || c.method === 'remove'
      ).length,
      0
    );

    const deleteClient = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento List Nulo' }],
      listResponse: { data: null, error: null },
    });
    const deleteLoggers = createLoggers();
    const deleteCode = await run({
      client: deleteClient,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento List Nulo',
      },
      log: deleteLoggers.log,
      logError: deleteLoggers.logError,
    });
    assert.equal(deleteCode, 0);
    assert.ok(
      deleteLoggers.logs.some((l) =>
        l.includes(
          `Evento "Evento List Nulo" (${EVENT_ID}) borrado junto con 0 archivo(s) de Storage.`
        )
      )
    );
    assert.equal(deleteClient.state.events.has(EVENT_ID), false);
    assert.equal(
      deleteClient.calls.filter((c) => c.method === 'remove').length,
      0
    );

    for (const borrar of [false, true]) {
      const missingClient = createFakeClient({
        events: [],
        listResponse: { data: null, error: null },
      });
      const missingLoggers = createLoggers();
      const missingCode = await run({
        client: missingClient,
        args: { ok: true, eventId: EVENT_ID, borrar, nombre: null },
        log: missingLoggers.log,
        logError: missingLoggers.logError,
      });
      assert.equal(missingCode, 0);
      assert.deepEqual(missingLoggers.logs, ['No hay nada que borrar.']);
      assert.equal(
        missingClient.calls.filter(
          (c) => c.method === 'delete' || c.method === 'remove'
        ).length,
        0
      );
    }
  });

  test('si delete devuelve { data: null, error: null }, sale con código 1 y cero llamadas a remove', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Delete Nulo' }],
      storageFolders: { [EVENT_ID]: ['a.jpg', 'a_thumb.jpg'] },
      deleteResponse: { data: null, error: null },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Delete Nulo',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((l) =>
        l.includes(
          'No se borró exactamente una fila del evento (filas borradas: 0).'
        )
      )
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'remove').length,
      0
    );
    assert.equal(client.state.folders.get(EVENT_ID).length, 2);
  });
});

describe('run: evento inexistente y repetición', () => {
  test('evento inexistente con archivos: simulacro informa sin cambios y --borrar sin --nombre los borra sin delete', async () => {
    const client = createFakeClient({
      events: [],
      storageFolders: {
        [EVENT_ID]: ['huerfano-1.jpg', 'huerfano-1_thumb.jpg'],
      },
    });

    const dryLoggers = createLoggers();
    const dryCode = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: false, nombre: null },
      log: dryLoggers.log,
      logError: dryLoggers.logError,
    });

    assert.equal(dryCode, 0);
    assert.ok(
      dryLoggers.logs.some((l) => l.includes('Archivos huérfanos encontrados'))
    );
    assert.equal(client.state.folders.get(EVENT_ID).length, 2);
    assert.equal(
      client.calls.filter((c) => c.method === 'delete' || c.method === 'remove')
        .length,
      0
    );

    const delLoggers = createLoggers();
    const delCode = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: true, nombre: null },
      log: delLoggers.log,
      logError: delLoggers.logError,
    });

    assert.equal(delCode, 0);
    assert.equal(client.state.folders.get(EVENT_ID).length, 0);
    assert.equal(
      client.calls.filter((c) => c.method === 'delete').length,
      0
    );
    assert.equal(
      client.calls.filter((c) => c.method === 'remove').length,
      1
    );
  });

  test('evento inexistente sin archivos devuelve código 0 y "No hay nada que borrar."', async () => {
    for (const borrar of [false, true]) {
      const client = createFakeClient({
        events: [],
        storageFolders: { [EVENT_ID]: ['.emptyFolderPlaceholder'] },
      });
      const loggers = createLoggers();

      const code = await run({
        client,
        args: { ok: true, eventId: EVENT_ID, borrar, nombre: null },
        log: loggers.log,
        logError: loggers.logError,
      });

      assert.equal(code, 0);
      assert.deepEqual(loggers.logs, ['No hay nada que borrar.']);
      assert.equal(
        client.calls.filter(
          (c) => c.method === 'delete' || c.method === 'remove'
        ).length,
        0
      );
    }
  });

  test('repetir run dos veces seguidas con estado da 0 ambas veces y la segunda no toca nada', async () => {
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Repetible' }],
      storageFolders: {
        [EVENT_ID]: ['foto-1.jpg', 'foto-1_thumb.jpg'],
      },
    });

    const firstLoggers = createLoggers();
    const firstCode = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Repetible',
      },
      log: firstLoggers.log,
      logError: firstLoggers.logError,
    });

    assert.equal(firstCode, 0);
    assert.equal(client.state.events.has(EVENT_ID), false);
    assert.deepEqual(client.state.folders.get(EVENT_ID), []);

    const callsAfterFirst = client.calls.length;
    const secondLoggers = createLoggers();
    const secondCode = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Repetible',
      },
      log: secondLoggers.log,
      logError: secondLoggers.logError,
    });

    assert.equal(secondCode, 0);
    assert.deepEqual(secondLoggers.logs, ['No hay nada que borrar.']);
    const secondRunCalls = client.calls.slice(callsAfterFirst);
    assert.equal(
      secondRunCalls.filter(
        (c) => c.method === 'delete' || c.method === 'remove'
      ).length,
      0
    );
  });

  test('repetir run tras fallo parcial de un lote limpia los archivos huérfanos restantes', async () => {
    let failFirstRun = true;
    const client = createFakeClient({
      events: [{ id: EVENT_ID, name: 'Evento Recuperable' }],
      storageFolders: { [EVENT_ID]: makeFileNames(120) },
      removeError: (callNum) =>
        failFirstRun && callNum === 1 ? { message: 'corte de red' } : null,
    });

    const firstLoggers = createLoggers();
    const firstCode = await run({
      client,
      args: {
        ok: true,
        eventId: EVENT_ID,
        borrar: true,
        nombre: 'Evento Recuperable',
      },
      log: firstLoggers.log,
      logError: firstLoggers.logError,
    });
    assert.equal(firstCode, 1);
    assert.equal(client.state.folders.get(EVENT_ID).length, 100);

    failFirstRun = false;
    const secondLoggers = createLoggers();
    const secondCode = await run({
      client,
      args: { ok: true, eventId: EVENT_ID, borrar: true, nombre: null },
      log: secondLoggers.log,
      logError: secondLoggers.logError,
    });
    assert.equal(secondCode, 0);
    assert.equal(client.state.folders.get(EVENT_ID).length, 0);
  });

  test('run con id en mayúsculas contra evento y carpeta en minúsculas borra fila y archivos con rutas en minúsculas', async () => {
    const lowerId = UPPER_EVENT_ID.toLowerCase();
    const client = createFakeClient({
      events: [{ id: lowerId, name: 'Evento Mayúsculas' }],
      storageFolders: {
        [lowerId]: [
          { id: null, name: '.emptyFolderPlaceholder' },
          'foto-1.jpg',
          'foto-1_thumb.jpg',
        ],
      },
    });
    const loggers = createLoggers();

    const code = await run({
      client,
      args: {
        ok: true,
        eventId: UPPER_EVENT_ID,
        borrar: true,
        nombre: 'Evento Mayúsculas',
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 0);
    assert.ok(
      loggers.logs.some((l) =>
        l.includes(
          `Evento "Evento Mayúsculas" (${lowerId}) borrado junto con 2 archivo(s) de Storage.`
        )
      )
    );
    assert.equal(client.state.events.has(lowerId), false);
    assert.deepEqual(client.state.folders.get(lowerId), [
      { id: null, name: '.emptyFolderPlaceholder' },
    ]);

    const listCalls = client.calls.filter((c) => c.method === 'list');
    assert.equal(listCalls.length, 1);
    assert.equal(listCalls[0].args[0], lowerId);

    const removeCalls = client.calls.filter((c) => c.method === 'remove');
    assert.equal(removeCalls.length, 1);
    assert.deepEqual(removeCalls[0].args[0], [
      `${lowerId}/foto-1.jpg`,
      `${lowerId}/foto-1_thumb.jpg`,
    ]);
    for (const removedPath of removeCalls[0].args[0]) {
      assert.equal(removedPath, removedPath.toLowerCase());
    }
  });
});

describe('punto de entrada CLI', () => {
  test('falla con código 1 si falta el id o no es UUID antes de revisar variables de entorno', () => {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, 'invalido'], {
      cwd: os.tmpdir(),
      env: {},
      encoding: 'utf8',
    });

    assert.equal(res.status, 1);
    assert.ok(res.stderr.includes('El id del evento no es un UUID válido'));
  });

  test('falla con código 1 si hay banderas repetidas o --nombre seguido de otra bandera', () => {
    const cases = [
      {
        argv: [EVENT_ID, '--nombre', 'A', '--nombre=B'],
        expected: '--nombre se indicó más de una vez.',
      },
      {
        argv: [EVENT_ID, '--borrar', '--borrar'],
        expected: '--borrar se indicó más de una vez.',
      },
      {
        argv: [EVENT_ID, '--nombre', '--nombre=X'],
        expected: 'Falta el valor para --nombre.',
      },
    ];

    for (const { argv, expected } of cases) {
      const res = spawnSync(process.execPath, [SCRIPT_PATH, ...argv], {
        cwd: os.tmpdir(),
        env: {},
        encoding: 'utf8',
      });

      assert.equal(res.status, 1);
      assert.ok(
        res.stderr.includes(expected),
        `Se esperaba "${expected}", recibido: ${res.stderr}`
      );
    }
  });

  test('falla con código 1 si faltan SUPABASE_URL o SUPABASE_SECRET_KEY', () => {
    const res = spawnSync(process.execPath, [SCRIPT_PATH, EVENT_ID], {
      cwd: os.tmpdir(),
      env: {},
      encoding: 'utf8',
    });

    assert.equal(res.status, 1);
    assert.ok(
      res.stderr.includes(
        'Faltan variables de entorno requeridas: SUPABASE_URL, SUPABASE_SECRET_KEY'
      )
    );
  });
});
