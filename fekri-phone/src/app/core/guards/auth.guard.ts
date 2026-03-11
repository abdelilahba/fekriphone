import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take, switchMap } from 'rxjs/operators';
import { combineLatest, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoading$.pipe(
    filter(loading => !loading),
    take(1),
    map(() => {
      if (auth.isAuthenticated) {
        return true;
      }
      router.navigate(['/login']);
      return false;
    })
  );
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.isLoading$, auth.userRole$]).pipe(
    filter(([loading, _]) => !loading),
    take(1),
    map(([_, role]) => {
      if (role === 'admin') {
        return true;
      }
      router.navigate(['/ventes']);
      return false;
    })
  );
};

export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return combineLatest([auth.isLoading$, auth.userRole$]).pipe(
    filter(([loading, _]) => !loading),
    take(1),
    map(([_, role]) => {
      if (!auth.isAuthenticated) {
        return true;
      }
      if (role === 'employee') {
        router.navigate(['/ventes']);
      } else {
        router.navigate(['/']);
      }
      return false;
    })
  );
};
