import { Module } from '@nestjs/common';
import { BoardingController } from './http/boarding.controller.js';

@Module({
  controllers: [BoardingController],
})
export class BoardingModule {}
