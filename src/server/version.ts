import {
  dbNamesOf,
  Entity,
  Fields,
  getValueList,
  IdEntity,
  remult,
  repo,
  SqlDatabase,
} from 'remult'
import { calcValidUntil, Task } from '../app/events/tasks'
import { TaskStatusChanges } from 'src/app/events/TaskStatusChanges'
import { taskStatus } from 'src/app/events/taskStatus'
import { phoneConfig } from '../app/events/phone'
import { getSite } from '../app/users/sites'
import { OrgEntity } from 'src/app/users/OrgEntity'
import { User } from '../app/users/user'
import { ChangeLog } from '../app/common/change-log/change-log'

@Entity(undefined!, {
  dbName: 'versionInfo',
})
export class VersionInfo extends IdEntity {
  @Fields.number()
  version: number = 0
}

export async function versionUpdate() {
  const db = SqlDatabase.getDb()
  const site = getSite()
  let version = async (ver: number, what: () => Promise<void>) => {
    let v = await remult.repo(VersionInfo).findFirst()
    if (!v) {
      v = remult.repo(VersionInfo).create()
      v.version = 0
    }
    if (v.version <= ver - 1) {
      try {
        console.time(`version: ` + ver + ' ' + getSite().urlPrefix)
        await what()
      } catch (err) {
        console.error(err)
        throw err
      } finally {
        console.timeEnd(`version: ` + ver + ' ' + getSite().urlPrefix)
      }

      v.version = ver
      await v.save()
    }
  }

  await version(1, async () => {
    await db.execute(`CREATE SEQUENCE task_seq
    START WITH 3000
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;`)
  })
  await version(2, async () => {
    phoneConfig.disableValidation = true
    for await (const task of repo(Task).query()) {
      task.validUntil = calcValidUntil(
        task.eventDate,
        task.startTime,
        task.relevantHours
      )
      try {
        await task.save()
      } catch (err: any) {
        console.error(err.message)
        throw err
      }
    }
    phoneConfig.disableValidation = false
  })

  await version(5, async () => {
    const t = await dbNamesOf(Task)
    const s = await dbNamesOf(TaskStatusChanges)
    await db.execute(
      `insert into ${s} (${s.id}, ${s.taskId},${s.what},${s.eventStatus},${s.driverId},${s.createUserId},${s.createdAt}) 
      select ${t.id},${t.id},'יצירה',${t.taskStatus},${t.driverId},${t.createUserId},${t.createdAt} from ${t}`
    )
  })
  await version(6, async () => {
    for await (const task of await repo(Task).query()) {
      task.validUntil = calcValidUntil(
        task.eventDate,
        task.startTime,
        task.relevantHours
      )
      await task.save()
    }
  })

  await version(13, async () => {
    for (const entity of [User, Task, TaskStatusChanges, ChangeLog]) {
      const names = await dbNamesOf<OrgEntity>(entity as any)

      const c = db.createCommand()
      await c.execute(
        `update ${await names.$entityName}  set ${
          names.org
        }=${c.addParameterAndReturnSqlToken(site.org)}`
      )
    }
  })
  await version(14, async () => {
    const s = await dbNamesOf(TaskStatusChanges)
    await db.execute(
      `create index if not exists task_status_changes_task_id on ${s.$entityName}(${s.taskId})`
    )
  })
  // await version(15, async () => {
  //   const t = await dbNamesOf(Task)
  //   await db.execute(
  //     `update ${t} set ${t.publicVisible}=true where publicVisible='true'`
  //   )
  // })
  await version(16, async () => {
    const u = await dbNamesOf(User)
    await db.execute(
      `create index if not exists user_phone on ${u.$entityName}(${u.phone})`
    )
  })
}
