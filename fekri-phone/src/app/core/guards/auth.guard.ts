import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take } from 'rxjs/operators';

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

export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.isLoading$.pipe(
    filter(loading => !loading),
    take(1),
    map(() => {
      if (!auth.isAuthenticated) {
        return true;
      }
      router.navigate(['/']);
      return false;
    })
  );
};
