import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const REQUIRED_ENV_VARS = [
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
];

const CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function getEnvConfig() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(', ')}`
    );
  }
  return {
    url: process.env.SUPABASE_URL.trim(),
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY.trim(),
    secretKey: process.env.SUPABASE_SECRET_KEY.trim(),
  };
}

export function createAdminClient(url, secretKey) {
  return createClient(url, secretKey, CLIENT_OPTIONS);
}

export function createAnonClient(url, publishableKey) {
  return createClient(url, publishableKey, CLIENT_OPTIONS);
}

export async function createAuthenticatedClient(
  url,
  publishableKey,
  email,
  password
) {
  const client = createClient(url, publishableKey, CLIENT_OPTIONS);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(
      `No se pudo iniciar sesión para ${email}: ${error.message}`
    );
  }
  return client;
}

export function createEmptyContext() {
  return {
    run: Date.now().toString(36),
    adminClient: null,
    anonClient: null,
    ownerXClient: null,
    ownerYClient: null,
    helperXClient: null,
    teamOwnerAClient: null,
    teamOwnerBClient: null,
    teamHelperClient: null,
    outsideTeamClient: null,
    ownerXUser: null,
    ownerYUser: null,
    helperXUser: null,
    teamOwnerAUser: null,
    teamOwnerBUser: null,
    teamHelperUser: null,
    outsideTeamUser: null,
    team: null,
    eventX: null,
    eventY: null,
    eventExpired: null,
    eventStarted: null,
    invitationA: null,
    invitationB: null,
    invitationY: null,
    invitationExpired: null,
    invitationStarted: null,
    guestsA: [],
    guestB: null,
    guestY: null,
    guestExpired: null,
    guestStarted: null,
    giftXUnique: null,
    giftXRepeatable: null,
    giftXFree: null,
    giftXReserved: null,
    giftYUnique: null,
    giftStartedUnique: null,
    giftStartedRepeatable: null,
    reservationStartedUnique: null,
    reservationXReserved: null,
    uniqueGiftWinnerCode: null,
    uniqueGiftLoserCode: null,
    savedInvitationPayload: null,
    test27InvitationId: null,
    test27GuestId: null,
    test27Code: null,
    test29ArrivalsPayload: null,
    test29GuestIds: [],
    test29RecordedAt: null,
    createdEventIds: [],
    createdUserIds: [],
  };
}

export async function cleanupPreviousRuns(adminClient) {
  const { error: eventsError } = await adminClient
    .from('events')
    .delete()
    .like('name', 'PRUEBA-%');

  if (eventsError) {
    throw new Error(
      `No se pudieron limpiar eventos de corridas previas: ${eventsError.message}`
    );
  }

  const { error: teamsError } = await adminClient
    .from('teams')
    .delete()
    .like('name', 'PRUEBA-%');

  if (teamsError) {
    throw new Error(
      `No se pudieron limpiar equipos de corridas previas: ${teamsError.message}`
    );
  }

  const perPage = 100;
  let page = 1;
  const staleUserIds = [];

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      throw new Error(
        `No se pudieron listar usuarios de corridas previas: ${error.message}`
      );
    }

    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email?.toLowerCase().endsWith('@convite.test')) {
        staleUserIds.push(user.id);
      }
    }

    if (users.length < perPage) {
      break;
    }
    page += 1;
  }

  for (const userId of staleUserIds) {
    const { error } = await adminClient.auth.admin.deleteUser(userId);
    if (error) {
      throw new Error(
        `No se pudo borrar el usuario de prueba previo ${userId}: ${error.message}`
      );
    }
  }
}

async function createTestUser(adminClient, ctx, rolePrefix) {
  const email = `${rolePrefix}-${ctx.run}@convite.test`;
  const password = crypto.randomUUID();

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error || !data?.user) {
    throw new Error(
      `No se pudo crear el usuario ${email}: ${error?.message ?? 'sin datos'}`
    );
  }

  ctx.createdUserIds.push(data.user.id);
  return { id: data.user.id, email, password };
}

export async function setupTestContext(ctx) {
  const { url, publishableKey, secretKey } = getEnvConfig();
  ctx.adminClient = createAdminClient(url, secretKey);
  ctx.anonClient = createAnonClient(url, publishableKey);

  try {
    await cleanupPreviousRuns(ctx.adminClient);

    ctx.ownerXUser = await createTestUser(ctx.adminClient, ctx, 'propietario-x');
    ctx.ownerYUser = await createTestUser(ctx.adminClient, ctx, 'propietario-y');
    ctx.helperXUser = await createTestUser(ctx.adminClient, ctx, 'ayudante-x');

    ctx.ownerXClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.ownerXUser.email,
      ctx.ownerXUser.password
    );
    ctx.ownerYClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.ownerYUser.email,
      ctx.ownerYUser.password
    );
    ctx.helperXClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.helperXUser.email,
      ctx.helperXUser.password
    );

    const now = Date.now();
    const in30Days = new Date(now + 30 * DAY_MS).toISOString();
    const in20Days = new Date(now + 20 * DAY_MS).toISOString();
    const in10Days = new Date(now + 10 * DAY_MS).toISOString();
    const yesterday = new Date(now - 1 * DAY_MS).toISOString();
    const twoDaysAgo = new Date(now - 2 * DAY_MS).toISOString();
    const threeDaysAgo = new Date(now - 3 * DAY_MS).toISOString();

    const { data: eventX, error: eventXError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-X`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerXUser.id,
      })
      .select()
      .single();
    if (eventXError || !eventX) {
      throw new Error(
        `No se pudo crear el evento X: ${eventXError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventX = eventX;
    ctx.createdEventIds.push(eventX.id);

    const { data: eventY, error: eventYError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-Y`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerYUser.id,
      })
      .select()
      .single();
    if (eventYError || !eventY) {
      throw new Error(
        `No se pudo crear el evento Y: ${eventYError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventY = eventY;
    ctx.createdEventIds.push(eventY.id);

    const { data: eventExpired, error: eventExpiredError } =
      await ctx.adminClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-VENCIDO`,
          starts_at: in10Days,
          rsvp_deadline: yesterday,
          created_by: ctx.ownerXUser.id,
        })
        .select()
        .single();
    if (eventExpiredError || !eventExpired) {
      throw new Error(
        `No se pudo crear el evento vencido: ${eventExpiredError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventExpired = eventExpired;
    ctx.createdEventIds.push(eventExpired.id);

    const { data: eventStarted, error: eventStartedError } =
      await ctx.adminClient
        .from('events')
        .insert({
          name: `PRUEBA-${ctx.run}-INICIADO`,
          starts_at: twoDaysAgo,
          rsvp_deadline: threeDaysAgo,
          created_by: ctx.ownerXUser.id,
        })
        .select()
        .single();
    if (eventStartedError || !eventStarted) {
      throw new Error(
        `No se pudo crear el evento iniciado: ${eventStartedError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventStarted = eventStarted;
    ctx.createdEventIds.push(eventStarted.id);

    const { error: helperMemberError } = await ctx.adminClient
      .from('event_members')
      .insert({
        event_id: ctx.eventX.id,
        user_id: ctx.helperXUser.id,
        role: 'helper',
      });
    if (helperMemberError) {
      throw new Error(
        `No se pudo registrar al ayudante en el evento X: ${helperMemberError.message}`
      );
    }

    const { error: helperExpiredMemberError } = await ctx.adminClient
      .from('event_members')
      .insert({
        event_id: ctx.eventExpired.id,
        user_id: ctx.helperXUser.id,
        role: 'helper',
      });
    if (helperExpiredMemberError) {
      throw new Error(
        `No se pudo registrar al ayudante en el evento vencido: ${helperExpiredMemberError.message}`
      );
    }

    const { data: invitationA, error: invAError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: ctx.eventX.id,
        group_name: 'Familia Prueba A',
        phone: '+573000000001',
      })
      .select()
      .single();
    if (invAError || !invitationA) {
      throw new Error(
        `No se pudo crear la invitación A: ${invAError?.message ?? 'sin datos'}`
      );
    }
    ctx.invitationA = invitationA;

    const { data: invitationB, error: invBError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: ctx.eventX.id,
        group_name: 'Familia Prueba B',
        phone: '+573000000002',
      })
      .select()
      .single();
    if (invBError || !invitationB) {
      throw new Error(
        `No se pudo crear la invitación B: ${invBError?.message ?? 'sin datos'}`
      );
    }
    ctx.invitationB = invitationB;

    const { data: invitationY, error: invYError } = await ctx.adminClient
      .from('invitations')
      .insert({
        event_id: ctx.eventY.id,
        group_name: 'Familia Prueba Y',
        phone: '+573000000003',
      })
      .select()
      .single();
    if (invYError || !invitationY) {
      throw new Error(
        `No se pudo crear la invitación Y: ${invYError?.message ?? 'sin datos'}`
      );
    }
    ctx.invitationY = invitationY;

    const { data: invitationExpired, error: invExpError } =
      await ctx.adminClient
        .from('invitations')
        .insert({
          event_id: ctx.eventExpired.id,
          group_name: 'Familia Prueba Vencida',
          phone: '+573000000004',
        })
        .select()
        .single();
    if (invExpError || !invitationExpired) {
      throw new Error(
        `No se pudo crear la invitación del evento vencido: ${invExpError?.message ?? 'sin datos'}`
      );
    }
    ctx.invitationExpired = invitationExpired;

    const { data: invitationStarted, error: invStartedError } =
      await ctx.adminClient
        .from('invitations')
        .insert({
          event_id: ctx.eventStarted.id,
          group_name: 'Familia Prueba Iniciada',
          phone: '+573000000005',
        })
        .select()
        .single();
    if (invStartedError || !invitationStarted) {
      throw new Error(
        `No se pudo crear la invitación del evento iniciado: ${invStartedError?.message ?? 'sin datos'}`
      );
    }
    ctx.invitationStarted = invitationStarted;

    const { data: guestsA, error: guestsAError } = await ctx.adminClient
      .from('guests')
      .insert([
        {
          invitation_id: ctx.invitationA.id,
          full_name: 'Integrante A Uno',
          sort_order: 1,
        },
        {
          invitation_id: ctx.invitationA.id,
          full_name: 'Integrante A Dos',
          sort_order: 2,
        },
      ])
      .select();
    if (guestsAError || !guestsA || guestsA.length !== 2) {
      throw new Error(
        `No se pudieron crear las personas de la invitación A: ${guestsAError?.message ?? 'sin datos'}`
      );
    }
    ctx.guestsA = guestsA;

    const { data: guestB, error: guestBError } = await ctx.adminClient
      .from('guests')
      .insert({
        invitation_id: ctx.invitationB.id,
        full_name: 'Integrante B Uno',
        sort_order: 1,
      })
      .select()
      .single();
    if (guestBError || !guestB) {
      throw new Error(
        `No se pudo crear la persona de la invitación B: ${guestBError?.message ?? 'sin datos'}`
      );
    }
    ctx.guestB = guestB;

    const { data: guestY, error: guestYError } = await ctx.adminClient
      .from('guests')
      .insert({
        invitation_id: ctx.invitationY.id,
        full_name: 'Integrante Y Uno',
        sort_order: 1,
      })
      .select()
      .single();
    if (guestYError || !guestY) {
      throw new Error(
        `No se pudo crear la persona de la invitación Y: ${guestYError?.message ?? 'sin datos'}`
      );
    }
    ctx.guestY = guestY;

    const { data: guestExpired, error: guestExpError } = await ctx.adminClient
      .from('guests')
      .insert({
        invitation_id: ctx.invitationExpired.id,
        full_name: 'Integrante Vencido Uno',
        sort_order: 1,
      })
      .select()
      .single();
    if (guestExpError || !guestExpired) {
      throw new Error(
        `No se pudo crear la persona del evento vencido: ${guestExpError?.message ?? 'sin datos'}`
      );
    }
    ctx.guestExpired = guestExpired;

    const { data: guestStarted, error: guestStartedError } =
      await ctx.adminClient
        .from('guests')
        .insert({
          invitation_id: ctx.invitationStarted.id,
          full_name: 'Integrante Iniciado Uno',
          sort_order: 1,
        })
        .select()
        .single();
    if (guestStartedError || !guestStarted) {
      throw new Error(
        `No se pudo crear la persona del evento iniciado: ${guestStartedError?.message ?? 'sin datos'}`
      );
    }
    ctx.guestStarted = guestStarted;

    const { data: giftXUnique, error: giftXUniqueError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: 'Regalo Único Evento X',
        kind: 'unique',
        sort_order: 1,
      })
      .select()
      .single();
    if (giftXUniqueError || !giftXUnique) {
      throw new Error(
        `No se pudo crear el regalo único en X: ${giftXUniqueError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftXUnique = giftXUnique;

    const { data: giftXRepeatable, error: giftXRepeatableError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: 'Regalo Repetible Evento X',
          kind: 'repeatable',
          sort_order: 2,
        })
        .select()
        .single();
    if (giftXRepeatableError || !giftXRepeatable) {
      throw new Error(
        `No se pudo crear el regalo repetible en X: ${giftXRepeatableError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftXRepeatable = giftXRepeatable;

    const { data: giftXFree, error: giftXFreeError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventX.id,
        name: 'Regalo Libre Evento X',
        kind: 'free',
        sort_order: 3,
      })
      .select()
      .single();
    if (giftXFreeError || !giftXFree) {
      throw new Error(
        `No se pudo crear el regalo libre en X: ${giftXFreeError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftXFree = giftXFree;

    const { data: giftXReserved, error: giftXReservedError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventX.id,
          name: 'Regalo Reservado Evento X',
          kind: 'unique',
          sort_order: 4,
        })
        .select()
        .single();
    if (giftXReservedError || !giftXReserved) {
      throw new Error(
        `No se pudo crear el regalo reservado en X: ${giftXReservedError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftXReserved = giftXReserved;

    const { data: reservationXReserved, error: reservationXReservedError } =
      await ctx.adminClient
        .from('gift_reservations')
        .insert({
          gift_id: ctx.giftXReserved.id,
          invitation_id: ctx.invitationA.id,
        })
        .select()
        .single();
    if (reservationXReservedError || !reservationXReserved) {
      throw new Error(
        `No se pudo crear la reserva del regalo reservado en X: ${reservationXReservedError?.message ?? 'sin datos'}`
      );
    }
    ctx.reservationXReserved = reservationXReserved;

    const { data: giftYUnique, error: giftYUniqueError } = await ctx.adminClient
      .from('gifts')
      .insert({
        event_id: ctx.eventY.id,
        name: 'Regalo Único Evento Y',
        kind: 'unique',
        sort_order: 1,
      })
      .select()
      .single();
    if (giftYUniqueError || !giftYUnique) {
      throw new Error(
        `No se pudo crear el regalo único en Y: ${giftYUniqueError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftYUnique = giftYUnique;

    const { error: reserveYError } = await ctx.anonClient.rpc('reserve_gift', {
      p_code: ctx.invitationY.code,
      p_gift_id: ctx.giftYUnique.id,
    });
    if (reserveYError) {
      throw new Error(
        `No se pudo apartar el regalo del evento Y: ${reserveYError.message}`
      );
    }

    const { data: giftStartedUnique, error: giftStartedUniqueError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventStarted.id,
          name: 'Regalo Único Evento Iniciado',
          kind: 'unique',
          sort_order: 1,
        })
        .select()
        .single();
    if (giftStartedUniqueError || !giftStartedUnique) {
      throw new Error(
        `No se pudo crear el regalo único en el evento iniciado: ${giftStartedUniqueError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftStartedUnique = giftStartedUnique;

    const { data: giftStartedRepeatable, error: giftStartedRepeatableError } =
      await ctx.adminClient
        .from('gifts')
        .insert({
          event_id: ctx.eventStarted.id,
          name: 'Regalo Repetible Evento Iniciado',
          kind: 'repeatable',
          sort_order: 2,
        })
        .select()
        .single();
    if (giftStartedRepeatableError || !giftStartedRepeatable) {
      throw new Error(
        `No se pudo crear el regalo repetible en el evento iniciado: ${giftStartedRepeatableError?.message ?? 'sin datos'}`
      );
    }
    ctx.giftStartedRepeatable = giftStartedRepeatable;

    const {
      data: reservationStartedUnique,
      error: reservationStartedUniqueError,
    } = await ctx.adminClient
      .from('gift_reservations')
      .insert({
        gift_id: ctx.giftStartedUnique.id,
        invitation_id: ctx.invitationStarted.id,
      })
      .select()
      .single();
    if (reservationStartedUniqueError || !reservationStartedUnique) {
      throw new Error(
        `No se pudo crear la reserva en el evento iniciado: ${reservationStartedUniqueError?.message ?? 'sin datos'}`
      );
    }
    ctx.reservationStartedUnique = reservationStartedUnique;

    ctx.teamOwnerAUser = await createTestUser(
      ctx.adminClient,
      ctx,
      'equipo-owner-a'
    );
    ctx.teamOwnerBUser = await createTestUser(
      ctx.adminClient,
      ctx,
      'equipo-owner-b'
    );
    ctx.teamHelperUser = await createTestUser(
      ctx.adminClient,
      ctx,
      'equipo-helper'
    );
    ctx.outsideTeamUser = await createTestUser(
      ctx.adminClient,
      ctx,
      'fuera-equipo'
    );

    ctx.teamOwnerAClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.teamOwnerAUser.email,
      ctx.teamOwnerAUser.password
    );
    ctx.teamOwnerBClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.teamOwnerBUser.email,
      ctx.teamOwnerBUser.password
    );
    ctx.teamHelperClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.teamHelperUser.email,
      ctx.teamHelperUser.password
    );
    ctx.outsideTeamClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.outsideTeamUser.email,
      ctx.outsideTeamUser.password
    );

    const { data: team, error: teamError } = await ctx.adminClient
      .from('teams')
      .insert({
        name: `PRUEBA-${ctx.run}-EQUIPO`,
      })
      .select()
      .single();
    if (teamError || !team) {
      throw new Error(
        `No se pudo crear el equipo de prueba: ${teamError?.message ?? 'sin datos'}`
      );
    }
    ctx.team = team;

    const { error: teamMembersError } = await ctx.adminClient
      .from('team_members')
      .insert([
        {
          team_id: ctx.team.id,
          user_id: ctx.teamOwnerAUser.id,
          role: 'owner',
        },
        {
          team_id: ctx.team.id,
          user_id: ctx.teamOwnerBUser.id,
          role: 'owner',
        },
        {
          team_id: ctx.team.id,
          user_id: ctx.teamHelperUser.id,
          role: 'helper',
        },
      ]);
    if (teamMembersError) {
      throw new Error(
        `No se pudieron registrar los miembros del equipo de prueba: ${teamMembersError.message}`
      );
    }
  } catch (err) {
    await teardownTestContext(ctx);
    throw err;
  }
}

export async function teardownTestContext(ctx) {
  if (!ctx?.adminClient) {
    return;
  }

  try {
    await ctx.adminClient
      .from('events')
      .delete()
      .like('name', `PRUEBA-${ctx.run}-%`);
  } catch {
    // Se ignora si la conexión o el recurso ya no está disponible.
  }

  if (Array.isArray(ctx.createdEventIds) && ctx.createdEventIds.length > 0) {
    const idsToDelete = [...ctx.createdEventIds];
    ctx.createdEventIds.length = 0;
    try {
      await ctx.adminClient.from('events').delete().in('id', idsToDelete);
    } catch {
      // Se ignora si los eventos ya fueron eliminados.
    }
  }

  try {
    await ctx.adminClient
      .from('teams')
      .delete()
      .like('name', `PRUEBA-${ctx.run}-%`);
  } catch {
    // Se ignora si los equipos ya fueron eliminados.
  }

  if (Array.isArray(ctx.createdUserIds) && ctx.createdUserIds.length > 0) {
    const userIds = [...ctx.createdUserIds];
    ctx.createdUserIds.length = 0;
    for (const userId of userIds) {
      try {
        await ctx.adminClient.auth.admin.deleteUser(userId);
      } catch {
        // Se ignora si el usuario ya no existe.
      }
    }
  }
}
