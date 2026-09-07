import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

// Mesmo padrão do PrismaService: cliente de infra compartilhado, um por app.
// As conexões de pub/sub do BoardingEventsService nascem de duplicate() — um
// cliente ioredis que entra em subscribe não aceita mais comandos comuns.
@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor() {
    super(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      // Comandos enfileirados durante reconexão não podem falhar: o publish
      // que chegar quando o Redis estiver reerguendo não deve derrubar a API.
      maxRetriesPerRequest: null,
    });
  }

  onModuleDestroy() {
    // disconnect() e não quit(): quit é gracioso (aguarda resposta) e pendura
    // o app.close() dos testes quando o socket nunca chegou a estabelecer.
    this.disconnect();
  }
}
