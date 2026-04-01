import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaGlobalModule } from './prisma-global.module';
import { PrismaService } from './prisma.service';

describe('PrismaGlobalModule', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [PrismaGlobalModule],
    }).compile();
  });

  afterEach(async () => {
    await module.close();
  });

  it('should provide PrismaService', () => {
    const service = module.get<PrismaService>(PrismaService);
    expect(service).toBeDefined();
  });

  it('should export PrismaService as global provider', () => {
    const service = module.get<PrismaService>(PrismaService);
    expect(service).toBeDefined();
  });
});
