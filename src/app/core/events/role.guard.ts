import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { CanActivateFn, Router } from '@angular/router';
import { filter, firstValueFrom, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { EventContextService } from './event-context.service';

export const roleGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const eventContext = inject(EventContextService);
  const router = inject(Router);

  if (!auth.ready()) {
    await firstValueFrom(
      toObservable(auth.ready).pipe(
        filter((ready) => ready),
        take(1),
      ),
    );
  }

  if (!auth.session()) {
    return router.createUrlTree(['/login']);
  }

  const eventId = route.paramMap.get('id');
  if (!eventId) {
    return router.createUrlTree(['/eventos']);
  }

  await eventContext.load(eventId);

  if (!eventContext.event() || !eventContext.role()) {
    return router.createUrlTree(['/eventos']);
  }

  if (eventContext.role() !== 'owner') {
    return router.createUrlTree(['/eventos', eventId, 'panel']);
  }

  return true;
};
