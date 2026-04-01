import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaGlobalModule } from './domains/shared/shell/infra/prisma-global.module';

@Module({
  imports: [PrismaGlobalModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
