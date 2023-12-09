import { Component, Input, OnInit, Output } from '@angular/core'
import {
  BusyService,
  WantsToCloseDialog,
  openDialog,
} from '../common-ui-elements'
import { EventEmitter } from 'events'

import { remult, repo } from 'remult'
import { Roles } from '../users/roles'

import { UIToolsService } from '../common/UIToolsService'
import { Task, eventDisplayDate } from '../events/tasks'
import { taskStatus } from '../events/taskStatus'
import {
  getCity,
  getGoogleMapLink,
  getLongLat,
  openWaze,
} from '../common/address-input/google-api-helpers'
import {
  ContactInfo,
  TaskContactInfo,
  sendWhatsappToPhone,
} from '../events/phone'
import { UpdateStatusComponent } from '../update-status/update-status.component'
import { User, matchesCurrentUserId } from '../users/user'
import { getImageUrl } from '../events/getImageUrl'
import { DialogConfig } from '../common-ui-elements/src/angular/DialogConfig'

@DialogConfig({ maxWidth: '95vw' })
@Component({
  selector: 'app-event-info',
  templateUrl: './event-info.component.html',
  styleUrls: ['./event-info.component.scss'],
})
export class EventInfoComponent implements OnInit, WantsToCloseDialog {
  constructor(public dialog: UIToolsService, private busy: BusyService) {}
  @Output() phoneChanged = new EventEmitter()
  @Input()
  e!: Task
  public refresh = () => {}
  driver?: User
  @Input() forExternalViewer = false

  @Input() context = ''
  displayDate() {
    return this.e.displayDate()
  }
  getImageUrl() {
    return getImageUrl(this.e.imageId)
  }

  showContactInfoMessage() {
    return (
      !this.e.phone1 &&
      !this.e.phone2 &&
      !this.e.toPhone1 &&
      !this.e.toPhone2 &&
      remult.authenticated()
    )
  }
  showMap = false

  args?: {
    closeScreenAfterAdd?: () => Promise<boolean>
  }

  menuOptions = Task.rowButtons(this.dialog, {
    taskAdded: (t) => this.refresh(),
    taskSaved: () => this.refresh(),
  })
  useFillerInfo() {
    return this.e.getSite().useFillerInfo
  }
  openSourceWaze() {
    openWaze(getLongLat(this.e.addressApiResult), this.e.address)
  }
  openTargetWaze() {
    openWaze(getLongLat(this.e.toAddressApiResult), this.e.toAddress)
  }

  openSourceGoogleMap() {
    window.open(getGoogleMapLink(this.e.addressApiResult), '_blank')
  }
  openTargetGoogleMap() {
    window.open(getGoogleMapLink(this.e.toAddressApiResult), '_blank')
  }
  sendWhatsapp(phone: string) {
    sendWhatsappToPhone(phone, '')
  }

  inProgress = false
  async registerToEvent() {
    if (this.inProgress) return
    this.inProgress = true
    try {
      await this.e.assignToMe()
      await this.e._.reload()
      if (await this.args?.closeScreenAfterAdd?.()) this.closeDialog?.()
    } catch (err: any) {
      this.dialog.error(err)
      this.e.taskStatus = taskStatus.assigned
    } finally {
      this.inProgress = false
    }
  }
  async problem() {
    await openDialog(
      UpdateStatusComponent,
      (x) =>
        (x.args = {
          showFailStatus: true,
          task: this.e,
          onSave: () => {
            this.closeDialog?.()
          },
        })
    )
  }
  async completed() {
    await openDialog(
      UpdateStatusComponent,
      (x) => (x.args = { showFailStatus: false, task: this.e })
    )
    await this.e._.reload()
  }
  showCancel() {
    return (
      this.e.taskStatus != taskStatus.active &&
      this.e.taskStatus != taskStatus.assigned &&
      this.e.taskStatus != taskStatus.driverPickedUp &&
      this.e.taskStatus != taskStatus.draft
    )
  }
  isAssigned() {
    return (
      this.e.taskStatus == taskStatus.assigned ||
      this.e.taskStatus == taskStatus.driverPickedUp
    )
  }

  showWillNotDo() {
    return (
      this.isAssigned() ||
      (this.e.getSite().showContactToAnyDriver &&
        this.e.taskStatus == taskStatus.active)
    )
  }

  async clickedByMistake() {
    await this.e.completedStatusClickedByMistake()
  }

  isAuthenticated() {
    return remult.authenticated()
  }
  isDispatcher() {
    return this.e.isDispatcher()
  }
  registered() {
    return matchesCurrentUserId(this.e.driverId, this.e.org)
  }
  showAssign() {
    return this.e.taskStatus == taskStatus.active
  }
  driverAssignButtonText() {
    return this.e.getSite().driverAssignButtonText
  }
  contactInfo: TaskContactInfo = {
    origin: [],
    target: [],
  }
  ngOnInit(): void {
    this.dialog.report('צפייה', this.context, this.e.id)
    if (!this.forExternalViewer)
      repo(Task)
        .findFirst({ id: this.e.id })
        .then((x) => {
          if (!x) {
            this.dialog.error(
              'הנסיעה כנראה כבר נלקחה על ידי נהג אחר',
              this.e.id
            )
            this.e.taskStatus = taskStatus.assigned
            this.closeDialog?.()
          }
        })
    if (this.e.driverId && this.isDispatcher())
      this.e._.relations.driver.findOne().then((x) => (this.driver = x))
  }

  edit() {
    this.e.openEditDialog(this.dialog, () => this.refresh())
  }
  getCity() {
    return getCity(this.e.addressApiResult!)
  }
  closeDialog!: VoidFunction

  showPickedUp() {
    return this.e.taskStatus === taskStatus.assigned
  }
  showCancelPickedUp() {
    return this.e.taskStatus === taskStatus.driverPickedUp
  }
  showThumbsUpOnPickup() {
    return [taskStatus.driverPickedUp, taskStatus.completed].includes(
      this.e.taskStatus
    )
  }
  async pickedUp() {
    await this.e.driverPickedUp()
  }
  async cancelPickedUp() {
    await this.e.pickedUpStatusClickedByMistake()
  }
}
//[ ] - התקן המכשיר
