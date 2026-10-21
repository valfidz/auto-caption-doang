import { Global, Module } from '@nestjs/common'
import { loadEnv, type AppEnv } from './env'

/** Token injeksi untuk AppEnv. */
export const APP_ENV = 'APP_ENV'

@Global()
@Module({
  providers: [{ provide: APP_ENV, useFactory: (): AppEnv => loadEnv() }],
  exports: [APP_ENV],
})
export class EnvModule {}
