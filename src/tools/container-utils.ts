import mineflayer from 'mineflayer';
import type { Block } from 'prismarine-block';
import { Vec3 } from 'vec3';

// Storage blocks that bot.openContainer can drive. Shulker boxes are matched by
// suffix so all 17 dye variants are covered without listing each one.
const CONTAINER_BLOCKS = new Set([
  'chest',
  'trapped_chest',
  'ender_chest',
  'barrel',
  'hopper',
  'dispenser',
  'dropper'
]);

export type Container = mineflayer.Chest | mineflayer.Dispenser;

export function isContainerBlock(name: string): boolean {
  return CONTAINER_BLOCKS.has(name) || name.endsWith('shulker_box');
}

export function findContainerBlock(bot: mineflayer.Bot, x: number, y: number, z: number): Block | null {
  const block = bot.blockAt(new Vec3(x, y, z));

  if (!block || !isContainerBlock(block.name)) {
    return null;
  }

  return block;
}

/**
 * Close whatever window the bot currently has open and report its type.
 * Returns null when nothing was open. This keeps the stateful `open-container`
 * flow from blocking the self-contained deposit/withdraw tools, since
 * mineflayer can only hold one window open at a time.
 */
export async function closeOpenWindow(bot: mineflayer.Bot): Promise<string | null> {
  const openWindow = bot.currentWindow;

  if (!openWindow) {
    return null;
  }

  try {
    await bot.closeWindow(openWindow);
  } catch {
    // Treat an already-closed window as closed.
  }

  return openWindow.type === undefined || openWindow.type === null
    ? 'unknown'
    : String(openWindow.type);
}

/**
 * Open a container, run an operation against it, and always close it again so
 * the bot never strands an open window on an early return or a thrown error.
 */
export async function withContainer<T>(
  bot: mineflayer.Bot,
  block: Block,
  operation: (container: Container) => Promise<T>
): Promise<T> {
  await closeOpenWindow(bot);

  const container = await bot.openContainer(block);

  try {
    return await operation(container);
  } finally {
    try {
      await container.close();
    } catch {
      // ignore
    }
  }
}
