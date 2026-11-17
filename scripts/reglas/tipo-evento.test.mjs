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

const VALID_EVENT_TYPES = [
  'baby_shower',
  'baptism',
  'birthday',
  'wedding',
  'anniversary',
  'other',
];

const ctx = {
  ...createEmptyContext(),
  run: `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
  ownerUser: null,
  ownerClient: null,
  helperUser: null,
  helperClient: null,
  otherUser: null,
  otherClient: null,
  otherTeam: null,
  eventMain: null,
  eventOther: null,
};

function isoOffset(baseMs, offsetMs) {
  return new Date(baseMs + offsetMs).toISOString();
}

async function createEventRow(client, { name, startsAt, rsvpDeadline, createdBy }) {
  const { data, error } = await client
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

async function deleteEventRow(eventId) {
  if (!eventId) {
    return;
  }
  await ctx.adminClient.from('events').delete().eq('id', eventId);
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
  }
) {
  const { data, error } = await client.rpc('save_invitation', {
    p_invitation_id: invitationId,
    p_event_id: eventId,
    p_group_name: groupName,
    p_phone: phone,
    p_guests: [{ id: guestId, full_name: guestName }],
    p_kind: 'group',
    p_known_guest_ids: [],
  });
  return { data, error, invitationId, guestId };
}

before(
  async () => {
    const { url, publishableKey, secretKey } = getEnvConfig();
    ctx.adminClient = createAdminClient(url, secretKey);
    ctx.anonClient = createAnonClient(url, publishableKey);

    ctx.ownerUser = await createTestUser(ctx.adminClient, ctx, 'prop-tipo-evento');
    ctx.helperUser = await createTestUser(ctx.adminClient, ctx, 'ayud-tipo-evento');
    ctx.otherUser = await createTestUser(ctx.adminClient, ctx, 'otro-tipo-evento');

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

    const { data: team, error: teamErr } = await ctx.adminClient
      .from('teams')
      .insert({ name: `PRUEBA-${ctx.run}-EQUIPO` })
      .select()
      .single();
    if (teamErr || !team) {
      throw new Error(
        `No se pudo crear el equipo principal: ${teamErr?.message ?? 'sin datos'}`
      );
    }
    ctx.team = team;

    const { error: teamMembersErr } = await ctx.adminClient
      .from('team_members')
      .insert([
        { team_id: team.id, user_id: ctx.ownerUser.id, role: 'owner' },
        { team_id: team.id, user_id: ctx.helperUser.id, role: 'helper' },
      ]);
    if (teamMembersErr) {
      throw new Error(
        `No se pudieron agregar los miembros del equipo principal: ${teamMembersErr.message}`
      );
    }

    const { data: otherTeam, error: otherTeamErr } = await ctx.adminClient
      .from('teams')
      .insert({ name: `PRUEBA-${ctx.run}-EQUIPO-OTRO` })
      .select()
      .single();
    if (otherTeamErr || !otherTeam) {
      throw new Error(
        `No se pudo crear el otro equipo: ${otherTeamErr?.message ?? 'sin datos'}`
      );
    }
    ctx.otherTeam = otherTeam;

    const { error: otherTeamMemberErr } = await ctx.adminClient
      .from('team_members')
      .insert({ team_id: otherTeam.id, user_id: ctx.otherUser.id, role: 'owner' });
    if (otherTeamMemberErr) {
      throw new Error(
        `No se pudo agregar el propietario del otro equipo: ${otherTeamMemberErr.message}`
      );
    }

    const now = Date.now();
    const in30Days = isoOffset(now, 30 * DAY_MS);
    const in20Days = isoOffset(now, 20 * DAY_MS);

    ctx.eventMain = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TIPO-EVENTO-MAIN`,
      startsAt: in30Days,
      rsvpDeadline: in20Days,
      createdBy: ctx.ownerUser.id,
    });
    if (ctx.eventMain.team_id !== ctx.team.id) {
      throw new Error(
        `El evento principal no quedó asociado al equipo esperado: ${ctx.eventMain.team_id}`
      );
    }

    const { data: helperMember, error: helperCheckErr } = await ctx.adminClient
      .from('event_members')
      .select('role')
      .eq('event_id', ctx.eventMain.id)
      .eq('user_id', ctx.helperUser.id)
      .single();
    if (helperCheckErr || helperMember?.role !== 'helper') {
      throw new Error(
        `El ayudante no quedó asociado al evento principal: ${helperCheckErr?.message ?? helperMember?.role}`
      );
    }

    ctx.eventOther = await createEventRow(ctx.adminClient, {
      name: `PRUEBA-${ctx.run}-TIPO-EVENTO-OTRO`,
      startsAt: in30Days,
      rsvpDeadline: in20Days,
      createdBy: ctx.otherUser.id,
    });
    if (ctx.eventOther.team_id !== ctx.otherTeam.id) {
      throw new Error(
        `El evento del otro equipo no quedó asociado al otro equipo: ${ctx.eventOther.team_id}`
      );
    }
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
  '1. Evento creado sin event_type queda con event_type = other y honoree_name = null',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    let createdId = null;

    try {
      const { data: created, error: createErr } = await ctx.ownerClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-SIN-TIPO`,
          starts_at: isoOffset(now, 30 * DAY_MS),
          rsvp_deadline: isoOffset(now, 20 * DAY_MS),
          created_by: ctx.ownerUser.id,
        })
        .select('id, event_type, honoree_name')
        .single();

      assert.equal(createErr, null, `Error al crear evento sin tipo: ${createErr?.message}`);
      assert.ok(created?.id, 'Se esperaba recibir el id del evento creado');
      createdId = created.id;
      ctx.createdEventIds.push(createdId);

      assert.equal(created.event_type, 'other');
      assert.equal(created.honoree_name, null);

      const { data: stored, error: readErr } = await ctx.adminClient
        .from('events')
        .select('event_type, honoree_name')
        .eq('id', createdId)
        .single();
      assert.equal(readErr, null);
      assert.equal(stored.event_type, 'other');
      assert.equal(stored.honoree_name, null);
    } finally {
      await deleteEventRow(createdId);
    }
  }
);

test(
  '2. event_type = party falla con código 23514 y restricción events_event_type_check',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const rejectedId = crypto.randomUUID();
    let eventId = null;

    try {
      const { error: insertErr } = await ctx.ownerClient.from('events').insert({
        id: rejectedId,
        name: `PRUEBA-${ctx.run}-PARTY-INSERT`,
        starts_at: isoOffset(now, 30 * DAY_MS),
        rsvp_deadline: isoOffset(now, 20 * DAY_MS),
        created_by: ctx.ownerUser.id,
        event_type: 'party',
      });

      assert.ok(insertErr, 'Debe fallar insertar un evento con event_type = party');
      assert.equal(
        insertErr.code,
        '23514',
        `Se esperaba código 23514 al insertar party, se recibió: ${insertErr.code}`
      );
      assert.match(
        insertErr.message,
        /events_event_type_check/,
        `Se esperaba events_event_type_check, se recibió: ${insertErr.message}`
      );

      const { data: strayRow } = await ctx.adminClient
        .from('events')
        .select('id')
        .eq('id', rejectedId)
        .maybeSingle();
      assert.equal(strayRow, null, 'El evento con event_type inválido no debe haberse guardado');

      const event = await createEventRow(ctx.ownerClient, {
        name: `PRUEBA-${ctx.run}-PARTY-UPDATE`,
        startsAt: isoOffset(now, 30 * DAY_MS),
        rsvpDeadline: isoOffset(now, 20 * DAY_MS),
        createdBy: ctx.ownerUser.id,
      });
      eventId = event.id;

      const { error: updateErr } = await ctx.ownerClient
        .from('events')
        .update({ event_type: 'party' })
        .eq('id', eventId);

      assert.ok(updateErr, 'Debe fallar actualizar un evento a event_type = party');
      assert.equal(
        updateErr.code,
        '23514',
        `Se esperaba código 23514 al actualizar a party, se recibió: ${updateErr.code}`
      );
      assert.match(
        updateErr.message,
        /events_event_type_check/,
        `Se esperaba events_event_type_check al actualizar, se recibió: ${updateErr.message}`
      );

      const { data: stored, error: readErr } = await ctx.adminClient
        .from('events')
        .select('event_type')
        .eq('id', eventId)
        .single();
      assert.equal(readErr, null);
      assert.equal(stored.event_type, 'other');
    } finally {
      await deleteEventRow(rejectedId);
      await deleteEventRow(eventId);
    }
  }
);

test(
  '3. honoree_name valida límites: 60 caracteres se guarda; 61 y solo espacios fallan con 23514 y events_honoree_name_check',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    let eventId = null;

    try {
      const event = await createEventRow(ctx.ownerClient, {
        name: `PRUEBA-${ctx.run}-HONOREE-LIMITES`,
        startsAt: isoOffset(now, 30 * DAY_MS),
        rsvpDeadline: isoOffset(now, 20 * DAY_MS),
        createdBy: ctx.ownerUser.id,
      });
      eventId = event.id;

      const valid60 = 'a'.repeat(60);
      const { data: updated60, error: err60 } = await ctx.ownerClient
        .from('events')
        .update({ honoree_name: valid60 })
        .eq('id', eventId)
        .select('honoree_name')
        .single();

      assert.equal(err60, null, `honoree_name de 60 caracteres debe guardarse: ${err60?.message}`);
      assert.equal(updated60.honoree_name, valid60);

      const { error: err61 } = await ctx.ownerClient
        .from('events')
        .update({ honoree_name: 'a'.repeat(61) })
        .eq('id', eventId);

      assert.ok(err61, 'honoree_name de 61 caracteres debe fallar');
      assert.equal(
        err61.code,
        '23514',
        `Se esperaba código 23514 para 61 caracteres, se recibió: ${err61.code}`
      );
      assert.match(
        err61.message,
        /events_honoree_name_check/,
        `Se esperaba events_honoree_name_check para 61 caracteres, se recibió: ${err61.message}`
      );

      const { error: errBlank } = await ctx.ownerClient
        .from('events')
        .update({ honoree_name: '   ' })
        .eq('id', eventId);

      assert.ok(errBlank, 'honoree_name solo con espacios debe fallar');
      assert.equal(
        errBlank.code,
        '23514',
        `Se esperaba código 23514 para solo espacios, se recibió: ${errBlank.code}`
      );
      assert.match(
        errBlank.message,
        /events_honoree_name_check/,
        `Se esperaba events_honoree_name_check para solo espacios, se recibió: ${errBlank.message}`
      );

      const { data: stored, error: readErr } = await ctx.adminClient
        .from('events')
        .select('honoree_name')
        .eq('id', eventId)
        .single();
      assert.equal(readErr, null);
      assert.equal(
        stored.honoree_name,
        valid60,
        'honoree_name debe conservar el valor de 60 caracteres tras los rechazos'
      );
    } finally {
      await deleteEventRow(eventId);
    }
  }
);

test(
  '4. Cada uno de los seis tipos válidos de event_type se guarda y se comprueba leído',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    let eventId = null;

    try {
      const event = await createEventRow(ctx.ownerClient, {
        name: `PRUEBA-${ctx.run}-SEIS-TIPOS`,
        startsAt: isoOffset(now, 30 * DAY_MS),
        rsvpDeadline: isoOffset(now, 20 * DAY_MS),
        createdBy: ctx.ownerUser.id,
      });
      eventId = event.id;

      for (const eventType of VALID_EVENT_TYPES) {
        const { error: updateErr } = await ctx.ownerClient
          .from('events')
          .update({ event_type: eventType })
          .eq('id', eventId);

        assert.equal(
          updateErr,
          null,
          `No debe fallar al actualizar event_type a ${eventType}: ${updateErr?.message}`
        );

        const { data: stored, error: readErr } = await ctx.adminClient
          .from('events')
          .select('event_type')
          .eq('id', eventId)
          .single();
        assert.equal(readErr, null);
        assert.equal(
          stored.event_type,
          eventType,
          `El valor leído de event_type debe ser ${eventType}`
        );
      }
    } finally {
      await deleteEventRow(eventId);
    }
  }
);

test(
  '5. get_invitation como anon devuelve event_type y honoree_name junto con las claves de siempre',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    let eventId = null;

    try {
      const event = await createEventRow(ctx.ownerClient, {
        name: `PRUEBA-${ctx.run}-GET-INVITATION`,
        startsAt: isoOffset(now, 30 * DAY_MS),
        rsvpDeadline: isoOffset(now, 20 * DAY_MS),
        createdBy: ctx.ownerUser.id,
      });
      eventId = event.id;

      const inv = await createInvitationWithGuest(ctx.ownerClient, {
        eventId,
        groupName: `Familia Ejemplo ${ctx.run}`,
        guestName: 'Invitado Ejemplo 5',
      });
      assert.equal(inv.error, null, `Error al crear invitación de prueba: ${inv.error?.message}`);
      const invitationCode = inv.data.code;

      for (const [label, expectedType, expectedHonoree] of [
        ['baby_shower con nombre', 'baby_shower', 'Ana y Luis'],
        ['other con honoree_name null', 'other', null],
      ]) {
        const { error: updateErr } = await ctx.ownerClient
          .from('events')
          .update({ event_type: expectedType, honoree_name: expectedHonoree })
          .eq('id', eventId);
        assert.equal(updateErr, null, `Error al fijar ${label}: ${updateErr?.message}`);

        const { data: view, error: viewErr } = await ctx.anonClient.rpc(
          'get_invitation',
          { p_code: invitationCode }
        );
        assert.equal(
          viewErr,
          null,
          `Error en get_invitation (${label}): ${viewErr?.message}`
        );
        assert.ok(view?.event, `Se esperaba recibir data.event (${label})`);
        assert.equal(view.event.event_type, expectedType);
        assert.equal(view.event.honoree_name, expectedHonoree);
        assert.equal(view.event.name, event.name);
        assert.equal(view.event.theme_id, event.theme_id);
        assert.equal(
          new Date(view.event.starts_at).getTime(),
          new Date(event.starts_at).getTime()
        );
        assert.equal(
          new Date(view.event.rsvp_deadline).getTime(),
          new Date(event.rsvp_deadline).getTime()
        );
      }
    } finally {
      await deleteEventRow(eventId);
    }
  }
);

test(
  '6. El propietario del evento actualiza event_type y honoree_name con su cliente autenticado',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: updated, error: updateErr } = await ctx.ownerClient
      .from('events')
      .update({ event_type: 'wedding', honoree_name: 'Ana y Luis' })
      .eq('id', ctx.eventMain.id)
      .select('event_type, honoree_name')
      .single();

    assert.equal(
      updateErr,
      null,
      `El propietario debe poder actualizar event_type y honoree_name: ${updateErr?.message}`
    );
    assert.equal(updated.event_type, 'wedding');
    assert.equal(updated.honoree_name, 'Ana y Luis');

    const { data: stored, error: readErr } = await ctx.adminClient
      .from('events')
      .select('event_type, honoree_name')
      .eq('id', ctx.eventMain.id)
      .single();
    assert.equal(readErr, null);
    assert.equal(stored.event_type, 'wedding');
    assert.equal(stored.honoree_name, 'Ana y Luis');
  }
);

async function assertBlockedHonoreeUpdate(
  client,
  actorLabel,
  initialHonoree,
  attemptedHonoree
) {
  const { error: seedErr } = await ctx.adminClient
    .from('events')
    .update({ honoree_name: initialHonoree })
    .eq('id', ctx.eventMain.id);
  assert.equal(seedErr, null, `Error preparando la prueba (${actorLabel}): ${seedErr?.message}`);

  const { data: updatedRows, error: updateErr } = await client
    .from('events')
    .update({ honoree_name: attemptedHonoree })
    .eq('id', ctx.eventMain.id)
    .select();

  if (updateErr) {
    assert.equal(
      updateErr.code,
      '42501',
      `Se esperaba código 42501 al actualizar como ${actorLabel}, se recibió: ${updateErr.code}`
    );
  } else {
    assert.equal(
      updatedRows?.length ?? 0,
      0,
      `El update de ${actorLabel} no debe modificar filas`
    );
  }

  const { data: stored, error: readErr } = await ctx.adminClient
    .from('events')
    .select('honoree_name')
    .eq('id', ctx.eventMain.id)
    .single();
  assert.equal(readErr, null);
  assert.equal(
    stored.honoree_name,
    initialHonoree,
    `honoree_name no debe haber cambiado tras el intento de ${actorLabel}`
  );
}

test(
  '7. El ayudante del evento intenta actualizar honoree_name y no cambia en base de datos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    await assertBlockedHonoreeUpdate(
      ctx.helperClient,
      'ayudante',
      'Nombre Protegido 7',
      'Alterado Por Ayudante'
    );
  }
);

test(
  '8. Un usuario autenticado de otro equipo intenta actualizar honoree_name y no cambia en base de datos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    await assertBlockedHonoreeUpdate(
      ctx.otherClient,
      'usuario de otro equipo',
      'Nombre Protegido 8',
      'Alterado Por Otro Equipo'
    );
  }
);
