import { Controller, Get, Inject, Logger } from '@nestjs/common';
import { AppService } from './app.service.js';
import { EFFECT_RUNTIME } from './domains/shared/shell/effect-runtime/effect-runtime.module.js';
import { ManagedRuntime } from 'effect';
import { healthCheckProgram } from './domains/shared/shell/effect-runtime/health-check.program.js';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    @Inject(EFFECT_RUNTIME) private readonly runtime: ManagedRuntime.ManagedRuntime<any, never>,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('api/v1/health/effect')
  async healthEffect() {
    try {
      const [result, events] = await this.runtime.runPromise(healthCheckProgram)
      if (events.length > 0) {
        this.logger.warn(`Health check produced ${events.length} unexpected event(s)`)
      }
      return result
    } catch (error) {
      this.logger.error('Effect health check failed', error instanceof Error ? error.stack : error)
      throw error
    }
  }
}
