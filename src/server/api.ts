import { remultExpress } from 'remult/remult-express'
import { User } from '../app/users/user'
import { SignInController } from '../app/users/SignInController'
import { Session, initRequestUser } from './server-session'
import { Task } from '../app/events/tasks'
import { TaskImage } from 'src/app/events/TaskImage'
import { TaskStatusChanges } from 'src/app/events/TaskStatusChanges'
import { getPostgresSchemaManager } from './PostgresSchemaWrapper'
import { config } from 'dotenv'
import {
  InMemoryLiveQueryStorage,
  LiveQueryStorage,
  SqlDatabase,
  SubscriptionServer,
  remult,
  repo,
} from 'remult'
import { VersionInfo } from './version'
import { Locks } from '../app/events/locks'
import {
  Site,
  backendSites,
  getBackendSite,
  getSite,
  getSiteFromPath,
  initSite,
} from '../app/users/sites'
import { InitRequestOptions, SseSubscriptionServer } from 'remult/server'
import { Roles } from '../app/users/roles'
import { sendSms } from './send-sms'
import { gql, update } from './getGraphQL'
import {
  ACTIVE_DELIVERY,
  updateStatusOnMonday,
  upsertTaskBasedOnMondayValues,
} from './monday-work'
import {
  GetGeoInformation,
  updateGeocodeResult,
} from '../app/common/address-input/google-api-helpers'
import { ChangeLog } from '../app/common/change-log/change-log'

import { OverviewController } from '../app/overview/overview.controller'
import fetch from 'node-fetch'
import { BlockedPhone } from '../app/events/blockedPhone'
import { SendVerifyRelevanceSms } from '../app/events/send-verify-relevance-sms'

//import { readExcelVolunteers } from './read-excel'
//import { readTripExcel } from './read-excel'

config() //loads the configuration from the .env file

const entities = [
  User,
  Task,
  TaskStatusChanges,
  VersionInfo,
  Locks,
  TaskImage,
  ChangeLog,
  Session,
  BlockedPhone,
]

const postgres = getPostgresSchemaManager({
  disableSsl: Boolean(process.env['DEV']),
  entities,
})

export const api = remultExpress({
  subscriptionServer: new SseSubscriptionServer(() =>
    remult.isAllowed([Roles.dispatcher, Roles.manageDrivers])
  ),
  controllers: [SignInController, OverviewController],
  rootPath: '/*/api',
  entities,
  initRequest: async (req, options) => {
    let schema = getSiteFromPath(req)
    initSite(schema)
    remult.context.origin =
      'https://' + req.get('host') + '/' + getSite().urlPrefix
    const info = getBackendSite(schema)
    if (!info) {
      console.log('Error, invalid schema - request was: ' + req.path)
      throw 'invalid schema'
    }
    remult.dataProvider = await postgres.getConnectionForSchema(
      getBackendSite(schema)!.dbSchema
    )
    await initRequestUser(req)
    initRemultBasedOnRequestInfo(schema, options)
  },
  contextSerializer: {
    serialize: async () => ({
      origin: remult.context.origin,
      site: getSite().urlPrefix,
    }),
    deserialize: async (json, options) => {
      let schema = json.site
      remult.context.origin = json.origin
      initSite(schema)
      remult.dataProvider = await postgres.getConnectionForSchema(
        getBackendSite(schema)!.dbSchema
      )
      initRemultBasedOnRequestInfo(schema, options)
    },
  },

  initApi: async () => {
    try {
      remult.context.site = new Site('lev1j')
      remult.dataProvider = await postgres.getConnectionForSchema(
        getBackendSite(remult.context.site.urlPrefix)!.dbSchema
      )

      remult.subscriptionServer = new SseSubscriptionServer()
      //await investigate()
      // SqlDatabase.LogToConsole = true
      // await repo(User).findFirst()
      // await repo(Task).findFirst()
      // await repo(ChangeLog).findFirst()
      // await repo(TaskStatusChanges).findFirst()
      // await repo(TaskImage).findFirst()
      // await repo(Session).findFirst()
      // await repo(User).findFirst()
      // SqlDatabase.LogToConsole = true
      //await updateStatusOnMonday(item, ACTIVE_DELIVERY)

      //await upsertTaskBasedOnMondayValues(1290250715, 1299715447)
    } catch (error: any) {
      console.error(error)
    }
  },
})

async function runPeriodicOperations() {
  if (!process.env['DISABLE_PERIODIC_OPERATIONS'])
    for (const site of backendSites) {
      if (site.sendTextMessageToRequester) {
        try {
          await new Promise((res, rej) => {
            api.withRemult(
              {
                path: '/' + site.urlPrefix + '/api',
                get: () => {
                  return 'sh.hagai.co'
                },
                session: {},
              } as any,
              {} as any,
              async () => {
                try {
                  await SendVerifyRelevanceSms()
                  res({})
                } catch (err: any) {
                  rej(err)
                }
              }
            )
          })
        } catch (err) {
          console.error(err)
        }
      }
    }
  setTimeout(() => {
    runPeriodicOperations()
  }, 1000 * 60 * 10)
}
runPeriodicOperations()

const siteEventPublishers = new Map<
  string,
  {
    subscriptionServer: SubscriptionServer
    liveQueryStorage: LiveQueryStorage
  }
>()
function initRemultBasedOnRequestInfo(
  site: string,
  options: InitRequestOptions
) {
  var dbSchema = getBackendSite(site)!.dbSchema
  let found = siteEventPublishers.get(dbSchema)
  if (!found) {
    let subscriptionServer: SubscriptionServer
    let x = new SseSubscriptionServer((channel, remult) => {
      return remult.isAllowed([Roles.dispatcher, Roles.manageDrivers])
    })

    subscriptionServer = x

    var liveQueryStorage = new InMemoryLiveQueryStorage()
    siteEventPublishers.set(
      dbSchema,
      (found = {
        subscriptionServer,
        liveQueryStorage,
      })
    )
  }
  remult.subscriptionServer = found.subscriptionServer
  options.liveQueryStorage = found.liveQueryStorage
}
