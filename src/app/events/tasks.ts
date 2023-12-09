import copy from 'copy-to-clipboard'
import {
  Allow,
  Allowed,
  AllowedForInstance,
  BackendMethod,
  Entity,
  EntityFilter,
  Field,
  FieldOptions,
  FieldRef,
  Fields,
  IdEntity,
  Relations,
  SqlDatabase,
  Validators,
  ValueConverters,
  remult,
  repo,
} from 'remult'
import {
  DataControl,
  GridSettings,
  RowButton,
} from '../common-ui-elements/interfaces'

import moment from 'moment'
import { UITools } from '../common/UITools'
import {
  GeocodeResult,
  GetDistanceBetween,
  getCity,
  getLocation,
  updateGeocodeResult,
} from '../common/address-input/google-api-helpers'
import { Roles } from '../users/roles'
import { getSite, getSiteByOrg, getTitle, lev1j } from '../users/sites'
import { OrgEntity } from '../users/OrgEntity'
import {
  User,
  getCurrentSiteUserId,
  getCurrentUserId,
  matchesCurrentUserId,
} from '../users/user'
import { createId } from '@paralleldrive/cuid2'
import { TaskImage } from './TaskImage'
import { TaskStatusChanges } from './TaskStatusChanges'
import { CreatedAtField, DateField, formatDate } from './date-utils'
import { Locks } from './locks'
import {
  PhoneField,
  TaskContactInfo,
  formatPhone,
  phoneConfig,
  sendWhatsappToPhone,
} from './phone'
import { taskStatus } from './taskStatus'
import { Urgency } from './urgency'
import { updateChannel } from './UpdatesChannel'
import { sendSms } from '../../server/send-sms'
import { _DisposeViewRepeaterStrategy } from '@angular/cdk/collections'
import { update } from '../../server/getGraphQL'
import {
  ACTIVE_DELIVERY,
  DELIVERY_DONE,
  NO_PACK_READY_FOR_DELIVERY,
  PACKED_READY_FOR_DELIVERY,
  updateDriverOnMonday,
  updateStatusOnMonday,
} from '../../server/monday-work'
import { BlockedPhone } from './blockedPhone'
import { recordChanges } from '../common/change-log/change-log'
import { updateShadagBasedOnTask } from '../../server/shadag-work'
import { updateLev1Monday } from '../../server/monday-lev1j'
import whatsappApi from '../../server/whatsapp-api'

const onlyDriverRules: FieldOptions<Task, string> = {
  includeInApi: (t) => {
    if (remult.user) {
      if (t?.eventBelongToOrgUser([Roles.trainee, Roles.dispatcher]))
        return true
      if (
        t!.createUserId === remult.user?.id &&
        remult.isAllowed(Roles.trainee)
      )
        return true
      if (t?.getSite().showContactToAnyDriver) return true
      if (matchesCurrentUserId(t!.driverId, t!.org)) return true
    }
    if (remult.context.availableTaskIds?.includes(t?.id!)) return true
    if (t?.publicVisible) return true
    if (t!.isNew()) return true
    return false
  },
  allowApiUpdate: (t) => {
    if (remult.user) {
      if (t?.eventBelongToOrgUser([Roles.trainee, Roles.dispatcher]))
        return true
      if (
        t!.createUserId === remult.user?.id &&
        remult.isAllowed(Roles.trainee)
      )
        return true
    }
    if (t!.isNew()) return true
    return false
  },
}

@Entity<Task>('tasks', {
  allowApiInsert: true,
  allowApiUpdate: (t) => {
    if (t!.taskStatus === taskStatus.draft)
      return Boolean(t?.eventBelongToOrgUser([Roles.trainee, Roles.dispatcher]))
    return Boolean(t?.eventBelongToOrgUser(Roles.dispatcher))
  },
  allowApiRead: Allow.authenticated,
  allowApiDelete: false,
  saving: async (task) => {
    if (!remult.user && task.isNew()) {
      const user = await Task.intakeUserId()
      if (!user) {
        throw new Error('לא ניתן להוסיף בקשות חדשות')
      }
      remult.user = {
        id: user,
        orgs: [{ org: getSite().org, userId: user }],
        showAllOrgs: false,
      }
      task.createUserId = user
    }
    if (task.isNew()) remult.context.availableTaskIds.push(task.id!)
    if (
      !remult.isAllowed(Roles.dispatcher) &&
      task.isNew() &&
      !task.getSite().allDeliveryRequestsAreApprovedAutomatically
    )
      task.taskStatus = taskStatus.draft
    if (task.$.taskStatus.valueChanged()) task.statusChangeDate = new Date()
    if (task.isNew() && !task.externalId)
      task.externalId = (
        await SqlDatabase.getDb().execute("select nextval('task_seq')")
      ).rows[0].nextval
    if (
      task.$.eventDate.valueChanged() ||
      task.$.startTime.valueChanged() ||
      task.$.relevantHours.valueChanged()
    ) {
      task.validUntil = calcValidUntil(
        task.eventDate,
        task.startTime,
        task.relevantHours
      )
    }
    if (task.imageId?.includes('data:image/')) {
      task.imageId = (await repo(TaskImage).insert({ image: task.imageId })).id
    }
    for (const f of [task.$.createUserId, task.$.driverId]) {
      if (f.value === null) f.value = f.originalValue
    }
    for (const f of [task.$.addressApiResult, task.$.toAddressApiResult]) {
      if (f.value && !f.value.district) await updateGeocodeResult(f.value)
      task.distance = parseFloat(
        GetDistanceBetween(
          getLocation(task.addressApiResult),
          getLocation(task.toAddressApiResult)
        ).toFixed(1)
      )
    }
    await recordChanges(task, {
      excludeColumns: (e) => [e.imageId, e.statusChangeDate],
    })
  },
  saved: async (task, { isNew }) => {
    if (isNew) {
      await task.insertStatusChange('יצירה', task.createUserId)
      if (task.taskStatus === taskStatus.draft && getSite().sendSmsOnNewDraft) {
        for (const user of await repo(User).find({
          where: { dispatcher: true, org: getSite().org },
        })) {
          await sendSms(
            user.phone,
            'נוספה בקשה: ' +
              task.getShortDescription() +
              '\n\n' +
              remult.context.origin +
              '/טיוטות'
          )
        }
      }
    }
    if (task.getSite().syncWithMonday && task.externalId.startsWith('m:')) {
      if (task.getSite() === lev1j) {
        await updateLev1Monday(task)
      } else {
        if (task.$.taskStatus.valueChanged()) {
          switch (task.taskStatus) {
            case taskStatus.active:
            case taskStatus.assigned:
              updateStatusOnMonday(
                task,
                task.returnMondayStatus === NO_PACK_READY_FOR_DELIVERY
                  ? task.returnMondayStatus
                  : PACKED_READY_FOR_DELIVERY
              )
              break
            case taskStatus.driverPickedUp:
              updateStatusOnMonday(task, ACTIVE_DELIVERY)
              break
            case taskStatus.completed:
              updateStatusOnMonday(task, DELIVERY_DONE)
              break
          }
        }
        if (task.$.driverId.valueChanged()) {
          if (task.driverId) {
            await updateDriverOnMonday(task)
          }
        }
      }
    }
    if (task.getSite().syncWithShadag && task.externalId.startsWith('s:')) {
      if (task.$.driverId.valueChanged() || task.$.taskStatus.valueChanged()) {
        await updateShadagBasedOnTask(task)
      }
    }
    if (
      task.getSite().sendTextMessageOnApprove &&
      task.taskStatus == taskStatus.active &&
      (task.$.taskStatus.valueChanged() || isNew)
    ) {
      let phone = task.getTextMessagePhone()
      if (
        phone?.phone &&
        (await repo(TaskStatusChanges).count({
          what: SMS_CONFIRM_MESSAGE,
          taskId: task.id,
        })) == 0
      )
        await task.insertStatusChange(
          SMS_CONFIRM_MESSAGE,
          JSON.stringify({
            phone: phone.phone,
            message: await sendSms(
              phone.phone,
              `שלום ${phone.name},

קיבלנו את פנייתך ${task.getShortDescription()}.

ברגע שמתנדב או מתנדבת שלנו יהיו זמינים לסייע לך, הם ייצרו איתך קשר בשיחת טלפון - נא זמינותך.
במידה והסתדרת בכל דרך אחרת, נודה לעדכון בקישור הבא, בכדי שנוכל לייעל את השירות שלנו עבור פונים נוספים. לעדכון/הסרה יש להיכנס לקישור
${remult.context.origin + '/s/' + task.editLink}
שנדע ימים טובים יותר!
תודה, ${getTitle()}`
            ),
          })
        )
    }
  },
  validation: (task) => {
    if (phoneConfig.disableValidation || task.__disableValidation) return
    if (
      !task.addressApiResult?.results &&
      !task.getSite().onlyAskForSecondAddress
    )
      task.$.address.error = 'כתובת לא נמצאה'
    if (!task.toAddressApiResult?.results)
      task.$.toAddress.error = 'כתובת לא נמצאה'
  },
  backendPrefilter: () => {
    if (remult.context.disableOrgFiltering) return {}
    let orgs = remult.user?.orgs

    if (!orgs?.[0]) return getSite().tasksFilter()
    return {
      $or: orgs!.map(({ org }) => getSiteByOrg(org).tasksFilter()),
    }
  },
  //@ts-ignore
  apiPrefilter: () => {
    if (remult.isAllowed(Roles.dispatcher)) return {}
    if (remult.isAllowed(Roles.trainee))
      return {
        $or: [
          {
            taskStatus: taskStatus.draft,
            createUser: remult.user!.id,
          },
          Task.filterActiveTasks(),
        ],
      }

    // {
    //   $or: [
    //     { draft: true, createUser: remult.user!.id },
    //     Task.filterActiveTasks,
    //   ],
    // }
    return Task.filterActiveTasks()
  },
})
export class Task extends OrgEntity {
  __disableValidation = false
  sendWhatsappInvite() {
    sendWhatsappToPhone(
      this.driver?.phone!,
      `שלום ${this.driver?.name || ''}, קיבלת נסיעה חדשה מ "${getTitle()}"
${this.getShortDescription()}
${this.getLink()}`
    )
  }
  eventBelongToOrgUser(allowed?: Allowed) {
    const user = remult.user
    if (!user) return false
    const userOrg = user.orgs.find(
      (x) => x.org == this.org && user.id == x.userId
    )
    const rolesAllowed = allowed === undefined || remult.isAllowed(allowed)
    return userOrg?.userId == user.id && rolesAllowed
  }
  isDispatcher() {
    return this.eventBelongToOrgUser(Roles.dispatcher)
  }
  getSite() {
    return getSiteByOrg(this.org)
  }

  getShortDescription(): string {
    let message = ''
    if (this.category) message = this.category + ': '
    if (this.title) message += this.title + ' '
    if (this.addressApiResult?.results?.length)
      message += 'מ' + getCity(this.addressApiResult!)
    if (this.toAddressApiResult?.results?.length)
      message += ' ל' + getCity(this.toAddressApiResult)
    return message + ` (${this.externalId})`
  }

  getMessageForDriver() {
    return `שלום ${this.driver?.name || ''} ,מופיע באפליקציה שלקחת את הנסיעה:
${this.getShortDescription()} של ארגון "${getTitle()}"
והיא טרם הושלמה

נשמח אם תעדכן אותנו מה הסטטוס שלה, בקישור הבא או בהודעה חוזרת

${this.getLink()}
`
  }
  displayDate() {
    const e = this
    let result = eventDisplayDate(e)
    if (e.startTime) {
      let time = e.startTime
      if (time.startsWith('0')) time = time.substring(1)
      result += ' ' + time
    }
    if (this.getSite().showValidUntil) {
      result += ' - ' + formatDate(e.validUntil).split(' ').reverse().join(' ')
    }

    return 'רלוונטי מ: ' + result
  }
  static filterActiveTasks(): EntityFilter<Task> {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return {
      taskStatus: { $ne: taskStatus.draft },
      $or: [
        {
          taskStatus: taskStatus.active,
        },
        {
          driverId: remult.user?.orgs.map((x) => x.userId),
          taskStatus: [taskStatus.assigned, taskStatus.driverPickedUp],
        },
        {
          driverId: remult.user?.orgs.map((x) => x.userId),
          statusChangeDate: { $gte: d },
        },
      ],
    }
  }

  @Fields.string<Task>({
    caption: 'מה משנעים *',
    validate: (s, c) => {
      if (s.__disableValidation) return
      Validators.required(s, c)
    },
  })
  title = ''
  @DataControl({ width: '120' })
  @Field(() => taskStatus, { allowApiUpdate: false })
  taskStatus: taskStatus = taskStatus.active
  @DataControl({ width: '120' })
  @DateField({
    allowApiUpdate: false,
    caption: 'סטטוס עדכון אחרון',
    displayValue: (_, d) => formatDate(d),
  })
  statusChangeDate = new Date()
  @Fields.string({
    caption: 'פרטים נוספים',
    customInput: (x) => x.textarea(),
  })
  description = ''
  @DataControl<Task>({ visible: (t) => t.getSite().canSeeUrgency() })
  @Field(() => Urgency)
  urgency = Urgency.normal
  @DataControl({
    valueList: () => getSite().categories.map((x) => ({ id: x, caption: x })),
  })
  @Fields.string({ caption: 'קטגוריה' })
  category: string = getSite().defaultCategory
  @Fields.dateOnly<Task>({
    caption: 'תאריך הסיוע המבוקש',
    displayValue: (e, v) => eventDisplayDate(e),
    validate: (s, c) => {
      if (s.__disableValidation) return
      if (!c.value || c.value.getFullYear() < 2018) c.error = 'תאריך שגוי'
      var twoDaysAgo = new Date()
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
      if ((s.isNew() || c.valueChanged()) && c.value < twoDaysAgo)
        c.error = 'תאריך עבר'
    },
  })
  eventDate: Date = new Date()
  @Fields.string({ inputType: 'time', caption: 'רלוונטי החל משעה' })
  @DataControl({ width: '110' })
  startTime = new Date().toLocaleTimeString('he-il', {
    hour: '2-digit',
    minute: '2-digit',
  })

  @Fields.integer({
    caption: 'למשך כמה שעות הסיוע רלוונטי',
    validate: (_, c) => {
      if (_.isNew() || c.valueChanged()) {
        if (getSite().requireValidUntil && !c.value) {
          throw Error('ערך חסר')
        }
        if (getSite().requireValidUntil && +c.value > 72) {
          throw Error('ערך גדול מדי, נא להזין עד 72 שעות')
        }
      }
    },
  })
  relevantHours = getSite().requireValidUntil ? 0 : 12
  @DataControl({ width: '240' })
  @DateField({ caption: 'בתוקף עד', allowApiUpdate: false })
  validUntil = new Date()

  @Fields.json<GeocodeResult>()
  addressApiResult: GeocodeResult | null = null
  @Fields.string({
    caption: 'מיקום מוצא *',
    customInput: (c) =>
      c.inputAddress(
        (result, event: Task) =>
          (event.addressApiResult = result.autoCompleteResult)
      ),
  })
  address = ''

  @Fields.json<GeocodeResult>()
  toAddressApiResult: GeocodeResult | null = null
  @Fields.string({
    caption: 'מיקום יעד *',
    customInput: (c) =>
      c.inputAddress(
        (result, event: Task) =>
          (event.toAddressApiResult = result.autoCompleteResult)
      ),
  })
  toAddress = ''
  @Fields.number()
  distance = 0

  @PhoneField<Task>({
    caption: 'טלפון ממלא הבקשה *',
    ...onlyDriverRules,
    validate: (entity, ref) => {
      if (entity.__disableValidation) return

      if (
        (entity.isNew() || ref.valueChanged()) &&
        entity.getSite().useFillerInfo &&
        !remult.isAllowed(Roles.dispatcher)
      )
        Validators.required(entity, ref)
    },
  })
  requesterPhone1 = !remult.isAllowed(Roles.dispatcher)
    ? remult.user?.phone
    : ''
  @Fields.string({
    caption: 'שם ממלא הבקשה',
    ...onlyDriverRules,
    validate: requiredOnChange(
      () =>
        getSite().requireContactName &&
        getSite().useFillerInfo &&
        !remult.isAllowed(Roles.dispatcher)
    ),
  })
  requesterPhone1Description = !remult.isAllowed(Roles.dispatcher)
    ? remult.user?.name
    : ''

  @PhoneField<Task>({
    caption: 'טלפון מוצא *',
    ...onlyDriverRules,
    validate: requiredOnChange(() => true),
  })
  phone1 = ''
  @Fields.string({
    caption: 'איש קשר מוצא',
    validate: requiredOnChange(() => getSite().requireContactName),

    ...onlyDriverRules,
  })
  phone1Description = ''
  @DataControl({ visible: () => getSite().showTwoContacts })
  @PhoneField<Task>({
    caption: 'טלפון מוצא 2',
    ...onlyDriverRules,
  })
  phone2 = ''
  @DataControl({ visible: () => getSite().showTwoContacts })
  @Fields.string({
    caption: 'איש קשר מוצא 2',
    ...onlyDriverRules,
  })
  phone2Description = ''
  @PhoneField({
    caption: 'טלפון ליעד',
    validate: (entity, ref) => {
      if (entity.__disableValidation) return

      if (
        (entity.isNew() || ref.valueChanged()) &&
        (getSite().onlyAskForSecondAddress || getSite().requireContactName)
      )
        Validators.required(entity, ref)
    },
    ...onlyDriverRules,
  })
  toPhone1 = ''
  @Fields.string({
    caption: 'איש קשר ליעד',
    validate: requiredOnChange(() => getSite().requireContactName),
    ...onlyDriverRules,
  })
  tpPhone1Description = ''
  @DataControl({ visible: () => getSite().showTwoContacts })
  @PhoneField({
    caption: 'טלפון ליעד 2',
    ...onlyDriverRules,
  })
  toPhone2 = ''
  @DataControl({ visible: () => getSite().showTwoContacts })
  @Fields.string({
    caption: 'איש קשר ליעד 2',
    ...onlyDriverRules,
  })
  tpPhone2Description = ''

  @Fields.string({
    caption: 'מידע שיוצג רק לנהג המבצע ולמוקד',
    ...onlyDriverRules,
    customInput: (x) => x.textarea(),
  })
  privateDriverNotes = ''

  @CreatedAtField()
  createdAt = new Date()
  @Fields.string<Task>({
    includeInApi: Roles.dispatcher,
    allowApiUpdate: false,
    caption: 'משתמש מוסיף',
    displayValue: (u) => u.createUser?.name || '',
  })
  createUserId = getCurrentSiteUserId()
  @Relations.toOne<Task, User>(() => User, 'createUserId')
  createUser?: User

  @Fields.string({
    allowApiUpdate: false,
    caption: 'נהג',
    displayValue: (u) => u.driver?.name || '',
  })
  driverId = ''
  @Relations.toOne<Task, User>(() => User, 'driverId')
  driver?: User
  @Fields.string({ allowApiUpdate: false })
  statusNotes = ''

  @DataControl<Task>({ visible: (t) => !t.isNew(), width: '70' })
  @Fields.string({ caption: 'מזהה ', allowApiUpdate: false })
  externalId = ''
  @DataControl<Task>({
    visible: (t) => t.eventBelongToOrgUser([Roles.trainee, Roles.dispatcher]),
  })
  @Fields.string({
    caption: 'הערה פנימית לחמ"ל',
    customInput: (x) => x.textarea(),
    includeInApi: Roles.trainee,
  })
  internalComments = ''

  @Fields.string<Task>({
    caption: 'תמונה',
    customInput: (c) => c.image(),
    validate: (_, f) => {
      if (_.__disableValidation) return
      if (getSite().imageIsMandatory && (_.isNew() || f.valueChanged()))
        Validators.required(_, f, 'אנא העלה תמונה')
    },
  })
  imageId = ''

  @Fields.integer<Task>({ includeInApi: false })
  returnMondayStatus = -1

  @Fields.string({ includeInApi: Roles.dispatcher })
  editLink = createId()
  @Fields.boolean({ allowApiUpdate: false, dbName: 'publicVisibleBoolean' })
  publicVisible = false
  @BackendMethod({ allowed: true })
  static async makePublicVisible(id: string) {
    if (!remult.context.availableTaskIds.includes(id))
      throw Error('לא ניתן לבצע זאת למשימה זו')
    if (!getSite().allowShareLink) throw Error('לא ניתן לבצע זאת')
    const t = await repo(Task).findId(id)
    t.publicVisible = true
    await t.save()
    await t.insertStatusChange('הפך לחשוף ציבורית')
  }
  @BackendMethod({ allowed: true })
  static async getPublicTaskInfo(id: string) {
    if (!getSite().allowShareLink) throw Error('פעולה לא מורשת')
    const r = await repo(Task).findFirst({ id, publicVisible: true })
    if (!r) throw Error('לא נמצאה משימה זו')
    await r.insertStatusChange('צפייה ציבורית')
    return r._.toApiJson()
  }

  @BackendMethod({ allowed: true })
  static async getTaskSelfUpdateInfo(id: string) {
    const r = await repo(Task).findFirst({
      editLink: id,
      taskStatus: taskStatus.active,
    })
    if (!r) throw Error('לא נמצאה משימה זו')
    await r.insertStatusChange('צפייה למטרת עדכון על ידי מבקש')
    return r._.toApiJson()
  }

  @BackendMethod({ allowed: true })
  static async intakeUserId() {
    if (remult.user) return getCurrentSiteUserId()
    const user = await repo(User).findFirst({
      phone: '0500000000',
      deleted: false,
    })
    return user?.id
  }
  getTextMessagePhone() {
    if (getSite().useFillerInfo && this.requesterPhone1)
      return {
        phone: this.requesterPhone1,
        name: this.requesterPhone1Description,
      }
    return { phone: this.phone1, name: this.phone1Description }
  }
  @BackendMethod({ allowed: true })
  static async SelfUpdateStatus(editLink: string, status: number) {
    const r = await repo(Task).findFirst({
      editLink,
      taskStatus: taskStatus.active,
    })
    if (!r) throw Error('לא נמצאה משימה זו')

    switch (status) {
      case 1:
        await r.insertStatusChange('עדיין רלוונטי', 'עודכן על ידי מבקש')
        r.statusChangeDate = new Date()
        break
      case 21:
        r.taskStatus = taskStatus.notRelevant
        r.statusNotes = 'עודכן על ידי מבקש'
        await r.insertStatusChange(r.taskStatus.caption, 'עודכן על ידי מבקש')
        await r.save()
        break
      case 22:
        try {
          await r.insertStatusChange('לא לשלוח יותר SMS', 'עודכן על ידי מבקש')
          await repo(BlockedPhone).insert({
            phone: r.getTextMessagePhone().phone,
          })
        } catch (err) {
          console.log(err)
        }
        break
    }
    return 'תודה על העדכון'
  }

  @BackendMethod({ allowed: Roles.admin })
  static async markTasksForRelevanceCheck(ids: string[]) {
    let i = 0
    for (const task of await repo(Task).find({
      where: { id: ids, taskStatus: taskStatus.active },
    })) {
      task.__disableValidation = true
      await task.markForRelevanceCheck()
      i++
    }
    return i
  }

  @BackendMethod({ allowed: Allow.authenticated })
  async assignToMe(userId?: string) {
    let assignUserId = getCurrentUserId(this.org)!
    const assignedChangeType = 'שוייך לנהג'
    if (userId) {
      if ((await repo(User).count({ id: userId })) == 0)
        throw Error('משתמש לא קיים')
      if (
        matchesCurrentUserId(userId, this.org) &&
        !this.eventBelongToOrgUser(Roles.dispatcher)
      )
        throw Error('אינך רשאי לשייך לנהג אחר')
      assignUserId = userId
    } else {
      if (
        (await repo(Task).count({
          driverId: assignUserId,
          taskStatus: [taskStatus.assigned, taskStatus.driverPickedUp],
        })) >= getSite().maxActiveTripsPerDriver
      )
        throw Error(
          `ניתן להרשם במקביל לעד ${getSite().maxActiveTripsPerDriver} נסיעות`
        )

      if (
        (await repo(TaskStatusChanges).count({
          driverId: assignUserId,
          what: assignedChangeType,
          createdAt: {
            $gt: new Date(new Date().getTime() - 1000 * 60 * 60),
          },
        })) >= 20
      ) {
        throw Error('ניתן להרשם לעד 20 נסיעות בשעה')
      }
    }
    await this._.reload()
    if (this.driverId) throw Error('מתנדב אחר כבר לקח משימה זו')
    if (!assignUserId) throw Error('משהו לא הסתדר בשיוך, מזהה נהג ריק')
    this.driverId = assignUserId
    this.taskStatus = taskStatus.assigned
    this.statusNotes = ''
    await this.insertStatusChange(assignedChangeType)
    await this.save()
    await whatsappApi.sendStatusUpdate('עמית', this.taskStatus.caption, '+972545884312')
    return this.getContactInfo()
  }
  async insertStatusChange(what: string, notes?: string) {
    updateChannel(this.org).publish({
      status: this.taskStatus.id,
      message: what + ' - ' + this.getShortDescription(),
      userId: getCurrentUserId(this.org)!,
      action: what,
    })
    return await repo(TaskStatusChanges).insert({
      org: this.org,
      taskId: this.id,
      what,
      eventStatus: this.taskStatus,
      notes,
      driverId: this.driverId,
    })
  }
  @Fields.string({
    valueConverter: {
      toDb: (x) => (x == null ? '' : x),
    },
  })
  responsibleDispatcherId = ''
  @Relations.toOne<Task, User>(() => User, 'responsibleDispatcherId')
  responsibleDispatcher?: User

  @BackendMethod({ allowed: Allow.authenticated })
  async cancelAssignment(notes: string) {
    this.checkAssignedToDriverOrDispatcher()
    let hadDriverId = Boolean(this.driverId)
    this.driverId = ''
    this.taskStatus = taskStatus.active
    this.statusNotes = notes
    await this.insertStatusChange(
      hadDriverId ? DriverCanceledAssign : 'נהג בחר לא לבצע',
      notes
    )
    await this.save()
  }
  private checkAssignedToDriverOrDispatcher() {
    const s = this.getSite()
    if (!this.driverId && s.showContactToAnyDriver) return
    if (
      !matchesCurrentUserId(this.driverId, this.org) &&
      !this.eventBelongToOrgUser(Roles.dispatcher)
    )
      throw new Error('נסיעה זו לא משוייכת לך')
  }

  @BackendMethod({ allowed: Allow.authenticated })
  async noLongerRelevant(notes: string) {
    if (!notes) throw Error('אנא הזן הערות, שנדע מה קרה')
    this.checkAssignedToDriverOrDispatcher()
    this.taskStatus = taskStatus.notRelevant
    this.statusNotes = notes
    await this.insertStatusChange(this.taskStatus.caption, notes)
    await this.save()
  }
  @BackendMethod({ allowed: Roles.dispatcher })
  async returnToDriver() {
    if (!this.driverId) throw Error('לא נמצא נהג')
    this.taskStatus = taskStatus.assigned
    await this.insertStatusChange('מוקדן החזיר לנהג', 'על ידי מוקדן')
    await this.save()
  }
  @BackendMethod({ allowed: Roles.dispatcher })
  async returnToActive() {
    this.driverId = ''
    let action = 'מוקדן החזיר לפעיל'
    if (this.taskStatus == taskStatus.draft) action = 'טיוטה אושרה'
    this.taskStatus = taskStatus.active
    await this.insertStatusChange(action, 'על ידי מוקדן')
    await this.save()
  }
  @BackendMethod({ allowed: Roles.dispatcher })
  async markAsDraft() {
    this.driverId = ''
    this.taskStatus = taskStatus.draft
    await this.insertStatusChange('סמן כטיוטא', 'על ידי מוקדן')
    await this.save()
  }
  @BackendMethod({ allowed: Roles.dispatcher })
  async markForRelevanceCheck() {
    this.taskStatus = taskStatus.relevanceCheck
    await this.insertStatusChange(this.taskStatus.caption)
    await this.save()
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async otherProblem(notes: string) {
    if (!notes) throw Error('אנא הזן הערות, שנדע מה קרה')
    this.checkAssignedToDriverOrDispatcher()
    this.taskStatus = taskStatus.otherProblem
    this.statusNotes = notes
    await this.insertStatusChange(this.taskStatus.caption, notes)
    await this.save()
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async completed(notes: string) {
    this.checkAssignedToDriverOrDispatcher()
    this.taskStatus = taskStatus.completed
    this.statusNotes = notes
    await this.insertStatusChange(this.taskStatus.caption, notes)
    await this.save()
    if (matchesCurrentUserId(this.driverId, this.org))
      return await repo(Task)
        .find({
          where: {
            driverId: this.driverId,
            taskStatus: taskStatus.completed,
          },
        })
        .then((x) =>
          x.reduce(
            (sum, t) => {
              sum.rides++
              sum.km += t.distance
              return sum
            },
            { rides: 0, km: 0 }
          )
        )
    return undefined
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async completedStatusClickedByMistake() {
    this.checkAssignedToDriverOrDispatcher()
    if (
      (await repo(TaskStatusChanges).count({
        taskId: this.id,
        eventStatus: taskStatus.driverPickedUp,
      })) > 0
    )
      this.taskStatus = taskStatus.driverPickedUp
    else this.taskStatus = taskStatus.assigned
    this.statusNotes = ''
    await this.insertStatusChange('עדכון סטטוס נלחץ בטעות')
    await this.save()
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async driverPickedUp() {
    this.checkAssignedToDriverOrDispatcher()
    this.taskStatus = taskStatus.driverPickedUp
    await this.insertStatusChange(this.taskStatus.caption)
    await this.save()
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async pickedUpStatusClickedByMistake() {
    this.checkAssignedToDriverOrDispatcher()
    this.taskStatus = taskStatus.assigned
    await this.insertStatusChange('נאסף בהצלחה נלחץ בטעות')
    await this.save()
  }
  @BackendMethod({ allowed: Allow.authenticated })
  async getContactInfo(): Promise<TaskContactInfo> {
    if (Roles.dispatcher || matchesCurrentUserId(this.driverId, this.org))
      return {
        origin: [
          {
            phone: this.phone1,
            formattedPhone: formatPhone(this.phone1),
            name: this.phone1Description,
          },
          {
            phone: this.phone2,
            formattedPhone: formatPhone(this.phone2),
            name: this.phone2Description,
          },
        ],

        target: [
          {
            phone: this.toPhone1,
            formattedPhone: formatPhone(this.toPhone1),
            name: this.tpPhone1Description,
          },
          {
            phone: this.toPhone2,
            formattedPhone: formatPhone(this.toPhone2),
            name: this.tpPhone2Description,
          },
        ],
      }
    return {
      origin: [],
      target: [],
    }
  }

  async openEditDialog(ui: UITools, saved?: VoidFunction) {
    const doLocks = !this.isNew()
    if (doLocks)
      try {
        await Locks.lock(this.id, false)
      } catch (err: any) {
        if (remult.isAllowed(Roles.admin)) {
          if (await ui.yesNoQuestion(err.message + ', לפתוח בכל זאת?')) {
            await Locks.lock(this.id, true)
          } else return
        } else {
          ui.error(err.message)
          return
        }
      }

    const e = this.$
    ui.areaDialog({
      title: 'פרטי נסיעה',
      fields: [
        [e.category!, e.urgency],
        e.title,
        e.address,
        e.toAddress,
        e.description,
        e.privateDriverNotes,
        [e.eventDate, e.startTime, e.relevantHours],
        ...(getSite().useFillerInfo
          ? [[e.requesterPhone1, e.requesterPhone1Description]]
          : []),
        [e.phone1, e.phone1Description],
        [e.phone2, e.phone2Description],
        [e.toPhone1, e.tpPhone1Description],
        [e.toPhone2, e.tpPhone2Description],

        e.imageId,
        e.internalComments,
        e.externalId,
      ],
      ok: () =>
        this.save().then(() => {
          saved?.()
          if (doLocks) Locks.unlock(this.id)
        }),
      cancel: () => {
        this._.undoChanges()
        if (doLocks) Locks.unlock(this.id)
      },
      buttons: [],
    })
  }
  verifyRelevanceMessage(name: string, replyToText: boolean) {
    const site = getSiteByOrg(this.org)
    const parts = remult.context.origin.split('/')
    parts[parts.length - 1] = site?.urlPrefix!
    const url = parts.join('/')
    let description = this.getShortDescription()
    let twoDaysAgo = new Date()
    twoDaysAgo.setHours(0, 0, 0)
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 1)
    if (this.eventDate < twoDaysAgo) {
      description += ' מ' + eventDisplayDate(this)
    }

    return `שלום ${name}, בהמשך לפנייתך ל"${site?.title}":
${description}

על מנת שנוכל לעזור ולסייע ואזרחים נוספים בצורה יעילה יותר, נשמח שתעדכן בקישור הבא ${
      replyToText ? 'או בהודעה חוזרת ' : ''
    }אם הבקשה עדיין רלוונטית או הסתדרת כבר

${url + '/s/' + this.editLink}

תודה ${site?.title}`
  }

  static rowButtons(
    ui: UITools,
    args?: {
      taskAdded?: (t: Task) => void
      taskSaved?: (t: Task) => void
    }
  ): RowButton<Task>[] {
    return [
      {
        name: 'ערוך נסיעה',
        icon: 'edit',
        click: async (e) => {
          e.openEditDialog(ui, () => args?.taskSaved?.(e))
        },
      },
      {
        name: 'העתק הודעה לווטסאפ',
        icon: 'content_copy',
        visible: (x) => x.taskStatus === taskStatus.active,
        click: (e) => {
          e.copyWhatsappMessage(ui)
        },
      },
      {
        name: 'שלח ווטסאפ לנהג',
        icon: 'sms',
        visible: (x) =>
          [taskStatus.driverPickedUp, taskStatus.assigned].includes(
            x.taskStatus
          ),
        click: async (e) => {
          if (!e.driver) {
            e.driver = await e._.relations.driver.findOne()
          }

          sendWhatsappToPhone(e.driver?.phone!, e.getMessageForDriver())
        },
      },
      {
        name: 'ווטסאפ למבקש הנסיעה',
        icon: 'sms',
        visible: (x) => Boolean(x.requesterPhone1) && getSite().useFillerInfo,
        click: async (e) => {
          if (!e.editLink) {
            e.editLink = createId()
            e.save()
          }
          const m = e.verifyRelevanceMessage(
            e.requesterPhone1Description!,
            true
          )

          sendWhatsappToPhone(e.requesterPhone1!, m)
        },
      },
      {
        name: 'ווטסאפ לאיש קשר לאיסוף',
        icon: 'sms',
        visible: (x) => Boolean(x.phone1) && x.phone1 != x.requesterPhone1,
        click: async (e) => {
          if (!e.editLink) {
            e.editLink = createId()
            e.save()
          }
          const m = e.verifyRelevanceMessage(e.phone1Description, true)

          sendWhatsappToPhone(e.phone1, m)
        },
      },

      {
        name: 'בחר נהג',
        icon: 'directions_car',
        visible: (x) => x.taskStatus === taskStatus.active,
        click: async (e) => {
          ui.selectUser({
            onSelect: async (user) => {
              await e.assignToMe(user.id)
              if (await ui.yesNoQuestion('שלח הודעת ווטסאפ לנהג?')) {
                e.sendWhatsappInvite()
              }
            },
          })
        },
      },

      {
        name: 'היסטוריה',
        icon: 'history_edu',
        click: async (e) => {
          ui.gridDialog({
            settings: new GridSettings(repo(TaskStatusChanges), {
              where: {
                taskId: e.id,
              },
              include: {
                createUser: true,
                driver: true,
              },
              rowButtons: [
                {
                  name: 'פרטי מבצע',
                  click: (e) =>
                    ui.showUserInfo({ userId: e.createUserId, title: 'מבצע' }),
                },
                {
                  name: 'פרטי נהג',
                  icon: 'local_taxi',
                  visible: (e) => !!e.driverId,
                  click: (e) =>
                    ui.showUserInfo({ userId: e.driverId, title: 'נהג' }),
                },
              ],

              columnSettings: (x) => [
                { field: x.what, width: '130' },
                { field: x.driverId, getValue: (x) => x.driver?.name },
                x.notes,
                { field: x.createdAt, width: '240px' },
                { field: x.createUserId, getValue: (x) => x.createUser?.name },
                x.eventStatus,
              ],
            }),
            title: 'היסטורית נסיעה ' + e.externalId + ' ' + e.title,
          })
        },
      },
      {
        name: 'פרטי מוקדן',
        icon: 'contact_emergency',
        click: (e) =>
          ui.showUserInfo({ userId: e.createUserId, title: 'מוקדן' }),
      },
      {
        name: 'פרטי נהג',
        icon: 'local_taxi',
        visible: (e) => !!e.driverId,
        click: (e) => ui.showUserInfo({ userId: e.driverId, title: 'נהג' }),
      },
      {
        name: 'העבר לבירור רלוונטיות',
        icon: 'question_mark',
        visible: (e) => [taskStatus.active].includes(e.taskStatus),
        click: async (e) => {
          await e.markForRelevanceCheck()
        },
      },
      {
        name: 'סמן כלא רלוונטי',
        icon: 'thumb_down',
        visible: (e) =>
          [
            taskStatus.active,
            taskStatus.assigned,
            taskStatus.notRelevant,
            taskStatus.otherProblem,
            taskStatus.relevanceCheck,
            taskStatus.draft,
          ].includes(e.taskStatus),
        click: async (e) => {
          if (e.taskStatus !== taskStatus.completed)
            await e.noLongerRelevant('על ידי מוקדן')
        },
      },
      {
        name: 'החזר לנהג',
        icon: 'badge',
        visible: (e) =>
          ![
            taskStatus.active,
            taskStatus.assigned,
            taskStatus.driverPickedUp,
            taskStatus.relevanceCheck,
          ].includes(e.taskStatus) && e.driverId !== '',

        click: async (e) => {
          await e.returnToDriver()
        },
      },
      {
        name: 'החזר לפתוח לרישום',
        icon: 'check_circle',

        visible: (e) =>
          ![taskStatus.active, taskStatus.draft].includes(e.taskStatus),
        click: async (e) => {
          await e.returnToActive()
        },
      },
      {
        name: 'אשר טיוטא',
        icon: 'check_circle',

        visible: (e) => [taskStatus.draft].includes(e.taskStatus),
        click: async (e) => {
          await e.returnToActive()
        },
      },
      {
        name: 'סמן כטיוטא',
        visible: (e) =>
          e.taskStatus == taskStatus.active ||
          e.taskStatus === taskStatus.notRelevant ||
          e.taskStatus == taskStatus.relevanceCheck,
        click: async (e) => {
          await e.markAsDraft()
        },
      },
      {
        name: 'שכפול נסיעה לכתובת אחרת',
        icon: 'content_copy',
        click: async (oldE) => {
          const e = remult.repo(Task).create(oldE)
          e.eventDate = new Date()
          e.toAddress = ''
          e.toAddressApiResult = null
          e.toPhone1 = ''
          e.toPhone2 = ''
          e.tpPhone1Description = ''
          e.tpPhone2Description = ''
          ui.areaDialog({
            title: 'שכפול נסיעה לכתובת אחרת',
            fields: [
              e.$.toAddress,
              [e.$.toPhone1, e.$.tpPhone1Description],
              [e.$.toPhone2, e.$.tpPhone2Description],
              e.$.eventDate,
            ],
            ok: async () => {
              await e.save()
              args?.taskAdded?.(e)
            },
          })
        },
      },
      {
        name: 'פתח בMONDAY',
        visible: (e) => e.externalId.startsWith('m:'),
        click: (t) => {
          window.open(
            `https://kanfi-barzel.monday.com/boards/1290250715/pulses/` +
              t.externalId.split(':')[1],
            '_blank'
          )
        },
      },
    ]
  }
  copyWhatsappMessage(ui: UITools) {
    copy(this.getShortDescription() + '\n' + this.getLink())
    ui.info('הקישור הועתק ללוח, ניתן לשלוח בקבוצה')
  }
  getLink(): string {
    return remult.context.origin + '/t/' + this.id
  }
}

export const day = 86400000

function requiredOnChange(condition: () => boolean) {
  return (entity: Task, ref: FieldRef) => {
    if (entity.__disableValidation) return
    if (getSite().onlyAskForSecondAddress) return
    if (!condition()) return
    if (entity.isNew() || ref.valueChanged()) Validators.required(entity, ref)
  }
}

export function eventDisplayDate(
  e: Task,
  group = false,
  today: Date | undefined = undefined
) {
  if (e.eventDate) {
    let edd = e.eventDate
    if (!today) today = new Date()
    today = ValueConverters.DateOnly.fromJson!(
      ValueConverters.DateOnly.toJson!(new Date())
    )

    let t = today.valueOf()
    let d = edd.valueOf()
    if (d > t - day) {
      if (d < t + day)
        return `היום` + ' (' + moment(d).locale('he').format('DD/MM') + ')'
      if (d < t + day * 2)
        return 'מחר' + ' (' + moment(d).locale('he').format('DD/MM') + ')'
      if (group) {
        let endOfWeek = t - today.getDay() * day + day * 7
        if (d < endOfWeek) return 'השבוע'
        if (d < endOfWeek + day * 7) return 'שבוע הבא'
        if (edd.getFullYear() == today.getFullYear())
          return edd.toLocaleString('he', { month: 'long' })

        if (group)
          return edd.toLocaleString('he', { month: 'long', year: '2-digit' })
      }
    } else {
      if (d > t - day * 2) {
        return 'אתמול' + ' (' + moment(d).locale('he').format('DD/MM') + ')'
      }
      if (d > t - day * 3) {
        return 'שלשום' + ' (' + moment(d).locale('he').format('DD/MM') + ')'
      }

      return moment(d).locale('he').format('DD/MM')
    }

    return moment(d).locale('he').format('DD/MM (dddd)')
  }
  if (group) return 'gcr'
  return ''
}

export function calcValidUntil(
  date: Date,
  startTime: string,
  validUntil: number
) {
  const hours = +startTime.substring(0, 2)
  const minutes = +startTime.substring(3, 5)
  const result = new Date(date)
  result.setHours(result.getHours() + hours + validUntil - 2)
  result.setMinutes(result.getMinutes() + minutes)
  return result
  const text = result.toLocaleString('en-US', {
    timeZone: 'Asia/Jerusalem',
    hour12: false,
    timeZoneName: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const r2 = new Date(text)
  console.log({ date, startTime, validUntil, result, text, r2 })
  return r2
}

export const DriverCanceledAssign = 'נהג ביטל שיוך'
export const SMS_CONFIRM_MESSAGE = 'הודעת SMS באישור'
