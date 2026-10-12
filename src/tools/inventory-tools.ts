import { z } from "zod";
import mineflayer from 'mineflayer';
import { ToolFactory } from '../tool-factory.js';
import { coerceCoordinates } from './coordinate-utils.js';
import { closeOpenWindow, isContainerBlock } from './container-utils.js';
import { Vec3 } from 'vec3';

interface InventoryItem {
  name: string;
  count: number;
  slot: number;
}

export function registerInventoryTools(factory: ToolFactory, getBot: () => mineflayer.Bot): void {
  factory.registerTool(
    "list-inventory",
    "List all items in the bot's inventory",
    {},
    async () => {
      const bot = getBot();
      const items = bot.inventory.items();
      const itemList: InventoryItem[] = items.map((item) => ({
        name: item.name,
        count: item.count,
        slot: item.slot
      }));

      if (items.length === 0) {
        return factory.createResponse("Inventory is empty");
      }

      let inventoryText = `Found ${items.length} items in inventory:\n\n`;
      itemList.forEach(item => {
        inventoryText += `- ${item.name} (x${item.count}) in slot ${item.slot}\n`;
      });

      return factory.createResponse(inventoryText);
    }
  );

  factory.registerTool(
    "find-item",
    "Find a specific item in the bot's inventory",
    {
      nameOrType: z.string().describe("Name or type of item to find")
    },
    async ({ nameOrType }) => {
      const bot = getBot();
      const items = bot.inventory.items();
      const item = items.find((item) =>
        item.name.includes(nameOrType.toLowerCase())
      );

      if (item) {
        return factory.createResponse(`Found ${item.count} ${item.name} in inventory (slot ${item.slot})`);
      } else {
        return factory.createResponse(`Couldn't find any item matching '${nameOrType}' in inventory`);
      }
    }
  );

  factory.registerTool(
    "equip-item",
    "Equip a specific item",
    {
      itemName: z.string().describe("Name of the item to equip"),
      destination: z.string().optional().describe("Where to equip the item (default: 'hand')")
    },
    async ({ itemName, destination = 'hand' }) => {
      const bot = getBot();
      const items = bot.inventory.items();
      const item = items.find((item) =>
        item.name.includes(itemName.toLowerCase())
      );

      if (!item) {
        return factory.createResponse(`Couldn't find any item matching '${itemName}' in inventory`);
      }

      await bot.equip(item, destination as mineflayer.EquipmentDestination);
      return factory.createResponse(`Equipped ${item.name} to ${destination}`);
    }
  );

  factory.registerTool(
    "open-container",
    "Open a block container or chest at the specified position and list its contents.",
    {
      x: z.coerce.number().describe("X coordinate"),
      y: z.coerce.number().describe("Y coordinate"),
      z: z.coerce.number().describe("Z coordinate"),
    },
    async ({ x, y, z }: { x: number; y: number; z: number }) => {
      ({ x, y, z } = coerceCoordinates(x, y, z));

      const bot = getBot();
      const block = bot.blockAt(new Vec3(x, y, z));

      if (!block) {
        return factory.createResponse(`No block information found at position (${x}, ${y}, ${z})`);
      }

      // Only one window can be open at a time, so release a stale one first.
      const previousWindow = await closeOpenWindow(bot);
      const container = await bot.openContainer(block);
      const items = container.containerItems();
      const contents = items.length > 0
        ? items.map((item) => `${item.name} x ${item.count}`).join(', ')
        : 'empty';
      const closedNote = previousWindow
        ? ` Closed the previously open ${previousWindow} window first.`
        : '';
      const unexpectedNote = isContainerBlock(block.name)
        ? ''
        : ` Note: ${block.name} is not a known storage block.`;

      return factory.createResponse(
        `Opened container (type: ${container.type}) at position (${block.position.x}, ${block.position.y}, ${block.position.z}).`
        + `${closedNote}${unexpectedNote} Contents: ${contents}.`
        + ` Call close-window when finished, or use deposit-to-chest / withdraw-from-chest for a single transfer.`
      );
    }
  );

  factory.registerTool(
    "close-window",
    "Close the window or inventory that the bot currently has open.",
    {},
    async () => {
      const bot = getBot();
      const closedWindow = await closeOpenWindow(bot);

      if (!closedWindow) {
        return factory.createResponse('The bot does not have a window currently open.');
      }

      return factory.createResponse(`Closed bot window (type: ${closedWindow})`);
    }
  );
}
