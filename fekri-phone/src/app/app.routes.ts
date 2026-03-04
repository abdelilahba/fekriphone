import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent),
    canActivate: [loginGuard]
  },
  {
    path: '',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'produits',
    loadComponent: () => import('./pages/produits/produits.component').then(m => m.ProduitsComponent),
    canActivate: [authGuard]
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
    canActivate: [authGuard]
  },
  {
    path: 'credits',
    loadComponent: () => import('./pages/credits/credits.component').then(m => m.CreditsComponent),
    canActivate: [authGuard]
  },
  {
    path: 'categories',
    loadComponent: () => import('./pages/categories/categories.component').then(m => m.CategoriesComponent),
    canActivate: [authGuard]
  },
  {
    path: 'pieces',
    loadComponent: () => import('./pages/pieces/pieces.component').then(m => m.PiecesComponent),
    canActivate: [authGuard]
  },
  {
    path: 'rapport',
    loadComponent: () => import('./pages/rapport/rapport.component').then(m => m.RapportComponent),
    canActivate: [authGuard]
  },
  {
    path: 'pertes',
    loadComponent: () => import('./pages/pertes/pertes.component').then(m => m.PertesComponent),
    canActivate: [authGuard]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
