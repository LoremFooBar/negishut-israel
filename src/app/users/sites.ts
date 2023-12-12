import { EntityFilter, remult } from 'remult'
import { Roles } from './roles'
import { taskStatus } from '../events/taskStatus'
import { UpdateMessage } from '../events/UpdatesChannel'
import { DriverCanceledAssign, Task } from '../events/tasks'
import { User, matchesCurrentSiteUserId, matchesCurrentUserId } from './user'

let title = ''
export function getTitle() {
  return getSite().title
}

export class Site {
  showComfortIntakeMessage = false
  driverAssignButtonText = 'אני אבצע'
  sortTasksAscending = false
  sendTextMessageOnApprove = false
  sendTextMessageToRequester = false
  sendTextMessageOnlyForFutureEvents = false
  constructor(
    public urlPrefix: string,
    set?: Partial<Site> & { dbSchema: string; title: string }
  ) {
    if (set) {
      Object.assign(this, set)
    }
    if (!this.org) {
      this.org = this.urlPrefix
    }

    if (!this.categories.includes(this.defaultCategory))
      this.categories = [this.defaultCategory, ...this.categories]
  }
  dbSchema!: string
  ignore?: boolean
  title!: string
  maxActiveTripsPerDriver = 15

  signInFilter: () => EntityFilter<User> = () => ({
    org: this.getVisibleOrgs().map((x) => x.org),
  })
  tasksFilter: () => EntityFilter<Task> = () => ({
    org: this.getVisibleOrgs().map((x) => x.org),
  })

  allDeliveryRequestsAreApprovedAutomatically = false
  taskTitleCaption?: string
  defaultLinkDescription = `כאן תוכלו להתעדכן ולסייע בהסעת חיילים, מפונים וציוד`
  showContactToAnyDriver = true
  showValidUntil = false
  requireValidUntil = false
  requireContactName = false
  getVisibleOrgs = () => [
    this,
    ...this.getOtherVisibleOrgs().filter((x) => x != this),
  ]
  getOtherVisibleOrgs = () => {
    return [] as Site[]
  }
  getIntroText() {
    return this.getIntroTextImplementation({
      title: this.title,
      registerVolunteerLink: this.registerVolunteerLink,
    })
  }
  getIntroTextImplementation({
    title,
    registerVolunteerLink,
  }: {
    title: string
    registerVolunteerLink?: string
  }): string {
    return `ברוכים הבאים לאפליקציית השינועים של ${getTitle()}.

כאן תוכלו להתעדכן באירועי שינוע ולסייע בהסעת חיילים לבסיסים, בשינוע ציוד לחיילים או בשינועים שונים הנדרשים לכוחות העורף.

המענה שלכם יסייע באופן משמעותי למאמץ המלחמתי כעוגן האזרחי של ישראל.

${
  registerVolunteerLink
    ? `

עוד לא נרשמתם? [לחצו כאן להרשמה ונאשר אתכם במהרה](${registerVolunteerLink})

`
    : ''
}
צאו לעשות חסדים!`
  }

  onlyAskForSecondAddress = false
  countUpdates = true
  useFillerInfo = false
  allowAnyVolunteerToAdd? = false
  sendSmsOnNewDraft = false
  registerVolunteerLink?: string
  messageBySnif = false
  showInfoSnackbarFor(message: UpdateMessage) {
    return true
  }

  soldiersDelivery = 'שינוע חיילים'
  bikeDelivery = 'שינוע באופנוע'

  bikeCategoryCaption?: string
  defaultCategory = this.soldiersDelivery
  truckCategoryCaption?: string
  categories: string[] = [
    this.soldiersDelivery,
    'שינוע ציוד',
    'שינוע מזון',
    'שינוע ברכב מסחרי / נגרר',
    'שינוע במשאית',
    'מתאים גם לאופנוע',
    'שינוע רכב',
    'אחר',
  ]
  showCopyLink?: boolean
  imageIsMandatory?: boolean
  showTwoContacts = true
  fromAddressName?: string
  toAddressName?: string
  addressInstructions?: string
  driverCanMarkAsNonRelevant = true

  canSeeUrgency() {
    return true
  }
  onlyCities = false
  syncWithMonday = false
  syncWithShadag = false
  showPastEvents = true
  allowShareLink = false
  org!: string
}

const bikeIl: Site = new Site('bikeil', {
  showContactToAnyDriver: false,
  driverAssignButtonText: 'אני אבצע',
  sendTextMessageToRequester: true,
  requireContactName: true,
  getIntroTextImplementation: () => {
    return `ברוכים הבאים לאפליקציית השינועים של חמל אופנועים.

האפליקציה מיועדת לשימוש מתנדבים הרוכבים על דו-גלגלי או רכב פרטי\\מסחרי ורוצים לסייע בשינוע של ציוד ללוחמים ולמשפחות הנפגעים, או בשינועים המוגדרים כדחופים, לפי שיקול דעתו של החמל.

בכל בקשה בנושא אחר יש לפנות לאחד מהחמלים האחרים העוסקים במגוון נושאים כגון טרמפים, מלאי ציוד וכו.

המענה שלכם יסייע באופן משמעותי למאמץ המלחמתי כעוגן האזרחי של ישראל.`
  },
  dbSchema: 'shinuim',
  title: 'חמל אופנועים',
  defaultCategory: 'שינוע באופנוע',
  categories: ['שינוע מסחרי או נגרר', 'רכב פרטי', 'אחר'],
  showCopyLink: true,
  imageIsMandatory: true,
  useFillerInfo: true,
  allowAnyVolunteerToAdd: true,
  sendSmsOnNewDraft: true,
  // getOtherVisibleOrgs: () => [hahatul],
  tasksFilter: () => ({
    org: [bikeIl.org],
  }),
})
function theBigGroup() {
  return [hahatul, ngim, lev1, lev1j, lev1ms]
}

const hahatul: Site = new Site('hahatul', {
  sendTextMessageOnApprove: true,
  sendTextMessageToRequester: true,
  maxActiveTripsPerDriver: 20,
  dbSchema: 'shinuim',
  title: 'עמותת החתול – בוגרי 669',
  showCopyLink: true,
  allowAnyVolunteerToAdd: true,
  sendSmsOnNewDraft: true,
  useFillerInfo: true,
  registerVolunteerLink:
    'https://wa.me/972545276812?text=' +
    encodeURI('שלום, אני מעוניין להצטרף כנהג מתנדב - שמי הוא: '),
  allowShareLink: true,
  getOtherVisibleOrgs: theBigGroup,
  signInFilter: () => ({ org: theBigGroup().map((x) => x.org) }),
  tasksFilter: () => ({
    $or: [
      {
        org: theBigGroup().map((x) => x.org),
      },
      {
        org: [bikeIl.org],
        category: ['שינוע מסחרי או נגרר', 'רכב פרטי'],
      },
    ],
  }),
})
const ngim: Site = new Site('ngim', {
  sendTextMessageToRequester: true,
  dbSchema: 'shinuim',
  title: 'חמל נהגים',
  showCopyLink: true,
  allowAnyVolunteerToAdd: true,
  sendSmsOnNewDraft: true,
  useFillerInfo: true,
  getOtherVisibleOrgs: theBigGroup,
})
const lev1: Site = new Site('lev1', {
  sendTextMessageToRequester: true,
  dbSchema: 'shinuim',
  title: 'לב אחד שינועים',
  getOtherVisibleOrgs: theBigGroup,
})

const lev1ms: Site = new Site('lev1ms', {
  //sendTextMessageToRequester: true,
  dbSchema: 'shinuim',
  title: 'לב אחד מוקד שרון',
  registerVolunteerLink:
    'https://wa.me/972547800671?text=' +
    encodeURI('שלום, אני מעוניין להצטרף כנהג מתנדב - שמי הוא: '),
  getOtherVisibleOrgs: theBigGroup,
})
export const lev1j: Site = new Site('lev1j', {
  //sendTextMessageToRequester: true,
  syncWithMonday: true,
  dbSchema: 'shinuim',
  title: 'לב אחד ירושלים',
  registerVolunteerLink:
    'https://wa.me/972549805636?text=' +
    encodeURI('שלום, אני מעוניין להצטרף כנהג מתנדב - שמי הוא: '),
  getOtherVisibleOrgs: () => theBigGroup(),
})
export const lev1ge: Site = new Site('lev1ge', {
  //sendTextMessageToRequester: true,
  syncWithMonday: true,
  dbSchema: 'shinuim',
  title: 'לב אחד גוש עציון',
  registerVolunteerLink:
    'https://wa.me/972506238081?text=' +
    encodeURI('שלום, אני מעוניין להצטרף כנהג מתנדב - שמי הוא: '),
  showCopyLink: true,
})
const vdri = new Site('vdri', {
  sendTextMessageToRequester: true,
  dbSchema: 'shinuim',
  title: 'חמ"ל נהגים מתנדבים ארצי',
  showCopyLink: true,
  allowAnyVolunteerToAdd: true,
  showTwoContacts: false,
  fromAddressName: 'ישוב מוצא',
  toAddressName: 'ישוב יעד',
  addressInstructions:
    'אין למלא כתובות מדויקות או בסיסים, יש לרשום רק את העיר.',
  onlyCities: true,
})
function yedidimEnv(urlPrefix: string) {
  return new Site(urlPrefix, {
    showContactToAnyDriver: false,
    sendTextMessageToRequester: true,
    dbSchema: 'shinuim',
    org: 'yedidim',
    sendTextMessageOnApprove: true,
    title: 'ידידים',
    countUpdates: false,
    messageBySnif: true,
    canSeeUrgency: () => remult.isAllowed(Roles.admin),
    getIntroTextImplementation: ({ registerVolunteerLink }) => {
      return `ברוכים הבאים למערכת השינועים של ידידים!

  כאן תוכלו להתעדכן באירועי שינוע ולסייע בהסעת חיילים לבסיסים, בשינוע ציוד לחיילים או בשינועים שונים הנדרשים לכוחות העורף.

  המענה שלכם יסייע באופן משמעותי למאמץ המלחמתי כעוגן האזרחי של ישראל.

  ${
    registerVolunteerLink
      ? `

  עוד לא נרשמתם? [לחצו כאן להרשמה ונאשר אתכם במהרה](${registerVolunteerLink})

  `
      : ''
  }

  במידה ונתקלתם בבעיה בהתחברות למערכת יש לפנות למנהל הסניף, או להתקשר למוקד הכוננים במספר [077-600-1230](tel:077-600-1230) שלוחה 1.

  צאו לעשות חסדים!`
    },

    registerVolunteerLink: 'https://forms.gle/E4DGSCtEgfSYfJvy9',
    showInfoSnackbarFor(message: UpdateMessage): boolean {
      if (matchesCurrentSiteUserId(message.userId)) return false
      if ([DriverCanceledAssign].includes(message.action)) return true
      if (
        [taskStatus.draft, taskStatus.otherProblem]
          .map((x) => x.id)
          .includes(message.status)
      )
        return true
      return false
    },
  })
}
const yedidim = yedidimEnv('y')

const civil = new Site('civil', {
  showComfortIntakeMessage: true,
  sendTextMessageToRequester: true,
  sendTextMessageOnlyForFutureEvents: true,
  sendTextMessageOnApprove: true,
  sortTasksAscending: true,
  dbSchema: 'shinuim',
  title: 'מתנדבי טרמפים',
  showValidUntil: true,
  requireValidUntil: true,
  getIntroText: () => {
    return `נהגים מתנדבי טרמפים, ברוכים הבאים למערכת החדשה,

אם טרם נרשמתם כנהגים, [אנא מלאו את הטופס פה](https://docs.google.com/forms/d/1tCBQchGqgjU7a604BduE-MFGWtiutdOTTfFW4TpKc2U)

אם נרשמתם כבר, אמורים להתקשר אליכם לאימות נתונים.

מספר שעות לאחר האימות, פרטיכם יוזנו למערכת, ואז מסי הטלפון שלכם יוכר. מכאן ואילך, לאחר אימות SMS, תוכלו לחפש בקשות מתאימות, ולממש את רוח ההתנדבות שלכם.
יש  בעיות? דווחו בקבוצת הוואטסאפ "טרמפים+ כלל הארץ". הצטרפות לקבוצה הנ"ל - https://bit.ly/3Q7HJ2R`
  },
  showCopyLink: true,
  allowAnyVolunteerToAdd: true,
  useFillerInfo: true,
  allDeliveryRequestsAreApprovedAutomatically: true,

  defaultCategory: 'הסעת חיילים',
  registerVolunteerLink:
    'https://docs.google.com/forms/d/1tCBQchGqgjU7a604BduE-MFGWtiutdOTTfFW4TpKc2U',
  categories: [
    'הסעת מפונים',
    'הסעות אחר',
    'שינוע ציוד',
    'שינוע אוכל חם',
    'אחר',
  ],
  showPastEvents: false,
  defaultLinkDescription: 'מתנדבי טרמפים, מערכת ניהול טרמפים',
})

const warRoom = new Site('wrc', {
  sendTextMessageToRequester: true,
  dbSchema: 'shinuim',
  title: 'אופנוענים ונהגים מתנדבים',
  showCopyLink: true,
  allowAnyVolunteerToAdd: true,
  useFillerInfo: true,
  driverCanMarkAsNonRelevant: false,
  defaultCategory: 'שינוע ציוד',
  syncWithMonday: true,
  registerVolunteerLink: `https://forms.monday.com/forms/2ecb222fecfb8b8d7404f754362d2c6d?r=euc1`,
})
const trmps = new Site('trmps', {
  dbSchema: 'shinuim',
  title: 'חמ"ל השינוע הארצי',
  //syncWithMonday: true,
})

const showers = new Site('showers', {
  dbSchema: 'showers',
  title: 'מקלחות ניידות לשטח',
  taskTitleCaption: 'כמה חיילים? *',
  onlyAskForSecondAddress: true,
  defaultCategory: 'מקלחות ניידות',
  categories: ['רכב גורר עד 1.5 טון', 'רכב גורר עד 3.5 טון'],
})

export function initSite(site?: string) {
  if (!site && typeof document !== 'undefined') {
    //@ts-ignore
    site = document.body.getAttribute('site')
    if (site === '!!!ORG!!!') {
      //@ts-ignore
      site = document.location.pathname.split('/')[1]
    }
  }
  remult.context.site =
    backendSites.find((x) => x.urlPrefix === site) ||
    new Site('error', { dbSchema: 'error', title: 'error' })
}

export function getSite() {
  return remult.context.site || new Site('')
}

export const backendSites = [
  new Site('dshinua', {
    dbSchema: 'dshinua',
    title: 'שינוע - הדגמה',
    allowShareLink: true,
    ignore: true,
    showCopyLink: true,
    allowAnyVolunteerToAdd: true,
    sendSmsOnNewDraft: true,
    useFillerInfo: true,
  }),
  hahatul,
  lev1,
  lev1ms,
  lev1j,
  lev1ge,
  bikeIl,
  ngim,
  vdri,
  yedidim,
  trmps,
  yedidimEnv('ezion'),
  // new Site('brdls', { dbSchema: 'brdls', title: 'ברדלס' }),
  // new Site('mgln', {
  //   dbSchema: 'mgln',
  //   title: 'ידידי מגלן',
  //   showCopyLink: true,
  //   allowAnyVolunteerToAdd: true,
  //   sendSmsOnNewDraft: true,
  //   useFillerInfo: true,
  // }),
  new Site('shadag_test', {
    dbSchema: 'dshinua',
    title: 'סביבת בדיקות שדג',
    driverCanMarkAsNonRelevant: false,
    defaultCategory: 'שינוע ציוד',
    syncWithShadag: true,
  }),
  new Site('test1', {
    // getOtherVisibleOrgs: () => [hahatul],
    showContactToAnyDriver: true,
    showComfortIntakeMessage: true,
    showValidUntil: true,
    //syncWithShadag: true,
    requireValidUntil: true,
    dbSchema: 'dshinua',
    title: 'פיתוח',
    ignore: true,
    org: 'test1',
  }),
  new Site('test2', {
    showValidUntil: false,
    dbSchema: 'dshinua',
    title: 'סביבת בדיקות החתול',
    ignore: true,
  }),
  new Site('jshield', {
    dbSchema: 'shinuim',
    title: 'jshield',
    registerVolunteerLink:
      'https://wa.me/972585007888?text=' +
      encodeURI('שלום, אני מעוניין להצטרף כנהג מתנדב - שמי הוא: '),
  }),
  warRoom,
  showers,
  civil,
  new Site('darkenu', {
    dbSchema: 'shinuim',
    title: 'דרכנו',
    showCopyLink: true,
    registerVolunteerLink:
      'https://forms.monday.com/forms/771b9449be6dac38889b9ea2226bfef7?r=euc1',
  }),
  // new Site('teva', {
  //   dbSchema: 'teva',
  //   title: 'תופעת טבע',
  //   showCopyLink: true,
  //   allowAnyVolunteerToAdd: true,
  //   sendSmsOnNewDraft: true,
  //   useFillerInfo: true,
  // }),
]
export function getSiteByOrg(org: string) {
  return backendSites.find((x) => x.org === org)!
}

export function getBackendSite(urlPrefix?: string) {
  if (!urlPrefix) urlPrefix = getSite().urlPrefix
  const result = backendSites.find((x) => x.urlPrefix === urlPrefix)
  return result!
}

export function getSiteFromPath(req: { path: string }) {
  return req.path.split('/')[1]
}

/*
insert into shinuim.users
( id, org, name, phone, adminNotes, createDate, createUserId, admin, dispatcher, trainee, manageDrivers, deleted, lastUpdateView, addressApiResult, address, okCategories)
select id, org, name, phone, adminNotes, createDate, createUserId, admin, dispatcher, trainee, manageDrivers, deleted, lastUpdateView, addressApiResult, address, okCategories
from bikeil.users;

insert into shinuim.tasks (id, org, title, taskStatus, statusChangeDate, description, urgency, category, eventDate, startTime, relevantHours, validUntil, addressApiResult, address, toAddressApiResult, toAddress, distance, requesterPhone1, requesterPhone1Description, phone1, phone1Description, phone2, phone2Description, toPhone1, tpPhone1Description, toPhone2, tpPhone2Description, privateDriverNotes, createdAt, createUserId, driverId, statusNotes, externalId, internalComments, imageId, returnMondayStatus, publicVisible, responsibleDispatcherId)
select id, org, title, taskStatus, statusChangeDate, description, urgency, category, eventDate, startTime, relevantHours, validUntil, addressApiResult, address, toAddressApiResult, toAddress, distance, requesterPhone1, requesterPhone1Description, phone1, phone1Description, phone2, phone2Description, toPhone1, tpPhone1Description, toPhone2, tpPhone2Description, privateDriverNotes, createdAt, createUserId, driverId, statusNotes, externalId, internalComments, imageId, returnMondayStatus, publicVisible, responsibleDispatcherId
from bikeil.tasks;

insert into shinuim.changelog (id, org, relatedId, relatedName, entity, appUrl, apiUrl, changeDate, userId, userName, changes, changedFields)
select id, org, relatedId, relatedName, entity, appUrl, apiUrl, changeDate, userId, userName, changes, changedFields
from bikeil.changelog;

insert into shinuim.taskstatuschanges (id, org, taskId, what, eventStatus, notes, driverId, createUserId, session, createdAt)
select id, org, taskId, what, eventStatus, notes, driverId, createUserId, session, createdAt
from bikeil.taskstatuschanges;
insert into shinuim.images select * from bikeil.images;
insert into shinuim.session (id,createdat,headers,ip)
select id,createdat,headers,ip from bikeil.session;

*/
