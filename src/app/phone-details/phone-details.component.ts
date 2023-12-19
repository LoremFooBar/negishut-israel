import { Component, Input } from '@angular/core'
import { formatPhone, sendWhatsappToPhone } from '../events/phone'
import { remult } from 'remult'
import { getTitle } from '../users/sites'

@Component({
  selector: 'app-phone-details',
  templateUrl: './phone-details.component.html',
  styleUrls: ['./phone-details.component.scss'],
})
export class PhoneDetailsComponent  {
  constructor() {}
  @Input()
  args!: {
    phone?: string
    name?: string
    title?: string
    closeDialog?: VoidFunction
    messageContext?: string
  }
  sendWhatsapp() {
    sendWhatsappToPhone(
      this.args.phone!,
      `שלום ${this.args.name}
זה ${remult.user?.name} מ${getTitle()}
${this.args.messageContext ? 'בקשר ל' + this.args.messageContext : ''}
`
    )
  }
  displayPhone() {
    return formatPhone(this.args.phone!)
  }
  getTitle() {
    if (this.args.title && this.args.name)
      return this.args.title + ': ' + this.args.name
    else if (this.args.title) return this.args.title
    return this.args.name
  }

  getWhatsappTitle() {return `שליחת הודעה בווטסאפ אל ${getTitle()}`}
}
