import { Context } from 'effect';
import type { PrismaClient } from '../../../../generated/prisma/client.js';

export class PrismaServiceTag extends Context.Tag('PrismaService')<
  PrismaServiceTag,
  PrismaClient
>() {}
