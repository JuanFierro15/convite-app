import { inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  ActivatedRouteSnapshot,
  CanActivateFn,
  Router,
  UrlTree,
} from '@angular/router';
import { filter, from, switchMap, take } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ArrivalStoreService } from './arrival-store.service';

async function evaluateArrivalsAccess(
  auth: AuthService,
  store: ArrivalStoreService,
  router: Router,
  eventId: string | null,
): Promise<boolean | UrlTree> {
  if (auth.session()) {
    return true;
  }

  if (eventId) {
    const lastUser = await auth.lastKnownUser();
    if (lastUser) {
      const { snapshot } = await store.read(eventId);
      if (snapshot && snapshot.userId === lastUser.id) {
        return true;
      }
    }
  }

  return router.createUrlTree(['/login']);
}

export const arrivalsGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const store = inject(ArrivalStoreService);
  const router = inject(Router);

  const eventId = route.paramMap.get('id');

  if (auth.ready()) {
    return evaluateArrivalsAccess(auth, store, router, eventId);
  }

  return toObservable(auth.ready).pipe(
    filter((ready) => ready),
    take(1),
    switchMap(() => from(evaluateArrivalsAccess(auth, store, router, eventId))),
  );
};
