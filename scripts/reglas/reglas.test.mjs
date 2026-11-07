import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import {
  createAuthenticatedClient,
  createEmptyContext,
  createTestUser,
  getEnvConfig,
  setupTestContext,
  teardownTestContext,
} from './helpers.mjs';

const TEST_TIMEOUT_MS = 30_000;
const ctx = createEmptyContext();

before(
  async () => {
    await setupTestContext(ctx);
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
  '1. Sin sesión no se puede leer ninguna tabla',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const tables = [
      'events',
      'event_members',
      'invitations',
      'guests',
      'gifts',
      'gift_reservations',
    ];

    for (const table of tables) {
      const { data, error } = await ctx.anonClient
        .from(table)
        .select('*')
        .limit(1);

      const rows = data ?? [];
      assert.equal(
        rows.length,
        0,
        `Se esperaba que la tabla ${table} no devolviera ninguna fila sin sesión`
      );
      assert.ok(
        Boolean(error) || Array.isArray(data),
        `Se esperaba un error de permisos o una lista vacía al consultar ${table} sin sesión`
      );
    }
  }
);

test(
  '2. get_invitation con el código A devuelve solo las personas de A y ningún teléfono',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data, error } = await ctx.anonClient.rpc('get_invitation', {
      p_code: ctx.invitationA.code,
    });

    assert.equal(
      error,
      null,
      'Se esperaba que get_invitation con el código A no devolviera error'
    );
    assert.ok(
      data,
      'Se esperaba recibir el objeto de la invitación A desde get_invitation'
    );

    const returnedIds = (data.guests ?? []).map((guest) => guest.id).sort();
    const expectedIds = ctx.guestsA.map((guest) => guest.id).sort();

    assert.equal(
      returnedIds.length,
      2,
      'Se esperaba que la invitación A devolviera exactamente dos personas'
    );
    assert.deepEqual(
      returnedIds,
      expectedIds,
      'Se esperaba que las personas devueltas coincidieran por id con las de la invitación A'
    );

    const serialized = JSON.stringify(data);
    assert.equal(
      serialized.includes('phone'),
      false,
      'Se esperaba que el JSON de get_invitation no contuviera la clave phone'
    );
    assert.equal(
      serialized.includes('+57'),
      false,
      'Se esperaba que el JSON de get_invitation no contuviera ningún teléfono con +57'
    );
  }
);

test(
  '3. Un código inexistente devuelve null; con guiones o minúsculas funciona igual',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: missingData, error: missingError } =
      await ctx.anonClient.rpc('get_invitation', {
        p_code: 'NOEXISTE00',
      });

    assert.equal(
      missingError,
      null,
      'Se esperaba que get_invitation con código inexistente no fallara con error'
    );
    assert.equal(
      missingData,
      null,
      'Se esperaba que get_invitation con un código inexistente devolviera null'
    );

    const rawCode = ctx.invitationA.code;
    const formattedCode =
      `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}-${rawCode.slice(8)}`.toLowerCase();

    const { data: formattedData, error: formattedError } =
      await ctx.anonClient.rpc('get_invitation', {
        p_code: formattedCode,
      });

    assert.equal(
      formattedError,
      null,
      'Se esperaba que get_invitation con guiones y minúsculas no devolviera error'
    );
    assert.ok(
      formattedData,
      'Se esperaba recibir datos al consultar con el código en minúsculas y con guiones'
    );
    assert.equal(
      formattedData.invitation?.id,
      ctx.invitationA.id,
      'Se esperaba que el código con guiones y minúsculas devolviera la misma invitación A'
    );
  }
);

test(
  '4. set_rsvp con una persona de B usando el código A falla con guest_not_in_invitation',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: ctx.invitationA.code,
      p_guest_id: ctx.guestB.id,
      p_rsvp: 'accepted',
    });

    assert.ok(
      error,
      'Se esperaba un error al confirmar una persona de la invitación B usando el código A'
    );
    assert.ok(
      error.message.includes('guest_not_in_invitation'),
      `Se esperaba el error guest_not_in_invitation, pero se recibió: ${error.message}`
    );
  }
);

test(
  '5. set_rsvp en un evento con fecha límite vencida falla con deadline_passed',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: ctx.invitationExpired.code,
      p_guest_id: ctx.guestExpired.id,
      p_rsvp: 'accepted',
    });

    assert.ok(
      error,
      'Se esperaba un error al responder en un evento cuya fecha límite ya venció'
    );
    assert.ok(
      error.message.includes('deadline_passed'),
      `Se esperaba el error deadline_passed, pero se recibió: ${error.message}`
    );
  }
);

test(
  '6. Dos invitaciones apartan el mismo regalo único con Promise.all: exactamente una lo logra y la otra recibe already_reserved',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const [resultA, resultB] = await Promise.all([
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: ctx.giftXUnique.id,
      }),
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationB.code,
        p_gift_id: ctx.giftXUnique.id,
      }),
    ]);

    const attempts = [
      { code: ctx.invitationA.code, response: resultA },
      { code: ctx.invitationB.code, response: resultB },
    ];

    const succeeded = attempts.filter((item) => !item.response.error);
    const failed = attempts.filter((item) => Boolean(item.response.error));

    assert.equal(
      succeeded.length,
      1,
      'Se esperaba que exactamente una invitación lograra apartar el regalo único'
    );
    assert.equal(
      failed.length,
      1,
      'Se esperaba que exactamente una invitación fallara al apartar el regalo único'
    );

    const winner = succeeded[0];
    const loser = failed[0];
    ctx.uniqueGiftWinnerCode = winner.code;
    ctx.uniqueGiftLoserCode = loser.code;

    assert.ok(
      loser.response.error.message.includes('already_reserved'),
      `Se esperaba que la invitación perdedora recibiera already_reserved, pero recibió: ${loser.response.error.message}`
    );

    const { data: winnerGifts, error: winnerError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: winner.code,
      });
    assert.equal(
      winnerError,
      null,
      'Se esperaba consultar get_gifts del ganador sin error'
    );
    const uniqueForWinner = (winnerGifts ?? []).find(
      (gift) => gift.id === ctx.giftXUnique.id
    );
    assert.ok(
      uniqueForWinner,
      'Se esperaba encontrar el regalo único en la lista devuelta al ganador'
    );
    assert.equal(
      uniqueForWinner.reserved_by_me,
      true,
      'Se esperaba que el ganador viera reserved_by_me en true para el regalo único'
    );

    const { data: loserGifts, error: loserError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: loser.code,
      });
    assert.equal(
      loserError,
      null,
      'Se esperaba consultar get_gifts del perdedor sin error'
    );
    const uniqueForLoser = (loserGifts ?? []).find(
      (gift) => gift.id === ctx.giftXUnique.id
    );
    assert.ok(
      uniqueForLoser,
      'Se esperaba encontrar el regalo único en la lista devuelta al perdedor'
    );
    assert.equal(
      uniqueForLoser.taken,
      true,
      'Se esperaba que el perdedor viera taken en true para el regalo único'
    );
  }
);

test(
  '7. Dos invitaciones eligen el mismo regalo repetible: ambas lo logran',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const [resultA, resultB] = await Promise.all([
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: ctx.giftXRepeatable.id,
      }),
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationB.code,
        p_gift_id: ctx.giftXRepeatable.id,
      }),
    ]);

    assert.equal(
      resultA.error,
      null,
      'Se esperaba que la invitación A pudiera apartar el regalo repetible sin error'
    );
    assert.equal(
      resultB.error,
      null,
      'Se esperaba que la invitación B pudiera apartar el regalo repetible sin error'
    );

    const { data: giftsA, error: giftsAError } = await ctx.anonClient.rpc(
      'get_gifts',
      { p_code: ctx.invitationA.code }
    );
    assert.equal(
      giftsAError,
      null,
      'Se esperaba consultar los regalos de la invitación A sin error'
    );
    const repeatableForA = (giftsA ?? []).find(
      (gift) => gift.id === ctx.giftXRepeatable.id
    );
    assert.equal(
      repeatableForA?.reserved_by_me,
      true,
      'Se esperaba que la invitación A viera reserved_by_me en true para el regalo repetible'
    );

    const { data: giftsB, error: giftsBError } = await ctx.anonClient.rpc(
      'get_gifts',
      { p_code: ctx.invitationB.code }
    );
    assert.equal(
      giftsBError,
      null,
      'Se esperaba consultar los regalos de la invitación B sin error'
    );
    const repeatableForB = (giftsB ?? []).find(
      (gift) => gift.id === ctx.giftXRepeatable.id
    );
    assert.equal(
      repeatableForB?.reserved_by_me,
      true,
      'Se esperaba que la invitación B viera reserved_by_me en true para el regalo repetible'
    );
  }
);

test(
  '8. Una invitación no puede liberar un regalo apartado por otra (not_reserved_by_you)',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    assert.ok(
      ctx.uniqueGiftLoserCode,
      'Se esperaba contar con el código de la invitación perdedora del caso 6'
    );

    const { error } = await ctx.anonClient.rpc('release_gift', {
      p_code: ctx.uniqueGiftLoserCode,
      p_gift_id: ctx.giftXUnique.id,
    });

    assert.ok(
      error,
      'Se esperaba un error cuando una invitación intenta liberar un regalo apartado por otra'
    );
    assert.ok(
      error.message.includes('not_reserved_by_you'),
      `Se esperaba el error not_reserved_by_you, pero se recibió: ${error.message}`
    );
  }
);

test(
  '9. Un ayudante crea, edita y borra invitaciones, pero no lee gifts ni gift_reservations',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: createdInvitation, error: createInvError } =
      await ctx.helperXClient
        .from('invitations')
        .insert({
          event_id: ctx.eventX.id,
          group_name: 'Familia Creada Por Ayudante',
          phone: '+573000000099',
        })
        .select()
        .single();

    assert.equal(
      createInvError,
      null,
      'Se esperaba que el ayudante pudiera crear una invitación en el evento X'
    );
    assert.ok(
      createdInvitation?.id,
      'Se esperaba recibir la invitación creada con su id'
    );

    const { data: createdGuest, error: createGuestError } =
      await ctx.helperXClient
        .from('guests')
        .insert({
          invitation_id: createdInvitation.id,
          full_name: 'Persona Creada Por Ayudante',
          sort_order: 1,
        })
        .select()
        .single();

    assert.equal(
      createGuestError,
      null,
      'Se esperaba que el ayudante pudiera agregar una persona a la invitación'
    );
    assert.equal(
      createdGuest?.invitation_id,
      createdInvitation.id,
      'Se esperaba que la persona creada quedara asociada a la invitación del ayudante'
    );

    const { data: updatedInvitation, error: updateInvError } =
      await ctx.helperXClient
        .from('invitations')
        .update({ group_name: 'Familia Editada Por Ayudante' })
        .eq('id', createdInvitation.id)
        .select()
        .single();

    assert.equal(
      updateInvError,
      null,
      'Se esperaba que el ayudante pudiera editar el group_name de la invitación'
    );
    assert.equal(
      updatedInvitation?.group_name,
      'Familia Editada Por Ayudante',
      'Se esperaba que el group_name reflejara el nuevo valor tras la edición'
    );

    const { error: deleteInvError } = await ctx.helperXClient
      .from('invitations')
      .delete()
      .eq('id', createdInvitation.id);

    assert.equal(
      deleteInvError,
      null,
      'Se esperaba que el ayudante pudiera borrar la invitación creada'
    );

    const { data: remainingInvitations, error: checkDeletedError } =
      await ctx.helperXClient
        .from('invitations')
        .select('id')
        .eq('id', createdInvitation.id);

    assert.equal(
      checkDeletedError,
      null,
      'Se esperaba consultar sin error si la invitación borrada sigue existiendo'
    );
    assert.equal(
      remainingInvitations.length,
      0,
      'Se esperaba que la invitación borrada ya no existiera en la base de datos'
    );

    const { data: helperGifts, error: helperGiftsError } =
      await ctx.helperXClient
        .from('gifts')
        .select('*')
        .eq('event_id', ctx.eventX.id);

    assert.equal(
      helperGiftsError,
      null,
      'Se esperaba que la lectura de gifts por el ayudante no devolviera error'
    );
    assert.equal(
      helperGifts.length,
      0,
      'Se esperaba que el ayudante recibiera una lista vacía al consultar gifts del evento X'
    );

    const { data: helperReservations, error: helperReservationsError } =
      await ctx.helperXClient
        .from('gift_reservations')
        .select('*')
        .eq('event_id', ctx.eventX.id);

    assert.equal(
      helperReservationsError,
      null,
      'Se esperaba que la lectura de gift_reservations por el ayudante no devolviera error'
    );
    assert.equal(
      helperReservations.length,
      0,
      'Se esperaba que el ayudante recibiera una lista vacía al consultar gift_reservations del evento X'
    );
  }
);

test(
  '10. Un propietario del evento X no ve nada del evento Y',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: eventsY, error: eventsYError } = await ctx.ownerXClient
      .from('events')
      .select('*')
      .eq('id', ctx.eventY.id);

    assert.equal(
      eventsYError,
      null,
      'Se esperaba que consultar events con el id de Y no produjera error'
    );
    assert.equal(
      eventsY.length,
      0,
      'Se esperaba que el propietario de X no viera el evento Y en events'
    );

    const scopedTables = [
      'invitations',
      'guests',
      'gifts',
      'gift_reservations',
    ];

    for (const table of scopedTables) {
      const { data, error } = await ctx.ownerXClient
        .from(table)
        .select('*')
        .eq('event_id', ctx.eventY.id);

      assert.equal(
        error,
        null,
        `Se esperaba que consultar ${table} del evento Y no produjera error`
      );
      assert.equal(
        data.length,
        0,
        `Se esperaba que el propietario de X recibiera una lista vacía en ${table} para el evento Y`
      );
    }
  }
);

test(
  '11. Un segundo regalo libre en el mismo evento falla',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error } = await ctx.ownerXClient.from('gifts').insert({
      event_id: ctx.eventX.id,
      name: 'Segundo Regalo Libre Evento X',
      kind: 'free',
    });

    assert.ok(
      error,
      'Se esperaba que fallara la inserción de un segundo regalo de tipo free en el mismo evento'
    );
    assert.equal(
      error.code,
      '23505',
      `Se esperaba el código PostgreSQL 23505 de violación de unicidad, pero se recibió: ${error.code}`
    );
  }
);

test(
  '12. El creador de un evento queda como owner',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: ownEvent, error: insertError } = await ctx.ownerXClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-PROPIO`,
        starts_at: startsAt,
        rsvp_deadline: rsvpDeadline,
      })
      .select()
      .single();

    assert.equal(
      insertError,
      null,
      'Se esperaba que el propietario X pudiera crear un evento sin enviar created_by'
    );
    assert.ok(
      ownEvent?.id,
      'Se esperaba que el evento recién creado devolviera su id'
    );
    ctx.createdEventIds.push(ownEvent.id);

    const { data: members, error: membersError } = await ctx.ownerXClient
      .from('event_members')
      .select('user_id, role')
      .eq('event_id', ownEvent.id);

    assert.equal(
      membersError,
      null,
      'Se esperaba consultar event_members del nuevo evento sin error'
    );
    assert.equal(
      members.length,
      1,
      'Se esperaba que el nuevo evento tuviera exactamente un miembro registrado'
    );
    assert.equal(
      members[0].user_id,
      ctx.ownerXUser.id,
      'Se esperaba que el miembro registrado fuera el usuario propietario X'
    );
    assert.equal(
      members[0].role,
      'owner',
      'Se esperaba que el creador del evento quedara con el rol owner'
    );
  }
);

test(
  '13. RN-12: un propietario y un ayudante cambian la respuesta de una persona con la fecha límite vencida',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: ownerRows, error: ownerError } = await ctx.ownerXClient
      .from('guests')
      .update({ rsvp: 'accepted' })
      .eq('id', ctx.guestExpired.id)
      .select();

    assert.equal(
      ownerError,
      null,
      'Se esperaba que el propietario X pudiera actualizar la respuesta con la fecha límite vencida'
    );
    assert.equal(
      ownerRows?.length,
      1,
      'Se esperaba que la actualización del propietario X devolviera exactamente una fila'
    );
    assert.equal(
      ownerRows[0].rsvp,
      'accepted',
      'Se esperaba que el rsvp quedara en accepted tras la actualización del propietario X'
    );

    const { data: helperRows, error: helperError } = await ctx.helperXClient
      .from('guests')
      .update({ rsvp: 'declined' })
      .eq('id', ctx.guestExpired.id)
      .select();

    assert.equal(
      helperError,
      null,
      'Se esperaba que el ayudante pudiera actualizar la respuesta con la fecha límite vencida'
    );
    assert.equal(
      helperRows?.length,
      1,
      'Se esperaba que la actualización del ayudante devolviera exactamente una fila'
    );
    assert.equal(
      helperRows[0].rsvp,
      'declined',
      'Se esperaba que el rsvp quedara en declined tras la actualización del ayudante'
    );
  }
);

test(
  '14. RN-13: reserve_gift y release_gift fallan con gifts_closed en un evento que ya empezó',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error: reserveError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationStarted.code,
      p_gift_id: ctx.giftStartedRepeatable.id,
    });

    assert.ok(
      reserveError,
      'Se esperaba un error al apartar un regalo en un evento que ya empezó'
    );
    assert.equal(
      reserveError.message,
      'gifts_closed',
      `Se esperaba el error gifts_closed en reserve_gift, pero se recibió: ${reserveError.message}`
    );

    const { error: releaseError } = await ctx.anonClient.rpc('release_gift', {
      p_code: ctx.invitationStarted.code,
      p_gift_id: ctx.giftStartedUnique.id,
    });

    assert.ok(
      releaseError,
      'Se esperaba un error al liberar un regalo en un evento que ya empezó'
    );
    assert.equal(
      releaseError.message,
      'gifts_closed',
      `Se esperaba el error gifts_closed en release_gift, pero se recibió: ${releaseError.message}`
    );

    const { data: remainingReservations, error: checkError } =
      await ctx.adminClient
        .from('gift_reservations')
        .select('id, gift_id, invitation_id')
        .eq('id', ctx.reservationStartedUnique.id);

    assert.equal(
      checkError,
      null,
      'Se esperaba consultar con el administrador la reserva del evento iniciado sin error'
    );
    assert.equal(
      remainingReservations?.length,
      1,
      'Se esperaba que la reserva del regalo único en el evento iniciado siguiera existiendo'
    );
  }
);

test(
  '15. RN-15: cambiar el tipo de un regalo que ya tiene reservas falla',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error: updateError } = await ctx.ownerXClient
      .from('gifts')
      .update({ kind: 'repeatable', max_reservations: 2 })
      .eq('id', ctx.giftXReserved.id);

    assert.ok(
      updateError,
      'Se esperaba un error al cambiar el tipo de un regalo con reservas existentes'
    );
    assert.equal(
      updateError.message,
      'gift_has_reservations',
      `Se esperaba el mensaje de error gift_has_reservations, pero se recibió: ${updateError.message}`
    );

    const { data: storedGift, error: checkError } = await ctx.adminClient
      .from('gifts')
      .select('id, kind')
      .eq('id', ctx.giftXReserved.id)
      .single();

    assert.equal(
      checkError,
      null,
      'Se esperaba consultar con el administrador el regalo reservado sin error'
    );
    assert.equal(
      storedGift?.kind,
      'unique',
      'Se esperaba que el regalo conservara su tipo unique tras el intento fallido'
    );
  }
);

test(
  '16. Cambiar el event_id de una invitación o de un regalo falla',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error: invUpdateError } = await ctx.ownerXClient
      .from('invitations')
      .update({ event_id: ctx.eventExpired.id })
      .eq('id', ctx.invitationA.id);

    assert.ok(
      invUpdateError,
      'Se esperaba un error al intentar cambiar el event_id de la invitación A'
    );
    assert.equal(
      invUpdateError.message,
      'event_id_immutable',
      `Se esperaba el mensaje de error event_id_immutable al mover la invitación, pero se recibió: ${invUpdateError.message}`
    );

    const { error: giftUpdateError } = await ctx.ownerXClient
      .from('gifts')
      .update({ event_id: ctx.eventExpired.id })
      .eq('id', ctx.giftXRepeatable.id);

    assert.ok(
      giftUpdateError,
      'Se esperaba un error al intentar cambiar el event_id del regalo repetible de X'
    );
    assert.equal(
      giftUpdateError.message,
      'event_id_immutable',
      `Se esperaba el mensaje de error event_id_immutable al mover el regalo, pero se recibió: ${giftUpdateError.message}`
    );

    const { data: storedInvitation, error: checkInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id, event_id')
        .eq('id', ctx.invitationA.id)
        .single();

    assert.equal(
      checkInvError,
      null,
      'Se esperaba consultar con el administrador la invitación A sin error'
    );
    assert.equal(
      storedInvitation?.event_id,
      ctx.eventX.id,
      'Se esperaba que la invitación A siguiera perteneciendo al evento X'
    );

    const { data: storedGift, error: checkGiftError } = await ctx.adminClient
      .from('gifts')
      .select('id, event_id')
      .eq('id', ctx.giftXRepeatable.id)
      .single();

    assert.equal(
      checkGiftError,
      null,
      'Se esperaba consultar con el administrador el regalo repetible de X sin error'
    );
    assert.equal(
      storedGift?.event_id,
      ctx.eventX.id,
      'Se esperaba que el regalo repetible siguiera perteneciendo al evento X'
    );
  }
);

test(
  '17. Un owner del equipo crea un evento: el otro owner y el helper quedan agregados con su rol',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdEvent, error: insertError } =
      await ctx.teamOwnerAClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-EQUIPO-A`,
          starts_at: startsAt,
          rsvp_deadline: rsvpDeadline,
        })
        .select()
        .single();

    assert.equal(
      insertError,
      null,
      'Se esperaba que el owner A del equipo pudiera crear un evento sin enviar created_by'
    );
    assert.ok(
      createdEvent?.id,
      'Se esperaba que el evento creado por el owner A devolviera su id'
    );
    ctx.createdEventIds.push(createdEvent.id);

    const { data: members, error: membersError } = await ctx.adminClient
      .from('event_members')
      .select('user_id, role')
      .eq('event_id', createdEvent.id);

    assert.equal(
      membersError,
      null,
      'Se esperaba consultar event_members del evento de owner A sin error'
    );
    assert.equal(
      members?.length,
      3,
      'Se esperaba que el evento creado por owner A tuviera exactamente tres miembros'
    );

    const actualMembers = (members ?? [])
      .map((member) => `${member.user_id}:${member.role}`)
      .sort();
    const expectedMembers = [
      `${ctx.teamOwnerAUser.id}:owner`,
      `${ctx.teamOwnerBUser.id}:owner`,
      `${ctx.teamHelperUser.id}:helper`,
    ].sort();

    assert.deepEqual(
      actualMembers,
      expectedMembers,
      'Se esperaba que los miembros del evento fueran owner A, owner B y el ayudante con sus roles del equipo'
    );

    for (const table of ['team_members', 'teams']) {
      const { data, error } = await ctx.teamOwnerAClient
        .from(table)
        .select('*');

      const rows = data ?? [];
      assert.equal(
        rows.length,
        0,
        `Se esperaba que la tabla ${table} no devolviera ninguna fila al cliente autenticado`
      );
      assert.ok(
        Boolean(error) || Array.isArray(data),
        `Se esperaba un error de permisos o una lista vacía al consultar ${table} con un cliente autenticado`
      );
    }
  }
);

test(
  '18. El segundo owner del equipo crea un evento: pasa lo mismo',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdEvent, error: insertError } =
      await ctx.teamOwnerBClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-EQUIPO-B`,
          starts_at: startsAt,
          rsvp_deadline: rsvpDeadline,
        })
        .select()
        .single();

    assert.equal(
      insertError,
      null,
      'Se esperaba que el owner B del equipo pudiera crear un evento sin enviar created_by'
    );
    assert.ok(
      createdEvent?.id,
      'Se esperaba que el evento creado por el owner B devolviera su id'
    );
    ctx.createdEventIds.push(createdEvent.id);

    const { data: members, error: membersError } = await ctx.adminClient
      .from('event_members')
      .select('user_id, role')
      .eq('event_id', createdEvent.id);

    assert.equal(
      membersError,
      null,
      'Se esperaba consultar event_members del evento de owner B sin error'
    );
    assert.equal(
      members?.length,
      3,
      'Se esperaba que el evento creado por owner B tuviera exactamente tres miembros'
    );

    const actualMembers = (members ?? [])
      .map((member) => `${member.user_id}:${member.role}`)
      .sort();
    const expectedMembers = [
      `${ctx.teamOwnerBUser.id}:owner`,
      `${ctx.teamOwnerAUser.id}:owner`,
      `${ctx.teamHelperUser.id}:helper`,
    ].sort();

    assert.deepEqual(
      actualMembers,
      expectedMembers,
      'Se esperaba que los miembros del evento fueran owner B, owner A y el ayudante con sus roles del equipo'
    );
  }
);

test(
  '19. El helper del equipo crea un evento: solo él queda como miembro',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdEvent, error: insertError } =
      await ctx.teamHelperClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-EQUIPO-HELPER`,
          starts_at: startsAt,
          rsvp_deadline: rsvpDeadline,
        })
        .select()
        .single();

    assert.equal(
      insertError,
      null,
      'Se esperaba que el helper del equipo pudiera crear su propio evento sin enviar created_by'
    );
    assert.ok(
      createdEvent?.id,
      'Se esperaba que el evento creado por el helper devolviera su id'
    );
    ctx.createdEventIds.push(createdEvent.id);

    const { data: members, error: membersError } = await ctx.adminClient
      .from('event_members')
      .select('user_id, role')
      .eq('event_id', createdEvent.id);

    assert.equal(
      membersError,
      null,
      'Se esperaba consultar event_members del evento del helper sin error'
    );
    assert.equal(
      members?.length,
      1,
      'Se esperaba que el evento creado por el helper tuviera exactamente un miembro'
    );

    const actualMembers = (members ?? [])
      .map((member) => `${member.user_id}:${member.role}`)
      .sort();
    const expectedMembers = [`${ctx.teamHelperUser.id}:owner`];

    assert.deepEqual(
      actualMembers,
      expectedMembers,
      'Se esperaba que únicamente el helper quedara como owner de su propio evento'
    );
  }
);

test(
  '20. Un usuario fuera del equipo crea un evento: solo él queda como miembro',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: createdEvent, error: insertError } =
      await ctx.outsideTeamClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-FUERA`,
          starts_at: startsAt,
          rsvp_deadline: rsvpDeadline,
        })
        .select()
        .single();

    assert.equal(
      insertError,
      null,
      'Se esperaba que el usuario fuera del equipo pudiera crear un evento sin enviar created_by'
    );
    assert.ok(
      createdEvent?.id,
      'Se esperaba que el evento creado por el usuario fuera del equipo devolviera su id'
    );
    ctx.createdEventIds.push(createdEvent.id);

    const { data: members, error: membersError } = await ctx.adminClient
      .from('event_members')
      .select('user_id, role')
      .eq('event_id', createdEvent.id);

    assert.equal(
      membersError,
      null,
      'Se esperaba consultar event_members del evento del usuario fuera del equipo sin error'
    );
    assert.equal(
      members?.length,
      1,
      'Se esperaba que el evento creado por el usuario fuera del equipo tuviera exactamente un miembro'
    );

    const actualMembers = (members ?? [])
      .map((member) => `${member.user_id}:${member.role}`)
      .sort();
    const expectedMembers = [`${ctx.outsideTeamUser.id}:owner`];

    assert.deepEqual(
      actualMembers,
      expectedMembers,
      'Se esperaba que únicamente el usuario fuera del equipo quedara como owner del evento'
    );
  }
);

test(
  '21. Un propietario crea una invitación con dos personas usando save_invitation',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const invitationId = crypto.randomUUID();
    const guestOneId = crypto.randomUUID();
    const guestTwoId = crypto.randomUUID();
    const groupName = `PRUEBA-${ctx.run}-FAMILIA-GUARDADA`;
    const phone = '+573000000000';
    const guests = [
      { id: guestOneId, full_name: 'Integrante Guardado Uno' },
      { id: guestTwoId, full_name: 'Integrante Guardado Dos' },
    ];

    ctx.savedInvitationPayload = {
      p_invitation_id: invitationId,
      p_event_id: ctx.eventX.id,
      p_group_name: groupName,
      p_phone: phone,
      p_guests: guests,
    };

    const { data, error } = await ctx.ownerXClient.rpc(
      'save_invitation',
      ctx.savedInvitationPayload
    );

    assert.equal(
      error,
      null,
      'Se esperaba que save_invitation creara la invitación y sus personas sin error'
    );
    assert.ok(
      data,
      'Se esperaba recibir el objeto de la invitación guardada desde save_invitation'
    );
    assert.equal(
      data.id,
      invitationId,
      'Se esperaba que la invitación devuelta tuviera el id enviado por el cliente'
    );
    assert.equal(
      data.event_id,
      ctx.eventX.id,
      'Se esperaba que la invitación devuelta perteneciera al evento X'
    );
    assert.equal(
      data.group_name,
      groupName,
      'Se esperaba que la invitación devuelta conservara el nombre de grupo enviado'
    );
    assert.equal(
      data.phone,
      phone,
      'Se esperaba que la invitación devuelta conservara el teléfono enviado'
    );
    assert.equal(
      typeof data.code === 'string' && data.code.length > 0,
      true,
      'Se esperaba que la invitación devuelta tuviera un código no vacío'
    );
    assert.equal(
      Array.isArray(data.guests) && data.guests.length === 2,
      true,
      'Se esperaba que la respuesta incluyera exactamente las dos personas en guests'
    );
    assert.equal(
      data.guests[0].id,
      guestOneId,
      'Se esperaba que la primera persona devuelta tuviera el primer id enviado'
    );
    assert.equal(
      data.guests[0].full_name,
      'Integrante Guardado Uno',
      'Se esperaba que la primera persona devuelta conservara su nombre'
    );
    assert.equal(
      data.guests[0].sort_order,
      0,
      'Se esperaba que la primera persona tuviera sort_order 0'
    );
    assert.equal(
      data.guests[1].id,
      guestTwoId,
      'Se esperaba que la segunda persona devuelta tuviera el segundo id enviado'
    );
    assert.equal(
      data.guests[1].full_name,
      'Integrante Guardado Dos',
      'Se esperaba que la segunda persona devuelta conservara su nombre'
    );
    assert.equal(
      data.guests[1].sort_order,
      1,
      'Se esperaba que la segunda persona tuviera sort_order 1'
    );

    const { data: storedInvitations, error: checkInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('*')
        .eq('id', invitationId);

    assert.equal(
      checkInvError,
      null,
      'Se esperaba consultar con el administrador la invitación creada sin error'
    );
    assert.equal(
      storedInvitations?.length,
      1,
      'Se esperaba que la invitación existiera una sola vez en la base de datos'
    );

    const { data: storedGuests, error: checkGuestsError } =
      await ctx.adminClient
        .from('guests')
        .select('*')
        .eq('invitation_id', invitationId)
        .order('sort_order', { ascending: true });

    assert.equal(
      checkGuestsError,
      null,
      'Se esperaba consultar con el administrador las personas de la invitación sin error'
    );
    assert.equal(
      storedGuests?.length,
      2,
      'Se esperaba que la invitación tuviera exactamente dos personas en la base de datos'
    );
    assert.equal(
      storedGuests[0].id,
      guestOneId,
      'Se esperaba que la primera persona en base de datos coincidiera con el primer id'
    );
    assert.equal(
      storedGuests[0].full_name,
      'Integrante Guardado Uno',
      'Se esperaba que la primera persona en base de datos tuviera el nombre enviado'
    );
    assert.equal(
      storedGuests[0].sort_order,
      0,
      'Se esperaba que la primera persona en base de datos tuviera sort_order 0'
    );
    assert.equal(
      storedGuests[1].id,
      guestTwoId,
      'Se esperaba que la segunda persona en base de datos coincidiera con el segundo id'
    );
    assert.equal(
      storedGuests[1].full_name,
      'Integrante Guardado Dos',
      'Se esperaba que la segunda persona en base de datos tuviera el nombre enviado'
    );
    assert.equal(
      storedGuests[1].sort_order,
      1,
      'Se esperaba que la segunda persona en base de datos tuviera sort_order 1'
    );
  }
);

test(
  '22. Repetir save_invitation no duplica y editar reemplaza nombre, personas y orden',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    assert.ok(
      ctx.savedInvitationPayload,
      'Se esperaba contar con los datos de la invitación creada en la prueba 21'
    );

    const invitationId = ctx.savedInvitationPayload.p_invitation_id;
    const [firstGuest, secondGuest] = ctx.savedInvitationPayload.p_guests;

    const { data: repeatData, error: repeatError } =
      await ctx.ownerXClient.rpc('save_invitation', ctx.savedInvitationPayload);

    assert.equal(
      repeatError,
      null,
      'Se esperaba que repetir save_invitation con los mismos datos no devolviera error'
    );
    assert.equal(
      repeatData?.id,
      invitationId,
      'Se esperaba que la llamada repetida devolviera la misma invitación'
    );
    assert.equal(
      repeatData?.guests?.length,
      2,
      'Se esperaba que la llamada repetida devolviera dos personas'
    );

    const { data: invitationsAfterRepeat, error: invRepeatCheckError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', invitationId);

    assert.equal(
      invRepeatCheckError,
      null,
      'Se esperaba consultar la invitación tras repetir la llamada sin error'
    );
    assert.equal(
      invitationsAfterRepeat?.length,
      1,
      'Se esperaba que siguiera habiendo exactamente una invitación tras repetir la llamada'
    );

    const { data: guestsAfterRepeat, error: guestsRepeatCheckError } =
      await ctx.adminClient
        .from('guests')
        .select('id')
        .eq('invitation_id', invitationId);

    assert.equal(
      guestsRepeatCheckError,
      null,
      'Se esperaba consultar las personas tras repetir la llamada sin error'
    );
    assert.equal(
      guestsAfterRepeat?.length,
      2,
      'Se esperaba que siguiera habiendo exactamente dos personas tras repetir la llamada'
    );

    const { error: rsvpError } = await ctx.adminClient
      .from('guests')
      .update({ rsvp: 'accepted' })
      .eq('id', firstGuest.id);

    assert.equal(
      rsvpError,
      null,
      'Se esperaba marcar la primera persona con rsvp accepted sin error'
    );

    const editedGroupName = `PRUEBA-${ctx.run}-FAMILIA-EDITADA`;
    const thirdGuestId = crypto.randomUUID();
    const editedGuests = [
      { id: thirdGuestId, full_name: 'Integrante Guardado Tres' },
      { id: firstGuest.id, full_name: firstGuest.full_name },
    ];

    const { data: editData, error: editError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: invitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: editedGroupName,
        p_phone: '',
        p_guests: editedGuests,
      }
    );

    assert.equal(
      editError,
      null,
      'Se esperaba que editar la invitación con save_invitation no devolviera error'
    );
    assert.ok(
      editData,
      'Se esperaba recibir la invitación actualizada desde save_invitation'
    );
    assert.equal(
      editData.group_name,
      editedGroupName,
      'Se esperaba que la respuesta reflejara el nuevo nombre de grupo'
    );
    assert.equal(
      editData.phone,
      null,
      'Se esperaba que phone quedara nulo al enviar cadena vacía'
    );
    assert.equal(
      Array.isArray(editData.guests) && editData.guests.length === 2,
      true,
      'Se esperaba que la respuesta tras editar tuviera exactamente dos personas'
    );
    assert.equal(
      editData.guests[0].id,
      thirdGuestId,
      'Se esperaba que la tercera persona quedara primera en la respuesta'
    );
    assert.equal(
      editData.guests[0].full_name,
      'Integrante Guardado Tres',
      'Se esperaba que la primera persona en el nuevo orden tuviera el nombre de la tercera'
    );
    assert.equal(
      editData.guests[0].sort_order,
      0,
      'Se esperaba que la tercera persona tuviera sort_order 0'
    );
    assert.equal(
      editData.guests[1].id,
      firstGuest.id,
      'Se esperaba que la primera persona original quedara en la segunda posición'
    );
    assert.equal(
      editData.guests[1].full_name,
      firstGuest.full_name,
      'Se esperaba que la primera persona original conservara su nombre'
    );
    assert.equal(
      editData.guests[1].sort_order,
      1,
      'Se esperaba que la primera persona original tuviera sort_order 1'
    );
    assert.equal(
      editData.guests[1].rsvp,
      'accepted',
      'Se esperaba que la primera persona original conservara rsvp accepted en la respuesta'
    );

    const { data: storedInvitation, error: checkEditedInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('*')
        .eq('id', invitationId)
        .single();

    assert.equal(
      checkEditedInvError,
      null,
      'Se esperaba consultar con el administrador la invitación editada sin error'
    );
    assert.equal(
      storedInvitation?.group_name,
      editedGroupName,
      'Se esperaba que el nombre de grupo en base de datos fuera el editado'
    );
    assert.equal(
      storedInvitation?.phone,
      null,
      'Se esperaba que phone en base de datos fuera nulo tras editar con cadena vacía'
    );

    const { data: storedGuests, error: checkEditedGuestsError } =
      await ctx.adminClient
        .from('guests')
        .select('*')
        .eq('invitation_id', invitationId)
        .order('sort_order', { ascending: true });

    assert.equal(
      checkEditedGuestsError,
      null,
      'Se esperaba consultar con el administrador las personas tras editar sin error'
    );
    assert.equal(
      storedGuests?.length,
      2,
      'Se esperaba que en base de datos hubiera exactamente dos personas en la invitación'
    );
    assert.equal(
      storedGuests[0].id,
      thirdGuestId,
      'Se esperaba que en base de datos la primera persona por orden fuera la tercera agregada'
    );
    assert.equal(
      storedGuests[0].sort_order,
      0,
      'Se esperaba que en base de datos la tercera persona tuviera sort_order 0'
    );
    assert.equal(
      storedGuests[1].id,
      firstGuest.id,
      'Se esperaba que en base de datos la segunda persona por orden fuera la primera original'
    );
    assert.equal(
      storedGuests[1].sort_order,
      1,
      'Se esperaba que en base de datos la primera persona original tuviera sort_order 1'
    );
    assert.equal(
      storedGuests[1].rsvp,
      'accepted',
      'Se esperaba que en base de datos la primera persona original conservara rsvp accepted'
    );

    const { data: deletedGuestRows, error: checkDeletedGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('id')
        .eq('id', secondGuest.id);

    assert.equal(
      checkDeletedGuestError,
      null,
      'Se esperaba consultar con el administrador si la segunda persona fue eliminada sin error'
    );
    assert.equal(
      deletedGuestRows?.length,
      0,
      'Se esperaba que la segunda persona quitada ya no existiera en la base de datos'
    );
  }
);

test(
  '23. Un ayudante puede usar save_invitation y un usuario que no es miembro no',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const helperInvitationId = crypto.randomUUID();
    const helperGuestId = crypto.randomUUID();
    const helperGroupName = `PRUEBA-${ctx.run}-AYUDANTE-GUARDADO`;

    const { data: helperData, error: helperError } =
      await ctx.helperXClient.rpc('save_invitation', {
        p_invitation_id: helperInvitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: helperGroupName,
        p_phone: '',
        p_guests: [
          { id: helperGuestId, full_name: 'Integrante Guardado Por Ayudante' },
        ],
      });

    assert.equal(
      helperError,
      null,
      'Se esperaba que el ayudante del evento X pudiera usar save_invitation sin error'
    );
    assert.equal(
      helperData?.id,
      helperInvitationId,
      'Se esperaba que save_invitation devolviera la invitación creada por el ayudante'
    );

    const { data: storedHelperInv, error: checkHelperInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', helperInvitationId);

    assert.equal(
      checkHelperInvError,
      null,
      'Se esperaba consultar con el administrador la invitación del ayudante sin error'
    );
    assert.equal(
      storedHelperInv?.length,
      1,
      'Se esperaba que la invitación creada por el ayudante existiera en la base de datos'
    );

    const nonMemberInvitationId = crypto.randomUUID();
    const nonMemberGuestId = crypto.randomUUID();

    const { error: nonMemberError } = await ctx.ownerYClient.rpc(
      'save_invitation',
      {
        p_invitation_id: nonMemberInvitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-NO-MIEMBRO`,
        p_phone: '+573000000000',
        p_guests: [
          { id: nonMemberGuestId, full_name: 'Integrante No Autorizado' },
        ],
      }
    );

    assert.ok(
      nonMemberError,
      'Se esperaba un error cuando un usuario que no es miembro del evento X llama a save_invitation'
    );

    const { data: nonMemberInvRows, error: checkNonMemberInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', nonMemberInvitationId);

    assert.equal(
      checkNonMemberInvError,
      null,
      'Se esperaba consultar con el administrador si existe la invitación del no miembro sin error'
    );
    assert.equal(
      nonMemberInvRows?.length,
      0,
      'Se esperaba que no existiera ninguna invitación con el id enviado por el usuario no miembro'
    );

    const { data: nonMemberGuestRows, error: checkNonMemberGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('id')
        .in('id', [nonMemberGuestId]);

    assert.equal(
      checkNonMemberGuestError,
      null,
      'Se esperaba consultar con el administrador si existen las personas del no miembro sin error'
    );
    assert.equal(
      nonMemberGuestRows?.length,
      0,
      'Se esperaba que no existiera ninguna persona con los id enviados por el usuario no miembro'
    );
  }
);

test(
  '24. save_invitation rechaza arreglo vacío, personas de otra invitación y clientes sin sesión',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const emptyInvitationId = crypto.randomUUID();

    const { error: emptyError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: emptyInvitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-SIN-PERSONAS`,
        p_phone: '',
        p_guests: [],
      }
    );

    assert.ok(
      emptyError,
      'Se esperaba un error al llamar save_invitation con p_guests vacío'
    );
    assert.ok(
      emptyError.message.includes('guests_required'),
      `Se esperaba que el error contuviera guests_required, pero se recibió: ${emptyError.message}`
    );

    const { data: emptyInvRows, error: checkEmptyInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', emptyInvitationId);

    assert.equal(
      checkEmptyInvError,
      null,
      'Se esperaba consultar con el administrador la invitación con arreglo vacío sin error'
    );
    assert.equal(
      emptyInvRows?.length,
      0,
      'Se esperaba que no se creara la invitación cuando p_guests está vacío'
    );

    const foreignGuestInvitationId = crypto.randomUUID();

    const { error: foreignGuestError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: foreignGuestInvitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-PERSONA-AJENA`,
        p_phone: '',
        p_guests: [
          { id: ctx.guestB.id, full_name: 'Nombre Intentado Sobrescribir' },
        ],
      }
    );

    assert.ok(
      foreignGuestError,
      'Se esperaba un error al incluir el id de una persona perteneciente a otra invitación'
    );
    assert.ok(
      foreignGuestError.message.includes('guest_not_in_invitation'),
      `Se esperaba que el error contuviera guest_not_in_invitation, pero se recibió: ${foreignGuestError.message}`
    );

    const { data: foreignInvRows, error: checkForeignInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', foreignGuestInvitationId);

    assert.equal(
      checkForeignInvError,
      null,
      'Se esperaba consultar con el administrador la invitación rechazada por persona ajena sin error'
    );
    assert.equal(
      foreignInvRows?.length,
      0,
      'Se esperaba que la invitación nueva no existiera tras el rechazo por guest_not_in_invitation'
    );

    const { data: storedGuestB, error: checkGuestBError } =
      await ctx.adminClient
        .from('guests')
        .select('id, invitation_id, full_name')
        .eq('id', ctx.guestB.id)
        .single();

    assert.equal(
      checkGuestBError,
      null,
      'Se esperaba consultar con el administrador la persona de la invitación B sin error'
    );
    assert.equal(
      storedGuestB?.invitation_id,
      ctx.invitationB.id,
      'Se esperaba que la persona de la invitación B conservara su invitation_id original'
    );
    assert.equal(
      storedGuestB?.full_name,
      ctx.guestB.full_name,
      'Se esperaba que la persona de la invitación B conservara su full_name original'
    );

    const anonInvitationId = crypto.randomUUID();
    const anonGuestId = crypto.randomUUID();

    const { error: anonError } = await ctx.anonClient.rpc('save_invitation', {
      p_invitation_id: anonInvitationId,
      p_event_id: ctx.eventX.id,
      p_group_name: `PRUEBA-${ctx.run}-SIN-SESION`,
      p_phone: '+573000000000',
      p_guests: [{ id: anonGuestId, full_name: 'Integrante Sin Sesion' }],
    });

    assert.ok(
      anonError,
      'Se esperaba un error cuando un cliente sin sesión intenta llamar a save_invitation'
    );

    const { data: anonInvRows, error: checkAnonInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', anonInvitationId);

    assert.equal(
      checkAnonInvError,
      null,
      'Se esperaba consultar con el administrador si se creó la invitación sin sesión sin error'
    );
    assert.equal(
      anonInvRows?.length,
      0,
      'Se esperaba que no se creara ninguna invitación al llamar save_invitation sin sesión'
    );

    const { data: anonGuestRows, error: checkAnonGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('id')
        .eq('id', anonGuestId);

    assert.equal(
      checkAnonGuestError,
      null,
      'Se esperaba consultar con el administrador si se creó la persona sin sesión sin error'
    );
    assert.equal(
      anonGuestRows?.length,
      0,
      'Se esperaba que no se creara ninguna persona al llamar save_invitation sin sesión'
    );
  }
);

test(
  '25. Apartar dos veces el mismo regalo desde la misma invitación responde bien y deja una sola reserva',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: repeatedGift, error: createGiftError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: `PRUEBA-${ctx.run}-REGALO-REPETIDO`,
          kind: 'unique',
          sort_order: 10,
        })
        .select()
        .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo único para la prueba 25 sin error'
    );
    assert.ok(
      repeatedGift?.id,
      'Se esperaba recibir el id del regalo único creado para la prueba 25'
    );

    const { data: firstReserveData, error: firstReserveError } =
      await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: repeatedGift.id,
      });

    assert.equal(
      firstReserveError,
      null,
      'Se esperaba que la primera llamada a reserve_gift desde la invitación A no devolviera error'
    );
    assert.ok(
      Array.isArray(firstReserveData),
      'Se esperaba que la primera llamada a reserve_gift devolviera la lista de regalos'
    );

    const { data: secondReserveData, error: secondReserveError } =
      await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: repeatedGift.id,
      });

    assert.equal(
      secondReserveError,
      null,
      'Se esperaba que la segunda llamada a reserve_gift desde la misma invitación A no devolviera error'
    );
    assert.ok(
      Array.isArray(secondReserveData),
      'Se esperaba que la segunda llamada a reserve_gift devolviera la lista de regalos'
    );

    const { data: reservationsAfterTwice, error: checkReservationsError } =
      await ctx.adminClient
        .from('gift_reservations')
        .select('id, gift_id, invitation_id')
        .eq('gift_id', repeatedGift.id);

    assert.equal(
      checkReservationsError,
      null,
      'Se esperaba consultar con el administrador las reservas del regalo sin error'
    );
    assert.equal(
      reservationsAfterTwice?.length,
      1,
      'Se esperaba que hubiera exactamente una fila en gift_reservations tras apartar dos veces con la misma invitación'
    );
    assert.equal(
      reservationsAfterTwice[0].invitation_id,
      ctx.invitationA.id,
      'Se esperaba que la reserva perteneciera a la invitación A'
    );

    const { error: otherInvitationError } = await ctx.anonClient.rpc(
      'reserve_gift',
      {
        p_code: ctx.invitationB.code,
        p_gift_id: repeatedGift.id,
      }
    );

    assert.ok(
      otherInvitationError,
      'Se esperaba un error cuando otra invitación del evento X intenta apartar el mismo regalo único'
    );
    assert.ok(
      otherInvitationError.message.includes('already_reserved'),
      `Se esperaba que el error contuviera already_reserved, pero se recibió: ${otherInvitationError.message}`
    );

    const { data: reservationsAfterOther, error: checkAfterOtherError } =
      await ctx.adminClient
        .from('gift_reservations')
        .select('id, gift_id, invitation_id')
        .eq('gift_id', repeatedGift.id);

    assert.equal(
      checkAfterOtherError,
      null,
      'Se esperaba consultar con el administrador las reservas tras el intento de la otra invitación sin error'
    );
    assert.equal(
      reservationsAfterOther?.length,
      1,
      'Se esperaba que siguiera habiendo una sola reserva para el regalo único'
    );
    assert.equal(
      reservationsAfterOther[0].invitation_id,
      ctx.invitationA.id,
      'Se esperaba que la única reserva siguiera perteneciendo a la invitación A'
    );
  }
);

test(
  '26. El teléfono solo acepta celulares colombianos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const invalidPhoneDirectId = crypto.randomUUID();
    const { error: directError } = await ctx.adminClient
      .from('invitations')
      .insert({
        id: invalidPhoneDirectId,
        event_id: ctx.eventX.id,
        group_name: `PRUEBA-${ctx.run}-TEL-DIRECTO`,
        phone: '+576011234567',
      });

    assert.ok(
      directError,
      'Se esperaba un error al insertar directamente una invitación con teléfono no celular'
    );
    assert.ok(
      directError.message.includes('invitations_phone_format'),
      `Se esperaba que el error contuviera invitations_phone_format, pero se recibió: ${directError.message}`
    );

    const rpcInvalidInvId = crypto.randomUUID();
    const rpcInvalidGuestId = crypto.randomUUID();

    const { error: rpcInvalidError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: rpcInvalidInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-TEL-RPC-INVALIDO`,
        p_phone: '+576011234567',
        p_guests: [
          { id: rpcInvalidGuestId, full_name: 'Persona Telefono Invalido' },
        ],
      }
    );

    assert.ok(
      rpcInvalidError,
      'Se esperaba un error al llamar a save_invitation con teléfono no celular'
    );
    assert.ok(
      rpcInvalidError.message.includes('invitations_phone_format'),
      `Se esperaba que el error de save_invitation contuviera invitations_phone_format, pero se recibió: ${rpcInvalidError.message}`
    );

    const { data: storedInvalidInv, error: checkInvalidInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', rpcInvalidInvId);

    assert.equal(
      checkInvalidInvError,
      null,
      'Se esperaba consultar con el administrador sin error'
    );
    assert.equal(
      storedInvalidInv?.length,
      0,
      'Se esperaba que la invitación con teléfono no celular no se creara'
    );

    const validInvId = crypto.randomUUID();
    const validGuestId = crypto.randomUUID();
    const validPhone = '+573001234567';

    const { data: validData, error: validError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: validInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-TEL-VALIDO`,
        p_phone: validPhone,
        p_guests: [
          { id: validGuestId, full_name: 'Persona Telefono Valido' },
        ],
      }
    );

    assert.equal(
      validError,
      null,
      'Se esperaba que save_invitation con celular colombiano funcionara sin error'
    );
    assert.equal(
      validData?.phone,
      validPhone,
      'Se esperaba que el teléfono retornado por save_invitation fuera el celular enviado'
    );

    const { data: storedValidInv, error: checkValidInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('phone')
        .eq('id', validInvId)
        .single();

    assert.equal(
      checkValidInvError,
      null,
      'Se esperaba consultar la invitación válida con el administrador sin error'
    );
    assert.equal(
      storedValidInv?.phone,
      validPhone,
      'Se esperaba que el celular guardado en la base de datos coincidiera con el enviado'
    );
  }
);

test(
  '27. save_invitation crea una invitación individual y get_invitation devuelve su tipo y su código',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const individualInvId = crypto.randomUUID();
    const individualGuestId = crypto.randomUUID();
    const individualGroupName = `PRUEBA-${ctx.run}-Persona`;
    const differentGuestName = 'Nombre Diferente Que Debe Cambiar';

    const { data: savedData, error: saveError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: individualInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: individualGroupName,
        p_phone: '+573001234567',
        p_guests: [
          { id: individualGuestId, full_name: differentGuestName },
        ],
        p_kind: 'individual',
      }
    );

    assert.equal(
      saveError,
      null,
      'Se esperaba que save_invitation con kind individual se creara sin error'
    );
    assert.equal(
      savedData?.kind,
      'individual',
      'Se esperaba que la respuesta de save_invitation indicara kind = individual'
    );
    assert.equal(
      savedData?.guests?.length,
      1,
      'Se esperaba que la respuesta contuviera exactamente una persona'
    );
    assert.equal(
      savedData?.guests?.[0]?.full_name,
      individualGroupName,
      'Se esperaba que el nombre de la persona en la respuesta fuera igual a group_name'
    );

    ctx.test27InvitationId = individualInvId;
    ctx.test27GuestId = individualGuestId;

    const { data: storedInv, error: checkInvError } = await ctx.adminClient
      .from('invitations')
      .select('id, kind, code')
      .eq('id', individualInvId)
      .single();

    assert.equal(
      checkInvError,
      null,
      'Se esperaba consultar con el administrador la invitación individual sin error'
    );
    assert.equal(
      storedInv?.kind,
      'individual',
      'Se esperaba que la base de datos confirmara kind = individual'
    );

    const { data: storedGuests, error: checkGuestsError } = await ctx.adminClient
      .from('guests')
      .select('id, full_name')
      .eq('invitation_id', individualInvId);

    assert.equal(
      checkGuestsError,
      null,
      'Se esperaba consultar con el administrador las personas de la invitación individual'
    );
    assert.equal(
      storedGuests?.length,
      1,
      'Se esperaba exactamente una persona en la base de datos'
    );
    assert.equal(
      storedGuests?.[0]?.full_name,
      individualGroupName,
      'Se esperaba que el full_name de la persona en la base de datos fuera igual a group_name'
    );

    const lowerCaseCode = storedInv.code.toLowerCase();
    const { data: getInvData, error: getInvError } = await ctx.anonClient.rpc(
      'get_invitation',
      {
        p_code: lowerCaseCode,
      }
    );

    assert.equal(
      getInvError,
      null,
      'Se esperaba que get_invitation con código en minúsculas funcionara sin error'
    );
    assert.ok(
      getInvData?.invitation,
      'Se esperaba recibir el objeto de invitación desde get_invitation'
    );
    assert.equal(
      getInvData.invitation.kind,
      'individual',
      'Se esperaba que get_invitation devolviera kind = individual'
    );
    assert.equal(
      getInvData.invitation.code,
      storedInv.code,
      'Se esperaba que get_invitation devolviera el código guardado en mayúsculas'
    );
  }
);

test(
  '28. save_invitation valida el tipo y conserva el tipo existente si no se envía',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const twoGuestsInvId = crypto.randomUUID();
    const { error: twoGuestsError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: twoGuestsInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-DOS-PERSONAS`,
        p_phone: '+573001234567',
        p_guests: [
          { id: crypto.randomUUID(), full_name: 'Persona 1' },
          { id: crypto.randomUUID(), full_name: 'Persona 2' },
        ],
        p_kind: 'individual',
      }
    );

    assert.ok(
      twoGuestsError,
      'Se esperaba un error al crear una invitación individual con dos personas'
    );
    assert.ok(
      twoGuestsError.message.includes('individual_requires_one_guest'),
      `Se esperaba el código individual_requires_one_guest, pero se recibió: ${twoGuestsError.message}`
    );

    const { data: twoGuestsRows, error: checkTwoGuestsError } =
      await ctx.adminClient
        .from('invitations')
        .select('id')
        .eq('id', twoGuestsInvId);

    assert.equal(
      checkTwoGuestsError,
      null,
      'Se esperaba consultar con el administrador sin error'
    );
    assert.equal(
      twoGuestsRows?.length,
      0,
      'Se esperaba que no se hubiera creado la invitación con dos personas'
    );

    const invalidKindInvId = crypto.randomUUID();
    const { error: invalidKindError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: invalidKindInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-TIPO-INVALIDO`,
        p_phone: '+573001234567',
        p_guests: [
          { id: crypto.randomUUID(), full_name: 'Persona Tipo Invalido' },
        ],
        p_kind: 'otro',
      }
    );

    assert.ok(
      invalidKindError,
      'Se esperaba un error al enviar p_kind no reconocido'
    );
    assert.ok(
      invalidKindError.message.includes('invalid_kind'),
      `Se esperaba el código invalid_kind, pero se recibió: ${invalidKindError.message}`
    );

    const updatedGroupName = `PRUEBA-${ctx.run}-Persona-Renombrada`;
    const { data: updateData, error: updateError } = await ctx.ownerXClient.rpc(
      'save_invitation',
      {
        p_invitation_id: ctx.test27InvitationId,
        p_event_id: ctx.eventX.id,
        p_group_name: updatedGroupName,
        p_phone: '+573001234567',
        p_guests: [
          { id: ctx.test27GuestId, full_name: 'Nombre Que Se Debe Sobrescribir' },
        ],
      }
    );

    assert.equal(
      updateError,
      null,
      'Se esperaba que actualizar la invitación individual sin enviar p_kind no diera error'
    );
    assert.equal(
      updateData?.kind,
      'individual',
      'Se esperaba que se conservara el kind individual al omitir p_kind'
    );
    assert.equal(
      updateData?.guests?.[0]?.full_name,
      updatedGroupName,
      'Se esperaba que el nombre de la persona cambiara al nuevo group_name'
    );

    const { data: storedUpdatedInv, error: checkUpdatedInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('kind, group_name')
        .eq('id', ctx.test27InvitationId)
        .single();

    assert.equal(
      checkUpdatedInvError,
      null,
      'Se esperaba consultar la invitación actualizada con el administrador sin error'
    );
    assert.equal(
      storedUpdatedInv?.kind,
      'individual',
      'Se esperaba que en base de datos continuara con kind individual'
    );

    const { data: storedUpdatedGuest, error: checkUpdatedGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('full_name')
        .eq('id', ctx.test27GuestId)
        .single();

    assert.equal(
      checkUpdatedGuestError,
      null,
      'Se esperaba consultar la persona de la invitación con el administrador sin error'
    );
    assert.equal(
      storedUpdatedGuest?.full_name,
      updatedGroupName,
      'Se esperaba que en base de datos la persona tuviera el nuevo nombre'
    );

    const newGroupInvId = crypto.randomUUID();
    const newGroupGuestId = crypto.randomUUID();
    const { data: newGroupData, error: newGroupError } =
      await ctx.ownerXClient.rpc('save_invitation', {
        p_invitation_id: newGroupInvId,
        p_event_id: ctx.eventX.id,
        p_group_name: `PRUEBA-${ctx.run}-GRUPO-NUEVO`,
        p_phone: '+573001234567',
        p_guests: [
          { id: newGroupGuestId, full_name: 'Persona Grupo Nuevo' },
        ],
      });

    assert.equal(
      newGroupError,
      null,
      'Se esperaba crear una invitación nueva sin p_kind sin error'
    );
    assert.equal(
      newGroupData?.kind,
      'group',
      'Se esperaba que la nueva invitación tuviera kind = group por defecto'
    );

    const { data: storedNewGroupInv, error: checkNewGroupInvError } =
      await ctx.adminClient
        .from('invitations')
        .select('kind')
        .eq('id', newGroupInvId)
        .single();

    assert.equal(
      checkNewGroupInvError,
      null,
      'Se esperaba consultar con el administrador la nueva invitación grupal sin error'
    );
    assert.equal(
      storedNewGroupInv?.kind,
      'group',
      'Se esperaba que la base de datos confirmara kind = group para la nueva invitación'
    );
  }
);

test(
  '29. Un ayudante registra llegadas con record_arrivals',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const inv29Id = crypto.randomUUID();
    const guest1Id = crypto.randomUUID();
    const guest2Id = crypto.randomUUID();

    const { error: inv29Error } = await ctx.adminClient
      .from('invitations')
      .insert({
        id: inv29Id,
        event_id: ctx.eventX.id,
        group_name: `PRUEBA-${ctx.run}-LLEGADAS-29`,
      });

    assert.equal(
      inv29Error,
      null,
      'Se esperaba crear la invitación para la prueba 29 sin error'
    );

    const { error: guests29Error } = await ctx.adminClient
      .from('guests')
      .insert([
        { id: guest1Id, invitation_id: inv29Id, full_name: 'Persona Llegada 1', sort_order: 1 },
        { id: guest2Id, invitation_id: inv29Id, full_name: 'Persona Llegada 2', sort_order: 2 },
      ]);

    assert.equal(
      guests29Error,
      null,
      'Se esperaba crear las personas para la prueba 29 sin error'
    );

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const arrivalsPayload = [
      { guest_id: guest1Id, arrived_at: fiveMinutesAgo },
      { guest_id: guest2Id, arrived_at: fiveMinutesAgo },
    ];

    const { data: arrivalsData, error: arrivalsError } =
      await ctx.helperXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: arrivalsPayload,
      });

    assert.equal(
      arrivalsError,
      null,
      'Se esperaba que el ayudante llamara a record_arrivals sin error'
    );
    assert.ok(
      Array.isArray(arrivalsData),
      'Se esperaba que record_arrivals devolviera un arreglo'
    );
    assert.equal(
      arrivalsData.length,
      2,
      'Se esperaba que se devolvieran exactamente dos resultados de llegada'
    );

    const expectedTime = new Date(fiveMinutesAgo).getTime();

    for (let i = 0; i < arrivalsData.length; i += 1) {
      const item = arrivalsData[i];
      assert.equal(
        item.status,
        'recorded',
        `Se esperaba status = recorded para el elemento ${i}`
      );
      assert.equal(
        item.arrived_by,
        ctx.helperXUser.id,
        `Se esperaba que arrived_by fuera el id del ayudante para el elemento ${i}`
      );
      assert.equal(
        new Date(item.arrived_at).getTime(),
        expectedTime,
        `Se esperaba que arrived_at coincidiera con la hora enviada para el elemento ${i}`
      );
    }

    const { data: storedGuests, error: checkGuestsError } = await ctx.adminClient
      .from('guests')
      .select('id, arrived_at, arrived_by')
      .in('id', [guest1Id, guest2Id]);

    assert.equal(
      checkGuestsError,
      null,
      'Se esperaba consultar con el administrador los invitados en guests sin error'
    );
    assert.equal(
      storedGuests?.length,
      2,
      'Se esperaba encontrar los dos invitados en la base de datos'
    );

    for (const guest of storedGuests ?? []) {
      assert.equal(
        guest.arrived_by,
        ctx.helperXUser.id,
        'Se esperaba que arrived_by en base de datos fuera el id del ayudante'
      );
      assert.equal(
        new Date(guest.arrived_at).getTime(),
        expectedTime,
        'Se esperaba que arrived_at en base de datos fuera la hora enviada'
      );
    }

    ctx.test29ArrivalsPayload = arrivalsPayload;
    ctx.test29GuestIds = [guest1Id, guest2Id];
    ctx.test29RecordedAt = fiveMinutesAgo;
  }
);

test(
  '30. record_arrivals no pisa una llegada ya guardada, recorta horas futuras e ignora personas de otro evento',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: repeatData, error: repeatError } =
      await ctx.helperXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: ctx.test29ArrivalsPayload,
      });

    assert.equal(
      repeatError,
      null,
      'Se esperaba que repetir la llamada de llegadas no diera error'
    );
    assert.equal(
      repeatData?.length,
      2,
      'Se esperaba recibir dos resultados al repetir la llamada'
    );

    const originalTime = new Date(ctx.test29RecordedAt).getTime();

    for (const item of repeatData ?? []) {
      assert.equal(
        item.status,
        'already_arrived',
        'Se esperaba status = already_arrived al repetir la llamada'
      );
      assert.equal(
        item.arrived_by,
        ctx.helperXUser.id,
        'Se esperaba que arrived_by mantuviera el id original del ayudante'
      );
      assert.equal(
        new Date(item.arrived_at).getTime(),
        originalTime,
        'Se esperaba que arrived_at mantuviera la hora original'
      );
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const otherTimePayload = ctx.test29GuestIds.map((guestId) => ({
      guest_id: guestId,
      arrived_at: tenMinutesAgo,
    }));

    const { data: ownerAttemptData, error: ownerAttemptError } =
      await ctx.ownerXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: otherTimePayload,
      });

    assert.equal(
      ownerAttemptError,
      null,
      'Se esperaba que ownerXClient al llamar con otra hora no diera error'
    );

    for (const item of ownerAttemptData ?? []) {
      assert.equal(
        item.status,
        'already_arrived',
        'Se esperaba status = already_arrived con otra hora'
      );
      assert.equal(
        item.arrived_by,
        ctx.helperXUser.id,
        'Se esperaba que arrived_by no fuera pisado por el propietario'
      );
      assert.equal(
        new Date(item.arrived_at).getTime(),
        originalTime,
        'Se esperaba que arrived_at no fuera cambiado'
      );
    }

    const { data: storedAfterOwner, error: checkAfterOwnerError } =
      await ctx.adminClient
        .from('guests')
        .select('id, arrived_at, arrived_by')
        .in('id', ctx.test29GuestIds);

    assert.equal(
      checkAfterOwnerError,
      null,
      'Se esperaba consultar con el administrador sin error'
    );

    for (const guest of storedAfterOwner ?? []) {
      assert.equal(
        guest.arrived_by,
        ctx.helperXUser.id,
        'Se esperaba que la base de datos conservara arrived_by del ayudante'
      );
      assert.equal(
        new Date(guest.arrived_at).getTime(),
        originalTime,
        'Se esperaba que la base de datos conservara arrived_at original'
      );
    }

    const futureGuestInvId = crypto.randomUUID();
    const futureGuestId = crypto.randomUUID();

    await ctx.adminClient.from('invitations').insert({
      id: futureGuestInvId,
      event_id: ctx.eventX.id,
      group_name: `PRUEBA-${ctx.run}-FUTURA`,
    });
    await ctx.adminClient.from('guests').insert({
      id: futureGuestId,
      invitation_id: futureGuestInvId,
      full_name: 'Persona Hora Futura',
    });

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const beforeCallTime = Date.now();

    const { data: futureData, error: futureError } = await ctx.ownerXClient.rpc(
      'record_arrivals',
      {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: futureGuestId, arrived_at: tomorrow }],
      }
    );

    const afterCallTime = Date.now();

    assert.equal(
      futureError,
      null,
      'Se esperaba que registrar llegada con hora futura no diera error'
    );
    assert.equal(
      futureData?.[0]?.status,
      'recorded',
      'Se esperaba status = recorded para la persona con hora futura'
    );

    const recordedFutureTime = new Date(futureData?.[0]?.arrived_at).getTime();
    const toleranceMs = 2 * 60 * 1000;
    assert.ok(
      recordedFutureTime <= afterCallTime + toleranceMs,
      `Se esperaba que la hora registrada no fuera posterior al momento de la llamada: ${recordedFutureTime} > ${afterCallTime + toleranceMs}`
    );
    assert.ok(
      recordedFutureTime >= beforeCallTime - toleranceMs,
      `Se esperaba que la hora registrada fuera cercana al momento de la llamada: ${recordedFutureTime} < ${beforeCallTime - toleranceMs}`
    );

    const guestYId = ctx.guestY.id;

    const { data: foreignResult, error: foreignError } =
      await ctx.ownerXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: guestYId, arrived_at: new Date().toISOString() }],
      });

    assert.equal(
      foreignError,
      null,
      'Se esperaba que llamar con una persona de otro evento no lanzara excepción'
    );
    assert.equal(
      foreignResult?.[0]?.status,
      'not_found',
      'Se esperaba status = not_found para una persona de otro evento'
    );
    assert.equal(
      foreignResult?.[0]?.arrived_at,
      null,
      'Se esperaba arrived_at en null para la persona de otro evento'
    );
    assert.equal(
      foreignResult?.[0]?.arrived_by,
      null,
      'Se esperaba arrived_by en null para la persona de otro evento'
    );

    const { data: storedGuestY, error: checkGuestYError } =
      await ctx.adminClient
        .from('guests')
        .select('arrived_at, arrived_by')
        .eq('id', guestYId)
        .single();

    assert.equal(
      checkGuestYError,
      null,
      'Se esperaba consultar con el administrador la persona del evento Y sin error'
    );
    assert.equal(
      storedGuestY?.arrived_at,
      null,
      'Se esperaba que la persona del evento Y siguiera con arrived_at nulo'
    );
    assert.equal(
      storedGuestY?.arrived_by,
      null,
      'Se esperaba que la persona del evento Y siguiera con arrived_by nulo'
    );
  }
);

test(
  '31. record_arrivals rechaza a quien no es miembro, a clientes sin sesión y entradas inválidas',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { error: nonMemberError } = await ctx.ownerYClient.rpc(
      'record_arrivals',
      {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: crypto.randomUUID() }],
      }
    );

    assert.ok(
      nonMemberError,
      'Se esperaba un error cuando un usuario que no es miembro del evento intenta registrar llegadas'
    );
    assert.ok(
      nonMemberError.message.includes('not_event_member'),
      `Se esperaba el código not_event_member, pero se recibió: ${nonMemberError.message}`
    );

    const anonTestInvId = crypto.randomUUID();
    const anonTestGuestId = crypto.randomUUID();
    await ctx.adminClient.from('invitations').insert({
      id: anonTestInvId,
      event_id: ctx.eventX.id,
      group_name: `PRUEBA-${ctx.run}-ANON-LLEGADA`,
    });
    await ctx.adminClient.from('guests').insert({
      id: anonTestGuestId,
      invitation_id: anonTestInvId,
      full_name: 'Persona Prueba Anon',
    });

    const { error: anonError } = await ctx.anonClient.rpc('record_arrivals', {
      p_event_id: ctx.eventX.id,
      p_arrivals: [{ guest_id: anonTestGuestId }],
    });

    assert.ok(
      anonError,
      'Se esperaba un error al intentar llamar a record_arrivals sin sesión'
    );

    const { data: storedAnonGuest, error: checkAnonGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('arrived_at, arrived_by')
        .eq('id', anonTestGuestId)
        .single();

    assert.equal(
      checkAnonGuestError,
      null,
      'Se esperaba consultar con el administrador sin error'
    );
    assert.equal(
      storedAnonGuest?.arrived_at,
      null,
      'Se esperaba que arrived_at siguiera en nulo tras el intento anónimo'
    );
    assert.equal(
      storedAnonGuest?.arrived_by,
      null,
      'Se esperaba que arrived_by siguiera en nulo tras el intento anónimo'
    );

    const { error: emptyError } = await ctx.ownerXClient.rpc(
      'record_arrivals',
      {
        p_event_id: ctx.eventX.id,
        p_arrivals: [],
      }
    );

    assert.ok(
      emptyError,
      'Se esperaba un error al llamar a record_arrivals con arreglo vacío'
    );
    assert.ok(
      emptyError.message.includes('arrivals_required'),
      `Se esperaba el código arrivals_required, pero se recibió: ${emptyError.message}`
    );

    const arrivals501 = Array.from({ length: 501 }, () => ({
      guest_id: crypto.randomUUID(),
    }));

    const { error: tooManyError } = await ctx.ownerXClient.rpc(
      'record_arrivals',
      {
        p_event_id: ctx.eventX.id,
        p_arrivals: arrivals501,
      }
    );

    assert.ok(
      tooManyError,
      'Se esperaba un error al llamar a record_arrivals con más de 500 elementos'
    );
    assert.ok(
      tooManyError.message.includes('too_many_arrivals'),
      `Se esperaba el código too_many_arrivals, pero se recibió: ${tooManyError.message}`
    );

    const { error: invalidArrivalError } = await ctx.ownerXClient.rpc(
      'record_arrivals',
      {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: 'no-es-uuid' }],
      }
    );

    assert.ok(
      invalidArrivalError,
      'Se esperaba un error al enviar un guest_id que no es un UUID'
    );
    assert.ok(
      invalidArrivalError.message.includes('invalid_arrival'),
      `Se esperaba el código invalid_arrival, pero se recibió: ${invalidArrivalError.message}`
    );
  }
);

test(
  '32. Deshacer una llegada y reglas del disparador',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const inv32Id = crypto.randomUUID();
    const guest32Id = crypto.randomUUID();

    await ctx.adminClient.from('invitations').insert({
      id: inv32Id,
      event_id: ctx.eventX.id,
      group_name: `PRUEBA-${ctx.run}-LLEGADA-32`,
    });
    await ctx.adminClient.from('guests').insert({
      id: guest32Id,
      invitation_id: inv32Id,
      full_name: 'Persona Prueba 32',
    });

    const initialTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const { data: initialRecordData, error: initialRecordError } =
      await ctx.helperXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: guest32Id, arrived_at: initialTime }],
      });

    assert.equal(
      initialRecordError,
      null,
      'Se esperaba registrar la llegada inicial sin error'
    );
    assert.equal(
      initialRecordData?.[0]?.status,
      'recorded',
      'Se esperaba status = recorded en el registro inicial'
    );

    const { error: undoError } = await ctx.helperXClient
      .from('guests')
      .update({ arrived_at: null })
      .eq('id', guest32Id);

    assert.equal(
      undoError,
      null,
      'Se esperaba que el ayudante pudiera deshacer la llegada actualizando arrived_at a null'
    );

    const { data: storedAfterUndo, error: checkAfterUndoError } =
      await ctx.adminClient
        .from('guests')
        .select('arrived_at, arrived_by')
        .eq('id', guest32Id)
        .single();

    assert.equal(
      checkAfterUndoError,
      null,
      'Se esperaba consultar con el administrador la persona tras deshacer llegada'
    );
    assert.equal(
      storedAfterUndo?.arrived_at,
      null,
      'Se esperaba que arrived_at fuera nulo en la base de datos'
    );
    assert.equal(
      storedAfterUndo?.arrived_by,
      null,
      'Se esperaba que arrived_by fuera nulo en la base de datos'
    );

    const secondTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: secondRecordData, error: secondRecordError } =
      await ctx.helperXClient.rpc('record_arrivals', {
        p_event_id: ctx.eventX.id,
        p_arrivals: [{ guest_id: guest32Id, arrived_at: secondTime }],
      });

    assert.equal(
      secondRecordError,
      null,
      'Se esperaba volver a registrar la llegada sin error'
    );
    assert.equal(
      secondRecordData?.[0]?.status,
      'recorded',
      'Se esperaba status = recorded al registrar nuevamente tras deshacer'
    );

    const secondTimeMs = new Date(secondTime).getTime();
    assert.equal(
      new Date(secondRecordData?.[0]?.arrived_at).getTime(),
      secondTimeMs,
      'Se esperaba que la nueva hora de llegada fuera la enviada'
    );

    const attemptTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { error: updateAttemptError } = await ctx.ownerXClient
      .from('guests')
      .update({ arrived_at: attemptTime })
      .eq('id', guest32Id);

    assert.equal(
      updateAttemptError,
      null,
      'Se esperaba que el update no fallara pero el disparador protegiera los valores'
    );

    const { data: storedAfterAttempt, error: checkAfterAttemptError } =
      await ctx.adminClient
        .from('guests')
        .select('arrived_at, arrived_by')
        .eq('id', guest32Id)
        .single();

    assert.equal(
      checkAfterAttemptError,
      null,
      'Se esperaba consultar con el administrador tras el intento de sobrescritura'
    );
    assert.equal(
      new Date(storedAfterAttempt?.arrived_at).getTime(),
      secondTimeMs,
      'Se esperaba que arrived_at no cambiara tras el intento de sobrescritura'
    );
    assert.equal(
      storedAfterAttempt?.arrived_by,
      ctx.helperXUser.id,
      'Se esperaba que arrived_by no cambiara tras el intento de sobrescritura'
    );

    const newGuestWithArrivalId = crypto.randomUUID();
    const { error: insertWithArrivalError } = await ctx.adminClient
      .from('guests')
      .insert({
        id: newGuestWithArrivalId,
        invitation_id: inv32Id,
        full_name: 'Persona Nueva Con Llegada Forzada',
        arrived_at: new Date().toISOString(),
        arrived_by: ctx.ownerXUser.id,
      });

    assert.equal(
      insertWithArrivalError,
      null,
      'Se esperaba insertar la persona con el administrador sin error'
    );

    const { data: storedInsertedGuest, error: checkInsertedGuestError } =
      await ctx.adminClient
        .from('guests')
        .select('arrived_at, arrived_by')
        .eq('id', newGuestWithArrivalId)
        .single();

    assert.equal(
      checkInsertedGuestError,
      null,
      'Se esperaba consultar la persona recién insertada con el administrador'
    );
    assert.equal(
      storedInsertedGuest?.arrived_at,
      null,
      'Se esperaba que arrived_at quedara en nulo por regla del disparador en INSERT'
    );
    assert.equal(
      storedInsertedGuest?.arrived_by,
      null,
      'Se esperaba que arrived_by quedara en nulo por regla del disparador en INSERT'
    );
  }
);

test(
  '33. Dos familias apartan el último cupo al mismo tiempo y solo una lo logra',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: gift33, error: createGiftError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: `PRUEBA-${ctx.run}-REGALO-33`,
        kind: 'repeatable',
        max_reservations: 2,
        sort_order: 33,
      })
      .select()
      .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo repetible con tope 2 sin error'
    );
    assert.ok(
      gift33?.id,
      'Se esperaba recibir el id del regalo repetible creado para la prueba 33'
    );

    const { error: reserveAError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift33.id,
    });

    assert.equal(
      reserveAError,
      null,
      'Se esperaba que la familia A pudiera apartar el primer cupo sin error'
    );

    const [resultB, resultC] = await Promise.all([
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationB.code,
        p_gift_id: gift33.id,
      }),
      ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationC.code,
        p_gift_id: gift33.id,
      }),
    ]);

    const results = [resultB, resultC];
    const successes = results.filter((r) => !r.error);
    const fullErrors = results.filter(
      (r) => r.error && r.error.message.includes('gift_full')
    );

    assert.equal(
      successes.length,
      1,
      'Se esperaba que exactamente una de las familias B o C lograra apartar el cupo restante'
    );
    assert.equal(
      fullErrors.length,
      1,
      'Se esperaba que exactamente una de las familias recibiera el error con gift_full'
    );

    const { data: reservations33, error: res33Error } = await ctx.adminClient
      .from('gift_reservations')
      .select('id, invitation_id')
      .eq('gift_id', gift33.id);

    assert.equal(
      res33Error,
      null,
      'Se esperaba consultar con el administrador las reservas del regalo sin error'
    );
    assert.equal(
      reservations33?.length,
      2,
      'Se esperaba que el regalo tuviera exactamente 2 reservas con el administrador'
    );

    const { data: giftsA, error: giftsAError } = await ctx.anonClient.rpc(
      'get_gifts',
      { p_code: ctx.invitationA.code }
    );

    assert.equal(
      giftsAError,
      null,
      'Se esperaba consultar get_gifts para la familia A sin error'
    );
    const itemA = (giftsA ?? []).find((g) => g.id === gift33.id);
    assert.ok(
      itemA,
      'Se esperaba encontrar el regalo en la respuesta de get_gifts de la familia A'
    );
    assert.equal(
      itemA.remaining,
      0,
      'Se esperaba que remaining fuera 0 para el regalo completo'
    );
    assert.equal(
      itemA.full,
      true,
      'Se esperaba que full fuera true para el regalo completo'
    );
  }
);

test(
  '34. La misma familia que aparta dos veces no consume dos cupos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: gift34, error: createGiftError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: `PRUEBA-${ctx.run}-REGALO-34`,
        kind: 'repeatable',
        max_reservations: 2,
        sort_order: 34,
      })
      .select()
      .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo repetible con tope 2 sin error'
    );
    assert.ok(
      gift34?.id,
      'Se esperaba recibir el id del regalo repetible creado para la prueba 34'
    );

    const { error: reserveA1Error } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift34.id,
    });

    assert.equal(
      reserveA1Error,
      null,
      'Se esperaba que la primera llamada a reserve_gift de la familia A no devolviera error'
    );

    const { error: reserveA2Error } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift34.id,
    });

    assert.equal(
      reserveA2Error,
      null,
      'Se esperaba que la segunda llamada a reserve_gift de la misma familia A no devolviera error'
    );

    const { data: reservationsAfterTwice, error: resTwiceError } =
      await ctx.adminClient
        .from('gift_reservations')
        .select('id, invitation_id')
        .eq('gift_id', gift34.id);

    assert.equal(
      resTwiceError,
      null,
      'Se esperaba consultar con el administrador las reservas del regalo sin error'
    );
    assert.equal(
      reservationsAfterTwice?.length,
      1,
      'Se esperaba exactamente 1 reserva tras apartar dos veces la misma familia'
    );

    const { data: giftsAAfterTwice, error: giftsAError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: ctx.invitationA.code,
      });

    assert.equal(
      giftsAError,
      null,
      'Se esperaba consultar get_gifts para la familia A sin error'
    );
    const itemAAfterTwice = (giftsAAfterTwice ?? []).find(
      (g) => g.id === gift34.id
    );
    assert.ok(
      itemAAfterTwice,
      'Se esperaba encontrar el regalo en get_gifts de la familia A'
    );
    assert.equal(
      itemAAfterTwice.remaining,
      1,
      'Se esperaba remaining = 1 tras apartar una sola familia en un regalo con tope 2'
    );
    assert.equal(
      itemAAfterTwice.full,
      false,
      'Se esperaba full = false cuando aún queda cupo disponible'
    );

    const { data: giftsBReserve, error: reserveBError } =
      await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationB.code,
        p_gift_id: gift34.id,
      });

    assert.equal(
      reserveBError,
      null,
      'Se esperaba que la familia B pudiera apartar el segundo cupo sin error'
    );
    const itemB = (giftsBReserve ?? []).find((g) => g.id === gift34.id);
    assert.ok(
      itemB,
      'Se esperaba encontrar el regalo en la respuesta devuelta a la familia B'
    );
    assert.equal(
      itemB.full,
      true,
      'Se esperaba full = true tras ocuparse el último cupo'
    );
    assert.equal(
      itemB.remaining,
      0,
      'Se esperaba remaining = 0 tras ocuparse el último cupo'
    );

    const { error: reserveA3Error } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift34.id,
    });

    assert.equal(
      reserveA3Error,
      null,
      'Se esperaba que la familia A al apartar de nuevo con el regalo completo respondiera sin error'
    );

    const { data: reservationsFinal, error: resFinalError } =
      await ctx.adminClient
        .from('gift_reservations')
        .select('id, invitation_id')
        .eq('gift_id', gift34.id);

    assert.equal(
      resFinalError,
      null,
      'Se esperaba consultar con el administrador las reservas finales sin error'
    );
    assert.equal(
      reservationsFinal?.length,
      2,
      'Se esperaba que siguiera habiendo exactamente 2 reservas tras el reintento de la familia A'
    );
  }
);

test(
  '35. Liberar un regalo devuelve el cupo',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: gift35, error: createGiftError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: `PRUEBA-${ctx.run}-REGALO-35`,
        kind: 'repeatable',
        max_reservations: 2,
        sort_order: 35,
      })
      .select()
      .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo repetible con tope 2 sin error'
    );
    assert.ok(
      gift35?.id,
      'Se esperaba recibir el id del regalo repetible creado para la prueba 35'
    );

    const { error: reserveAError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift35.id,
    });

    assert.equal(
      reserveAError,
      null,
      'Se esperaba que la familia A pudiera apartar el primer cupo sin error'
    );

    const { error: reserveBError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationB.code,
      p_gift_id: gift35.id,
    });

    assert.equal(
      reserveBError,
      null,
      'Se esperaba que la familia B pudiera apartar el segundo cupo sin error'
    );

    const { error: reserveCError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationC.code,
      p_gift_id: gift35.id,
    });

    assert.ok(
      reserveCError,
      'Se esperaba un error cuando la familia C intenta apartar un regalo lleno'
    );
    assert.ok(
      reserveCError.message.includes('gift_full'),
      `Se esperaba el código gift_full, pero se recibió: ${reserveCError.message}`
    );

    const { data: releaseData, error: releaseError } = await ctx.anonClient.rpc(
      'release_gift',
      {
        p_code: ctx.invitationA.code,
        p_gift_id: gift35.id,
      }
    );

    assert.equal(
      releaseError,
      null,
      'Se esperaba que la familia A pudiera liberar el regalo sin error'
    );
    const releasedGift = (releaseData ?? []).find((g) => g.id === gift35.id);
    assert.ok(
      releasedGift,
      'Se esperaba encontrar el regalo en la respuesta de release_gift'
    );
    assert.equal(
      releasedGift.remaining,
      1,
      'Se esperaba remaining = 1 para el regalo tras ser liberado'
    );
    assert.equal(
      releasedGift.full,
      false,
      'Se esperaba full = false para el regalo tras ser liberado'
    );

    const { data: reserveCData, error: reserveCSuccessError } =
      await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationC.code,
        p_gift_id: gift35.id,
      });

    assert.equal(
      reserveCSuccessError,
      null,
      'Se esperaba que la familia C pudiera apartar el regalo liberado sin error'
    );
    const reservedByCGift = (reserveCData ?? []).find(
      (g) => g.id === gift35.id
    );
    assert.ok(
      reservedByCGift,
      'Se esperaba encontrar el regalo en la respuesta devuelta a la familia C'
    );
    assert.equal(
      reservedByCGift.full,
      true,
      'Se esperaba full = true tras apartar el cupo que fue liberado'
    );
    assert.equal(
      reservedByCGift.remaining,
      0,
      'Se esperaba remaining = 0 tras apartar el cupo que fue liberado'
    );
  }
);

test(
  '36. El organizador no puede bajar el límite por debajo de las reservas',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: gift36, error: createGiftError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: `PRUEBA-${ctx.run}-REGALO-36`,
        kind: 'repeatable',
        max_reservations: 3,
        sort_order: 36,
      })
      .select()
      .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo repetible con tope 3 sin error'
    );
    assert.ok(
      gift36?.id,
      'Se esperaba recibir el id del regalo repetible creado para la prueba 36'
    );

    const { error: resAError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationA.code,
      p_gift_id: gift36.id,
    });
    assert.equal(
      resAError,
      null,
      'Se esperaba que la familia A pudiera apartar sin error'
    );

    const { error: resBError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationB.code,
      p_gift_id: gift36.id,
    });
    assert.equal(
      resBError,
      null,
      'Se esperaba que la familia B pudiera apartar sin error'
    );

    const { error: resCError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationC.code,
      p_gift_id: gift36.id,
    });
    assert.equal(
      resCError,
      null,
      'Se esperaba que la familia C pudiera apartar sin error'
    );

    const { error: updateTo2Error } = await ctx.ownerXClient
      .from('gifts')
      .update({ max_reservations: 2 })
      .eq('id', gift36.id);

    assert.ok(
      updateTo2Error,
      'Se esperaba un error al intentar bajar el tope por debajo del número de reservas'
    );
    assert.ok(
      updateTo2Error.message.includes('reservations_exceed_limit'),
      `Se esperaba reservations_exceed_limit, pero se recibió: ${updateTo2Error.message}`
    );

    const { data: giftAfterFailedUpdate, error: checkGiftError } =
      await ctx.adminClient
        .from('gifts')
        .select('max_reservations')
        .eq('id', gift36.id)
        .single();

    assert.equal(
      checkGiftError,
      null,
      'Se esperaba consultar el regalo con el administrador sin error'
    );
    assert.equal(
      giftAfterFailedUpdate?.max_reservations,
      3,
      'Se esperaba que max_reservations mantuviera su valor original de 3 tras fallar el update'
    );

    const { error: updateTo4Error } = await ctx.ownerXClient
      .from('gifts')
      .update({ max_reservations: 4 })
      .eq('id', gift36.id);

    assert.equal(
      updateTo4Error,
      null,
      'Se esperaba que subir max_reservations a 4 fuera exitoso'
    );

    const { data: giftsAfterUpdate, error: giftsUpdateError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: ctx.invitationA.code,
      });

    assert.equal(
      giftsUpdateError,
      null,
      'Se esperaba consultar get_gifts tras subir el tope sin error'
    );
    const giftAfterUpdateItem = (giftsAfterUpdate ?? []).find(
      (g) => g.id === gift36.id
    );
    assert.ok(
      giftAfterUpdateItem,
      'Se esperaba encontrar el regalo en get_gifts tras actualizar el tope'
    );
    assert.equal(
      giftAfterUpdateItem.remaining,
      1,
      'Se esperaba que remaining fuera 1 al subir el tope a 4 con 3 reservas'
    );
    assert.equal(
      giftAfterUpdateItem.full,
      false,
      'Se esperaba que full fuera false al subir el tope a 4 con 3 reservas'
    );
    assert.equal(
      giftAfterUpdateItem.max_reservations,
      4,
      'Se esperaba que max_reservations fuera 4 en get_gifts'
    );
  }
);

test(
  '37. Un regalo único, libre o sugerencia no acepta límite y el límite debe ser 2 o más',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const uniqueInvalidName = `PRUEBA-${ctx.run}-REGALO-37-UNIQUE-INVALID`;
    const { error: uniqueError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: uniqueInvalidName,
        kind: 'unique',
        max_reservations: 1,
      });

    assert.ok(
      uniqueError,
      'Se esperaba un error al crear un regalo unique con max_reservations'
    );
    assert.equal(
      uniqueError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      uniqueError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${uniqueError.message}`
    );

    const freeInvalidName = `PRUEBA-${ctx.run}-REGALO-37-FREE-INVALID`;
    const { error: freeError } = await ctx.ownerYClient
      .from('gifts')
      .insert({
        event_id: ctx.eventY.id,
        name: freeInvalidName,
        kind: 'free',
        max_reservations: 1,
      });

    assert.ok(
      freeError,
      'Se esperaba un error al crear un regalo free con max_reservations'
    );
    assert.equal(
      freeError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      freeError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${freeError.message}`
    );

    const suggestionInvalidName = `PRUEBA-${ctx.run}-REGALO-37-SUGGESTION-INVALID`;
    const { error: suggestionError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: suggestionInvalidName,
        kind: 'suggestion',
        max_reservations: 2,
      });

    assert.ok(
      suggestionError,
      'Se esperaba un error al crear un regalo suggestion con max_reservations'
    );
    assert.equal(
      suggestionError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      suggestionError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${suggestionError.message}`
    );

    const zeroInvalidName = `PRUEBA-${ctx.run}-REGALO-37-ZERO-INVALID`;
    const { error: zeroError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: zeroInvalidName,
        kind: 'repeatable',
        max_reservations: 0,
      });

    assert.ok(
      zeroError,
      'Se esperaba un error al crear un regalo repeatable con max_reservations = 0'
    );
    assert.equal(
      zeroError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      zeroError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${zeroError.message}`
    );

    const oneInvalidName = `PRUEBA-${ctx.run}-REGALO-37-ONE-INVALID`;
    const { error: oneError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: oneInvalidName,
        kind: 'repeatable',
        max_reservations: 1,
      });

    assert.ok(
      oneError,
      'Se esperaba un error al crear un regalo repeatable con max_reservations = 1'
    );
    assert.equal(
      oneError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      oneError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${oneError.message}`
    );

    const validRepeatableName = `PRUEBA-${ctx.run}-REGALO-37-REPEATABLE-VALID`;
    const { data: createdRepeatable, error: createValidError } =
      await ctx.ownerXClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: validRepeatableName,
          kind: 'repeatable',
          max_reservations: 2,
        })
        .select()
        .single();

    assert.equal(
      createValidError,
      null,
      'Se esperaba crear el regalo repeatable con max_reservations = 2 sin error'
    );
    assert.ok(
      createdRepeatable?.id,
      'Se esperaba recibir el id del regalo repeatable válido'
    );

    const { error: changeKindError } = await ctx.ownerXClient
      .from('gifts')
      .update({ kind: 'unique' })
      .eq('id', createdRepeatable.id);

    assert.ok(
      changeKindError,
      'Se esperaba un error al cambiar kind a unique sin quitar el tope max_reservations'
    );
    assert.equal(
      changeKindError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      changeKindError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${changeKindError.message}`
    );

    const failedNames = [
      uniqueInvalidName,
      freeInvalidName,
      suggestionInvalidName,
      zeroInvalidName,
      oneInvalidName,
    ];
    const { data: failedGifts, error: checkFailedError } = await ctx.adminClient
      .from('gifts')
      .select('id, name')
      .in('name', failedNames);

    assert.equal(
      checkFailedError,
      null,
      'Se esperaba consultar los regalos fallidos con el administrador sin error'
    );
    assert.equal(
      failedGifts?.length,
      0,
      'Se esperaba que ninguno de los intentos fallidos dejara un regalo creado en la base de datos'
    );
  }
);


test(
  '38. Un propietario crea un evento con el tema de miel y un tema que no existe falla',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const startsAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
    const rsvpDeadline = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

    const { data: honeyEvent, error: honeyError } = await ctx.ownerXClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-TEMA-MIEL`,
        theme_id: 'honey-bee',
        starts_at: startsAt,
        rsvp_deadline: rsvpDeadline,
      })
      .select()
      .single();

    assert.equal(
      honeyError,
      null,
      'Se esperaba que el propietario X pudiera crear un evento con el tema honey-bee'
    );
    assert.ok(honeyEvent?.id, 'Se esperaba recibir el id del evento con el tema de miel');
    ctx.createdEventIds.push(honeyEvent.id);
    assert.equal(
      honeyEvent.theme_id,
      'honey-bee',
      'Se esperaba que el evento quedara guardado con el tema honey-bee'
    );

    const invalidName = `PRUEBA-${ctx.run}-TEMA-INEXISTENTE`;
    const { error: invalidError } = await ctx.ownerXClient.from('events').insert({
      name: invalidName,
      theme_id: 'tema-inexistente',
      starts_at: startsAt,
      rsvp_deadline: rsvpDeadline,
    });

    assert.ok(invalidError, 'Se esperaba un error al crear un evento con un tema que no existe');
    assert.equal(
      invalidError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      invalidError.message.includes('events_theme_id_valid'),
      `Se esperaba la restricción events_theme_id_valid, pero se recibió: ${invalidError.message}`
    );

    const { data: invalidEvents, error: checkError } = await ctx.adminClient
      .from('events')
      .select('id')
      .eq('name', invalidName);

    assert.equal(
      checkError,
      null,
      'Se esperaba consultar el evento fallido con el administrador sin error'
    );
    assert.equal(
      invalidEvents?.length,
      0,
      'Se esperaba que el intento fallido no dejara un evento creado en la base de datos'
    );
  }
);

test(
  '39. Un ayudante marca y desmarca el envío por WhatsApp, un usuario ajeno no y el invitado no lo ve',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: invitation, error: createError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: ctx.eventX.id,
        group_name: `PRUEBA-${ctx.run}-ENVIO-WHATSAPP`,
        phone: '+573000000039',
      })
      .select()
      .single();

    assert.equal(
      createError,
      null,
      'Se esperaba crear con el administrador la invitación para la prueba 39 sin error'
    );
    assert.ok(invitation?.id, 'Se esperaba recibir el id de la invitación de la prueba 39');

    try {
      const sentAt = new Date().toISOString();
      const { data: marked, error: markError } = await ctx.helperXClient
        .from('invitations')
        .update({ whatsapp_sent_at: sentAt })
        .eq('id', invitation.id)
        .select('whatsapp_sent_at')
        .single();

      assert.equal(
        markError,
        null,
        'Se esperaba que el ayudante pudiera marcar la invitación como enviada'
      );
      assert.equal(
        new Date(marked.whatsapp_sent_at).getTime(),
        new Date(sentAt).getTime(),
        'Se esperaba que whatsapp_sent_at quedara con la fecha enviada por el ayudante'
      );

      const { data: inviteeView, error: inviteeError } = await ctx.anonClient.rpc(
        'get_invitation',
        { p_code: invitation.code }
      );

      assert.equal(
        inviteeError,
        null,
        'Se esperaba que get_invitation con el código de la prueba 39 no devolviera error'
      );
      assert.ok(inviteeView, 'Se esperaba recibir la invitación desde get_invitation');
      assert.ok(
        !JSON.stringify(inviteeView).includes('whatsapp_sent_at'),
        'Se esperaba que get_invitation no expusiera whatsapp_sent_at en ninguna parte del JSON'
      );

      const { data: outsiderRows, error: outsiderError } = await ctx.ownerYClient
        .from('invitations')
        .update({ whatsapp_sent_at: null })
        .eq('id', invitation.id)
        .select('id');

      assert.equal(
        outsiderError,
        null,
        'Se esperaba que la actualización de un usuario ajeno no devolviera error, solo cero filas'
      );
      assert.equal(
        outsiderRows?.length ?? 0,
        0,
        'Se esperaba que un usuario que no es miembro del evento no pudiera quitar la marca'
      );

      const { data: stillMarked, error: stillMarkedError } = await ctx.adminClient
        .from('invitations')
        .select('whatsapp_sent_at')
        .eq('id', invitation.id)
        .single();

      assert.equal(
        stillMarkedError,
        null,
        'Se esperaba consultar la invitación con el administrador sin error'
      );
      assert.ok(
        stillMarked.whatsapp_sent_at,
        'Se esperaba que la marca siguiera puesta tras el intento del usuario ajeno'
      );

      const { data: cleared, error: clearError } = await ctx.helperXClient
        .from('invitations')
        .update({ whatsapp_sent_at: null })
        .eq('id', invitation.id)
        .select('whatsapp_sent_at')
        .single();

      assert.equal(
        clearError,
        null,
        'Se esperaba que el ayudante pudiera quitar la marca de enviada'
      );
      assert.equal(
        cleared.whatsapp_sent_at,
        null,
        'Se esperaba que whatsapp_sent_at quedara en null tras desmarcar'
      );
    } finally {
      await ctx.adminClient.from('invitations').delete().eq('id', invitation.id);
    }
  }
);

test(
  '40. Registrar una llegada no cambia la respuesta de la persona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const invId = crypto.randomUUID();
    const guestPendingId = crypto.randomUUID();
    const guestAcceptedId = crypto.randomUUID();
    const guestDeclinedId = crypto.randomUUID();

    try {
      const { error: invError } = await ctx.adminClient
        .from('invitations')
        .insert({
          id: invId,
          event_id: ctx.eventX.id,
          group_name: `PRUEBA-${ctx.run}-LLEGADAS-40`,
        });

      assert.equal(
        invError,
        null,
        'Se esperaba crear la invitación para la prueba 40 sin error'
      );

      const { error: guestsError } = await ctx.adminClient
        .from('guests')
        .insert([
          {
            id: guestPendingId,
            invitation_id: invId,
            full_name: 'Persona Pendiente',
            rsvp: 'pending',
            sort_order: 1,
          },
          {
            id: guestAcceptedId,
            invitation_id: invId,
            full_name: 'Persona Aceptada',
            rsvp: 'accepted',
            sort_order: 2,
          },
          {
            id: guestDeclinedId,
            invitation_id: invId,
            full_name: 'Persona Rechazada',
            rsvp: 'declined',
            sort_order: 3,
          },
        ]);

      assert.equal(
        guestsError,
        null,
        'Se esperaba crear las personas para la prueba 40 sin error'
      );

      const { data: initialGuests, error: initialError } = await ctx.adminClient
        .from('guests')
        .select('id, rsvp, rsvp_updated_at')
        .in('id', [guestPendingId, guestAcceptedId, guestDeclinedId]);

      assert.equal(
        initialError,
        null,
        'Se esperaba consultar las personas iniciales para la prueba 40 sin error'
      );
      assert.equal(
        initialGuests?.length,
        3,
        'Se esperaba obtener exactamente tres personas iniciales'
      );

      const initialMap = new Map(
        initialGuests.map((g) => [g.id, g])
      );

      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const arrivalsPayload = [
        { guest_id: guestPendingId, arrived_at: twoMinutesAgo },
        { guest_id: guestAcceptedId, arrived_at: twoMinutesAgo },
        { guest_id: guestDeclinedId, arrived_at: twoMinutesAgo },
      ];

      const { data: arrivalsData, error: arrivalsError } =
        await ctx.helperXClient.rpc('record_arrivals', {
          p_event_id: ctx.eventX.id,
          p_arrivals: arrivalsPayload,
        });

      assert.equal(
        arrivalsError,
        null,
        'Se esperaba que el ayudante llamara a record_arrivals sin error'
      );
      assert.ok(
        Array.isArray(arrivalsData),
        'Se esperaba que record_arrivals devolviera un arreglo'
      );
      assert.equal(
        arrivalsData.length,
        3,
        'Se esperaba que se devolvieran exactamente tres resultados de llegada'
      );

      for (const item of arrivalsData) {
        assert.equal(
          item.status,
          'recorded',
          `Se esperaba status = recorded para la persona ${item.guest_id}`
        );
      }

      const { data: finalGuests, error: finalError } = await ctx.adminClient
        .from('guests')
        .select('id, rsvp, rsvp_updated_at, arrived_at')
        .in('id', [guestPendingId, guestAcceptedId, guestDeclinedId]);

      assert.equal(
        finalError,
        null,
        'Se esperaba consultar las personas finales para la prueba 40 sin error'
      );
      assert.equal(
        finalGuests?.length,
        3,
        'Se esperaba obtener las tres personas finales'
      );

      for (const finalGuest of finalGuests) {
        const initial = initialMap.get(finalGuest.id);
        assert.ok(initial, `Se esperaba encontrar el estado inicial de la persona ${finalGuest.id}`);
        assert.equal(
          finalGuest.rsvp,
          initial.rsvp,
          `Se esperaba que rsvp se mantuviera igual para la persona ${finalGuest.id}`
        );
        assert.equal(
          finalGuest.rsvp_updated_at,
          initial.rsvp_updated_at,
          `Se esperaba que rsvp_updated_at se mantuviera igual para la persona ${finalGuest.id}`
        );
        assert.ok(
          finalGuest.arrived_at !== null,
          `Se esperaba que arrived_at ya no fuera null para la persona ${finalGuest.id}`
        );
      }
    } finally {
      await ctx.adminClient.from('invitations').delete().eq('id', invId);
    }
  }
);

test(
  '41. Reservar una sugerencia falla y no deja reserva',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const suggestionName = `PRUEBA-${ctx.run}-REGALO-41-SUGERENCIA`;
    const repeatableName = `PRUEBA-${ctx.run}-REGALO-41-REPETIBLE`;
    let suggestionId;
    let repeatableId;

    try {
      const { data: suggestionGift, error: createSuggestionError } =
        await ctx.adminClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: suggestionName,
            kind: 'suggestion',
            sort_order: 41,
          })
          .select()
          .single();

      assert.equal(
        createSuggestionError,
        null,
        'Se esperaba crear la sugerencia con el administrador sin error'
      );
      assert.ok(
        suggestionGift?.id,
        'Se esperaba recibir el id de la sugerencia creada para la prueba 41'
      );
      suggestionId = suggestionGift.id;

      const { data: repeatableGift, error: createRepeatableError } =
        await ctx.adminClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: repeatableName,
            kind: 'repeatable',
            max_reservations: 2,
            sort_order: 42,
          })
          .select()
          .single();

      assert.equal(
        createRepeatableError,
        null,
        'Se esperaba crear el repetible con tope 2 con el administrador sin error'
      );
      assert.ok(
        repeatableGift?.id,
        'Se esperaba recibir el id del repetible creado para la prueba 41'
      );
      repeatableId = repeatableGift.id;

      const { error: reserveSuggestionError } = await ctx.anonClient.rpc(
        'reserve_gift',
        {
          p_code: ctx.invitationA.code,
          p_gift_id: suggestionId,
        }
      );

      assert.ok(
        reserveSuggestionError,
        'Se esperaba un error al apartar una sugerencia'
      );
      assert.equal(
        reserveSuggestionError.message,
        'gift_not_reservable',
        `Se esperaba el mensaje de error gift_not_reservable, pero se recibió: ${reserveSuggestionError.message}`
      );

      const { data: reservationsForSuggestion, error: checkReservationsError } =
        await ctx.adminClient
          .from('gift_reservations')
          .select('id')
          .eq('gift_id', suggestionId);

      assert.equal(
        checkReservationsError,
        null,
        'Se esperaba consultar las reservas de la sugerencia sin error'
      );
      assert.equal(
        reservationsForSuggestion?.length,
        0,
        'Se esperaba que no hubiera filas en gift_reservations para la sugerencia'
      );

      const { data: giftsList, error: getGiftsError } = await ctx.anonClient.rpc(
        'get_gifts',
        { p_code: ctx.invitationA.code }
      );

      assert.equal(
        getGiftsError,
        null,
        'Se esperaba consultar get_gifts sin error'
      );

      const suggestionItem = (giftsList ?? []).find(
        (g) => g.id === suggestionId
      );
      assert.ok(
        suggestionItem,
        'Se esperaba encontrar la sugerencia en get_gifts'
      );
      assert.equal(
        suggestionItem.kind,
        'suggestion',
        'Se esperaba kind = suggestion para la sugerencia'
      );
      assert.equal(
        suggestionItem.reserved_by_me,
        false,
        'Se esperaba reserved_by_me = false para la sugerencia'
      );
      assert.equal(
        suggestionItem.taken,
        false,
        'Se esperaba taken = false para la sugerencia'
      );
      assert.equal(
        suggestionItem.remaining,
        null,
        'Se esperaba remaining = null para la sugerencia'
      );
      assert.equal(
        suggestionItem.full,
        false,
        'Se esperaba full = false para la sugerencia'
      );
      assert.equal(
        suggestionItem.max_reservations,
        null,
        'Se esperaba max_reservations = null para la sugerencia'
      );

      const repeatableItem = (giftsList ?? []).find(
        (g) => g.id === repeatableId
      );
      assert.ok(
        repeatableItem,
        'Se esperaba encontrar el repetible en get_gifts'
      );
      assert.equal(
        repeatableItem.max_reservations,
        2,
        'Se esperaba max_reservations = 2 para el repetible'
      );
      assert.equal(
        repeatableItem.remaining,
        2,
        'Se esperaba remaining = 2 para el repetible'
      );

      const { error: reserveRepeatableError } = await ctx.anonClient.rpc(
        'reserve_gift',
        {
          p_code: ctx.invitationA.code,
          p_gift_id: repeatableId,
        }
      );

      assert.equal(
        reserveRepeatableError,
        null,
        'Se esperaba que la familia A pudiera apartar el repetible sin error'
      );
    } finally {
      const idsToDelete = [suggestionId, repeatableId].filter(Boolean);
      if (idsToDelete.length > 0) {
        await ctx.adminClient.from('gifts').delete().in('id', idsToDelete);
      }
    }
  }
);

test(
  '42. Un repetible exige tope de 2 o más y una sugerencia no acepta tope',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const nullLimitName = `PRUEBA-${ctx.run}-REGALO-42-NULL-LIMIT`;
    const { error: nullLimitError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: nullLimitName,
        kind: 'repeatable',
        max_reservations: null,
      });

    assert.ok(
      nullLimitError,
      'Se esperaba un error al crear un repetible con max_reservations = null'
    );
    assert.equal(
      nullLimitError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      nullLimitError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${nullLimitError.message}`
    );

    const oneLimitName = `PRUEBA-${ctx.run}-REGALO-42-ONE-LIMIT`;
    const { error: oneLimitError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: oneLimitName,
        kind: 'repeatable',
        max_reservations: 1,
      });

    assert.ok(
      oneLimitError,
      'Se esperaba un error al crear un repetible con max_reservations = 1'
    );
    assert.equal(
      oneLimitError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      oneLimitError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${oneLimitError.message}`
    );

    const suggestionWithLimitName = `PRUEBA-${ctx.run}-REGALO-42-SUGG-WITH-LIMIT`;
    const { error: suggWithLimitError } = await ctx.ownerXClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: suggestionWithLimitName,
        kind: 'suggestion',
        max_reservations: 2,
      });

    assert.ok(
      suggWithLimitError,
      'Se esperaba un error al crear una sugerencia con max_reservations = 2'
    );
    assert.equal(
      suggWithLimitError.code,
      '23514',
      'Se esperaba el código de error 23514 (check_violation)'
    );
    assert.ok(
      suggWithLimitError.message.includes('gifts_max_reservations_valid'),
      `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${suggWithLimitError.message}`
    );

    let validSuggestionId;
    let validRepeatableId;

    try {
      const validSuggestionName = `PRUEBA-${ctx.run}-REGALO-42-SUGG-VALID`;
      const { data: createdSuggestion, error: createSuggestionError } =
        await ctx.ownerXClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: validSuggestionName,
            kind: 'suggestion',
          })
          .select()
          .single();

      assert.equal(
        createSuggestionError,
        null,
        'Se esperaba crear una sugerencia sin tope sin error'
      );
      assert.ok(
        createdSuggestion?.id,
        'Se esperaba recibir el id de la sugerencia creada'
      );
      validSuggestionId = createdSuggestion.id;

      const validRepeatableName = `PRUEBA-${ctx.run}-REGALO-42-REP-VALID`;
      const { data: createdRepeatable, error: createRepeatableError } =
        await ctx.ownerXClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: validRepeatableName,
            kind: 'repeatable',
            max_reservations: 2,
          })
          .select()
          .single();

      assert.equal(
        createRepeatableError,
        null,
        'Se esperaba crear un repetible válido con max_reservations = 2 sin error'
      );
      assert.ok(
        createdRepeatable?.id,
        'Se esperaba recibir el id del repetible válido'
      );
      validRepeatableId = createdRepeatable.id;

      const { error: updateToNullError } = await ctx.ownerXClient
        .from('gifts')
        .update({ max_reservations: null })
        .eq('id', validRepeatableId);

      assert.ok(
        updateToNullError,
        'Se esperaba un error al actualizar max_reservations a null en un repetible'
      );
      assert.equal(
        updateToNullError.code,
        '23514',
        'Se esperaba el código de error 23514 (check_violation)'
      );
      assert.ok(
        updateToNullError.message.includes('gifts_max_reservations_valid'),
        `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${updateToNullError.message}`
      );
    } finally {
      const idsToDelete = [validSuggestionId, validRepeatableId].filter(Boolean);
      if (idsToDelete.length > 0) {
        await ctx.adminClient.from('gifts').delete().in('id', idsToDelete);
      }
    }
  }
);

test(
  '43. Un repetible con reservas no pasa a sugerencia, y una sugerencia pasa a repetible solo con tope',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let repeatableId;
    let suggestionId;

    try {
      const repeatableName = `PRUEBA-${ctx.run}-REGALO-43-REPETIBLE`;
      const { data: repeatableGift, error: createRepError } =
        await ctx.adminClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: repeatableName,
            kind: 'repeatable',
            max_reservations: 2,
          })
          .select()
          .single();

      assert.equal(
        createRepError,
        null,
        'Se esperaba crear el regalo repetible con tope 2 sin error'
      );
      assert.ok(
        repeatableGift?.id,
        'Se esperaba recibir el id del regalo repetible'
      );
      repeatableId = repeatableGift.id;

      const { error: reserveError } = await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: repeatableId,
      });

      assert.equal(
        reserveError,
        null,
        'Se esperaba que la familia A pudiera apartar el repetible sin error'
      );

      const { error: updateToSuggError } = await ctx.ownerXClient
        .from('gifts')
        .update({ kind: 'suggestion', max_reservations: null })
        .eq('id', repeatableId);

      assert.ok(
        updateToSuggError,
        'Se esperaba un error al cambiar a sugerencia un regalo que tiene reservas'
      );
      assert.equal(
        updateToSuggError.message,
        'gift_has_reservations',
        `Se esperaba el mensaje de error gift_has_reservations, pero se recibió: ${updateToSuggError.message}`
      );

      const { data: storedRepeatable, error: checkRepError } =
        await ctx.adminClient
          .from('gifts')
          .select('id, kind, max_reservations')
          .eq('id', repeatableId)
          .single();

      assert.equal(
        checkRepError,
        null,
        'Se esperaba consultar el repetible con el administrador sin error'
      );
      assert.equal(
        storedRepeatable?.kind,
        'repeatable',
        'Se esperaba que el regalo siguiera siendo repeatable tras fallar el update'
      );
      assert.equal(
        storedRepeatable?.max_reservations,
        2,
        'Se esperaba que max_reservations siguiera siendo 2'
      );

      const suggestionName = `PRUEBA-${ctx.run}-REGALO-43-SUGERENCIA`;
      const { data: suggestionGift, error: createSuggError } =
        await ctx.ownerXClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: suggestionName,
            kind: 'suggestion',
          })
          .select()
          .single();

      assert.equal(
        createSuggError,
        null,
        'Se esperaba crear la sugerencia sin reservas sin error'
      );
      assert.ok(
        suggestionGift?.id,
        'Se esperaba recibir el id de la sugerencia'
      );
      suggestionId = suggestionGift.id;

      const { error: updateNoLimitError } = await ctx.ownerXClient
        .from('gifts')
        .update({ kind: 'repeatable' })
        .eq('id', suggestionId);

      assert.ok(
        updateNoLimitError,
        'Se esperaba un error al cambiar la sugerencia a repetible sin tope'
      );
      assert.equal(
        updateNoLimitError.code,
        '23514',
        'Se esperaba el código de error 23514 (check_violation)'
      );
      assert.ok(
        updateNoLimitError.message.includes('gifts_max_reservations_valid'),
        `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${updateNoLimitError.message}`
      );

      const { error: updateWithLimitError } = await ctx.ownerXClient
        .from('gifts')
        .update({ kind: 'repeatable', max_reservations: 2 })
        .eq('id', suggestionId);

      assert.equal(
        updateWithLimitError,
        null,
        'Se esperaba que cambiar la sugerencia a repetible con max_reservations = 2 fuera exitoso'
      );

      const { data: storedConvertedGift, error: checkConvertedError } =
        await ctx.adminClient
          .from('gifts')
          .select('id, kind, max_reservations')
          .eq('id', suggestionId)
          .single();

      assert.equal(
        checkConvertedError,
        null,
        'Se esperaba consultar el regalo convertido con el administrador sin error'
      );
      assert.equal(
        storedConvertedGift?.kind,
        'repeatable',
        'Se esperaba kind = repeatable tras la actualización válida'
      );
      assert.equal(
        storedConvertedGift?.max_reservations,
        2,
        'Se esperaba max_reservations = 2 tras la actualización válida'
      );
    } finally {
      const idsToDelete = [repeatableId, suggestionId].filter(Boolean);
      if (idsToDelete.length > 0) {
        await ctx.adminClient.from('gifts').delete().in('id', idsToDelete);
      }
    }
  }
);

test(
  '44. Reservar una lluvia de sobres falla y no deja reserva',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let envelopeId;

    try {
      const { data: existingEnvelopes, error: checkExistingError } =
        await ctx.adminClient
          .from('gifts')
          .select('id')
          .eq('event_id', ctx.eventX.id)
          .eq('kind', 'envelope');

      assert.equal(
        checkExistingError,
        null,
        'Se esperaba verificar que eventX no tuviera un envelope previo sin error'
      );
      assert.equal(
        existingEnvelopes?.length,
        0,
        'No se esperaba encontrar un envelope previo en eventX'
      );

      const envelopeName = `PRUEBA-${ctx.run}-REGALO-44-ENVELOPE`;
      const { data: envelopeGift, error: createError } = await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: envelopeName,
          kind: 'envelope',
        })
        .select()
        .single();

      assert.equal(
        createError,
        null,
        'Se esperaba crear el regalo envelope con el administrador sin error'
      );
      assert.ok(
        envelopeGift?.id,
        'Se esperaba recibir el id del regalo envelope creado'
      );
      envelopeId = envelopeGift.id;

      const { error: reserveError } = await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationA.code,
        p_gift_id: envelopeId,
      });

      assert.ok(
        reserveError,
        'Se esperaba un error al intentar reservar una lluvia de sobres con reserve_gift'
      );
      assert.equal(
        reserveError.message,
        'gift_not_reservable',
        `Se esperaba el mensaje de error gift_not_reservable, pero se recibió: ${reserveError.message}`
      );

      const { error: directInsertError } = await ctx.adminClient
        .from('gift_reservations')
        .insert({
          gift_id: envelopeId,
          invitation_id: ctx.invitationA.id,
        });

      assert.ok(
        directInsertError,
        'Se esperaba un error al insertar directo en gift_reservations para una lluvia de sobres'
      );
      assert.ok(
        directInsertError.message.includes('gift_not_reservable'),
        `Se esperaba que el mensaje contuviera gift_not_reservable, pero se recibió: ${directInsertError.message}`
      );

      const { data: reservations, error: checkReservationsError } =
        await ctx.adminClient
          .from('gift_reservations')
          .select('id')
          .eq('gift_id', envelopeId);

      assert.equal(
        checkReservationsError,
        null,
        'Se esperaba consultar las reservas de la lluvia de sobres sin error'
      );
      assert.equal(
        reservations?.length,
        0,
        'Se esperaba que no hubiera filas en gift_reservations para la lluvia de sobres'
      );

      const { data: giftsList, error: getGiftsError } = await ctx.anonClient.rpc(
        'get_gifts',
        { p_code: ctx.invitationA.code }
      );

      assert.equal(
        getGiftsError,
        null,
        'Se esperaba consultar get_gifts sin error'
      );

      const envelopeItem = (giftsList ?? []).find((g) => g.id === envelopeId);
      assert.ok(
        envelopeItem,
        'Se esperaba encontrar el regalo envelope en get_gifts'
      );
      assert.equal(
        envelopeItem.kind,
        'envelope',
        'Se esperaba kind = envelope para el regalo'
      );
      assert.equal(
        envelopeItem.reserved_by_me,
        false,
        'Se esperaba reserved_by_me = false para el envelope'
      );
      assert.equal(
        envelopeItem.taken,
        false,
        'Se esperaba taken = false para el envelope'
      );
      assert.equal(
        envelopeItem.full,
        false,
        'Se esperaba full = false para el envelope'
      );
      assert.equal(
        envelopeItem.remaining,
        null,
        'Se esperaba remaining = null para el envelope'
      );
    } finally {
      if (envelopeId) {
        await ctx.adminClient.from('gifts').delete().eq('id', envelopeId);
      }
    }
  }
);

test(
  '45. Solo puede haber una lluvia de sobres por evento',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let envelopeX1Id;
    let envelopeYId;

    try {
      const { data: existingEnvelopesX, error: checkExistingXError } =
        await ctx.adminClient
          .from('gifts')
          .select('id')
          .eq('event_id', ctx.eventX.id)
          .eq('kind', 'envelope');

      assert.equal(
        checkExistingXError,
        null,
        'Se esperaba verificar que eventX no tuviera un envelope previo sin error'
      );
      assert.equal(
        existingEnvelopesX?.length,
        0,
        'No se esperaba encontrar un envelope previo en eventX'
      );

      const { data: existingEnvelopesY, error: checkExistingYError } =
        await ctx.adminClient
          .from('gifts')
          .select('id')
          .eq('event_id', ctx.eventY.id)
          .eq('kind', 'envelope');

      assert.equal(
        checkExistingYError,
        null,
        'Se esperaba verificar que eventY no tuviera un envelope previo sin error'
      );
      assert.equal(
        existingEnvelopesY?.length,
        0,
        'No se esperaba encontrar un envelope previo en eventY'
      );

      const envelopeX1Name = `PRUEBA-${ctx.run}-REGALO-45-SOBRE-X1`;
      const { data: envelopeX1, error: createX1Error } = await ctx.ownerXClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: envelopeX1Name,
          kind: 'envelope',
        })
        .select()
        .single();

      assert.equal(
        createX1Error,
        null,
        'Se esperaba que el propietario X creara el primer envelope en eventX sin error'
      );
      assert.ok(
        envelopeX1?.id,
        'Se esperaba recibir el id del primer envelope en eventX'
      );
      envelopeX1Id = envelopeX1.id;

      const envelopeX2Name = `PRUEBA-${ctx.run}-REGALO-45-SOBRE-X2`;
      const { error: createX2Error } = await ctx.ownerXClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: envelopeX2Name,
          kind: 'envelope',
        });

      assert.ok(
        createX2Error,
        'Se esperaba un error al crear un segundo envelope en el mismo evento'
      );
      assert.equal(
        createX2Error.code,
        '23505',
        'Se esperaba el código de error 23505 (unique_violation)'
      );
      assert.ok(
        createX2Error.message.includes('gifts_one_envelope_per_event'),
        `Se esperaba la restricción gifts_one_envelope_per_event, pero se recibió: ${createX2Error.message}`
      );

      const envelopeYName = `PRUEBA-${ctx.run}-REGALO-45-SOBRE-Y`;
      const { data: envelopeY, error: createYError } = await ctx.ownerYClient
        .from('gifts')
        .insert({
          event_id: ctx.eventY.id,
          name: envelopeYName,
          kind: 'envelope',
        })
        .select()
        .single();

      assert.equal(
        createYError,
        null,
        'Se esperaba que el propietario Y creara un envelope en eventY sin error'
      );
      assert.ok(
        envelopeY?.id,
        'Se esperaba recibir el id del envelope en eventY'
      );
      envelopeYId = envelopeY.id;

      const { data: storedXEnvelopes, error: checkXError } = await ctx.adminClient
        .from('gifts')
        .select('id, name, kind')
        .eq('event_id', ctx.eventX.id)
        .in('name', [envelopeX1Name, envelopeX2Name]);

      assert.equal(
        checkXError,
        null,
        'Se esperaba consultar con el administrador los regalos envelope de eventX sin error'
      );
      assert.equal(
        storedXEnvelopes?.length,
        1,
        'Se esperaba que en eventX existiera exactamente un envelope con los nombres de la prueba'
      );
      assert.equal(
        storedXEnvelopes[0].name,
        envelopeX1Name,
        'Se esperaba que el envelope persistido fuera el primero (envelopeX1)'
      );
    } finally {
      const idsToDelete = [envelopeX1Id, envelopeYId].filter(Boolean);
      if (idsToDelete.length > 0) {
        await ctx.adminClient.from('gifts').delete().in('id', idsToDelete);
      }
    }
  }
);

test(
  '46. Una lluvia de sobres no acepta tope',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let validEnvelopeId;

    try {
      const { data: existingEnvelopes, error: checkExistingError } =
        await ctx.adminClient
          .from('gifts')
          .select('id')
          .eq('event_id', ctx.eventX.id)
          .eq('kind', 'envelope');

      assert.equal(
        checkExistingError,
        null,
        'Se esperaba verificar que eventX no tuviera un envelope previo sin error'
      );
      assert.equal(
        existingEnvelopes?.length,
        0,
        'No se esperaba encontrar un envelope previo en eventX'
      );

      const invalidEnvelopeName = `PRUEBA-${ctx.run}-REGALO-46-CON-TOPE`;
      const { error: createWithLimitError } = await ctx.ownerXClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: invalidEnvelopeName,
          kind: 'envelope',
          max_reservations: 3,
        });

      assert.ok(
        createWithLimitError,
        'Se esperaba un error al crear un envelope con max_reservations = 3'
      );
      assert.equal(
        createWithLimitError.code,
        '23514',
        'Se esperaba el código de error 23514 (check_violation)'
      );
      assert.ok(
        createWithLimitError.message.includes('gifts_max_reservations_valid'),
        `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${createWithLimitError.message}`
      );

      const { data: failedInsertRows, error: checkFailedInsertError } =
        await ctx.adminClient
          .from('gifts')
          .select('id')
          .eq('event_id', ctx.eventX.id)
          .eq('name', invalidEnvelopeName);

      assert.equal(
        checkFailedInsertError,
        null,
        'Se esperaba consultar si el intento fallido de inserción dejó fila sin error'
      );
      assert.equal(
        failedInsertRows?.length,
        0,
        'Se esperaba que el intento fallido no dejara fila en gifts'
      );

      const validEnvelopeName = `PRUEBA-${ctx.run}-REGALO-46-VALIDO`;
      const { data: createdEnvelope, error: createValidError } =
        await ctx.ownerXClient
          .from('gifts')
          .insert({
            event_id: ctx.eventX.id,
            name: validEnvelopeName,
            kind: 'envelope',
          })
          .select()
          .single();

      assert.equal(
        createValidError,
        null,
        'Se esperaba crear un envelope sin tope sin error'
      );
      assert.ok(
        createdEnvelope?.id,
        'Se esperaba recibir el id del envelope válido'
      );
      validEnvelopeId = createdEnvelope.id;

      const { error: updateLimitError } = await ctx.ownerXClient
        .from('gifts')
        .update({ max_reservations: 2 })
        .eq('id', validEnvelopeId);

      assert.ok(
        updateLimitError,
        'Se esperaba un error al actualizar max_reservations a 2 en un envelope'
      );
      assert.equal(
        updateLimitError.code,
        '23514',
        'Se esperaba el código de error 23514 (check_violation)'
      );
      assert.ok(
        updateLimitError.message.includes('gifts_max_reservations_valid'),
        `Se esperaba la restricción gifts_max_reservations_valid, pero se recibió: ${updateLimitError.message}`
      );

      const { data: storedEnvelope, error: checkStoredError } =
        await ctx.adminClient
          .from('gifts')
          .select('id, kind, max_reservations')
          .eq('id', validEnvelopeId)
          .single();

      assert.equal(
        checkStoredError,
        null,
        'Se esperaba consultar el envelope válido con el administrador sin error'
      );
      assert.equal(
        storedEnvelope?.max_reservations,
        null,
        'Se esperaba que max_reservations permaneciera en null tras fallar la actualización'
      );
    } finally {
      if (validEnvelopeId) {
        await ctx.adminClient.from('gifts').delete().eq('id', validEnvelopeId);
      }
    }
  }
);

test(
  '47. eventA tiene team_id asignado, teamHelper crea evento con team_id nulo, team_id es inmutable y usuario con dos equipos crea evento con team_id nulo',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let helperEventId = null;
    let twoTeamsEventId = null;
    let team1Id = null;
    let team2Id = null;

    try {
      assert.equal(
        ctx.budget.eventA.team_id,
        ctx.team.id,
        'Se esperaba que eventA tuviera team_id asignado al equipo ctx.team'
      );

      const helperEventName = `PRUEBA-${ctx.run}-47-HELPER`;
      const now = Date.now();
      const in30Days = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      const in20Days = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

      const { data: helperEvent, error: helperEventError } =
        await ctx.teamHelperClient
          .from('events')
          .insert({
            name: helperEventName,
            starts_at: in30Days,
            rsvp_deadline: in20Days,
            created_by: ctx.teamHelperUser.id,
            team_id: ctx.team.id,
          })
          .select()
          .single();

      assert.equal(
        helperEventError,
        null,
        'Se esperaba que el ayudante pudiera crear un evento sin error'
      );
      assert.ok(helperEvent?.id, 'Se esperaba id para el evento del ayudante');
      helperEventId = helperEvent.id;
      assert.equal(
        helperEvent.team_id,
        null,
        'Se esperaba que el evento creado por el ayudante quedara con team_id nulo'
      );

      const { error: changeTeamError } = await ctx.teamOwnerAClient
        .from('events')
        .update({ team_id: ctx.budget.otherTeam.id })
        .eq('id', ctx.budget.eventA.id);

      assert.ok(
        changeTeamError,
        'Se esperaba un error al intentar modificar team_id como propietario'
      );
      assert.ok(
        changeTeamError.message.includes('team_id_immutable'),
        `Se esperaba el error team_id_immutable, pero se recibió: ${changeTeamError.message}`
      );

      const twoTeamsUser = await createTestUser(
        ctx.adminClient,
        ctx,
        'dos-equipos-47'
      );
      const { url, publishableKey } = getEnvConfig();
      const twoTeamsClient = await createAuthenticatedClient(
        url,
        publishableKey,
        twoTeamsUser.email,
        twoTeamsUser.password
      );

      const { data: team1, error: team1Err } = await ctx.adminClient
        .from('teams')
        .insert({ name: `PRUEBA-${ctx.run}-DOS-1` })
        .select()
        .single();
      assert.equal(team1Err, null, 'Error al crear primer equipo');
      team1Id = team1.id;

      const { data: team2, error: team2Err } = await ctx.adminClient
        .from('teams')
        .insert({ name: `PRUEBA-${ctx.run}-DOS-2` })
        .select()
        .single();
      assert.equal(team2Err, null, 'Error al crear segundo equipo');
      team2Id = team2.id;

      const { error: tmErr } = await ctx.adminClient
        .from('team_members')
        .insert([
          { team_id: team1.id, user_id: twoTeamsUser.id, role: 'owner' },
          { team_id: team2.id, user_id: twoTeamsUser.id, role: 'owner' },
        ]);
      assert.equal(tmErr, null, 'Error al asociar membresías de los equipos');

      const { data: twoTeamsEvent, error: twoTeamsEventError } =
        await twoTeamsClient
          .from('events')
          .insert({
            name: `PRUEBA-${ctx.run}-DOS-EQUIPOS`,
            starts_at: in30Days,
            rsvp_deadline: in20Days,
            created_by: twoTeamsUser.id,
          })
          .select()
          .single();

      assert.equal(
        twoTeamsEventError,
        null,
        'Error al crear evento con usuario de dos equipos'
      );
      assert.ok(
        twoTeamsEvent?.id,
        'Se esperaba id para el evento de usuario con dos equipos'
      );
      twoTeamsEventId = twoTeamsEvent.id;
      assert.equal(
        twoTeamsEvent.team_id,
        null,
        'Se esperaba que el evento de usuario con dos equipos quedara con team_id nulo'
      );
    } finally {
      if (helperEventId) {
        await ctx.adminClient.from('events').delete().eq('id', helperEventId);
      }
      if (twoTeamsEventId) {
        await ctx.adminClient.from('events').delete().eq('id', twoTeamsEventId);
      }
      if (team1Id) {
        await ctx.adminClient.from('teams').delete().eq('id', team1Id);
      }
      if (team2Id) {
        await ctx.adminClient.from('teams').delete().eq('id', team2Id);
      }
    }
  }
);

test(
  '48. El ayudante no ve categorias, gastos ni pagos y tareas no revelan gastos vinculados',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let taskId = null;
    let expenseId = null;
    let paymentId = null;

    try {
      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Prueba 48',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Se esperaba crear la tarea sin error');

      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          task_id: taskId,
          description: 'Gasto Prueba 48',
          amount_cop: 150000,
        });
      assert.equal(expErr, null, 'Se esperaba crear el gasto vinculado sin error');

      paymentId = crypto.randomUUID();
      const { error: payErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: paymentId,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 50000,
        });
      assert.equal(payErr, null, 'Se esperaba crear el pago sin error');

      const { data: catRows, error: catErr } = await ctx.teamHelperClient
        .from('expense_categories')
        .select('*')
        .eq('event_id', ctx.budget.eventA.id);
      assert.equal(catErr, null);
      assert.equal(
        catRows?.length ?? 0,
        0,
        'Se esperaba que el ayudante recibiera 0 filas de expense_categories'
      );

      const { data: expRows, error: expErrList } = await ctx.teamHelperClient
        .from('expenses')
        .select('*')
        .eq('event_id', ctx.budget.eventA.id);
      assert.equal(expErrList, null);
      assert.equal(
        expRows?.length ?? 0,
        0,
        'Se esperaba que el ayudante recibiera 0 filas de expenses'
      );

      const { data: payRows, error: payErrList } = await ctx.teamHelperClient
        .from('expense_payments')
        .select('*')
        .eq('event_id', ctx.budget.eventA.id);
      assert.equal(payErrList, null);
      assert.equal(
        payRows?.length ?? 0,
        0,
        'Se esperaba que el ayudante recibiera 0 filas de expense_payments'
      );

      const { data: taskRows, error: joinErr } = await ctx.teamHelperClient
        .from('tasks')
        .select('*, expenses(id)')
        .eq('id', taskId);
      assert.equal(joinErr, null);
      assert.equal(taskRows?.length, 1);

      const task = taskRows[0];
      assert.ok(
        task.expenses === null ||
          (Array.isArray(task.expenses) && task.expenses.length === 0),
        'Se esperaba que la relacion expenses fuera vacia o nula para el ayudante'
      );

      const keysWithoutJoin = Object.keys(task).filter((k) => k !== 'expenses');
      for (const key of keysWithoutJoin) {
        assert.equal(
          key.toLowerCase().includes('expense'),
          false,
          `La fila de tasks no debe contener campos de gastos: ${key}`
        );
      }
    } finally {
      if (paymentId) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', paymentId);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
    }
  }
);

test(
  '49. El ayudante lee perfiles y tareas de eventA y outsideTeamClient recibe 0 filas',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let taskId = null;

    try {
      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Prueba 49',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Error al crear tarea de prueba 49');

      const { data: helperProfiles, error: helperProfErr } =
        await ctx.teamHelperClient
          .from('team_profiles')
          .select('*')
          .eq('team_id', ctx.team.id);
      assert.equal(helperProfErr, null);
      assert.ok(
        helperProfiles?.length > 0,
        'Se esperaba que el ayudante pudiera leer los perfiles del equipo'
      );

      const { data: helperTasks, error: helperTaskErr } =
        await ctx.teamHelperClient
          .from('tasks')
          .select('*')
          .eq('event_id', ctx.budget.eventA.id);
      assert.equal(helperTaskErr, null);
      assert.ok(
        helperTasks?.some((t) => t.id === taskId),
        'Se esperaba que el ayudante pudiera leer las tareas de eventA'
      );

      const { data: outsideProfiles, error: outsideProfErr } =
        await ctx.outsideTeamClient
          .from('team_profiles')
          .select('*')
          .eq('team_id', ctx.team.id);
      assert.equal(outsideProfErr, null);
      assert.equal(
        outsideProfiles?.length ?? 0,
        0,
        'Se esperaba que outsideTeamClient recibiera 0 filas de team_profiles'
      );

      const { data: outsideTasks, error: outsideTaskErr } =
        await ctx.outsideTeamClient
          .from('tasks')
          .select('*')
          .eq('event_id', ctx.budget.eventA.id);
      assert.equal(outsideTaskErr, null);
      assert.equal(
        outsideTasks?.length ?? 0,
        0,
        'Se esperaba que outsideTeamClient recibiera 0 filas de tasks'
      );
    } finally {
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
    }
  }
);

test(
  '50. El ayudante marca y desmarca tarea con set_task_done, pero no puede editar, crear con save_task ni borrar con delete_task',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let taskId = null;

    try {
      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Prueba 50',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Error al crear tarea de prueba 50');

      const { data: doneData, error: doneErr } = await ctx.teamHelperClient.rpc(
        'set_task_done',
        {
          p_task_id: taskId,
          p_done: true,
        }
      );
      assert.equal(doneErr, null, 'Error al marcar tarea como hecha por ayudante');
      assert.ok(doneData?.done_at, 'Se esperaba done_at lleno al marcar');
      assert.equal(
        doneData?.done_by,
        ctx.teamHelperUser.id,
        'Se esperaba que done_by fuera el id del ayudante'
      );

      const { data: checkDone, error: checkDoneErr } = await ctx.adminClient
        .from('tasks')
        .select('done_at, done_by')
        .eq('id', taskId)
        .single();
      assert.equal(checkDoneErr, null);
      assert.ok(checkDone?.done_at);
      assert.equal(checkDone?.done_by, ctx.teamHelperUser.id);

      const { data: undoneData, error: undoneErr } =
        await ctx.teamHelperClient.rpc('set_task_done', {
          p_task_id: taskId,
          p_done: false,
        });
      assert.equal(undoneErr, null, 'Error al desmarcar tarea por ayudante');
      assert.equal(undoneData?.done_at, null);
      assert.equal(undoneData?.done_by, null);

      const { data: checkUndone, error: checkUndoneErr } = await ctx.adminClient
        .from('tasks')
        .select('done_at, done_by')
        .eq('id', taskId)
        .single();
      assert.equal(checkUndoneErr, null);
      assert.equal(checkUndone?.done_at, null);
      assert.equal(checkUndone?.done_by, null);

      await ctx.teamHelperClient
        .from('tasks')
        .update({
          title: 'Titulo Alterado Por Helper',
          assignee_profile_id: ctx.budget.profile.id,
        })
        .eq('id', taskId);

      const { data: checkTaskDirect, error: checkTaskDirectErr } =
        await ctx.adminClient
          .from('tasks')
          .select('title, assignee_profile_id')
          .eq('id', taskId)
          .single();
      assert.equal(checkTaskDirectErr, null);
      assert.equal(
        checkTaskDirect?.title,
        'Tarea Prueba 50',
        'Se esperaba que el update directo del ayudante no modificara el titulo'
      );
      assert.equal(
        checkTaskDirect?.assignee_profile_id,
        null,
        'Se esperaba que el update directo del ayudante no modificara el responsable'
      );

      const { error: helperSaveErr } = await ctx.teamHelperClient.rpc(
        'save_task',
        {
          p_task_id: crypto.randomUUID(),
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea Helper 50',
          p_note: null,
          p_assignee_profile_id: null,
          p_due_date: '2026-12-31',
          p_expense_action: 'keep',
        }
      );
      assert.ok(
        helperSaveErr,
        'Se esperaba un error al intentar crear una tarea con save_task como ayudante'
      );

      const { error: helperDeleteErr } = await ctx.teamHelperClient.rpc(
        'delete_task',
        {
          p_task_id: taskId,
          p_delete_expense: false,
        }
      );
      assert.ok(
        helperDeleteErr,
        'Se esperaba un error al intentar borrar una tarea como ayudante'
      );
      assert.ok(
        helperDeleteErr.message.includes('task_not_found'),
        `Se esperaba error task_not_found, pero se recibió: ${helperDeleteErr.message}`
      );

      const { data: taskStillExists, error: checkStillExistsErr } =
        await ctx.adminClient
          .from('tasks')
          .select('id')
          .eq('id', taskId)
          .single();
      assert.equal(checkStillExistsErr, null);
      assert.equal(
        taskStillExists?.id,
        taskId,
        'Se esperaba que la tarea continuara existiendo tras el intento de borrado'
      );

      const { error: outsideMarkErr } = await ctx.outsideTeamClient.rpc(
        'set_task_done',
        {
          p_task_id: taskId,
          p_done: true,
        }
      );
      assert.ok(
        outsideMarkErr,
        'Se esperaba error al marcar tarea por cliente fuera del equipo'
      );
      assert.ok(
        outsideMarkErr.message.includes('task_not_found'),
        `Se esperaba error task_not_found para cliente fuera del equipo, pero se recibió: ${outsideMarkErr.message}`
      );
    } finally {
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
    }
  }
);

test(
  '51. El propietario paga parte de un gasto de 1000 y al superar el monto recibe payment_exceeds_expense y el resto exacto funciona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let expenseId = null;
    let pay1Id = null;
    let pay2Id = null;

    try {
      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto Prueba 51',
          amount_cop: 1000,
        });
      assert.equal(expErr, null, 'Error al crear el gasto de 1000');

      pay1Id = crypto.randomUUID();
      const { error: pay1Err } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: pay1Id,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 400,
        });
      assert.equal(pay1Err, null, 'Error al registrar el primer pago de 400');

      const { error: exceedErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 601,
        });
      assert.ok(
        exceedErr,
        'Se esperaba error al superar el monto del gasto con el pago'
      );
      assert.ok(
        exceedErr.message.includes('payment_exceeds_expense'),
        `Se esperaba error payment_exceeds_expense, pero se recibió: ${exceedErr.message}`
      );

      pay2Id = crypto.randomUUID();
      const { error: pay2Err } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: pay2Id,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 600,
        });
      assert.equal(pay2Err, null, 'Error al registrar el segundo pago exacto de 600');

      const { data: payments, error: checkPayErr } = await ctx.adminClient
        .from('expense_payments')
        .select('amount_cop')
        .eq('expense_id', expenseId);
      assert.equal(checkPayErr, null);
      const totalPaid = (payments ?? []).reduce((acc, p) => acc + p.amount_cop, 0);
      assert.equal(totalPaid, 1000, 'Se esperaba que la suma total pagada fuera 1000');
    } finally {
      if (pay1Id) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', pay1Id);
      }
      if (pay2Id) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', pay2Id);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
    }
  }
);

test(
  '52. Con 600 pagados de 1000 bajar a 599 da amount_below_paid y bajar a 600 funciona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let expenseId = null;
    let paymentId = null;

    try {
      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto Prueba 52',
          amount_cop: 1000,
        });
      assert.equal(expErr, null, 'Error al crear gasto de 1000');

      paymentId = crypto.randomUUID();
      const { error: payErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: paymentId,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 600,
        });
      assert.equal(payErr, null, 'Error al registrar pago de 600');

      const { error: belowErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .update({ amount_cop: 599 })
        .eq('id', expenseId);
      assert.ok(
        belowErr,
        'Se esperaba error al reducir monto por debajo de lo pagado'
      );
      assert.ok(
        belowErr.message.includes('amount_below_paid'),
        `Se esperaba error amount_below_paid, pero se recibió: ${belowErr.message}`
      );

      const { error: exactErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .update({ amount_cop: 600 })
        .eq('id', expenseId);
      assert.equal(
        exactErr,
        null,
        'Se esperaba poder actualizar el monto a exactamente lo pagado (600)'
      );

      const { data: updatedExp, error: checkExpErr } = await ctx.adminClient
        .from('expenses')
        .select('amount_cop')
        .eq('id', expenseId)
        .single();
      assert.equal(checkExpErr, null);
      assert.equal(updatedExp?.amount_cop, 600);
    } finally {
      if (paymentId) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', paymentId);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
    }
  }
);

test(
  '53. Dos pagos de 600 a un gasto de 1000 con Promise.allSettled a la vez dejan un solo exito y suma de 600',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let expenseId = null;

    try {
      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto Prueba 53 Concurrente',
          amount_cop: 1000,
        });
      assert.equal(expErr, null, 'Error al crear gasto de 1000');

      const p1 = ctx.teamOwnerAClient.from('expense_payments').insert({
        id: crypto.randomUUID(),
        expense_id: expenseId,
        paid_by_profile_id: ctx.budget.profile.id,
        amount_cop: 600,
      });
      const p2 = ctx.teamOwnerAClient.from('expense_payments').insert({
        id: crypto.randomUUID(),
        expense_id: expenseId,
        paid_by_profile_id: ctx.budget.profile.id,
        amount_cop: 600,
      });

      const [res1, res2] = await Promise.allSettled([p1, p2]);
      const results = [res1.value, res2.value];

      const successes = results.filter((r) => !r.error);
      const failures = results.filter((r) => r.error);

      assert.equal(
        successes.length,
        1,
        'Se esperaba que exactamente uno de los pagos concurrentes tuviera exito'
      );
      assert.equal(
        failures.length,
        1,
        'Se esperaba que exactamente uno de los pagos concurrentes fallara'
      );
      assert.ok(
        failures[0].error.message.includes('payment_exceeds_expense'),
        `Se esperaba error payment_exceeds_expense, pero se recibió: ${failures[0].error.message}`
      );

      const { data: payments, error: checkPayErr } = await ctx.adminClient
        .from('expense_payments')
        .select('amount_cop')
        .eq('expense_id', expenseId);
      assert.equal(checkPayErr, null);
      const totalPaid = (payments ?? []).reduce((acc, p) => acc + p.amount_cop, 0);
      assert.equal(
        totalPaid,
        600,
        'Se esperaba que la suma guardada en expense_payments fuera exactamente 600'
      );
    } finally {
      if (expenseId) {
        await ctx.adminClient
          .from('expense_payments')
          .delete()
          .eq('expense_id', expenseId);
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
    }
  }
);

test(
  '54. Pago y save_task con archivedProfile dan profile_archived, con otherTeamProfile dan profile_wrong_team y editar tarea archivada despues funciona',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let expenseId = null;
    let tempProfileId = null;
    let taskId = null;

    try {
      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto Prueba 54',
          amount_cop: 50000,
        });
      assert.equal(expErr, null, 'Error al crear gasto para prueba 54');

      const { error: payArchivedErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.archivedProfile.id,
          amount_cop: 10000,
        });
      assert.ok(payArchivedErr, 'Se esperaba error al pagar con perfil archivado');
      assert.ok(
        payArchivedErr.message.includes('profile_archived'),
        `Se esperaba error profile_archived, pero se recibió: ${payArchivedErr.message}`
      );

      const { error: taskArchivedErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: crypto.randomUUID(),
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea con perfil archivado',
          p_note: null,
          p_assignee_profile_id: ctx.budget.archivedProfile.id,
          p_due_date: '2026-12-31',
          p_expense_action: 'keep',
        }
      );
      assert.ok(
        taskArchivedErr,
        'Se esperaba error al crear tarea con perfil archivado'
      );
      assert.ok(
        taskArchivedErr.message.includes('profile_archived'),
        `Se esperaba error profile_archived en save_task, pero se recibió: ${taskArchivedErr.message}`
      );

      const { error: payWrongTeamErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.otherTeamProfile.id,
          amount_cop: 10000,
        });
      assert.ok(
        payWrongTeamErr,
        'Se esperaba error al pagar con perfil de otro equipo'
      );
      assert.ok(
        payWrongTeamErr.message.includes('profile_wrong_team'),
        `Se esperaba error profile_wrong_team, pero se recibió: ${payWrongTeamErr.message}`
      );

      const { error: taskWrongTeamErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: crypto.randomUUID(),
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea con perfil de otro equipo',
          p_note: null,
          p_assignee_profile_id: ctx.budget.otherTeamProfile.id,
          p_due_date: '2026-12-31',
          p_expense_action: 'keep',
        }
      );
      assert.ok(
        taskWrongTeamErr,
        'Se esperaba error al crear tarea con perfil de otro equipo'
      );
      assert.ok(
        taskWrongTeamErr.message.includes('profile_wrong_team'),
        `Se esperaba error profile_wrong_team en save_task, pero se recibió: ${taskWrongTeamErr.message}`
      );

      const { data: tempProfile, error: tempProfErr } =
        await ctx.teamOwnerAClient
          .from('team_profiles')
          .insert({
            team_id: ctx.team.id,
            name: `Perfil Temporal 54 ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(tempProfErr, null, 'Error al crear perfil temporal');
      tempProfileId = tempProfile.id;

      taskId = crypto.randomUUID();
      const { error: initialSaveErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: taskId,
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea Inicial 54',
          p_note: null,
          p_assignee_profile_id: tempProfileId,
          p_due_date: '2026-12-31',
          p_expense_action: 'keep',
        }
      );
      assert.equal(
        initialSaveErr,
        null,
        'Error al crear tarea asignada a perfil temporal'
      );

      const { error: archiveErr } = await ctx.teamOwnerAClient
        .from('team_profiles')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', tempProfileId);
      assert.equal(archiveErr, null, 'Error al archivar el perfil temporal');

      const { data: updatedTask, error: editTaskErr } =
        await ctx.teamOwnerAClient.rpc('save_task', {
          p_task_id: taskId,
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea Modificada 54',
          p_note: 'Nota editada',
          p_assignee_profile_id: tempProfileId,
          p_due_date: '2026-12-31',
          p_expense_action: 'keep',
        });
      assert.equal(
        editTaskErr,
        null,
        'Se esperaba poder editar la tarea cuyo perfil se archivo posteriormente sin cambiar de perfil'
      );
      assert.equal(updatedTask?.title, 'Tarea Modificada 54');
    } finally {
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
      if (tempProfileId) {
        await ctx.adminClient
          .from('team_profiles')
          .delete()
          .eq('id', tempProfileId);
      }
      if (expenseId) {
        await ctx.adminClient
          .from('expense_payments')
          .delete()
          .eq('expense_id', expenseId);
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
    }
  }
);

test(
  '55. Vincular a una tarea de eventA un gasto de eventB falla con expenses_task_same_event por update directo y por save_task link',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let taskIdA = null;
    let expenseIdB = null;

    try {
      taskIdA = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskIdA,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea 55 en Evento A',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Error al crear tarea en eventA');

      expenseIdB = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseIdB,
          event_id: ctx.budget.eventB.id,
          category_id: ctx.budget.categoryB.id,
          description: 'Gasto 55 en Evento B',
          amount_cop: 80000,
        });
      assert.equal(expErr, null, 'Error al crear gasto en eventB');

      const { error: directUpdateErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .update({ task_id: taskIdA })
        .eq('id', expenseIdB);
      assert.ok(
        directUpdateErr,
        'Se esperaba error al vincular gasto de eventB con tarea de eventA mediante update directo'
      );
      assert.ok(
        directUpdateErr.message.includes('expenses_task_same_event'),
        `Se esperaba error expenses_task_same_event en update directo, pero se recibió: ${directUpdateErr.message}`
      );

      const { error: saveLinkErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: taskIdA,
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea 55 en Evento A',
          p_note: null,
          p_assignee_profile_id: null,
          p_due_date: '2026-12-31',
          p_expense_action: 'link',
          p_expense: { id: expenseIdB },
        }
      );
      assert.ok(
        saveLinkErr,
        'Se esperaba error al vincular gasto de eventB con tarea de eventA mediante save_task link'
      );
      assert.ok(
        saveLinkErr.message.includes('expenses_task_same_event'),
        `Se esperaba error expenses_task_same_event en save_task link, pero se recibió: ${saveLinkErr.message}`
      );
    } finally {
      if (expenseIdB) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseIdB);
      }
      if (taskIdA) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskIdA);
      }
    }
  }
);

test(
  '56. save_task link con gasto ya vinculado da expense_already_linked, segundo gasto con mismo task_id da expenses_task_id_key y save_task new con id existente no mueve ni crea',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let task1Id = null;
    let expense1Id = null;
    let task2Id = null;
    let task3Id = null;
    let expense2Id = null;

    try {
      task1Id = crypto.randomUUID();
      const { error: task1Err } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: task1Id,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea 1 Prueba 56',
          due_date: '2026-12-31',
        });
      assert.equal(task1Err, null, 'Error al crear tarea 1');

      expense1Id = crypto.randomUUID();
      const { error: exp1Err } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expense1Id,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          task_id: task1Id,
          description: 'Gasto 1 Vinculado',
          amount_cop: 50000,
        });
      assert.equal(exp1Err, null, 'Error al crear gasto 1 vinculado a tarea 1');

      task2Id = crypto.randomUUID();
      const { error: task2Err } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: task2Id,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea 2 Prueba 56',
          due_date: '2026-12-31',
        });
      assert.equal(task2Err, null, 'Error al crear tarea 2');

      const { error: linkAlreadyLinkedErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: task2Id,
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea 2 Prueba 56',
          p_note: null,
          p_assignee_profile_id: null,
          p_due_date: '2026-12-31',
          p_expense_action: 'link',
          p_expense: { id: expense1Id },
        }
      );
      assert.ok(
        linkAlreadyLinkedErr,
        'Se esperaba error al vincular un gasto ya vinculado con save_task link'
      );
      assert.ok(
        linkAlreadyLinkedErr.message.includes('expense_already_linked'),
        `Se esperaba error expense_already_linked, pero se recibió: ${linkAlreadyLinkedErr.message}`
      );

      expense2Id = crypto.randomUUID();
      const { error: insertSecondErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expense2Id,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          task_id: task1Id,
          description: 'Segundo Gasto para Tarea 1',
          amount_cop: 60000,
        });
      assert.ok(
        insertSecondErr,
        'Se esperaba error al insertar segundo gasto con mismo task_id'
      );
      assert.ok(
        insertSecondErr.message.includes('expenses_task_id_key'),
        `Se esperaba error expenses_task_id_key, pero se recibió: ${insertSecondErr.message}`
      );

      task3Id = crypto.randomUUID();
      const { error: saveNewDuplicateErr } = await ctx.teamOwnerAClient.rpc(
        'save_task',
        {
          p_task_id: task3Id,
          p_event_id: ctx.budget.eventA.id,
          p_title: 'Tarea 3 Nueva',
          p_note: null,
          p_assignee_profile_id: null,
          p_due_date: '2026-12-31',
          p_expense_action: 'new',
          p_expense: {
            id: expense1Id,
            category_id: ctx.budget.categoryA.id,
            description: 'Gasto Duplicado New',
            amount_cop: 70000,
          },
        }
      );
      assert.ok(
        saveNewDuplicateErr,
        'Se esperaba error al usar save_task new con id de gasto existente de otra tarea'
      );
      assert.ok(
        saveNewDuplicateErr.message.includes('expense_already_linked'),
        `Se esperaba error expense_already_linked en save_task new, pero se recibió: ${saveNewDuplicateErr.message}`
      );

      const { data: checkTask3, error: checkTask3Err } = await ctx.adminClient
        .from('tasks')
        .select('id')
        .eq('id', task3Id);
      assert.equal(checkTask3Err, null);
      assert.equal(
        checkTask3?.length ?? 0,
        0,
        'Se esperaba que la tarea 3 no fuera creada tras fallar save_task'
      );

      const { data: checkExp1, error: checkExp1Err } = await ctx.adminClient
        .from('expenses')
        .select('task_id')
        .eq('id', expense1Id)
        .single();
      assert.equal(checkExp1Err, null);
      assert.equal(
        checkExp1?.task_id,
        task1Id,
        'Se esperaba que el gasto 1 mantuviera su vinculo original con la tarea 1'
      );
    } finally {
      if (expense2Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense2Id);
      }
      if (expense1Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense1Id);
      }
      if (task1Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task1Id);
      }
      if (task2Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task2Id);
      }
      if (task3Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task3Id);
      }
    }
  }
);

test(
  '57. Borrar categoria con gastos o perfil en uso da error y elementos sin uso si se borran',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let catWithExpId = null;
    let expenseId = null;
    let profInTaskId = null;
    let taskId = null;
    let profInPayId = null;
    let paymentId = null;
    let unusedProfId = null;
    let unusedCatId = null;

    try {
      const { data: catWithExp, error: catWithExpErr } =
        await ctx.teamOwnerAClient
          .from('expense_categories')
          .insert({
            event_id: ctx.budget.eventA.id,
            name: `Cat Con Gasto ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(catWithExpErr, null);
      catWithExpId = catWithExp.id;

      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: catWithExpId,
          description: 'Gasto Vinculado a Categoria',
          amount_cop: 25000,
        });
      assert.equal(expErr, null);

      const { error: delCatErr } = await ctx.teamOwnerAClient
        .from('expense_categories')
        .delete()
        .eq('id', catWithExpId);
      assert.ok(delCatErr, 'Se esperaba error al borrar categoria con gastos');
      assert.ok(
        delCatErr.message.includes('expenses_category_same_event'),
        `Se esperaba error expenses_category_same_event, pero se recibió: ${delCatErr.message}`
      );

      const { data: profInTask, error: profInTaskErr } =
        await ctx.teamOwnerAClient
          .from('team_profiles')
          .insert({
            team_id: ctx.team.id,
            name: `Perfil En Tarea ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(profInTaskErr, null);
      profInTaskId = profInTask.id;

      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea con Perfil 57',
          assignee_profile_id: profInTaskId,
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null);

      const { error: delProfTaskErr } = await ctx.teamOwnerAClient
        .from('team_profiles')
        .delete()
        .eq('id', profInTaskId);
      assert.ok(delProfTaskErr, 'Se esperaba error al borrar perfil usado en tarea');
      assert.ok(
        delProfTaskErr.message.toLowerCase().includes('foreign key'),
        `Se esperaba error de foreign key, pero se recibió: ${delProfTaskErr.message}`
      );

      const { data: profInPay, error: profInPayErr } =
        await ctx.teamOwnerAClient
          .from('team_profiles')
          .insert({
            team_id: ctx.team.id,
            name: `Perfil En Pago ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(profInPayErr, null);
      profInPayId = profInPay.id;

      paymentId = crypto.randomUUID();
      const { error: payErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: paymentId,
          expense_id: expenseId,
          paid_by_profile_id: profInPayId,
          amount_cop: 5000,
        });
      assert.equal(payErr, null);

      const { error: delProfPayErr } = await ctx.teamOwnerAClient
        .from('team_profiles')
        .delete()
        .eq('id', profInPayId);
      assert.ok(delProfPayErr, 'Se esperaba error al borrar perfil usado en pago');
      assert.ok(
        delProfPayErr.message.toLowerCase().includes('foreign key'),
        `Se esperaba error de foreign key, pero se recibió: ${delProfPayErr.message}`
      );

      const { data: unusedProf, error: unusedProfErr } =
        await ctx.teamOwnerAClient
          .from('team_profiles')
          .insert({
            team_id: ctx.team.id,
            name: `Perfil Sin Uso ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(unusedProfErr, null);
      unusedProfId = unusedProf.id;

      const { error: delUnusedProfErr } = await ctx.teamOwnerAClient
        .from('team_profiles')
        .delete()
        .eq('id', unusedProfId);
      assert.equal(
        delUnusedProfErr,
        null,
        'Se esperaba poder borrar un perfil sin usar sin error'
      );

      const { data: checkUnusedProf } = await ctx.adminClient
        .from('team_profiles')
        .select('id')
        .eq('id', unusedProfId);
      assert.equal(checkUnusedProf?.length ?? 0, 0);

      const { data: unusedCat, error: unusedCatErr } =
        await ctx.teamOwnerAClient
          .from('expense_categories')
          .insert({
            event_id: ctx.budget.eventA.id,
            name: `Cat Sin Uso ${Date.now()}`,
          })
          .select()
          .single();
      assert.equal(unusedCatErr, null);
      unusedCatId = unusedCat.id;

      const { error: delUnusedCatErr } = await ctx.teamOwnerAClient
        .from('expense_categories')
        .delete()
        .eq('id', unusedCatId);
      assert.equal(
        delUnusedCatErr,
        null,
        'Se esperaba poder borrar una categoria sin gastos sin error'
      );

      const { data: checkUnusedCat } = await ctx.adminClient
        .from('expense_categories')
        .select('id')
        .eq('id', unusedCatId);
      assert.equal(checkUnusedCat?.length ?? 0, 0);
    } finally {
      if (paymentId) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', paymentId);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
      if (catWithExpId) {
        await ctx.adminClient
          .from('expense_categories')
          .delete()
          .eq('id', catWithExpId);
      }
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
      if (profInTaskId) {
        await ctx.adminClient
          .from('team_profiles')
          .delete()
          .eq('id', profInTaskId);
      }
      if (profInPayId) {
        await ctx.adminClient
          .from('team_profiles')
          .delete()
          .eq('id', profInPayId);
      }
      if (unusedProfId) {
        await ctx.adminClient
          .from('team_profiles')
          .delete()
          .eq('id', unusedProfId);
      }
      if (unusedCatId) {
        await ctx.adminClient
          .from('expense_categories')
          .delete()
          .eq('id', unusedCatId);
      }
    }
  }
);

test(
  '58. Pago con paid_on 2999-01-01 da payment_future_date y pago sin paid_on toma fecha actual de Bogota',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let expenseId = null;
    let paymentId = null;

    try {
      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto Prueba 58',
          amount_cop: 50000,
        });
      assert.equal(expErr, null, 'Error al crear gasto para prueba 58');

      const { error: futureErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: crypto.randomUUID(),
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 10000,
          paid_on: '2999-01-01',
        });
      assert.ok(futureErr, 'Se esperaba error al registrar pago con fecha futura');
      assert.ok(
        futureErr.message.includes('payment_future_date'),
        `Se esperaba error payment_future_date, pero se recibió: ${futureErr.message}`
      );

      paymentId = crypto.randomUUID();
      const { data: defaultPay, error: defaultPayErr } =
        await ctx.teamOwnerAClient
          .from('expense_payments')
          .insert({
            id: paymentId,
            expense_id: expenseId,
            paid_by_profile_id: ctx.budget.profile.id,
            amount_cop: 10000,
          })
          .select()
          .single();
      assert.equal(defaultPayErr, null, 'Error al registrar pago sin paid_on');
      assert.ok(defaultPay?.paid_on, 'Se esperaba que paid_on tuviera valor');

      const expectedDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());

      assert.equal(
        defaultPay.paid_on,
        expectedDate,
        `Se esperaba la fecha actual en Bogota (${expectedDate}), pero se obtuvo: ${defaultPay.paid_on}`
      );
    } finally {
      if (paymentId) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', paymentId);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
    }
  }
);

test(
  '59. update de event_id da event_id_immutable en expense_categories, expenses, tasks y con admin en expense_payments',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let categoryId = null;
    let taskId = null;
    let expenseId = null;
    let paymentId = null;

    try {
      const { data: cat, error: catErr } = await ctx.teamOwnerAClient
        .from('expense_categories')
        .insert({
          event_id: ctx.budget.eventA.id,
          name: `Cat Inmutable ${Date.now()}`,
        })
        .select()
        .single();
      assert.equal(catErr, null);
      categoryId = cat.id;

      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Inmutable 59',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null);

      expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: ctx.budget.eventA.id,
          category_id: categoryId,
          task_id: taskId,
          description: 'Gasto Inmutable 59',
          amount_cop: 40000,
        });
      assert.equal(expErr, null);

      paymentId = crypto.randomUUID();
      const { error: payErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: paymentId,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 10000,
        });
      assert.equal(payErr, null);

      const { error: catUpdateErr } = await ctx.teamOwnerAClient
        .from('expense_categories')
        .update({ event_id: ctx.budget.eventB.id })
        .eq('id', categoryId);
      assert.ok(catUpdateErr, 'Se esperaba error al cambiar event_id en expense_categories');
      assert.ok(
        catUpdateErr.message.includes('event_id_immutable'),
        `Se esperaba event_id_immutable en expense_categories, pero se recibió: ${catUpdateErr.message}`
      );

      const { error: expUpdateErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .update({ event_id: ctx.budget.eventB.id })
        .eq('id', expenseId);
      assert.ok(expUpdateErr, 'Se esperaba error al cambiar event_id en expenses');
      assert.ok(
        expUpdateErr.message.includes('event_id_immutable'),
        `Se esperaba event_id_immutable en expenses, pero se recibió: ${expUpdateErr.message}`
      );

      const { error: taskUpdateErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .update({ event_id: ctx.budget.eventB.id })
        .eq('id', taskId);
      assert.ok(taskUpdateErr, 'Se esperaba error al cambiar event_id en tasks');
      assert.ok(
        taskUpdateErr.message.includes('event_id_immutable'),
        `Se esperaba event_id_immutable en tasks, pero se recibió: ${taskUpdateErr.message}`
      );

      const { error: payUpdateErr } = await ctx.adminClient
        .from('expense_payments')
        .update({ event_id: ctx.budget.eventB.id })
        .eq('id', paymentId);
      assert.ok(
        payUpdateErr,
        'Se esperaba error al cambiar event_id en expense_payments con adminClient'
      );
      assert.ok(
        payUpdateErr.message.includes('event_id_immutable'),
        `Se esperaba event_id_immutable en expense_payments, pero se recibió: ${payUpdateErr.message}`
      );
    } finally {
      if (paymentId) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', paymentId);
      }
      if (expenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', expenseId);
      }
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
      if (categoryId) {
        await ctx.adminClient
          .from('expense_categories')
          .delete()
          .eq('id', categoryId);
      }
    }
  }
);

test(
  '60. Borrar gasto vinculado conserva la tarea y comportamiento de delete_task con p_delete_expense segun pagos',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let task1Id = null;
    let expense1Id = null;
    let task2Id = null;
    let expense2Id = null;
    let task3Id = null;
    let expense3Id = null;
    let payment3Id = null;
    let task4Id = null;
    let expense4Id = null;

    try {
      task1Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('tasks').insert({
        id: task1Id,
        event_id: ctx.budget.eventA.id,
        title: 'Tarea Caso 1',
        due_date: '2026-12-31',
      });
      expense1Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('expenses').insert({
        id: expense1Id,
        event_id: ctx.budget.eventA.id,
        category_id: ctx.budget.categoryA.id,
        task_id: task1Id,
        description: 'Gasto Caso 1',
        amount_cop: 20000,
      });

      const { error: delExp1Err } = await ctx.teamOwnerAClient
        .from('expenses')
        .delete()
        .eq('id', expense1Id);
      assert.equal(delExp1Err, null);

      const { data: checkTask1, error: checkTask1Err } = await ctx.adminClient
        .from('tasks')
        .select('id')
        .eq('id', task1Id)
        .single();
      assert.equal(checkTask1Err, null);
      assert.equal(
        checkTask1?.id,
        task1Id,
        'Se esperaba que la tarea se conservara tras borrar directamente el gasto vinculado'
      );

      task2Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('tasks').insert({
        id: task2Id,
        event_id: ctx.budget.eventA.id,
        title: 'Tarea Caso 2',
        due_date: '2026-12-31',
      });
      expense2Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('expenses').insert({
        id: expense2Id,
        event_id: ctx.budget.eventA.id,
        category_id: ctx.budget.categoryA.id,
        task_id: task2Id,
        description: 'Gasto Caso 2 Sin Pagos',
        amount_cop: 30000,
      });

      const { data: delTask2Res, error: delTask2Err } =
        await ctx.teamOwnerAClient.rpc('delete_task', {
          p_task_id: task2Id,
          p_delete_expense: true,
        });
      assert.equal(delTask2Err, null);
      assert.equal(
        delTask2Res?.deleted_expense,
        true,
        'Se esperaba deleted_expense: true al borrar tarea con gasto sin pagos'
      );

      const { data: checkTask2 } = await ctx.adminClient
        .from('tasks')
        .select('id')
        .eq('id', task2Id);
      assert.equal(checkTask2?.length ?? 0, 0);

      const { data: checkExp2 } = await ctx.adminClient
        .from('expenses')
        .select('id')
        .eq('id', expense2Id);
      assert.equal(checkExp2?.length ?? 0, 0);

      task3Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('tasks').insert({
        id: task3Id,
        event_id: ctx.budget.eventA.id,
        title: 'Tarea Caso 3',
        due_date: '2026-12-31',
      });
      expense3Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('expenses').insert({
        id: expense3Id,
        event_id: ctx.budget.eventA.id,
        category_id: ctx.budget.categoryA.id,
        task_id: task3Id,
        description: 'Gasto Caso 3 Con Pagos',
        amount_cop: 50000,
      });
      payment3Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('expense_payments').insert({
        id: payment3Id,
        expense_id: expense3Id,
        paid_by_profile_id: ctx.budget.profile.id,
        amount_cop: 20000,
      });

      const { data: delTask3Res, error: delTask3Err } =
        await ctx.teamOwnerAClient.rpc('delete_task', {
          p_task_id: task3Id,
          p_delete_expense: true,
        });
      assert.equal(delTask3Err, null);
      assert.equal(
        delTask3Res?.deleted_expense,
        false,
        'Se esperaba deleted_expense: false al intentar borrar gasto con pagos'
      );

      const { data: checkTask3 } = await ctx.adminClient
        .from('tasks')
        .select('id')
        .eq('id', task3Id);
      assert.equal(checkTask3?.length ?? 0, 0, 'La tarea 3 debe ser borrada');

      const { data: checkExp3, error: checkExp3Err } = await ctx.adminClient
        .from('expenses')
        .select('id, task_id')
        .eq('id', expense3Id)
        .single();
      assert.equal(checkExp3Err, null);
      assert.equal(
        checkExp3?.task_id,
        null,
        'El gasto 3 debe conservarse con task_id nulo'
      );

      task4Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('tasks').insert({
        id: task4Id,
        event_id: ctx.budget.eventA.id,
        title: 'Tarea Caso 4',
        due_date: '2026-12-31',
      });
      expense4Id = crypto.randomUUID();
      await ctx.teamOwnerAClient.from('expenses').insert({
        id: expense4Id,
        event_id: ctx.budget.eventA.id,
        category_id: ctx.budget.categoryA.id,
        task_id: task4Id,
        description: 'Gasto Caso 4 Sin Pagos',
        amount_cop: 35000,
      });

      const { data: delTask4Res, error: delTask4Err } =
        await ctx.teamOwnerAClient.rpc('delete_task', {
          p_task_id: task4Id,
          p_delete_expense: false,
        });
      assert.equal(delTask4Err, null);
      assert.equal(
        delTask4Res?.deleted_expense,
        false,
        'Se esperaba deleted_expense: false al no solicitar borrado de gasto'
      );

      const { data: checkTask4 } = await ctx.adminClient
        .from('tasks')
        .select('id')
        .eq('id', task4Id);
      assert.equal(checkTask4?.length ?? 0, 0, 'La tarea 4 debe ser borrada');

      const { data: checkExp4, error: checkExp4Err } = await ctx.adminClient
        .from('expenses')
        .select('id, task_id')
        .eq('id', expense4Id)
        .single();
      assert.equal(checkExp4Err, null);
      assert.equal(
        checkExp4?.task_id,
        null,
        'El gasto 4 debe conservarse con task_id nulo'
      );
    } finally {
      if (payment3Id) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', payment3Id);
      }
      if (expense1Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense1Id);
      }
      if (expense2Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense2Id);
      }
      if (expense3Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense3Id);
      }
      if (expense4Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense4Id);
      }
      if (task1Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task1Id);
      }
      if (task2Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task2Id);
      }
      if (task3Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task3Id);
      }
      if (task4Id) {
        await ctx.adminClient.from('tasks').delete().eq('id', task4Id);
      }
    }
  }
);

test(
  '61. Un evento nuevo con categoria, gasto, pago y tarea vinculada se borra sin error y no deja filas huerfanas',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let newEventId = null;

    try {
      const now = Date.now();
      const in30Days = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
      const in20Days = new Date(now + 20 * 24 * 60 * 60 * 1000).toISOString();

      const { data: newEvent, error: newEventErr } = await ctx.teamOwnerAClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-61-BORRADO`,
          starts_at: in30Days,
          rsvp_deadline: in20Days,
          created_by: ctx.teamOwnerAUser.id,
        })
        .select()
        .single();
      assert.equal(newEventErr, null, 'Error al crear evento nuevo');
      newEventId = newEvent.id;

      const { data: cat, error: catErr } = await ctx.teamOwnerAClient
        .from('expense_categories')
        .insert({
          event_id: newEventId,
          name: 'Cat 61',
        })
        .select()
        .single();
      assert.equal(catErr, null, 'Error al crear categoria en evento 61');

      const taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: newEventId,
          title: 'Tarea 61',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Error al crear tarea en evento 61');

      const expenseId = crypto.randomUUID();
      const { error: expErr } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expenseId,
          event_id: newEventId,
          category_id: cat.id,
          task_id: taskId,
          description: 'Gasto 61',
          amount_cop: 50000,
        });
      assert.equal(expErr, null, 'Error al crear gasto en evento 61');

      const paymentId = crypto.randomUUID();
      const { error: payErr } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: paymentId,
          expense_id: expenseId,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 20000,
        });
      assert.equal(payErr, null, 'Error al registrar pago en evento 61');

      const { error: delEventErr } = await ctx.teamOwnerAClient
        .from('events')
        .delete()
        .eq('id', newEventId);
      assert.equal(
        delEventErr,
        null,
        'Se esperaba poder borrar el evento con el cliente del propietario sin error'
      );

      const tables = [
        'expense_categories',
        'expenses',
        'expense_payments',
        'tasks',
      ];
      for (const table of tables) {
        const { data: rows, error: checkErr } = await ctx.adminClient
          .from(table)
          .select('id')
          .eq('event_id', newEventId);
        assert.equal(checkErr, null);
        assert.equal(
          rows?.length ?? 0,
          0,
          `No deben quedar filas en la tabla ${table} para el evento borrado`
        );
      }
      newEventId = null;
    } finally {
      if (newEventId) {
        await ctx.adminClient.from('events').delete().eq('id', newEventId);
      }
    }
  }
);

test(
  '62. update directo de done_at da permission denied y save_task new con mismos id es idempotente dejando un solo gasto',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let taskId = null;
    let idemTaskId = null;
    let idemExpenseId = null;

    try {
      taskId = crypto.randomUUID();
      const { error: taskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: taskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Prueba 62',
          due_date: '2026-12-31',
        });
      assert.equal(taskErr, null, 'Error al crear tarea para prueba 62');

      const { error: directDoneErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .update({ done_at: new Date().toISOString() })
        .eq('id', taskId);
      assert.ok(
        directDoneErr,
        'Se esperaba un error de permisos al intentar actualizar done_at directamente'
      );
      assert.ok(
        directDoneErr.message.toLowerCase().includes('permission denied'),
        `Se esperaba error de permission denied, pero se recibió: ${directDoneErr.message}`
      );

      idemTaskId = crypto.randomUUID();
      idemExpenseId = crypto.randomUUID();
      const expensePayload = {
        id: idemExpenseId,
        category_id: ctx.budget.categoryA.id,
        description: 'Gasto Idempotente 62',
        amount_cop: 75000,
      };

      const { error: save1Err } = await ctx.teamOwnerAClient.rpc('save_task', {
        p_task_id: idemTaskId,
        p_event_id: ctx.budget.eventA.id,
        p_title: 'Tarea Idempotente 62 Primera Vez',
        p_note: 'Primera nota',
        p_assignee_profile_id: null,
        p_due_date: '2026-12-31',
        p_expense_action: 'new',
        p_expense: expensePayload,
      });
      assert.equal(save1Err, null, 'Error en primera llamada a save_task new');

      const { error: save2Err } = await ctx.teamOwnerAClient.rpc('save_task', {
        p_task_id: idemTaskId,
        p_event_id: ctx.budget.eventA.id,
        p_title: 'Tarea Idempotente 62 Segunda Vez',
        p_note: 'Segunda nota',
        p_assignee_profile_id: null,
        p_due_date: '2026-12-31',
        p_expense_action: 'new',
        p_expense: expensePayload,
      });
      assert.equal(save2Err, null, 'Error en segunda llamada a save_task new repetida');

      const { data: expRows, error: checkExpErr } = await ctx.adminClient
        .from('expenses')
        .select('*')
        .eq('id', idemExpenseId);
      assert.equal(checkExpErr, null);
      assert.equal(
        expRows?.length,
        1,
        'Se esperaba que quedara exactamente un gasto con ese id'
      );
      assert.equal(
        expRows[0].task_id,
        idemTaskId,
        'El gasto debe estar vinculado a la tarea'
      );
    } finally {
      if (idemExpenseId) {
        await ctx.adminClient.from('expenses').delete().eq('id', idemExpenseId);
      }
      if (idemTaskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', idemTaskId);
      }
      if (taskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', taskId);
      }
    }
  }
);

test(
  '63. teamHelper y outsideTeamClient no gestionan perfiles, can_manage_profiles responde segun rol y anonClient no ejecuta rpc',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let tempProfId = null;

    try {
      const { data: tempProf, error: tempProfErr } = await ctx.adminClient
        .from('team_profiles')
        .insert({
          team_id: ctx.team.id,
          name: `Perfil Temporal 63 ${Date.now()}`,
        })
        .select()
        .single();
      assert.equal(tempProfErr, null);
      tempProfId = tempProf.id;

      await ctx.teamHelperClient
        .from('team_profiles')
        .insert({ team_id: ctx.team.id, name: `Perfil Helper 63 ${Date.now()}` });

      const { data: helperCreated } = await ctx.adminClient
        .from('team_profiles')
        .select('id')
        .like('name', 'Perfil Helper 63%');
      assert.equal(
        helperCreated?.length ?? 0,
        0,
        'El ayudante no debe poder crear perfiles'
      );

      await ctx.teamHelperClient
        .from('team_profiles')
        .update({ name: 'Perfil Modificado Por Helper' })
        .eq('id', tempProfId);

      const { data: helperUnchanged } = await ctx.adminClient
        .from('team_profiles')
        .select('name')
        .eq('id', tempProfId)
        .single();
      assert.equal(
        helperUnchanged?.name,
        tempProf.name,
        'El ayudante no debe poder renombrar perfiles'
      );

      await ctx.teamHelperClient
        .from('team_profiles')
        .delete()
        .eq('id', tempProfId);

      const { data: helperStillThere } = await ctx.adminClient
        .from('team_profiles')
        .select('id')
        .eq('id', tempProfId);
      assert.equal(
        helperStillThere?.length,
        1,
        'El ayudante no debe poder borrar perfiles'
      );

      await ctx.outsideTeamClient
        .from('team_profiles')
        .insert({ team_id: ctx.team.id, name: `Perfil Outside 63 ${Date.now()}` });

      const { data: outsideCreated } = await ctx.adminClient
        .from('team_profiles')
        .select('id')
        .like('name', 'Perfil Outside 63%');
      assert.equal(
        outsideCreated?.length ?? 0,
        0,
        'Un cliente fuera del equipo no debe poder crear perfiles'
      );

      await ctx.outsideTeamClient
        .from('team_profiles')
        .update({ name: 'Perfil Modificado Por Outside' })
        .eq('id', tempProfId);

      const { data: outsideUnchanged } = await ctx.adminClient
        .from('team_profiles')
        .select('name')
        .eq('id', tempProfId)
        .single();
      assert.equal(
        outsideUnchanged?.name,
        tempProf.name,
        'Un cliente fuera del equipo no debe poder renombrar perfiles'
      );

      await ctx.outsideTeamClient
        .from('team_profiles')
        .delete()
        .eq('id', tempProfId);

      const { data: outsideStillThere } = await ctx.adminClient
        .from('team_profiles')
        .select('id')
        .eq('id', tempProfId);
      assert.equal(
        outsideStillThere?.length,
        1,
        'Un cliente fuera del equipo no debe poder borrar perfiles'
      );

      const { data: canOwner, error: errOwner } =
        await ctx.teamOwnerAClient.rpc('can_manage_profiles', {
          p_event_id: ctx.budget.eventA.id,
        });
      assert.equal(errOwner, null);
      assert.equal(
        canOwner,
        true,
        'Se esperaba que can_manage_profiles fuera true para el propietario'
      );

      const { data: canHelper, error: errHelper } =
        await ctx.teamHelperClient.rpc('can_manage_profiles', {
          p_event_id: ctx.budget.eventA.id,
        });
      assert.equal(errHelper, null);
      assert.equal(
        canHelper,
        false,
        'Se esperaba que can_manage_profiles fuera false para el ayudante'
      );

      const { data: canOutside, error: errOutside } =
        await ctx.outsideTeamClient.rpc('can_manage_profiles', {
          p_event_id: ctx.budget.eventA.id,
        });
      assert.equal(errOutside, null);
      assert.equal(
        canOutside,
        false,
        'Se esperaba que can_manage_profiles fuera false para cliente fuera del equipo'
      );

      const { error: anonDoneErr } = await ctx.anonClient.rpc('set_task_done', {
        p_task_id: crypto.randomUUID(),
        p_done: true,
      });
      assert.ok(
        anonDoneErr,
        'Se esperaba error al intentar ejecutar set_task_done sin sesion'
      );

      const { error: anonCanErr } = await ctx.anonClient.rpc(
        'can_manage_profiles',
        {
          p_event_id: ctx.budget.eventA.id,
        }
      );
      assert.ok(
        anonCanErr,
        'Se esperaba error al intentar ejecutar can_manage_profiles sin sesion'
      );
    } finally {
      if (tempProfId) {
        await ctx.adminClient
          .from('team_profiles')
          .delete()
          .eq('id', tempProfId);
      }
    }
  }
);

test(
  '64. Realtime notifica UPDATE en tasks a propietario y ayudante pero no emite avisos de presupuesto al canal espia',
  { timeout: 60_000 },
  async () => {
    let ownerChannel = null;
    let helperControlChannel = null;
    let helperSpyChannel = null;
    let testTaskId = null;
    let expense64Id = null;
    let payment64Id = null;

    const waitForStatus = (channel, expectedStatuses, timeoutMs = 10_000) => {
      return new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(
              new Error(
                `Timeout de ${timeoutMs}ms esperando estado ${expectedStatuses.join(' o ')} en canal ${channel.topic}`
              )
            );
          }
        }, timeoutMs);

        channel.subscribe((status, err) => {
          if (settled) return;
          if (expectedStatuses.includes(status)) {
            settled = true;
            clearTimeout(timer);
            resolve(status);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (!expectedStatuses.includes(status)) {
              settled = true;
              clearTimeout(timer);
              reject(
                err || new Error(`Canal ${channel.topic} terminó en estado ${status}`)
              );
            }
          }
        });
      });
    };

    try {
      const { data: ownerSession } = await ctx.teamOwnerAClient.auth.getSession();
      assert.ok(ownerSession?.session?.access_token, 'Se esperaba token de sesion para el propietario');
      ctx.teamOwnerAClient.realtime.setAuth(ownerSession.session.access_token);

      const { data: helperSession } = await ctx.teamHelperClient.auth.getSession();
      assert.ok(helperSession?.session?.access_token, 'Se esperaba token de sesion para el ayudante');
      ctx.teamHelperClient.realtime.setAuth(helperSession.session.access_token);

      const ownerMessages = [];
      ownerChannel = ctx.teamOwnerAClient.channel(`owner-tasks-${ctx.run}-${Date.now()}`);
      ownerChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `event_id=eq.${ctx.budget.eventA.id}`,
        },
        (payload) => {
          ownerMessages.push(payload);
        }
      );

      const helperControlMessages = [];
      helperControlChannel = ctx.teamHelperClient.channel(`helper-control-${ctx.run}-${Date.now()}`);
      helperControlChannel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: `event_id=eq.${ctx.budget.eventA.id}`,
        },
        (payload) => {
          helperControlMessages.push(payload);
        }
      );

      const helperSpyMessages = [];
      helperSpyChannel = ctx.teamHelperClient.channel(`helper-spy-${ctx.run}-${Date.now()}`);
      helperSpyChannel
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expenses',
          },
          (payload) => {
            helperSpyMessages.push(payload);
          }
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'expense_payments',
          },
          (payload) => {
            helperSpyMessages.push(payload);
          }
        );

      await Promise.all([
        waitForStatus(ownerChannel, ['SUBSCRIBED'], 10_000),
        waitForStatus(helperControlChannel, ['SUBSCRIBED'], 10_000),
        waitForStatus(helperSpyChannel, ['SUBSCRIBED', 'CHANNEL_ERROR'], 10_000),
      ]);

      testTaskId = crypto.randomUUID();
      const { error: createTaskErr } = await ctx.teamOwnerAClient
        .from('tasks')
        .insert({
          id: testTaskId,
          event_id: ctx.budget.eventA.id,
          title: 'Tarea Realtime 64',
          due_date: '2026-12-31',
        });
      assert.equal(createTaskErr, null, 'Error al crear tarea para prueba de realtime');

      await new Promise((resolve) => setTimeout(resolve, 3000));

      const { error: markErr } = await ctx.teamHelperClient.rpc('set_task_done', {
        p_task_id: testTaskId,
        p_done: true,
      });
      assert.equal(markErr, null, 'Error al marcar tarea como hecha en realtime');

      const deadline = Date.now() + 10_000;
      let receivedOwner = false;
      let receivedHelper = false;

      while (Date.now() < deadline) {
        receivedOwner = ownerMessages.some(
          (msg) => msg.new?.id === testTaskId || msg.old?.id === testTaskId
        );
        receivedHelper = helperControlMessages.some(
          (msg) => msg.new?.id === testTaskId || msg.old?.id === testTaskId
        );

        if (receivedOwner && receivedHelper) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      assert.ok(
        receivedOwner,
        'Se esperaba que el canal del propietario recibiera el aviso UPDATE de la tarea'
      );
      assert.ok(
        receivedHelper,
        'Se esperaba que el canal de control del ayudante recibiera el aviso UPDATE de la tarea'
      );

      expense64Id = crypto.randomUUID();
      const { error: exp64Err } = await ctx.teamOwnerAClient
        .from('expenses')
        .insert({
          id: expense64Id,
          event_id: ctx.budget.eventA.id,
          category_id: ctx.budget.categoryA.id,
          description: 'Gasto 64 Realtime',
          amount_cop: 25000,
        });
      assert.equal(exp64Err, null, 'Error al crear gasto en prueba 64');

      payment64Id = crypto.randomUUID();
      const { error: pay64Err } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .insert({
          id: payment64Id,
          expense_id: expense64Id,
          paid_by_profile_id: ctx.budget.profile.id,
          amount_cop: 25000,
        });
      assert.equal(pay64Err, null, 'Error al registrar pago en prueba 64');

      const { error: delPay64Err } = await ctx.teamOwnerAClient
        .from('expense_payments')
        .delete()
        .eq('id', payment64Id);
      assert.equal(delPay64Err, null, 'Error al borrar pago en prueba 64');
      payment64Id = null;

      const { error: delExp64Err } = await ctx.teamOwnerAClient
        .from('expenses')
        .delete()
        .eq('id', expense64Id);
      assert.equal(delExp64Err, null, 'Error al borrar gasto en prueba 64');
      expense64Id = null;

      await new Promise((resolve) => setTimeout(resolve, 4000));

      assert.equal(
        helperSpyMessages.length,
        0,
        `Se esperaba que el canal espia tuviera 0 avisos de expenses/expense_payments, pero recibio ${helperSpyMessages.length}`
      );
    } finally {
      if (ownerChannel) {
        await ctx.teamOwnerAClient.removeChannel(ownerChannel);
      }
      if (helperControlChannel) {
        await ctx.teamHelperClient.removeChannel(helperControlChannel);
      }
      if (helperSpyChannel) {
        await ctx.teamHelperClient.removeChannel(helperSpyChannel);
      }
      if (payment64Id) {
        await ctx.adminClient.from('expense_payments').delete().eq('id', payment64Id);
      }
      if (expense64Id) {
        await ctx.adminClient.from('expenses').delete().eq('id', expense64Id);
      }
      if (testTaskId) {
        await ctx.adminClient.from('tasks').delete().eq('id', testTaskId);
      }
    }
  }
);

test(
  '65. set_rsvp registra cambio en rsvp_log con source guest y repetir el mismo valor no agrega fila',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const targetGuest = ctx.guestsA[0];
    const { data: currentGuest, error: guestErr } = await ctx.adminClient
      .from('guests')
      .select('id, rsvp, invitation_id, event_id')
      .eq('id', targetGuest.id)
      .single();
    assert.equal(guestErr, null, 'Error al consultar estado previo del invitado');

    const previousRsvp = currentGuest.rsvp;
    const newRsvp = previousRsvp === 'accepted' ? 'declined' : 'accepted';

    const { count: countBefore, error: countBeforeErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*', { count: 'exact', head: true })
      .eq('guest_id', targetGuest.id);
    assert.equal(countBeforeErr, null, 'Error al contar filas previas en rsvp_log');

    const { error: rsvpErr } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: ctx.invitationA.code,
      p_guest_id: targetGuest.id,
      p_rsvp: newRsvp,
    });
    assert.equal(rsvpErr, null, 'Error al invocar set_rsvp con anonClient');

    const { data: logRows, error: logErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*')
      .eq('guest_id', targetGuest.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    assert.equal(logErr, null, 'Error al consultar rsvp_log tras set_rsvp');
    assert.equal(logRows?.length, 1, 'Se esperaba al menos una fila en rsvp_log');

    const logRow = logRows[0];
    assert.equal(logRow.source, 'guest', 'Se esperaba source = guest');
    assert.equal(logRow.actor_id, null, 'Se esperaba actor_id nulo para respuesta de invitado');
    assert.equal(logRow.previous_rsvp, previousRsvp, 'previous_rsvp no coincide');
    assert.equal(logRow.rsvp, newRsvp, 'rsvp no coincide con el nuevo valor');
    assert.equal(logRow.event_id, ctx.eventX.id, 'event_id no coincide');
    assert.equal(logRow.invitation_id, ctx.invitationA.id, 'invitation_id no coincide');

    const { count: countAfterFirst, error: countAfterFirstErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*', { count: 'exact', head: true })
      .eq('guest_id', targetGuest.id);
    assert.equal(countAfterFirstErr, null);
    assert.equal(countAfterFirst, (countBefore ?? 0) + 1, 'Se esperaba exactamente una fila nueva');

    const { error: repeatErr } = await ctx.anonClient.rpc('set_rsvp', {
      p_code: ctx.invitationA.code,
      p_guest_id: targetGuest.id,
      p_rsvp: newRsvp,
    });
    assert.equal(repeatErr, null, 'Error al repetir set_rsvp con el mismo valor');

    const { count: countAfterSecond, error: countAfterSecondErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*', { count: 'exact', head: true })
      .eq('guest_id', targetGuest.id);
    assert.equal(countAfterSecondErr, null);
    assert.equal(
      countAfterSecond,
      countAfterFirst,
      'Repetir set_rsvp con el mismo valor no debe agregar otra fila en rsvp_log'
    );
  }
);

test(
  '66. update directo de rsvp registra source team y actor_id, list_rsvp_log devuelve la fila primero con total y helperX ve mismo total, y pending no agrega fila',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    let tempGuestId = null;

    try {
      const targetGuest = ctx.guestsA[1];
      const { data: currentGuest, error: guestErr } = await ctx.adminClient
        .from('guests')
        .select('id, rsvp, full_name, invitation_id')
        .eq('id', targetGuest.id)
        .single();
      assert.equal(guestErr, null, 'Error al consultar invitado');

      const previousRsvp = currentGuest.rsvp;
      const newRsvp = previousRsvp === 'accepted' ? 'declined' : 'accepted';

      const { error: updateErr } = await ctx.ownerXClient
        .from('guests')
        .update({ rsvp: newRsvp })
        .eq('id', targetGuest.id);
      assert.equal(updateErr, null, 'Error al actualizar guests.rsvp directamente con ownerXClient');

      const { data: latestLog, error: latestLogErr } = await ctx.adminClient
        .from('rsvp_log')
        .select('*')
        .eq('guest_id', targetGuest.id)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(1)
        .single();
      assert.equal(latestLogErr, null, 'Error al consultar fila creada en rsvp_log');
      assert.equal(latestLog.source, 'team', 'Se esperaba source = team para update directo');
      assert.equal(latestLog.actor_id, ctx.ownerXUser.id, 'Se esperaba actor_id = ownerXUser.id');
      assert.equal(latestLog.rsvp, newRsvp, 'Se esperaba rsvp igual al nuevo valor');
      assert.equal(latestLog.previous_rsvp, previousRsvp, 'Se esperaba previous_rsvp igual al valor previo');

      const { count: totalRowsInEventX, error: countErr } = await ctx.adminClient
        .from('rsvp_log')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', ctx.eventX.id);
      assert.equal(countErr, null, 'Error al contar filas de eventX con adminClient');

      const { data: listData, error: listErr } = await ctx.ownerXClient.rpc('list_rsvp_log', {
        p_event_id: ctx.eventX.id,
        p_limit: 1,
      });
      assert.equal(listErr, null, 'Error al llamar list_rsvp_log con ownerXClient');
      assert.equal(listData?.total, totalRowsInEventX, 'total debe coincidir con filas de eventX');
      assert.equal(listData?.items?.length, 1, 'Debe devolver exactamente 1 item con p_limit = 1');

      const firstItem = listData.items[0];
      assert.equal(firstItem.id, latestLog.id, 'La fila devuelta primero debe ser la recién creada');
      assert.equal(firstItem.guest_id, targetGuest.id, 'guest_id no coincide');
      assert.equal(firstItem.guest_name, currentGuest.full_name, 'guest_name no coincide');
      assert.equal(firstItem.group_name, ctx.invitationA.group_name, 'group_name no coincide');
      assert.equal(firstItem.invitation_kind, ctx.invitationA.kind ?? 'group', 'invitation_kind no coincide');
      assert.equal(firstItem.source, 'team', 'source debe ser team');
      assert.equal(firstItem.rsvp, newRsvp, 'rsvp no coincide');
      assert.equal(firstItem.previous_rsvp, previousRsvp, 'previous_rsvp no coincide');

      const expectedActorName = ctx.ownerXUser.raw_user_meta_data?.display_name?.trim() || null;
      assert.equal(
        firstItem.actor_name,
        expectedActorName,
        'actor_name debe ser display_name del usuario o null si no tiene'
      );

      const { data: helperListData, error: helperListErr } = await ctx.helperXClient.rpc('list_rsvp_log', {
        p_event_id: ctx.eventX.id,
        p_limit: 1,
      });
      assert.equal(helperListErr, null, 'Error al llamar list_rsvp_log con helperXClient');
      assert.equal(helperListData?.total, totalRowsInEventX, 'helperXClient debe ver el mismo total');

      const countBeforeInsert = totalRowsInEventX;
      tempGuestId = crypto.randomUUID();
      const { error: insertGuestErr } = await ctx.ownerXClient
        .from('guests')
        .insert({
          id: tempGuestId,
          event_id: ctx.eventX.id,
          invitation_id: ctx.invitationA.id,
          full_name: 'Persona Temporal Pending 66',
          rsvp: 'pending',
          sort_order: 99,
        });
      assert.equal(insertGuestErr, null, 'Error al insertar persona con pending');

      const { count: countAfterInsert, error: countAfterErr } = await ctx.adminClient
        .from('rsvp_log')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', ctx.eventX.id);
      assert.equal(countAfterErr, null);
      assert.equal(
        countAfterInsert,
        countBeforeInsert,
        'Insertar una persona nueva con pending no debe agregar fila a rsvp_log'
      );
    } finally {
      if (tempGuestId) {
        await ctx.adminClient.from('guests').delete().eq('id', tempGuestId);
      }
    }
  }
);

test(
  '67. anonClient no lee ni ejecuta list_rsvp_log, ownerY recibe not_event_member y ownerX no puede hacer insert, update ni delete en rsvp_log',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { data: anonData, error: anonErr } = await ctx.anonClient
      .from('rsvp_log')
      .select('*')
      .limit(5);
    const anonRows = anonData ?? [];
    assert.equal(anonRows.length, 0, 'anonClient no debe ver filas de rsvp_log');
    assert.ok(
      Boolean(anonErr) || Array.isArray(anonData),
      'anonClient debe recibir error o lista vacia'
    );

    const { error: anonRpcErr } = await ctx.anonClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
    });
    assert.ok(anonRpcErr, 'anonClient debe fallar al llamar list_rsvp_log');

    const { error: ownerYRpcErr } = await ctx.ownerYClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
    });
    assert.ok(ownerYRpcErr, 'ownerYClient debe recibir error al llamar list_rsvp_log para eventX');
    assert.ok(
      ownerYRpcErr.message.includes('not_event_member'),
      `Se esperaba not_event_member pero se recibio: ${ownerYRpcErr.message}`
    );

    const { data: ownerYData, error: ownerYErr } = await ctx.ownerYClient
      .from('rsvp_log')
      .select('*')
      .eq('event_id', ctx.eventX.id);
    assert.equal(ownerYData?.length ?? 0, 0, 'ownerYClient no debe ver filas de eventX en rsvp_log');

    const { data: beforeRows, error: beforeErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*')
      .eq('event_id', ctx.eventX.id)
      .order('id');
    assert.equal(beforeErr, null, 'Error al consultar filas previas con adminClient');

    const fakeLogId = crypto.randomUUID();
    const { error: insertErr } = await ctx.ownerXClient
      .from('rsvp_log')
      .insert({
        id: fakeLogId,
        event_id: ctx.eventX.id,
        invitation_id: ctx.invitationA.id,
        guest_id: ctx.guestsA[0].id,
        rsvp: 'accepted',
        source: 'team',
      });
    assert.ok(insertErr, 'ownerXClient debe recibir error de permisos al intentar insert en rsvp_log');

    const targetRowId = beforeRows.length > 0 ? beforeRows[0].id : crypto.randomUUID();
    const { error: updateErr } = await ctx.ownerXClient
      .from('rsvp_log')
      .update({ rsvp: 'declined' })
      .eq('id', targetRowId);
    assert.ok(updateErr, 'ownerXClient debe recibir error de permisos al intentar update en rsvp_log');

    const { error: deleteErr } = await ctx.ownerXClient
      .from('rsvp_log')
      .delete()
      .eq('id', targetRowId);
    assert.ok(deleteErr, 'ownerXClient debe recibir error de permisos al intentar delete en rsvp_log');

    const { data: afterRows, error: afterErr } = await ctx.adminClient
      .from('rsvp_log')
      .select('*')
      .eq('event_id', ctx.eventX.id)
      .order('id');
    assert.equal(afterErr, null, 'Error al consultar filas posteriores con adminClient');
    assert.deepEqual(
      afterRows,
      beforeRows,
      'Las filas de rsvp_log para eventX deben mantenerse exactamente iguales'
    );
  }
);

test(
  '68. list_rsvp_log pagina correctamente sin repetir filas, ordena created_at desc y valida limites y offsets',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const { count: initialCount } = await ctx.adminClient
      .from('rsvp_log')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', ctx.eventX.id);

    const needed = Math.max(0, 3 - (initialCount ?? 0));
    const guestsToToggle = [ctx.guestsA[0], ctx.guestsA[1], ctx.guestB];

    for (let i = 0; i < needed; i++) {
      const g = guestsToToggle[i % guestsToToggle.length];
      const { data: gData } = await ctx.adminClient
        .from('guests')
        .select('rsvp')
        .eq('id', g.id)
        .single();
      const nextRsvp = gData?.rsvp === 'accepted' ? 'declined' : 'accepted';
      const { error: updateErr } = await ctx.ownerXClient
        .from('guests')
        .update({ rsvp: nextRsvp })
        .eq('id', g.id);
      assert.equal(updateErr, null, 'Error al generar fila de prueba en guests');
    }

    const { count: finalCount } = await ctx.adminClient
      .from('rsvp_log')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', ctx.eventX.id);
    assert.ok((finalCount ?? 0) >= 3, 'Se esperaban al menos 3 filas en eventX para la prueba de paginacion');

    const { data: page1, error: page1Err } = await ctx.ownerXClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
      p_limit: 2,
      p_offset: 0,
    });
    assert.equal(page1Err, null, 'Error en pagina 1');
    assert.equal(page1?.items?.length, 2, 'Pagina 1 debe devolver 2 items');

    const { data: page2, error: page2Err } = await ctx.ownerXClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
      p_limit: 2,
      p_offset: 2,
    });
    assert.equal(page2Err, null, 'Error en pagina 2');
    assert.ok(
      (page2?.items?.length ?? 0) >= 1,
      'Pagina 2 debe devolver al menos 1 item con 3 o mas filas'
    );

    const page1Ids = page1.items.map((it) => it.id);
    const page2Ids = page2.items.map((it) => it.id);
    for (const id of page2Ids) {
      assert.equal(
        page1Ids.includes(id),
        false,
        `El id ${id} de la pagina 2 no debe repetirse en la pagina 1`
      );
    }

    const allPagedItems = [...page1.items, ...page2.items];
    for (let i = 0; i < allPagedItems.length - 1; i++) {
      const current = allPagedItems[i];
      const next = allPagedItems[i + 1];
      const currentMs = new Date(current.created_at).getTime();
      const nextMs = new Date(next.created_at).getTime();
      assert.ok(
        currentMs >= nextMs,
        'Los elementos deben estar ordenados descendentemente por created_at'
      );
    }

    const { data: limitZeroData, error: limitZeroErr } = await ctx.ownerXClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
      p_limit: 0,
    });
    assert.equal(limitZeroErr, null, 'Error con p_limit = 0');
    assert.equal(limitZeroData?.items?.length, 1, 'p_limit = 0 debe devolver 1 item');

    const { data: limit500Data, error: limit500Err } = await ctx.ownerXClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
      p_limit: 500,
    });
    assert.equal(limit500Err, null, 'Error con p_limit = 500');
    assert.ok(
      (limit500Data?.items?.length ?? 0) <= 50,
      'p_limit = 500 debe devolver como maximo 50 items'
    );

    const { data: offsetNegData, error: offsetNegErr } = await ctx.ownerXClient.rpc('list_rsvp_log', {
      p_event_id: ctx.eventX.id,
      p_limit: 2,
      p_offset: -5,
    });
    assert.equal(offsetNegErr, null, 'Error con p_offset = -5');
    assert.deepEqual(
      offsetNegData?.items,
      page1.items,
      'p_offset = -5 debe devolver exactamente lo mismo que p_offset = 0'
    );
  }
);


