import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformType } from '@prisma/client';
import { PlatformAdapter } from './interfaces/platform-adapter.interface';

@Injectable()
export class PlatformAdapterFactory {
  private readonly adapters = new Map<PlatformType, PlatformAdapter>();

  register(platformType: PlatformType, adapter: PlatformAdapter): void {
    this.adapters.set(platformType, adapter);
  }

  resolve(platformType: PlatformType): PlatformAdapter {
    const adapter = this.adapters.get(platformType);
    if (!adapter) {
      throw new NotFoundException(
        `No adapter registered for platform: ${platformType}`,
      );
    }
    return adapter;
  }
}
