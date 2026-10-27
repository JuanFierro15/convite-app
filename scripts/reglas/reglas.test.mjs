import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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
        max_reservations: 1,
        sort_order: 35,
      })
      .select()
      .single();

    assert.equal(
      createGiftError,
      null,
      'Se esperaba crear con el administrador el regalo repetible con tope 1 sin error'
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
      'Se esperaba que la familia A pudiera apartar el único cupo sin error'
    );

    const { error: reserveBError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationB.code,
      p_gift_id: gift35.id,
    });

    assert.ok(
      reserveBError,
      'Se esperaba un error cuando la familia B intenta apartar un regalo lleno'
    );
    assert.ok(
      reserveBError.message.includes('gift_full'),
      `Se esperaba el código gift_full, pero se recibió: ${reserveBError.message}`
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

    const { data: reserveBData, error: reserveBSuccessError } =
      await ctx.anonClient.rpc('reserve_gift', {
        p_code: ctx.invitationB.code,
        p_gift_id: gift35.id,
      });

    assert.equal(
      reserveBSuccessError,
      null,
      'Se esperaba que la familia B pudiera apartar el regalo liberado sin error'
    );
    const reservedByBGift = (reserveBData ?? []).find(
      (g) => g.id === gift35.id
    );
    assert.ok(
      reservedByBGift,
      'Se esperaba encontrar el regalo en la respuesta devuelta a la familia B'
    );
    assert.equal(
      reservedByBGift.full,
      true,
      'Se esperaba full = true tras apartar el cupo que fue liberado'
    );
    assert.equal(
      reservedByBGift.remaining,
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

    const { error: updateTo1Error } = await ctx.ownerXClient
      .from('gifts')
      .update({ max_reservations: 1 })
      .eq('id', gift36.id);

    assert.ok(
      updateTo1Error,
      'Se esperaba un error al intentar bajar el tope por debajo del número de reservas'
    );
    assert.ok(
      updateTo1Error.message.includes('reservations_exceed_limit'),
      `Se esperaba reservations_exceed_limit, pero se recibió: ${updateTo1Error.message}`
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

    const { error: updateTo2Error } = await ctx.ownerXClient
      .from('gifts')
      .update({ max_reservations: 2 })
      .eq('id', gift36.id);

    assert.equal(
      updateTo2Error,
      null,
      'Se esperaba que actualizar max_reservations a 2 fuera exitoso'
    );

    const { error: updateToNullError } = await ctx.ownerXClient
      .from('gifts')
      .update({ max_reservations: null })
      .eq('id', gift36.id);

    assert.equal(
      updateToNullError,
      null,
      'Se esperaba que actualizar max_reservations a null fuera exitoso'
    );

    const { data: giftsAfterNull, error: giftsNullError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: ctx.invitationA.code,
      });

    assert.equal(
      giftsNullError,
      null,
      'Se esperaba consultar get_gifts tras poner el tope en null sin error'
    );
    const giftAfterNullItem = (giftsAfterNull ?? []).find(
      (g) => g.id === gift36.id
    );
    assert.ok(
      giftAfterNullItem,
      'Se esperaba encontrar el regalo en get_gifts tras actualizar tope a null'
    );
    assert.equal(
      giftAfterNullItem.remaining,
      null,
      'Se esperaba que remaining fuera null al actualizar el tope a null'
    );
    assert.equal(
      giftAfterNullItem.full,
      false,
      'Se esperaba que full fuera false al actualizar el tope a null'
    );

    const { data: giftNoLimit, error: createNoLimitError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: `PRUEBA-${ctx.run}-REGALO-36-SIN-TOPE`,
          kind: 'repeatable',
          max_reservations: null,
          sort_order: 37,
        })
        .select()
        .single();

    assert.equal(
      createNoLimitError,
      null,
      'Se esperaba crear un regalo sin tope sin error'
    );
    assert.ok(
      giftNoLimit?.id,
      'Se esperaba recibir el id del regalo creado sin tope'
    );

    const { data: giftsNoLimitList, error: giftsNoLimitError } =
      await ctx.anonClient.rpc('get_gifts', {
        p_code: ctx.invitationA.code,
      });

    assert.equal(
      giftsNoLimitError,
      null,
      'Se esperaba consultar get_gifts para el regalo sin tope sin error'
    );
    const noLimitItem = (giftsNoLimitList ?? []).find(
      (g) => g.id === giftNoLimit.id
    );
    assert.ok(
      noLimitItem,
      'Se esperaba encontrar el regalo sin tope en get_gifts'
    );
    assert.equal(
      noLimitItem.remaining,
      null,
      'Se esperaba remaining = null en un regalo creado sin tope'
    );
    assert.equal(
      noLimitItem.full,
      false,
      'Se esperaba full = false en un regalo creado sin tope'
    );
  }
);

test(
  '37. Un regalo único o libre no acepta límite y el límite debe ser 1 o más',
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

    const failedNames = [uniqueInvalidName, freeInvalidName, zeroInvalidName];
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
