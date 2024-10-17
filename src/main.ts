import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { Routes, provideRouter } from '@angular/router';

const routes: Routes = [
  { path: '', component: AppComponent },
  { path: '**', redirectTo: '' }
];

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes)
  ]
}).catch(err => console.error(err));
