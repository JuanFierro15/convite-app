import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  createEmptyContext,
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
      .update({ kind: 'repeatable' })
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
