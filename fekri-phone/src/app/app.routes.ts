import { Routes } from '@angular/router';
import { authGuard, loginGuard, adminGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard]
  },
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'produits',
    loadComponent: () => import('./pages/produits/produits.component').then(m => m.ProduitsComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'commandes',
    loadComponent: () => import('./pages/commandes/commandes').then(m => m.Commandes),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'ventes',
    loadComponent: () => import('./pages/ventes/ventes.component').then(m => m.VentesComponent),
    canActivate: [authGuard]
  },
  {
    path: 'reparations',
    loadComponent: () => import('./pages/reparations/reparations.component').then(m => m.ReparationsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'depenses',
    loadComponent: () => import('./pages/depenses/depenses.component').then(m => m.DepensesComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'credits',
    loadComponent: () => import('./pages/credits/credits.component').then(m => m.CreditsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'categories',
    loadComponent: () => import('./pages/categories/categories.component').then(m => m.CategoriesComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'pieces',
    loadComponent: () => import('./pages/pieces/pieces.component').then(m => m.PiecesComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'rapport',
    loadComponent: () => import('./pages/rapport/rapport.component').then(m => m.RapportComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'suivi',
    loadComponent: () => import('./pages/suivi/suivi.component').then(m => m.SuiviComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: 'pertes',
    loadComponent: () => import('./pages/pertes/pertes.component').then(m => m.PertesComponent),
    canActivate: [authGuard, adminGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
