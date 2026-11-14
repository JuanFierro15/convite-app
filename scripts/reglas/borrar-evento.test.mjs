import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { run } from '../mantenimiento/borrar-evento.mjs';
import {
  createAdminClient,
  createAuthenticatedClient,
  createEmptyContext,
  createTestUser,
  getEnvConfig,
  removeTestPhotoFiles,
  setupBudgetFixture,
  teardownTestContext,
  uploadTestPhoto,
} from './helpers.mjs';

const TEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ctx = {
  ...createEmptyContext(),
  ownerUser: null,
  ownerClient: null,
  eventA: null,
  eventB: null,
  eventAPhotos: [],
  eventBPhotos: [],
};

function createSilentLoggers() {
  const logs = [];
  const errors = [];
  return {
    logs,
    errors,
    log: (msg) => logs.push(String(msg)),
    logError: (msg) => errors.push(String(msg)),
  };
}

async function countRowsByEvent(adminClient, table, eventId) {
  const { count, error } = await adminClient
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  assert.equal(
    error,
    null,
    `No debio fallar la consulta de conteo en ${table}: ${error?.message}`
  );
  return count ?? 0;
}

async function listRealFiles(adminClient, eventId) {
  const { data, error } = await adminClient.storage
    .from('event-photos')
    .list(eventId, { limit: 100, offset: 0 });

  assert.equal(
    error,
    null,
    `No debio fallar el listado en Storage para ${eventId}: ${error?.message}`
  );
  return (data ?? [])
    .map((item) => item.name)
    .filter((name) => name && name !== '.emptyFolderPlaceholder');
}

async function assertEventBIntact() {
  const { data: eventRow, error: eventErr } = await ctx.adminClient
    .from('events')
    .select('id, name')
    .eq('id', ctx.eventB.id)
    .maybeSingle();

  assert.equal(eventErr, null);
  assert.equal(eventRow?.id, ctx.eventB.id, 'El evento B debe seguir existiendo');
  assert.equal(
    await countRowsByEvent(ctx.adminClient, 'event_photos', ctx.eventB.id),
    2,
    'El evento B debe conservar sus 2 filas en event_photos'
  );
  assert.equal(
    await countRowsByEvent(ctx.adminClient, 'invitations', ctx.eventB.id),
    1,
    'El evento B debe conservar su invitacion'
  );
  assert.equal(
    await countRowsByEvent(ctx.adminClient, 'guests', ctx.eventB.id),
    1,
    'El evento B debe conservar su persona'
  );

  const filesB = await listRealFiles(ctx.adminClient, ctx.eventB.id);
  assert.equal(
    filesB.length,
    4,
    `El evento B debe conservar sus 4 archivos en Storage, encontrados: ${filesB.join(', ')}`
  );
  for (const photo of ctx.eventBPhotos) {
    assert.ok(filesB.includes(`${photo.id}.jpg`));
    assert.ok(filesB.includes(`${photo.id}_thumb.jpg`));
  }
}

before(
  async () => {
    const { url, publishableKey, secretKey } = getEnvConfig();
    ctx.adminClient = createAdminClient(url, secretKey);

    ctx.ownerUser = await createTestUser(ctx.adminClient, ctx, 'prop-borrar');
    ctx.ownerClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.ownerUser.email,
      ctx.ownerUser.password
    );

    const now = Date.now();
    const in30Days = new Date(now + 30 * DAY_MS).toISOString();
    const in20Days = new Date(now + 20 * DAY_MS).toISOString();

    const { data: eventA, error: eventAError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-BORRAR-A`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerUser.id,
      })
      .select()
      .single();

    if (eventAError || !eventA) {
      throw new Error(
        `No se pudo crear el evento A: ${eventAError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventA = eventA;
    ctx.createdEventIds.push(eventA.id);

    const { data: eventB, error: eventBError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-BORRAR-B`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerUser.id,
      })
      .select()
      .single();

    if (eventBError || !eventB) {
      throw new Error(
        `No se pudo crear el evento B: ${eventBError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventB = eventB;
    ctx.createdEventIds.push(eventB.id);

    ctx.eventAPhotos.push(
      await uploadTestPhoto(ctx.ownerClient, eventA.id, crypto.randomUUID()),
      await uploadTestPhoto(ctx.ownerClient, eventA.id, crypto.randomUUID())
    );
    ctx.eventBPhotos.push(
      await uploadTestPhoto(ctx.ownerClient, eventB.id, crypto.randomUUID()),
      await uploadTestPhoto(ctx.ownerClient, eventB.id, crypto.randomUUID())
    );

    const { data: invA, error: invAError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: eventA.id,
        group_name: 'Familia Ejemplo A',
        phone: '+573000000001',
      })
      .select()
      .single();

    if (invAError || !invA) {
      throw new Error(
        `No se pudo crear la invitacion de A: ${invAError?.message ?? 'sin datos'}`
      );
    }

    const { error: guestAError } = await ctx.adminClient.from('guests').insert({
      invitation_id: invA.id,
      full_name: 'Invitado Ejemplo A',
      sort_order: 1,
    });
    if (guestAError) {
      throw new Error(
        `No se pudo crear la persona de A: ${guestAError.message}`
      );
    }

    const { data: invB, error: invBError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: eventB.id,
        group_name: 'Familia Ejemplo B',
        phone: '+573000000002',
      })
      .select()
      .single();

    if (invBError || !invB) {
      throw new Error(
        `No se pudo crear la invitacion de B: ${invBError?.message ?? 'sin datos'}`
      );
    }

    const { error: guestBError } = await ctx.adminClient.from('guests').insert({
      invitation_id: invB.id,
      full_name: 'Invitado Ejemplo B',
      sort_order: 1,
    });
    if (guestBError) {
      throw new Error(
        `No se pudo crear la persona de B: ${guestBError.message}`
      );
    }
  },
  { timeout: TEST_TIMEOUT_MS }
);

after(
  async () => {
    if (ctx.adminClient) {
      for (const eventId of ctx.createdEventIds) {
        try {
          await removeTestPhotoFiles(ctx.adminClient, eventId);
        } catch {
          // Se ignoran errores de limpieza de almacenamiento
        }
      }
    }
    await teardownTestContext(ctx);
  },
  { timeout: TEST_TIMEOUT_MS }
);

test(
  '1. Borra el evento A con --borrar y su nombre sin afectar el evento B',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const loggers = createSilentLoggers();

    const code = await run({
      client: ctx.adminClient,
      args: {
        ok: true,
        eventId: ctx.eventA.id,
        borrar: true,
        nombre: ctx.eventA.name,
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(
      code,
      0,
      `Se esperaba codigo 0 al borrar A; errores: ${loggers.errors.join(' | ')}`
    );

    const { data: eventARow, error: eventAErr } = await ctx.adminClient
      .from('events')
      .select('id')
      .eq('id', ctx.eventA.id)
      .maybeSingle();

    assert.equal(eventAErr, null);
    assert.equal(eventARow, null, 'El evento A debe haber sido eliminado');
    assert.equal(
      await countRowsByEvent(ctx.adminClient, 'event_photos', ctx.eventA.id),
      0,
      'A no debe tener filas en event_photos'
    );
    assert.equal(
      await countRowsByEvent(ctx.adminClient, 'invitations', ctx.eventA.id),
      0,
      'A no debe tener filas en invitations'
    );
    assert.equal(
      await countRowsByEvent(ctx.adminClient, 'guests', ctx.eventA.id),
      0,
      'A no debe tener filas en guests'
    );

    const filesA = await listRealFiles(ctx.adminClient, ctx.eventA.id);
    assert.equal(
      filesA.length,
      0,
      `A no debe tener archivos en Storage, encontrados: ${filesA.join(', ')}`
    );

    await assertEventBIntact();
  }
);

test(
  '2. Simulacro sobre B devuelve codigo 0 y conserva filas y archivos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const loggers = createSilentLoggers();

    const code = await run({
      client: ctx.adminClient,
      args: {
        ok: true,
        eventId: ctx.eventB.id,
        borrar: false,
        nombre: null,
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(
      code,
      0,
      `Se esperaba codigo 0 en simulacro; errores: ${loggers.errors.join(' | ')}`
    );

    const output = loggers.logs.join('\n');
    assert.ok(output.includes(ctx.eventB.name));
    assert.ok(output.includes('event_photos: 2'));
    assert.ok(output.includes('invitations: 1'));
    assert.ok(output.includes('guests: 1'));
    assert.ok(output.includes(`${ctx.eventB.id}/: 4`));

    await assertEventBIntact();
  }
);

test(
  '3. --borrar sobre B con nombre equivocado devuelve codigo 1 y conserva todo',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const loggers = createSilentLoggers();

    const code = await run({
      client: ctx.adminClient,
      args: {
        ok: true,
        eventId: ctx.eventB.id,
        borrar: true,
        nombre: `${ctx.eventB.name}-EQUIVOCADO`,
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(code, 1);
    assert.ok(
      loggers.errors.some((line) => line.includes('no coincide')),
      `Se esperaba mensaje de nombre no coincidente: ${loggers.errors.join(' | ')}`
    );

    await assertEventBIntact();
  }
);

test(
  '4. Evento con presupuesto y tareas (categoria, gasto con pago y tarea con responsable) se borra con codigo 0',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    ctx.teamOwnerAUser = await createTestUser(
      ctx.adminClient,
      ctx,
      'equipo-borrar'
    );

    const { data: team, error: teamError } = await ctx.adminClient
      .from('teams')
      .insert({ name: `PRUEBA-${ctx.run}-EQUIPO` })
      .select()
      .single();

    if (teamError || !team) {
      throw new Error(
        `No se pudo crear el equipo de prueba: ${teamError?.message ?? 'sin datos'}`
      );
    }
    ctx.team = team;

    const { error: memberError } = await ctx.adminClient
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: ctx.teamOwnerAUser.id,
        role: 'owner',
      });

    if (memberError) {
      throw new Error(
        `No se pudo registrar al propietario del equipo: ${memberError.message}`
      );
    }

    await setupBudgetFixture(ctx);

    const budgetEvent = ctx.budget.eventA;
    const taskId = crypto.randomUUID();
    const { error: taskError } = await ctx.adminClient.from('tasks').insert({
      id: taskId,
      event_id: budgetEvent.id,
      title: 'Tarea Ejemplo Presupuesto',
      assignee_profile_id: ctx.budget.profile.id,
      due_date: '2026-12-31',
    });
    assert.equal(
      taskError,
      null,
      `No debio fallar la insercion de tarea: ${taskError?.message}`
    );

    const expenseId = crypto.randomUUID();
    const { error: expenseError } = await ctx.adminClient
      .from('expenses')
      .insert({
        id: expenseId,
        event_id: budgetEvent.id,
        category_id: ctx.budget.categoryA.id,
        task_id: taskId,
        description: 'Gasto Ejemplo',
        amount_cop: 150000,
      });
    assert.equal(
      expenseError,
      null,
      `No debio fallar la insercion de gasto: ${expenseError?.message}`
    );

    const paymentId = crypto.randomUUID();
    const { error: paymentError } = await ctx.adminClient
      .from('expense_payments')
      .insert({
        id: paymentId,
        expense_id: expenseId,
        paid_by_profile_id: ctx.budget.profile.id,
        amount_cop: 50000,
      });
    assert.equal(
      paymentError,
      null,
      `No debio fallar la insercion de pago: ${paymentError?.message}`
    );

    const loggers = createSilentLoggers();
    const code = await run({
      client: ctx.adminClient,
      args: {
        ok: true,
        eventId: budgetEvent.id,
        borrar: true,
        nombre: budgetEvent.name,
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(
      code,
      0,
      `Se esperaba codigo 0 al borrar evento con presupuesto y tareas; errores: ${loggers.errors.join(' | ')}`
    );

    const { data: deletedEvent, error: checkEventErr } = await ctx.adminClient
      .from('events')
      .select('id')
      .eq('id', budgetEvent.id)
      .maybeSingle();
    assert.equal(checkEventErr, null);
    assert.equal(deletedEvent, null, 'El evento de presupuesto debio borrarse');

    for (const table of [
      'expense_categories',
      'tasks',
      'expenses',
      'expense_payments',
    ]) {
      assert.equal(
        await countRowsByEvent(ctx.adminClient, table, budgetEvent.id),
        0,
        `No deben quedar filas en ${table} para el evento borrado`
      );
    }

    const { data: teamCheck } = await ctx.adminClient
      .from('teams')
      .select('id')
      .eq('id', ctx.team.id)
      .maybeSingle();
    assert.equal(
      teamCheck?.id,
      ctx.team.id,
      'El equipo no debe ser eliminado al borrar un evento'
    );
  }
);

test(
  '5. Repetir el borrado de A devuelve codigo 0 con mensaje "No hay nada que borrar."',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const loggers = createSilentLoggers();

    const code = await run({
      client: ctx.adminClient,
      args: {
        ok: true,
        eventId: ctx.eventA.id,
        borrar: true,
        nombre: ctx.eventA.name,
      },
      log: loggers.log,
      logError: loggers.logError,
    });

    assert.equal(
      code,
      0,
      `Se esperaba codigo 0 al repetir borrado; errores: ${loggers.errors.join(' | ')}`
    );
    assert.ok(
      loggers.logs.some((line) => line.includes('No hay nada que borrar.')),
      `Se esperaba "No hay nada que borrar.", recibido: ${loggers.logs.join(' | ')}`
    );
  }
);
