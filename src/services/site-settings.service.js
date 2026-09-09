import prisma from '../utils/prisma.js';
import AppError from '../utils/app-error.js';

const MAINTENANCE_MODE_KEY = 'maintenance_mode';
const MAINTENANCE_MESSAGE_KEY = 'maintenance_message';

class SiteSettingsService {
  KEY = MAINTENANCE_MODE_KEY;

  async #ensureSetting(key, defaultValue) {
    const existing = await prisma.siteSetting.findUnique({ where: { key } });
    if (existing) return existing;

    return prisma.siteSetting.create({
      data: { key, value: defaultValue },
    });
  }

  async getMaintenanceMode() {
    const modeRow = await this.#ensureSetting(MAINTENANCE_MODE_KEY, 'false');
    const messageRow = await prisma.siteSetting.findUnique({
      where: { key: MAINTENANCE_MESSAGE_KEY },
    });

    const enabled = modeRow.value === 'true';
    const message = messageRow?.value?.trim() || undefined;

    return message ? { enabled, message } : { enabled };
  }

  async setMaintenanceMode(enabled, message) {
    if (typeof enabled !== 'boolean') {
      throw new AppError('enabled must be a boolean.', 400);
    }

    await prisma.siteSetting.upsert({
      where: { key: MAINTENANCE_MODE_KEY },
      create: { key: MAINTENANCE_MODE_KEY, value: enabled ? 'true' : 'false' },
      update: { value: enabled ? 'true' : 'false' },
    });

    if (message !== undefined) {
      const normalized = String(message ?? '').trim();
      await prisma.siteSetting.upsert({
        where: { key: MAINTENANCE_MESSAGE_KEY },
        create: { key: MAINTENANCE_MESSAGE_KEY, value: normalized },
        update: { value: normalized },
      });
    }

    return this.getMaintenanceMode();
  }
}

export default new SiteSettingsService();
