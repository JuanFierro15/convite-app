import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import {
  createAdminClient,
  createAnonClient,
  createAuthenticatedClient,
  createEmptyContext,
  createTestUser,
  getEnvConfig,
  teardownTestContext,
} from './helpers.mjs';

const TEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ctx = {
  ...createEmptyContext(),
  run: `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
  ownerUser: null,
  ownerClient: null,
  helperUser: null,
  helperClient: null,
  otherUser: null,
  otherClient: null,
  eventMain: null,
  eventOther: null,
};

function isoOffset(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

async function createEventRow(adminClient, { name, startsAt, rsvpDeadline, createdBy }) {
  const { data, error } = await adminClient
    .from('events')
    .insert({
      name,
      starts_at: startsAt,
      rsvp_deadline: rsvpDeadline,
      created_by: createdBy,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(
      `No se pudo crear el evento de prueba ${name}: ${error?.message ?? 'sin datos'}`
    );
  }
  ctx.createdEventIds.push(data.id);
  return data;
}

async function createInvitationWithGuest(
  client,
  {
    invitationId = crypto.randomUUID(),
    eventId,
    groupName,
    phone = '+573000000001',
    guestId = crypto.randomUUID(),
    guestName = 'Invitado Ejemplo',
    batchId,
    setBatch,
    knownGuestIds = [],
  }
) {
  const payload = {
    p_invitation_id: invitationId,
    p_event_id: eventId,
    p_group_name: groupName,
    p_phone: phone,
    p_guests: [{ id: guestId, full_name: guestName }],
    p_kind: 'group',
    p_known_guest_ids: knownGuestIds,
  };

  if (setBatch !== undefined) {
    payload.p_set_batch = setBatch;
  }
  if (batchId !== undefined) {
    payload.p_batch_id = batchId;
  }

  const { data, error } = await client.rpc('save_invitation', payload);
  return { data, error, invitationId, guestId };
}

async function cleanupRows({ invitationIds = [], batchIds = [] }) {
  if (invitationIds.length > 0) {
    await ctx.adminClient.from('invitations').delete().in('id', invitationIds);
  }
  if (batchIds.length > 0) {
    await ctx.adminClient.from('invitation_batches').delete().in('id', batchIds);
  }
}

before(
  async () => {
    const { url, publishableKey, secretKey } = getEnvConfig();
    ctx.adminClient = createAdminClient(url, secretKey);
    ctx.anonClient = createAnonClient(url, publishableKey);

    ctx.ownerUser = await createTestUser(ctx.adminClient, ctx, 'prop-tandas');
    ctx.helperUser = await createTestUser(ctx.adminClient, ctx, 'ayud-tandas');
    ctx.otherUser = await createTestUser(ctx.adminClient, ctx, 'otro-tandas');

    ctx.ownerClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.ownerUser.email,
      ctx.ownerUser.password
    );
    ctx.helperClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.helperUser.email,
      ctx.helperUser.password
    );
    ctx.otherClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.otherUser.email,
      ctx.otherUser.password
    );

    const now = Date.now();
    const in30Days = isoOffset(now, 30 * DAY_MS);
    const in20Days = isoOffset(now, 20 * DAY_MS);

    ctx.eventMain = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TANDAS-MAIN`,
      startsAt: in30Days,
      rsvpDeadline: in20Days,
      createdBy: ctx.ownerUser.id,
    });

    const { error: helperErr } = await ctx.adminClient.from('event_members').insert({
      event_id: ctx.eventMain.id,
      user_id: ctx.helperUser.id,
      role: 'helper',
    });
    if (helperErr) {
      throw new Error(`No se pudo asociar el ayudante: ${helperErr.message}`);
    }

    ctx.eventOther = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TANDAS-OTRO`,
      startsAt: in30Days,
      rsvpDeadline: in20Days,
      createdBy: ctx.otherUser.id,
    });
  },
  { timeout: TEST_TIMEOUT_MS }
);

after(
  async () => {
    await teardownTestContext(ctx);
  },
  { timeout: TEST_TIMEOUT_MS }
);

test(
  '1. Propietario crea tanda con fecha igual a starts_at (ok) y un segundo después falla con batch_deadline_after_start',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const startsAtMs = new Date(ctx.eventMain.starts_at).getTime();

    try {
      const { data: validBatch, error: validErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Límite Exacto',
          rsvp_deadline: ctx.eventMain.starts_at,
        })
        .select()
        .single();

      assert.equal(
        validErr,
        null,
        `La tanda con fecha igual a starts_at debe aceptarse: ${validErr?.message}`
      );
      assert.ok(validBatch?.id);
      batchIds.push(validBatch.id);
      assert.equal(
        new Date(validBatch.rsvp_deadline).getTime(),
        startsAtMs,
        'La fecha de la tanda debe coincidir con starts_at'
      );

      const rejectedId = crypto.randomUUID();
      const { error: afterErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          id: rejectedId,
          event_id: ctx.eventMain.id,
          name: 'Tanda Pasada Por Un Segundo',
          rsvp_deadline: isoOffset(startsAtMs, 1000),
        });

      assert.ok(afterErr, 'Debe fallar una tanda con rsvp_deadline posterior a starts_at');
      assert.match(
        afterErr.message,
        /batch_deadline_after_start/,
        `Se esperaba batch_deadline_after_start, se recibió: ${afterErr.message}`
      );

      const { data: checkRejected } = await ctx.adminClient
        .from('invitation_batches')
        .select('id')
        .eq('id', rejectedId)
        .maybeSingle();
      assert.equal(checkRejected, null, 'La tanda rechazada no debe haberse guardado');
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '2. Propietario actualiza tanda existente a fecha posterior a starts_at y falla con batch_deadline_after_start',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const startsAtMs = new Date(ctx.eventMain.starts_at).getTime();
    const initialDeadline = isoOffset(startsAtMs, -5 * DAY_MS);

    try {
      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Editable',
          rsvp_deadline: initialDeadline,
        })
        .select()
        .single();
      assert.equal(createErr, null, `Error al crear tanda: ${createErr?.message}`);
      batchIds.push(batch.id);

      const { error: updateAfterErr } = await ctx.ownerClient
        .from('invitation_batches')
        .update({ rsvp_deadline: isoOffset(startsAtMs, 1000) })
        .eq('id', batch.id);

      assert.ok(updateAfterErr, 'Debe fallar al mover rsvp_deadline después de starts_at');
      assert.match(
        updateAfterErr.message,
        /batch_deadline_after_start/,
        `Se esperaba batch_deadline_after_start, se recibió: ${updateAfterErr.message}`
      );

      const { data: storedAfterFail, error: checkErr } = await ctx.adminClient
        .from('invitation_batches')
        .select('rsvp_deadline')
        .eq('id', batch.id)
        .single();
      assert.equal(checkErr, null);
      assert.equal(
        new Date(storedAfterFail.rsvp_deadline).getTime(),
        new Date(initialDeadline).getTime(),
        'La fecha de la tanda debe seguir igual tras el rechazo'
      );

      const { data: updatedExact, error: exactErr } = await ctx.ownerClient
        .from('invitation_batches')
        .update({ rsvp_deadline: ctx.eventMain.starts_at })
        .eq('id', batch.id)
        .select()
        .single();
      assert.equal(exactErr, null, `Actualizar a starts_at exacto debe funcionar: ${exactErr?.message}`);
      assert.equal(
        new Date(updatedExact.rsvp_deadline).getTime(),
        startsAtMs
      );
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '3. Mover starts_at antes de una tanda falla con batch_deadline_after_start y moverlo igual o después funciona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const originalStartsAt = ctx.eventMain.starts_at;
    const originalStartsAtMs = new Date(originalStartsAt).getTime();
    // La tanda queda entre eventMain.rsvp_deadline (+20d) y starts_at (+30d) para probar solo el trigger de tandas.
    const batchDeadline = isoOffset(originalStartsAtMs, -5 * DAY_MS);
    const beforeBatchDeadline = isoOffset(originalStartsAtMs, -6 * DAY_MS);
    const afterBatchDeadline = isoOffset(originalStartsAtMs, -2 * DAY_MS);

    try {
      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Antes De Inicio',
          rsvp_deadline: batchDeadline,
        })
        .select()
        .single();
      assert.equal(createErr, null, `Error al crear tanda: ${createErr?.message}`);
      batchIds.push(batch.id);

      const { error: moveBeforeErr } = await ctx.ownerClient
        .from('events')
        .update({ starts_at: beforeBatchDeadline })
        .eq('id', ctx.eventMain.id);

      assert.ok(moveBeforeErr, 'Debe fallar al mover starts_at antes de la tanda');
      assert.match(
        moveBeforeErr.message,
        /batch_deadline_after_start/,
        `Se esperaba batch_deadline_after_start, se recibió: ${moveBeforeErr.message}`
      );

      const { error: moveEqualErr } = await ctx.ownerClient
        .from('events')
        .update({ starts_at: batchDeadline })
        .eq('id', ctx.eventMain.id);
      assert.equal(
        moveEqualErr,
        null,
        `Mover starts_at a igual que la tanda debe aceptarse: ${moveEqualErr?.message}`
      );

      const { error: moveAfterErr } = await ctx.ownerClient
        .from('events')
        .update({ starts_at: afterBatchDeadline })
        .eq('id', ctx.eventMain.id);
      assert.equal(
        moveAfterErr,
        null,
        `Mover starts_at después de la tanda debe aceptarse: ${moveAfterErr?.message}`
      );
    } finally {
      await ctx.adminClient
        .from('events')
        .update({ starts_at: originalStartsAt })
        .eq('id', ctx.eventMain.id);
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '4. Cambiar event_id de una tanda falla con event_id_immutable',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const now = Date.now();

    try {
      const ownerSecondEvent = await createEventRow(ctx.adminClient, {
        name: `PRUEBA-${ctx.run}-TANDAS-SEGUNDO`,
        startsAt: isoOffset(now, 30 * DAY_MS),
        rsvpDeadline: isoOffset(now, 20 * DAY_MS),
        createdBy: ctx.ownerUser.id,
      });

      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Inmutable',
          rsvp_deadline: isoOffset(now, 25 * DAY_MS),
        })
        .select()
        .single();
      assert.equal(createErr, null, `Error al crear tanda: ${createErr?.message}`);
      batchIds.push(batch.id);

      const { error: moveOwnErr } = await ctx.ownerClient
        .from('invitation_batches')
        .update({ event_id: ownerSecondEvent.id })
        .eq('id', batch.id);
      assert.ok(moveOwnErr, 'Debe fallar al cambiar event_id hacia otro evento propio');
      assert.match(
        moveOwnErr.message,
        /event_id_immutable/,
        `Se esperaba event_id_immutable, se recibió: ${moveOwnErr.message}`
      );

      const { error: moveOtherErr } = await ctx.ownerClient
        .from('invitation_batches')
        .update({ event_id: ctx.eventOther.id })
        .eq('id', batch.id);
      assert.ok(moveOtherErr, 'Debe fallar al cambiar event_id hacia un evento ajeno');
      assert.match(
        moveOtherErr.message,
        /event_id_immutable/,
        `Se esperaba event_id_immutable, se recibió: ${moveOtherErr.message}`
      );

      const { data: stored, error: checkErr } = await ctx.adminClient
        .from('invitation_batches')
        .select('event_id')
        .eq('id', batch.id)
        .single();
      assert.equal(checkErr, null);
      assert.equal(stored.event_id, ctx.eventMain.id);
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '5. Ayudante lee las tandas de su evento, pero insert, update y delete no modifican nada',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const deadline = isoOffset(Date.now(), 24 * DAY_MS);

    try {
      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Visible Ayudante',
          rsvp_deadline: deadline,
        })
        .select()
        .single();
      assert.equal(createErr, null, `Error al crear tanda: ${createErr?.message}`);
      batchIds.push(batch.id);

      const { data: helperRows, error: readErr } = await ctx.helperClient
        .from('invitation_batches')
        .select('*')
        .eq('event_id', ctx.eventMain.id);
      assert.equal(readErr, null, `El ayudante debe poder leer tandas: ${readErr?.message}`);
      assert.ok(
        helperRows?.some((row) => row.id === batch.id),
        'El ayudante debe ver la tanda creada por el propietario'
      );

      const attemptedId = crypto.randomUUID();
      const { error: helperInsertErr } = await ctx.helperClient
        .from('invitation_batches')
        .insert({
          id: attemptedId,
          event_id: ctx.eventMain.id,
          name: 'Tanda Del Ayudante',
          rsvp_deadline: deadline,
        });
      assert.ok(helperInsertErr, 'El ayudante no debe poder crear tandas');
      assert.equal(
        helperInsertErr.code,
        '42501',
        `Se esperaba código 42501 al insertar como ayudante, se recibió: ${helperInsertErr.code}`
      );

      const { data: helperUpdateRows, error: helperUpdateErr } = await ctx.helperClient
        .from('invitation_batches')
        .update({ name: 'Tanda Modificada Por Ayudante' })
        .eq('id', batch.id)
        .select();
      if (helperUpdateErr) {
        assert.equal(
          helperUpdateErr.code,
          '42501',
          `Se esperaba código 42501 al actualizar como ayudante, se recibió: ${helperUpdateErr.code}`
        );
      } else {
        assert.equal(
          helperUpdateRows?.length ?? 0,
          0,
          'El update del ayudante no debe modificar filas'
        );
      }

      const { data: helperDeleteRows, error: helperDeleteErr } = await ctx.helperClient
        .from('invitation_batches')
        .delete()
        .eq('id', batch.id)
        .select();
      if (helperDeleteErr) {
        assert.equal(
          helperDeleteErr.code,
          '42501',
          `Se esperaba código 42501 al borrar como ayudante, se recibió: ${helperDeleteErr.code}`
        );
      } else {
        assert.equal(
          helperDeleteRows?.length ?? 0,
          0,
          'El delete del ayudante no debe borrar filas'
        );
      }

      const { data: adminCheck, error: adminErr } = await ctx.adminClient
        .from('invitation_batches')
        .select('id, name, rsvp_deadline')
        .eq('event_id', ctx.eventMain.id);
      assert.equal(adminErr, null);
      assert.equal(
        adminCheck?.length,
        1,
        'No debe haberse creado ni borrado ninguna tanda'
      );
      assert.equal(adminCheck[0].id, batch.id);
      assert.equal(adminCheck[0].name, 'Tanda Visible Ayudante');
      assert.equal(
        new Date(adminCheck[0].rsvp_deadline).getTime(),
        new Date(deadline).getTime()
      );
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '6. Usuario no miembro del evento recibe lista vacía al consultar tandas y no puede crear una',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const deadline = isoOffset(Date.now(), 24 * DAY_MS);

    try {
      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Privada',
          rsvp_deadline: deadline,
        })
        .select()
        .single();
      assert.equal(createErr, null, `Error al crear tanda: ${createErr?.message}`);
      batchIds.push(batch.id);

      const { data: otherRows, error: otherReadErr } = await ctx.otherClient
        .from('invitation_batches')
        .select('*')
        .eq('event_id', ctx.eventMain.id);
      assert.equal(otherReadErr, null);
      assert.equal(
        otherRows?.length ?? 0,
        0,
        'Un usuario ajeno no debe ver tandas de otro evento'
      );

      const intruderId = crypto.randomUUID();
      const { error: otherInsertErr } = await ctx.otherClient
        .from('invitation_batches')
        .insert({
          id: intruderId,
          event_id: ctx.eventMain.id,
          name: 'Tanda Intrusa',
          rsvp_deadline: deadline,
        });
      assert.ok(otherInsertErr, 'Un usuario ajeno no debe poder crear tandas en el evento');
      assert.equal(
        otherInsertErr.code,
        '42501',
        `Se esperaba código 42501 al insertar como ajeno, se recibió: ${otherInsertErr.code}`
      );

      const { data: checkIntruder } = await ctx.adminClient
        .from('invitation_batches')
        .select('id')
        .eq('id', intruderId)
        .maybeSingle();
      assert.equal(checkIntruder, null);
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '7. anon sin sesión no puede leer ni escribir en invitation_batches',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];

    try {
      const { data: batch, error: createErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Para Probar Anon',
          rsvp_deadline: isoOffset(Date.now(), 24 * DAY_MS),
        })
        .select()
        .single();
      assert.equal(createErr, null);
      batchIds.push(batch.id);

      const { data: anonRows, error: anonReadErr } = await ctx.anonClient
        .from('invitation_batches')
        .select('*')
        .eq('id', batch.id);

      assert.equal(anonRows?.length ?? 0, 0, 'anon no debe recibir filas de invitation_batches');
      assert.ok(anonReadErr, 'anon debe recibir error de permisos al consultar invitation_batches');
      assert.equal(
        anonReadErr.code,
        '42501',
        `Se esperaba código 42501 para anon, se recibió: ${anonReadErr.code}`
      );

      const { error: anonInsertErr } = await ctx.anonClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Anon',
          rsvp_deadline: isoOffset(Date.now(), 24 * DAY_MS),
        });
      assert.ok(anonInsertErr, 'anon no debe poder insertar en invitation_batches');
      assert.equal(
        anonInsertErr.code,
        '42501',
        `Se esperaba código 42501 al insertar como anon, se recibió: ${anonInsertErr.code}`
      );
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '8. save_invitation y update directo con tanda de otro evento fallan con batch_not_in_event',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const invitationIds = [];

    try {
      const { data: otherBatch, error: batchErr } = await ctx.otherClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventOther.id,
          name: 'Tanda Del Otro Evento',
          rsvp_deadline: isoOffset(Date.now(), 24 * DAY_MS),
        })
        .select()
        .single();
      assert.equal(batchErr, null, `Error al crear tanda en evento ajeno: ${batchErr?.message}`);
      batchIds.push(otherBatch.id);

      const ownerAttemptInvId = crypto.randomUUID();
      const { error: ownerRpcErr } = await createInvitationWithGuest(ctx.ownerClient, {
        invitationId: ownerAttemptInvId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo Prop 8',
        batchId: otherBatch.id,
        setBatch: true,
      });
      assert.ok(ownerRpcErr, 'save_invitation como propietario con tanda ajena debe fallar');
      assert.match(
        ownerRpcErr.message,
        /batch_not_in_event/,
        `Se esperaba batch_not_in_event como propietario, se recibió: ${ownerRpcErr.message}`
      );

      const helperAttemptInvId = crypto.randomUUID();
      const { error: helperRpcErr } = await createInvitationWithGuest(ctx.helperClient, {
        invitationId: helperAttemptInvId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo Ayud 8',
        batchId: otherBatch.id,
        setBatch: true,
      });
      assert.ok(helperRpcErr, 'save_invitation como ayudante con tanda ajena debe fallar');
      assert.match(
        helperRpcErr.message,
        /batch_not_in_event/,
        `Se esperaba batch_not_in_event como ayudante, se recibió: ${helperRpcErr.message}`
      );

      const created = await createInvitationWithGuest(ctx.ownerClient, {
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo Directa 8',
      });
      assert.equal(created.error, null, `Error al crear invitación base: ${created.error?.message}`);
      invitationIds.push(created.invitationId);

      const { error: ownerDirectErr } = await ctx.ownerClient
        .from('invitations')
        .update({ batch_id: otherBatch.id })
        .eq('id', created.invitationId);
      assert.ok(ownerDirectErr, 'Update directo de propietario con tanda ajena debe fallar');
      assert.match(
        ownerDirectErr.message,
        /batch_not_in_event/,
        `Se esperaba batch_not_in_event en update directo, se recibió: ${ownerDirectErr.message}`
      );

      const { error: helperDirectErr } = await ctx.helperClient
        .from('invitations')
        .update({ batch_id: otherBatch.id })
        .eq('id', created.invitationId);
      assert.ok(helperDirectErr, 'Update directo de ayudante con tanda ajena debe fallar');
      assert.match(
        helperDirectErr.message,
        /batch_not_in_event/,
        `Se esperaba batch_not_in_event en update de ayudante, se recibió: ${helperDirectErr.message}`
      );

      const { data: storedInv } = await ctx.adminClient
        .from('invitations')
        .select('batch_id')
        .eq('id', created.invitationId)
        .single();
      assert.equal(storedInv?.batch_id, null, 'batch_id debe seguir nulo tras intentos fallidos');

      const { data: strayRows } = await ctx.adminClient
        .from('invitations')
        .select('id')
        .in('id', [ownerAttemptInvId, helperAttemptInvId]);
      assert.equal(strayRows?.length ?? 0, 0, 'Las llamadas rechazadas no deben crear filas');
    } finally {
      await cleanupRows({ invitationIds, batchIds });
    }
  }
);

test(
  '9. save_invitation respeta p_set_batch = true, false/omitido y retorno a primera tanda con null',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const invitationIds = [];

    try {
      const { data: batch, error: batchErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Segunda Tanda Prueba 9',
          rsvp_deadline: isoOffset(Date.now(), 25 * DAY_MS),
        })
        .select()
        .single();
      assert.equal(batchErr, null, `Error al crear tanda: ${batchErr?.message}`);
      batchIds.push(batch.id);

      const invId = crypto.randomUUID();
      const guestId = crypto.randomUUID();

      const created = await createInvitationWithGuest(ctx.ownerClient, {
        invitationId: invId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo 9',
        phone: '+573000000019',
        guestId,
        guestName: 'Invitado Ejemplo 9',
        batchId: batch.id,
        setBatch: true,
      });
      assert.equal(created.error, null, `Error al crear con tanda: ${created.error?.message}`);
      invitationIds.push(invId);
      assert.equal(created.data?.batch_id, batch.id, 'La creación debe asignar batch_id');

      // Versión anterior de la app: no envía p_batch_id ni p_set_batch.
      const legacyEdit = await createInvitationWithGuest(ctx.helperClient, {
        invitationId: invId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo 9 Legacy',
        phone: '+573000000019',
        guestId,
        guestName: 'Invitado Ejemplo 9',
        knownGuestIds: [guestId],
      });
      assert.equal(legacyEdit.error, null, `Error en edición sin parámetros nuevos: ${legacyEdit.error?.message}`);
      assert.equal(legacyEdit.data?.group_name, 'Familia Ejemplo 9 Legacy');
      assert.equal(
        legacyEdit.data?.batch_id,
        batch.id,
        'Omitir los parámetros de tanda debe conservar la tanda existente'
      );

      // p_set_batch = false explícito también ignora p_batch_id.
      const falseSetEdit = await createInvitationWithGuest(ctx.ownerClient, {
        invitationId: invId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo 9 False',
        phone: '+573000000019',
        guestId,
        guestName: 'Invitado Ejemplo 9',
        knownGuestIds: [guestId],
        batchId: null,
        setBatch: false,
      });
      assert.equal(falseSetEdit.error, null, `Error con p_set_batch = false: ${falseSetEdit.error?.message}`);
      assert.equal(
        falseSetEdit.data?.batch_id,
        batch.id,
        'p_set_batch = false debe conservar la tanda aunque p_batch_id sea null'
      );

      // p_set_batch = true y p_batch_id = null devuelve a la primera tanda.
      const backToFirst = await createInvitationWithGuest(ctx.ownerClient, {
        invitationId: invId,
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo 9 Primera',
        phone: '+573000000019',
        guestId,
        guestName: 'Invitado Ejemplo 9',
        knownGuestIds: [guestId],
        batchId: null,
        setBatch: true,
      });
      assert.equal(backToFirst.error, null, `Error al volver a primera tanda: ${backToFirst.error?.message}`);
      assert.equal(
        backToFirst.data?.batch_id,
        null,
        'p_set_batch = true con p_batch_id = null debe devolver la invitación a la primera tanda'
      );

      const { data: stored } = await ctx.adminClient
        .from('invitations')
        .select('batch_id')
        .eq('id', invId)
        .single();
      assert.equal(stored?.batch_id, null);
    } finally {
      await cleanupRows({ invitationIds, batchIds });
    }
  }
);

test(
  '10. Primera tanda vencida y segunda vigente: get_invitation y set_rsvp usan fecha efectiva por tanda',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const eventDeadline = isoOffset(now, -2 * DAY_MS);
    const batchDeadline = isoOffset(now, 5 * DAY_MS);
    const eventStartsAt = isoOffset(now, 15 * DAY_MS);

    const event = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TANDAS-10`,
      startsAt: eventStartsAt,
      rsvpDeadline: eventDeadline,
      createdBy: ctx.ownerUser.id,
    });

    const { data: batch2, error: batchErr } = await ctx.ownerClient
      .from('invitation_batches')
      .insert({
        event_id: event.id,
        name: 'Segunda Tanda Vigente',
        rsvp_deadline: batchDeadline,
      })
      .select()
      .single();
    assert.equal(batchErr, null, `Error al crear segunda tanda: ${batchErr?.message}`);

    const firstInv = await createInvitationWithGuest(ctx.ownerClient, {
      eventId: event.id,
      groupName: 'Familia Ejemplo Tanda 1',
      phone: '+573000000021',
      guestName: 'Invitado Tanda Uno',
      batchId: null,
      setBatch: true,
    });
    assert.equal(firstInv.error, null);

    const secondBatchInvs = [];
    for (let idx = 1; idx <= 3; idx += 1) {
      const created = await createInvitationWithGuest(ctx.ownerClient, {
        eventId: event.id,
        groupName: `Familia Ejemplo Tanda 2-${idx}`,
        phone: `+57300000003${idx}`,
        guestName: `Invitado Tanda Dos ${idx}`,
        batchId: batch2.id,
        setBatch: true,
      });
      assert.equal(created.error, null, `Error creando invitación ${idx} de segunda tanda`);
      secondBatchInvs.push(created);
    }

    const secondItem = secondBatchInvs[1];
    const lastItem = secondBatchInvs[2];

    // Primera tanda vencida: get_invitation.
    const { data: firstView, error: firstViewErr } = await ctx.anonClient.rpc(
      'get_invitation',
      { p_code: firstInv.data.code }
    );
    assert.equal(firstViewErr, null);
    assert.ok(firstView);
    assert.equal(firstView.can_respond, false, 'Primera tanda vencida debe tener can_respond = false');
    assert.equal(
      new Date(firstView.event.rsvp_deadline).getTime(),
      new Date(eventDeadline).getTime(),
      'Primera tanda debe mostrar la fecha del evento'
    );
    assert.deepEqual(
      Object.keys(firstView).sort(),
      ['can_respond', 'event', 'gifts_open', 'guests', 'invitation'],
      'get_invitation debe conservar exactamente las claves esperadas'
    );
    assert.equal(JSON.stringify(firstView).includes('batch_id'), false);

    // Segunda y última invitación de la segunda tanda vigente: get_invitation.
    for (const [label, item] of [
      ['segunda', secondItem],
      ['última', lastItem],
    ]) {
      const { data: view, error: viewErr } = await ctx.anonClient.rpc(
        'get_invitation',
        { p_code: item.data.code }
      );
      assert.equal(viewErr, null);
      assert.ok(view);
      assert.equal(
        view.can_respond,
        true,
        `La ${label} invitación de segunda tanda vigente debe tener can_respond = true`
      );
      assert.equal(
        new Date(view.event.rsvp_deadline).getTime(),
        new Date(batchDeadline).getTime(),
        `La ${label} invitación debe mostrar la fecha límite de su tanda`
      );
    }

    // set_rsvp en primera tanda vencida falla con deadline_passed.
    const { error: firstRsvpErr } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: firstInv.data.code,
      p_guest_id: firstInv.guestId,
      p_rsvp: 'accepted',
    });
    assert.ok(firstRsvpErr, 'set_rsvp en primera tanda vencida debe fallar');
    assert.match(
      firstRsvpErr.message,
      /deadline_passed/,
      `Se esperaba deadline_passed, se recibió: ${firstRsvpErr.message}`
    );

    // set_rsvp en la segunda y la última invitación de segunda tanda: aceptar, repetir y cambiar a declined.
    for (const [label, item] of [
      ['segunda', secondItem],
      ['última', lastItem],
    ]) {
      const { data: accept1, error: accept1Err } = await ctx.anonClient.rpc('set_rsvp', {
        p_code: item.data.code,
        p_guest_id: item.guestId,
        p_rsvp: 'accepted',
      });
      assert.equal(accept1Err, null, `Aceptar en ${label} invitación falló: ${accept1Err?.message}`);
      assert.equal(accept1.guests[0].rsvp, 'accepted');

      const { data: acceptRepeat, error: acceptRepeatErr } = await ctx.anonClient.rpc(
        'set_rsvp',
        {
          p_code: item.data.code,
          p_guest_id: item.guestId,
          p_rsvp: 'accepted',
        }
      );
      assert.equal(
        acceptRepeatErr,
        null,
        `Repetir accepted en ${label} invitación falló: ${acceptRepeatErr?.message}`
      );
      assert.equal(acceptRepeat.guests[0].rsvp, 'accepted');

      const { data: declineRes, error: declineErr } = await ctx.anonClient.rpc('set_rsvp', {
        p_code: item.data.code,
        p_guest_id: item.guestId,
        p_rsvp: 'declined',
      });
      assert.equal(
        declineErr,
        null,
        `Cambiar a declined en ${label} invitación falló: ${declineErr?.message}`
      );
      assert.equal(declineRes.guests[0].rsvp, 'declined');

      const { data: guestRow, error: guestCheckErr } = await ctx.adminClient
        .from('guests')
        .select('rsvp')
        .eq('id', item.guestId)
        .single();
      assert.equal(guestCheckErr, null);
      assert.equal(
        guestRow?.rsvp,
        'declined',
        `El cambio a declined en la ${label} invitación debe quedar persistido`
      );
    }
  }
);

test(
  '11. Tanda adicional vencida y primera tanda vigente: tanda vencida da deadline_passed y primera responde',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const firstDeadline = isoOffset(now, 10 * DAY_MS);
    const expiredBatchDeadline = isoOffset(now, -1 * DAY_MS);
    const eventStartsAt = isoOffset(now, 20 * DAY_MS);

    const event = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TANDAS-11`,
      startsAt: eventStartsAt,
      rsvpDeadline: firstDeadline,
      createdBy: ctx.ownerUser.id,
    });

    const { data: expiredBatch, error: batchErr } = await ctx.ownerClient
      .from('invitation_batches')
      .insert({
        event_id: event.id,
        name: 'Tanda Vencida',
        rsvp_deadline: expiredBatchDeadline,
      })
      .select()
      .single();
    assert.equal(batchErr, null, `Error al crear tanda vencida: ${batchErr?.message}`);

    const invFirst = await createInvitationWithGuest(ctx.ownerClient, {
      eventId: event.id,
      groupName: 'Familia Ejemplo Vigente 11',
      phone: '+573000000041',
      guestName: 'Invitado Vigente 11',
      batchId: null,
      setBatch: true,
    });
    assert.equal(invFirst.error, null);

    const invExpired = await createInvitationWithGuest(ctx.ownerClient, {
      eventId: event.id,
      groupName: 'Familia Ejemplo Vencida 11',
      phone: '+573000000042',
      guestName: 'Invitado Vencido 11',
      batchId: expiredBatch.id,
      setBatch: true,
    });
    assert.equal(invExpired.error, null);

    const { data: expiredView, error: expiredViewErr } = await ctx.anonClient.rpc(
      'get_invitation',
      { p_code: invExpired.data.code }
    );
    assert.equal(expiredViewErr, null);
    assert.equal(expiredView.can_respond, false);
    assert.equal(
      new Date(expiredView.event.rsvp_deadline).getTime(),
      new Date(expiredBatchDeadline).getTime()
    );

    const { error: expiredRsvpErr } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: invExpired.data.code,
      p_guest_id: invExpired.guestId,
      p_rsvp: 'accepted',
    });
    assert.ok(expiredRsvpErr, 'Responder en tanda vencida debe fallar');
    assert.match(
      expiredRsvpErr.message,
      /deadline_passed/,
      `Se esperaba deadline_passed, se recibió: ${expiredRsvpErr.message}`
    );

    const { data: firstView, error: firstViewErr } = await ctx.anonClient.rpc(
      'get_invitation',
      { p_code: invFirst.data.code }
    );
    assert.equal(firstViewErr, null);
    assert.equal(firstView.can_respond, true);
    assert.equal(
      new Date(firstView.event.rsvp_deadline).getTime(),
      new Date(firstDeadline).getTime()
    );

    const { data: firstRsvpData, error: firstRsvpErr } = await ctx.anonClient.rpc(
      'set_rsvp',
      {
        p_code: invFirst.data.code,
        p_guest_id: invFirst.guestId,
        p_rsvp: 'accepted',
      }
    );
    assert.equal(firstRsvpErr, null, `La primera tanda vigente debe poder responder: ${firstRsvpErr?.message}`);
    assert.equal(firstRsvpData.guests[0].rsvp, 'accepted');
  }
);

test(
  '12. Borrar tanda con invitaciones falla por llave foránea (23503 / invitations_batch_id_fkey) y sin invitaciones funciona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const invitationIds = [];
    const deadline = isoOffset(Date.now(), 24 * DAY_MS);

    try {
      const { data: batchUsed, error: usedErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Con Invitaciones',
          rsvp_deadline: deadline,
        })
        .select()
        .single();
      assert.equal(usedErr, null);
      batchIds.push(batchUsed.id);

      const { data: batchEmpty, error: emptyErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'Tanda Vacía',
          rsvp_deadline: deadline,
        })
        .select()
        .single();
      assert.equal(emptyErr, null);
      batchIds.push(batchEmpty.id);

      const inv = await createInvitationWithGuest(ctx.ownerClient, {
        eventId: ctx.eventMain.id,
        groupName: 'Familia Ejemplo 12',
        phone: '+573000000051',
        batchId: batchUsed.id,
        setBatch: true,
      });
      assert.equal(inv.error, null);
      invitationIds.push(inv.invitationId);

      const { error: delUsedErr } = await ctx.ownerClient
        .from('invitation_batches')
        .delete()
        .eq('id', batchUsed.id);

      assert.ok(delUsedErr, 'No debe permitir borrar una tanda que tiene invitaciones');
      assert.equal(
        delUsedErr.code,
        '23503',
        `Se esperaba código 23503, se recibió: ${delUsedErr.code}`
      );
      assert.match(
        delUsedErr.message,
        /invitations_batch_id_fkey/,
        `Se esperaba referencia a invitations_batch_id_fkey, se recibió: ${delUsedErr.message}`
      );

      const { error: delEmptyErr } = await ctx.ownerClient
        .from('invitation_batches')
        .delete()
        .eq('id', batchEmpty.id);
      assert.equal(
        delEmptyErr,
        null,
        `Borrar tanda sin invitaciones debe funcionar: ${delEmptyErr?.message}`
      );

      const { data: checkEmpty } = await ctx.adminClient
        .from('invitation_batches')
        .select('id')
        .eq('id', batchEmpty.id)
        .maybeSingle();
      assert.equal(checkEmpty, null, 'La tanda vacía debe haber sido eliminada');

      const { data: checkUsed } = await ctx.adminClient
        .from('invitation_batches')
        .select('id')
        .eq('id', batchUsed.id)
        .maybeSingle();
      assert.equal(checkUsed?.id, batchUsed.id, 'La tanda con invitaciones debe seguir existiendo');
    } finally {
      await cleanupRows({ invitationIds, batchIds });
    }
  }
);

test(
  '13. Borrar el evento completo con cliente admin teniendo tandas con invitaciones elimina evento, tandas e invitaciones',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const eventCascade = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TANDAS-CASCADE`,
      startsAt: isoOffset(now, 30 * DAY_MS),
      rsvpDeadline: isoOffset(now, 20 * DAY_MS),
      createdBy: ctx.ownerUser.id,
    });

    const { data: batch, error: batchErr } = await ctx.ownerClient
      .from('invitation_batches')
      .insert({
        event_id: eventCascade.id,
        name: 'Tanda Cascada',
        rsvp_deadline: isoOffset(now, 25 * DAY_MS),
      })
      .select()
      .single();
    assert.equal(batchErr, null);

    const inv = await createInvitationWithGuest(ctx.ownerClient, {
      eventId: eventCascade.id,
      groupName: 'Familia Ejemplo Cascada 13',
      phone: '+573000000061',
      guestName: 'Invitado Cascada 13',
      batchId: batch.id,
      setBatch: true,
    });
    assert.equal(inv.error, null);

    const { error: delEventErr } = await ctx.adminClient
      .from('events')
      .delete()
      .eq('id', eventCascade.id);
    assert.equal(
      delEventErr,
      null,
      `Borrar el evento completo con tandas e invitaciones debe funcionar: ${delEventErr?.message}`
    );

    const { data: eventLeft } = await ctx.adminClient
      .from('events')
      .select('id')
      .eq('id', eventCascade.id);
    assert.equal(eventLeft?.length ?? 0, 0, 'No debe quedar el evento');

    const { data: batchesLeft } = await ctx.adminClient
      .from('invitation_batches')
      .select('id')
      .eq('event_id', eventCascade.id);
    assert.equal(batchesLeft?.length ?? 0, 0, 'No deben quedar tandas del evento borrado');

    const { data: invitationsLeft } = await ctx.adminClient
      .from('invitations')
      .select('id')
      .eq('event_id', eventCascade.id);
    assert.equal(invitationsLeft?.length ?? 0, 0, 'No deben quedar invitaciones del evento borrado');

    const { data: guestsLeft } = await ctx.adminClient
      .from('guests')
      .select('id')
      .eq('event_id', eventCascade.id);
    assert.equal(guestsLeft?.length ?? 0, 0, 'No deben quedar invitados del evento borrado');
  }
);

test(
  '14. Nombre de tanda valida límites: solo espacios y 61 caracteres fallan con invitation_batches_name_length; 60 se acepta',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const batchIds = [];
    const deadline = isoOffset(Date.now(), 24 * DAY_MS);

    try {
      const { error: blankErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: '   ',
          rsvp_deadline: deadline,
        });
      assert.ok(blankErr, 'Nombre solo con espacios debe fallar');
      assert.equal(blankErr.code, '23514');
      assert.match(blankErr.message, /invitation_batches_name_length/);

      const { error: longErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'a'.repeat(61),
          rsvp_deadline: deadline,
        });
      assert.ok(longErr, 'Nombre de 61 caracteres debe fallar');
      assert.equal(longErr.code, '23514');
      assert.match(longErr.message, /invitation_batches_name_length/);

      const { data: maxBatch, error: maxErr } = await ctx.ownerClient
        .from('invitation_batches')
        .insert({
          event_id: ctx.eventMain.id,
          name: 'a'.repeat(60),
          rsvp_deadline: deadline,
        })
        .select()
        .single();
      assert.equal(maxErr, null, `Nombre de 60 caracteres debe aceptarse: ${maxErr?.message}`);
      batchIds.push(maxBatch.id);
    } finally {
      await cleanupRows({ batchIds });
    }
  }
);

test(
  '15. save_invitation con una tanda inexistente falla por llave foránea al insertar en invitations',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error, invitationId } = await createInvitationWithGuest(ctx.ownerClient, {
      eventId: ctx.eventMain.id,
      groupName: 'Familia Ejemplo Tanda Borrada',
      phone: '+573000000099',
      batchId: crypto.randomUUID(),
      setBatch: true,
    });

    try {
      assert.ok(error, 'Debe fallar al asignar una tanda que no existe');
      assert.equal(error.code, '23503');
      assert.match(error.message, /insert or update on table "invitations"/);
      assert.match(error.message, /invitations_batch_id_fkey/);

      const { data: saved } = await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', invitationId)
        .maybeSingle();
      assert.equal(saved, null, 'La invitación no debe quedar guardada');
    } finally {
      await cleanupRows({ invitationIds: [invitationId] });
    }
  }
);
