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
  MINIMAL_JPEG_BUFFER,
  removeTestPhotoFiles,
  teardownTestContext,
  uploadTestPhoto,
} from './helpers.mjs';

const TEST_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const ctx = {
  ...createEmptyContext(),
  ownerUser: null,
  ownerClient: null,
  helper1User: null,
  helper1Client: null,
  helper2User: null,
  helper2Client: null,
  otherUser: null,
  otherClient: null,
  eventMain: null,
  eventOther: null,
};

before(
  async () => {
    const { url, publishableKey, secretKey } = getEnvConfig();
    ctx.adminClient = createAdminClient(url, secretKey);
    ctx.anonClient = createAnonClient(url, publishableKey);

    ctx.ownerUser = await createTestUser(ctx.adminClient, ctx, 'prop-galeria');
    ctx.helper1User = await createTestUser(ctx.adminClient, ctx, 'ayud1-galeria');
    ctx.helper2User = await createTestUser(ctx.adminClient, ctx, 'ayud2-galeria');
    ctx.otherUser = await createTestUser(ctx.adminClient, ctx, 'otro-galeria');

    ctx.ownerClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.ownerUser.email,
      ctx.ownerUser.password
    );
    ctx.helper1Client = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.helper1User.email,
      ctx.helper1User.password
    );
    ctx.helper2Client = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.helper2User.email,
      ctx.helper2User.password
    );
    ctx.otherClient = await createAuthenticatedClient(
      url,
      publishableKey,
      ctx.otherUser.email,
      ctx.otherUser.password
    );

    const now = Date.now();
    const in30Days = new Date(now + 30 * DAY_MS).toISOString();
    const in20Days = new Date(now + 20 * DAY_MS).toISOString();

    const { data: eventMain, error: eventMainError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-GALERIA-MAIN`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerUser.id,
      })
      .select()
      .single();

    if (eventMainError || !eventMain) {
      throw new Error(
        `No se pudo crear el evento principal: ${eventMainError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventMain = eventMain;
    ctx.createdEventIds.push(eventMain.id);

    const { error: h1Error } = await ctx.adminClient
      .from('event_members')
      .insert({
        event_id: eventMain.id,
        user_id: ctx.helper1User.id,
        role: 'helper',
      });
    if (h1Error) {
      throw new Error(`No se pudo asociar el ayudante 1: ${h1Error.message}`);
    }

    const { error: h2Error } = await ctx.adminClient
      .from('event_members')
      .insert({
        event_id: eventMain.id,
        user_id: ctx.helper2User.id,
        role: 'helper',
      });
    if (h2Error) {
      throw new Error(`No se pudo asociar el ayudante 2: ${h2Error.message}`);
    }

    const { data: eventOther, error: eventOtherError } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-GALERIA-OTRO`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.otherUser.id,
      })
      .select()
      .single();

    if (eventOtherError || !eventOther) {
      throw new Error(
        `No se pudo crear el evento ajeno: ${eventOtherError?.message ?? 'sin datos'}`
      );
    }
    ctx.eventOther = eventOther;
    ctx.createdEventIds.push(eventOther.id);
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
  '1. Un ayudante no borra la fila ni los archivos de una foto del propietario ni de otro ayudante',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const ownerPhotoId = crypto.randomUUID();
    const ownerPhoto = await uploadTestPhoto(
      ctx.ownerClient,
      ctx.eventMain.id,
      ownerPhotoId
    );

    const helper2PhotoId = crypto.randomUUID();
    const helper2Photo = await uploadTestPhoto(
      ctx.helper2Client,
      ctx.eventMain.id,
      helper2PhotoId
    );

    // Ayudante 1 intenta borrar la fila del propietario
    const { data: delOwnerRow } = await ctx.helper1Client
      .from('event_photos')
      .delete()
      .eq('id', ownerPhoto.id)
      .select();
    assert.equal(
      delOwnerRow?.length ?? 0,
      0,
      'El delete de la foto del propietario no debio borrar ninguna fila'
    );

    // Releer con cliente admin para comprobar que la fila sigue existiendo
    const { data: checkOwnerRow } = await ctx.adminClient
      .from('event_photos')
      .select('id')
      .eq('id', ownerPhoto.id)
      .single();
    assert.equal(
      checkOwnerRow?.id,
      ownerPhoto.id,
      'La fila de la foto del propietario debe seguir existiendo'
    );

    // Ayudante 1 intenta borrar archivos de Storage de la foto del propietario
    await ctx.helper1Client.storage
      .from('event-photos')
      .remove([
        `${ctx.eventMain.id}/${ownerPhoto.id}.jpg`,
        `${ctx.eventMain.id}/${ownerPhoto.id}_thumb.jpg`,
      ]);

    // Comprobar con admin que los archivos siguen en Storage
    const { data: filesOwnerCheck } = await ctx.adminClient.storage
      .from('event-photos')
      .list(ctx.eventMain.id);
    const namesOwnerCheck = (filesOwnerCheck ?? []).map((f) => f.name);
    assert.ok(
      namesOwnerCheck.includes(`${ownerPhoto.id}.jpg`),
      'El archivo principal del propietario debe seguir en Storage'
    );
    assert.ok(
      namesOwnerCheck.includes(`${ownerPhoto.id}_thumb.jpg`),
      'La miniatura del propietario debe seguir en Storage'
    );

    // Ayudante 1 intenta borrar la fila del ayudante 2
    const { data: delH2Row } = await ctx.helper1Client
      .from('event_photos')
      .delete()
      .eq('id', helper2Photo.id)
      .select();
    assert.equal(
      delH2Row?.length ?? 0,
      0,
      'El delete de la foto de otro ayudante no debio borrar ninguna fila'
    );

    // Releer con cliente admin
    const { data: checkH2Row } = await ctx.adminClient
      .from('event_photos')
      .select('id')
      .eq('id', helper2Photo.id)
      .single();
    assert.equal(
      checkH2Row?.id,
      helper2Photo.id,
      'La fila de la foto de otro ayudante debe seguir existiendo'
    );

    // Ayudante 1 intenta borrar archivos de Storage de la foto del ayudante 2
    await ctx.helper1Client.storage
      .from('event-photos')
      .remove([
        `${ctx.eventMain.id}/${helper2Photo.id}.jpg`,
        `${ctx.eventMain.id}/${helper2Photo.id}_thumb.jpg`,
      ]);

    // Comprobar con admin
    const { data: filesH2Check } = await ctx.adminClient.storage
      .from('event-photos')
      .list(ctx.eventMain.id);
    const namesH2Check = (filesH2Check ?? []).map((f) => f.name);
    assert.ok(
      namesH2Check.includes(`${helper2Photo.id}.jpg`),
      'El archivo principal de otro ayudante debe seguir en Storage'
    );
    assert.ok(
      namesH2Check.includes(`${helper2Photo.id}_thumb.jpg`),
      'La miniatura de otro ayudante debe seguir en Storage'
    );
  }
);

test(
  '2. El propietario borra la fila y los archivos de una foto de un ayudante',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.helper1Client,
      ctx.eventMain.id,
      photoId
    );

    // Propietario borra la fila
    const { error: delError } = await ctx.ownerClient
      .from('event_photos')
      .delete()
      .eq('id', photo.id);
    assert.equal(delError, null, 'El propietario debe poder borrar la fila');

    // Verificar con admin que la fila ya no existe
    const { data: checkRow } = await ctx.adminClient
      .from('event_photos')
      .select('id')
      .eq('id', photo.id)
      .maybeSingle();
    assert.equal(checkRow, null, 'La fila debe haber sido eliminada');

    // Propietario borra los archivos
    const { error: remError } = await ctx.ownerClient.storage
      .from('event-photos')
      .remove([
        `${ctx.eventMain.id}/${photo.id}.jpg`,
        `${ctx.eventMain.id}/${photo.id}_thumb.jpg`,
      ]);
    assert.equal(
      remError,
      null,
      'El propietario debe poder borrar los archivos'
    );

    // Verificar con admin que los archivos ya no estan en Storage
    const { data: adminFiles } = await ctx.adminClient.storage
      .from('event-photos')
      .list(ctx.eventMain.id);
    const names = (adminFiles ?? []).map((f) => f.name);
    assert.ok(
      !names.includes(`${photo.id}.jpg`),
      'El archivo principal debe haber sido eliminado de Storage'
    );
    assert.ok(
      !names.includes(`${photo.id}_thumb.jpg`),
      'La miniatura debe haber sido eliminada de Storage'
    );
  }
);

test(
  '3. Un ayudante borra su propia foto (fila y archivos)',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.helper1Client,
      ctx.eventMain.id,
      photoId
    );

    // Ayudante 1 borra su propia fila
    const { error: delError } = await ctx.helper1Client
      .from('event_photos')
      .delete()
      .eq('id', photo.id);
    assert.equal(
      delError,
      null,
      'El ayudante debe poder borrar su propia fila'
    );

    // Verificar con admin que la fila ya no existe
    const { data: checkRow } = await ctx.adminClient
      .from('event_photos')
      .select('id')
      .eq('id', photo.id)
      .maybeSingle();
    assert.equal(checkRow, null, 'La fila debe haber sido eliminada');

    // Ayudante 1 borra sus propios archivos
    const { error: remError } = await ctx.helper1Client.storage
      .from('event-photos')
      .remove([
        `${ctx.eventMain.id}/${photo.id}.jpg`,
        `${ctx.eventMain.id}/${photo.id}_thumb.jpg`,
      ]);
    assert.equal(
      remError,
      null,
      'El ayudante debe poder borrar sus propios archivos'
    );

    // Verificar con admin que los archivos ya no estan en Storage
    const { data: adminFiles } = await ctx.adminClient.storage
      .from('event-photos')
      .list(ctx.eventMain.id);
    const names = (adminFiles ?? []).map((f) => f.name);
    assert.ok(
      !names.includes(`${photo.id}.jpg`),
      'El archivo principal debe haber sido eliminado de Storage'
    );
    assert.ok(
      !names.includes(`${photo.id}_thumb.jpg`),
      'La miniatura debe haber sido eliminada de Storage'
    );
  }
);

test(
  '4. Anon no lee la tabla, no baja el archivo con download y getPublicUrl no responde 200',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.ownerClient,
      ctx.eventMain.id,
      photoId
    );

    // Anon no lee la tabla (0 filas o error 42501)
    const { data: anonRows, error: anonError } = await ctx.anonClient
      .from('event_photos')
      .select('*')
      .eq('id', photo.id);
    if (anonError) {
      assert.equal(
        anonError.code,
        '42501',
        `Se esperaba codigo 42501 al consultar sin sesion, pero se recibio: ${anonError.code}`
      );
    } else {
      assert.equal(
        anonRows?.length ?? 0,
        0,
        'Anon no debe recibir ninguna fila'
      );
    }

    // Anon no baja el archivo con download
    const { error: dlError } = await ctx.anonClient.storage
      .from('event-photos')
      .download(`${ctx.eventMain.id}/${photo.id}.jpg`);
    assert.ok(
      dlError,
      'Anon no debe poder descargar el archivo con storage.download'
    );

    // fetch a getPublicUrl no responde 200
    const { data: pubUrlData } = ctx.anonClient.storage
      .from('event-photos')
      .getPublicUrl(`${ctx.eventMain.id}/${photo.id}.jpg`);
    assert.ok(pubUrlData?.publicUrl, 'getPublicUrl debe devolver una URL');
    const res = await fetch(pubUrlData.publicUrl);
    assert.notEqual(
      res.status,
      200,
      `getPublicUrl no debe responder 200 para un bucket privado (respondio ${res.status})`
    );
  }
);

test(
  '5. El miembro de otro evento no lee filas, no baja archivos, no sube archivos al evento y no borra',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.ownerClient,
      ctx.eventMain.id,
      photoId
    );

    // No lee filas
    const { data: otherRows } = await ctx.otherClient
      .from('event_photos')
      .select('*')
      .eq('event_id', ctx.eventMain.id);
    assert.equal(
      otherRows?.length ?? 0,
      0,
      'Miembro de otro evento no debe leer filas del evento'
    );

    // No baja archivos
    const { error: dlError } = await ctx.otherClient.storage
      .from('event-photos')
      .download(`${ctx.eventMain.id}/${photo.id}.jpg`);
    assert.ok(
      dlError,
      'Miembro de otro evento no debe descargar archivos del evento'
    );

    // No sube un archivo a la carpeta del evento
    const newPhotoId = crypto.randomUUID();
    const { error: upError } = await ctx.otherClient.storage
      .from('event-photos')
      .upload(`${ctx.eventMain.id}/${newPhotoId}.jpg`, MINIMAL_JPEG_BUFFER, {
        contentType: 'image/jpeg',
      });
    assert.ok(
      upError,
      'Miembro de otro evento no debe poder subir archivos a la carpeta del evento'
    );

    // No borra fila
    const { data: delData } = await ctx.otherClient
      .from('event_photos')
      .delete()
      .eq('id', photo.id)
      .select();
    assert.equal(
      delData?.length ?? 0,
      0,
      'Miembro de otro evento no debe poder borrar la fila'
    );

    // No borra archivos
    await ctx.otherClient.storage
      .from('event-photos')
      .remove([`${ctx.eventMain.id}/${photo.id}.jpg`]);

    const { data: adminFiles } = await ctx.adminClient.storage
      .from('event-photos')
      .list(ctx.eventMain.id);
    const names = (adminFiles ?? []).map((f) => f.name);
    assert.ok(
      names.includes(`${photo.id}.jpg`),
      'El archivo no debe haber sido borrado por el miembro de otro evento'
    );
  }
);

test(
  '6. Insertar una fila con uploaded_by de otro usuario falla con codigo 42501',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const { error } = await ctx.helper1Client
      .from('event_photos')
      .insert({
        id: photoId,
        event_id: ctx.eventMain.id,
        uploaded_by: ctx.ownerUser.id,
        width: 10,
        height: 10,
        size_bytes: 100,
        thumb_size_bytes: 100,
      });

    assert.ok(
      error,
      'Se esperaba un error al insertar uploaded_by de otro usuario'
    );
    assert.equal(
      error.code,
      '42501',
      `Se esperaba codigo 42501, pero se recibio: ${error.code}`
    );
  }
);

test(
  '7. La foto 301: admin siembra 300 filas y la insercion de la 301 falla con photo_limit_reached',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const now = Date.now();
    const in30Days = new Date(now + 30 * DAY_MS).toISOString();
    const in20Days = new Date(now + 20 * DAY_MS).toISOString();

    const { data: event300, error: evErr } = await ctx.adminClient
      .from('events')
      .insert({
        name: `PRUEBA-${ctx.run}-FOTOS-LIMITE`,
        starts_at: in30Days,
        rsvp_deadline: in20Days,
        created_by: ctx.ownerUser.id,
      })
      .select()
      .single();

    if (evErr || !event300) {
      throw new Error(
        `No se pudo crear el evento para prueba de limite: ${evErr?.message ?? 'sin datos'}`
      );
    }
    ctx.createdEventIds.push(event300.id);

    // Cliente admin siembra 300 filas en una sola insercion
    const rows300 = [];
    for (let i = 0; i < 300; i++) {
      rows300.push({
        id: crypto.randomUUID(),
        event_id: event300.id,
        uploaded_by: ctx.ownerUser.id,
        width: 10,
        height: 10,
        size_bytes: 100,
        thumb_size_bytes: 100,
      });
    }

    const { error: seedErr } = await ctx.adminClient
      .from('event_photos')
      .insert(rows300);
    assert.equal(
      seedErr,
      null,
      `Admin debe poder sembrar 300 filas sin archivos: ${seedErr?.message}`
    );

    // Miembro sube los dos archivos de la foto 301
    const photo301Id = crypto.randomUUID();
    const photoPath = `${event300.id}/${photo301Id}.jpg`;
    const thumbPath = `${event300.id}/${photo301Id}_thumb.jpg`;

    const { error: thumbErr } = await ctx.ownerClient.storage
      .from('event-photos')
      .upload(thumbPath, MINIMAL_JPEG_BUFFER, { contentType: 'image/jpeg' });
    assert.equal(
      thumbErr,
      null,
      'El miembro debe poder subir la miniatura de la foto 301'
    );

    const { error: photoErr } = await ctx.ownerClient.storage
      .from('event-photos')
      .upload(photoPath, MINIMAL_JPEG_BUFFER, { contentType: 'image/jpeg' });
    assert.equal(
      photoErr,
      null,
      'El miembro debe poder subir la foto 301'
    );

    // Insertar la fila de la 301 falla con photo_limit_reached
    const { error: insert301Err } = await ctx.ownerClient
      .from('event_photos')
      .insert({
        id: photo301Id,
        event_id: event300.id,
        width: 10,
        height: 10,
        size_bytes: MINIMAL_JPEG_BUFFER.length,
        thumb_size_bytes: MINIMAL_JPEG_BUFFER.length,
      });

    assert.ok(insert301Err, 'Se esperaba un error al insertar la foto 301');
    assert.ok(
      insert301Err.message.includes('photo_limit_reached'),
      `Se esperaba el mensaje 'photo_limit_reached', pero se recibio: ${insert301Err.message}`
    );
  }
);

test(
  '8. event_id no cambia: update como propietario falla con 42501 y con admin falla con event_id_immutable',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.ownerClient,
      ctx.eventMain.id,
      photoId
    );

    // Update como propietario falla con 42501 (sin permiso de update)
    const { error: ownerUpErr } = await ctx.ownerClient
      .from('event_photos')
      .update({ event_id: ctx.eventOther.id })
      .eq('id', photo.id);
    assert.ok(
      ownerUpErr,
      'Se esperaba error al hacer update de event_id como propietario'
    );
    assert.equal(
      ownerUpErr.code,
      '42501',
      `Se esperaba codigo 42501, pero se recibio: ${ownerUpErr.code}`
    );

    // Update con cliente admin falla con event_id_immutable
    const { error: adminUpErr } = await ctx.adminClient
      .from('event_photos')
      .update({ event_id: ctx.eventOther.id })
      .eq('id', photo.id);
    assert.ok(
      adminUpErr,
      'Se esperaba error al cambiar event_id con cliente admin'
    );
    assert.ok(
      adminUpErr.message.includes('event_id_immutable'),
      `Se esperaba el mensaje 'event_id_immutable', pero se recibio: ${adminUpErr.message}`
    );
  }
);

test(
  '9. Una fila sin archivos (un miembro inserta sin subir) falla con photo_files_missing',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const { error } = await ctx.ownerClient
      .from('event_photos')
      .insert({
        id: photoId,
        event_id: ctx.eventMain.id,
        width: 10,
        height: 10,
        size_bytes: 100,
        thumb_size_bytes: 100,
      });

    assert.ok(
      error,
      'Se esperaba un error al insertar fila sin haber subido archivos'
    );
    assert.ok(
      error.message.includes('photo_files_missing'),
      `Se esperaba el mensaje 'photo_files_missing', pero se recibio: ${error.message}`
    );
  }
);

test(
  '10. Un ayudante no puede reemplazar el archivo de otra foto (upsert y sin upsert fallan; tamano sigue igual)',
  { timeout: TEST_TIMEOUT_MS },
  async () => {
    const photoId = crypto.randomUUID();
    const photo = await uploadTestPhoto(
      ctx.ownerClient,
      ctx.eventMain.id,
      photoId
    );

    const replacementBuffer = Buffer.concat([
      MINIMAL_JPEG_BUFFER,
      Buffer.alloc(50),
    ]);

    // upload con upsert: true a la ruta existente falla
    const { error: upsertErr } = await ctx.helper1Client.storage
      .from('event-photos')
      .upload(`${ctx.eventMain.id}/${photo.id}.jpg`, replacementBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
    assert.ok(upsertErr, 'upload con upsert: true debe fallar');

    // upload sin upsert a la ruta existente falla
    const { error: noUpsertErr } = await ctx.helper1Client.storage
      .from('event-photos')
      .upload(`${ctx.eventMain.id}/${photo.id}.jpg`, replacementBuffer, {
        contentType: 'image/jpeg',
        upsert: false,
      });
    assert.ok(noUpsertErr, 'upload sin upsert debe fallar');

    // Comprobar con admin que el archivo sigue igual comparando su tamano
    const { data: dlFile, error: dlErr } = await ctx.adminClient.storage
      .from('event-photos')
      .download(`${ctx.eventMain.id}/${photo.id}.jpg`);
    assert.equal(dlErr, null, 'Admin debe poder descargar el archivo');
    const dlBuf = Buffer.from(await dlFile.arrayBuffer());
    assert.equal(
      dlBuf.length,
      MINIMAL_JPEG_BUFFER.length,
      'El tamano del archivo debe permanecer inalterado'
    );
  }
);
