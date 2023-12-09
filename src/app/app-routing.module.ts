import { AuthenticatedGuard, CommonUIElementsModule } from 'common-ui-elements'
import { NgModule, ErrorHandler } from '@angular/core'
import { Routes, RouterModule } from '@angular/router'
import { UsersComponent } from './users/users.component'
import {
  AdminGuard,
  CanSeeUsersGuard,
  DispatchGuard,
  DraftsGuard,
  SuperAdminGuard,
} from './users/AdminGuard'
import { ShowDialogOnErrorErrorHandler } from './common/UIToolsService'
import { terms } from './terms'
import { OrgEventsComponent } from './events/org-events.component'
import { NoamTestComponent } from './noam-test/noam-test.component'
import { DraftOverviewComponent } from './draft-overview/draft-overview.component'
import { IntakeComponent } from './intake/intake.component'
import { UpdatesComponent } from './updates/updates.component'
import { VerifyRelevanceComponent } from './verify-relevance/verify-relevance.component'
import { ProblemComponent } from './problem/problem.component'
import { OverviewComponent } from './overview/overview.component'
import { AboutComponent } from './about/about.component'
import { ShowPublicEventComponent } from './show-public-event/show-public-event.component'
import { TaskSelfUpdateComponent } from './task-self-update/task-self-update.component'

const defaultRoute = 'נסיעות'
const routes: Routes = [
  {
    path: defaultRoute,
    component: OrgEventsComponent,
    data: { name: 'נסיעות', hide: true },
  },
  {
    path: 't/:id',
    component: OrgEventsComponent,
    data: { name: 'נסיעות' },
  },

  {
    path: 'p/:id',
    component: ShowPublicEventComponent,
    data: { hide: true, noLogin: true },
  },
  {
    path: 's/:id',
    component: TaskSelfUpdateComponent,
    data: { hide: true, noLogin: true },
  },
  {
    path: 'מבט על',
    component: OverviewComponent,
    canActivate: [AdminGuard],
  },
  {
    path: 'טיוטות',
    component: DraftOverviewComponent,
    canActivate: [DraftsGuard],
    data: { hide: true },
  },
  {
    path: 'בעיות',
    component: ProblemComponent,
    canActivate: [DispatchGuard],
    data: { hide: true },
  },
  {
    path: 'בבדיקה',
    component: VerifyRelevanceComponent,
    canActivate: [DispatchGuard],
    data: { hide: true },
  },
  {
    path: 'עדכונים',
    component: UpdatesComponent,
    canActivate: [DispatchGuard],
    data: { hide: true },
  },
  {
    path: terms.userAccounts,
    component: UsersComponent,
    canActivate: [CanSeeUsersGuard],
  },
  {
    path: 'intake',
    component: IntakeComponent,
    data: { hide: true, name: 'הוספת נסיעה', noLogin: true },
  },
  { path: 'noam-test/:1', component: NoamTestComponent },
  { path: 'אודות', component: AboutComponent, data: { noLogin: true } },
  { path: '**', redirectTo: '/' + defaultRoute, pathMatch: 'full' },
]

@NgModule({
  imports: [RouterModule.forRoot(routes), CommonUIElementsModule],
  providers: [
    AdminGuard,
    DraftsGuard,
    DispatchGuard,
    SuperAdminGuard,
    { provide: ErrorHandler, useClass: ShowDialogOnErrorErrorHandler },
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
