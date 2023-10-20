import { APP_INITIALIZER, NgModule, NgZone } from '@angular/core'
import { BrowserModule } from '@angular/platform-browser'
import { AppRoutingModule } from './app-routing.module'
import { AppComponent } from './app.component'
import { FormsModule } from '@angular/forms'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatListModule } from '@angular/material/list'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatCardModule } from '@angular/material/card'
import { MatDialogModule } from '@angular/material/dialog'
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatInputModule } from '@angular/material/input'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { CommonUIElementsModule } from 'common-ui-elements'
import { UsersComponent } from './users/users.component'
import { HomeComponent } from './home/home.component'
import { YesNoQuestionComponent } from './common/yes-no-question/yes-no-question.component'
import { DataAreaDialogComponent } from './common/data-area-dialog/data-area-dialog.component'
import { UIToolsService } from './common/UIToolsService'
import { AdminGuard } from './users/AdminGuard'
import { remult } from 'remult'
import { SignInController } from './users/SignInController'
import { TextAreaDataControlComponent } from './common/textarea-data-control/textarea-data-control.component'
import { DotsMenuComponent } from './common/dot-menu.component'
import { AddressInputComponent } from './common/address-input/address-input.component'
import { CardInMiddleComponent } from './card-in-middle/card-in-middle.component'
import { OrgEventsComponent } from './events/org-events.component'
import { EventCardComponent } from './event-card/event-card.component'
import { EventInfoComponent } from './event-info/event-info.component'
import { MatRadioModule } from '@angular/material/radio'
import { MatTabsModule } from '@angular/material/tabs'
import {
  TransitionGroupComponent,
  TransitionGroupItemDirective,
} from './event-card/transition-group'
import { UpdateStatusComponent } from './update-status/update-status.component'
import { NoamTestComponent } from './noam-test/noam-test.component'
import { DraftOverviewComponent } from './draft-overview/draft-overview.component'
import { LocationErrorComponent } from './location-error/location-error.component'
import { UserDetailsComponent } from './user-details/user-details.component'
import { SelectUserComponent } from './users/select-user.component'
import { PhoneDetailsComponent } from './phone-details/phone-details.component'
import { IntakeComponent } from './intake/intake.component'
import { InputImageComponent } from './common/input-image/input-image.component'

@NgModule({
  declarations: [
    AppComponent,
    UsersComponent,
    HomeComponent,
    YesNoQuestionComponent,
    DataAreaDialogComponent,
    TextAreaDataControlComponent,
    AddressInputComponent,
    DotsMenuComponent,
    CardInMiddleComponent,
    OrgEventsComponent,
    EventCardComponent,
    EventInfoComponent,
    TransitionGroupItemDirective,
    TransitionGroupComponent,
    UpdateStatusComponent,
    NoamTestComponent,
    DraftOverviewComponent,
    LocationErrorComponent,
    SelectUserComponent,
    UserDetailsComponent,
    PhoneDetailsComponent,
    IntakeComponent,
    InputImageComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    MatSidenavModule,
    MatListModule,
    MatToolbarModule,
    MatCheckboxModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    CommonUIElementsModule,
    MatRadioModule,
    MatTabsModule,
  ],
  providers: [
    UIToolsService,
    AdminGuard,
    { provide: APP_INITIALIZER, useFactory: initApp, multi: true },
  ],
  bootstrap: [AppComponent],
})
export class AppModule {
  constructor(zone: NgZone) {
    remult.apiClient.wrapMessageHandling = (handler) =>
      zone.run(() => handler())
  }
}

export function initApp() {
  const loadCurrentUserBeforeAppStarts = async () => {
    remult.user = await SignInController.currentUser()
  }
  return loadCurrentUserBeforeAppStarts
}
