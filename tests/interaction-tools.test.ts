import test from 'ava';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { Vec3 } from 'vec3';
import { registerInteractionTools } from '../src/tools/interaction-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import { BotConnection } from '../src/bot-connection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';
import type { Block } from 'prismarine-block';
import type { Item } from 'prismarine-item';

const createMockItem = (fields: {
  name: string;
  count: number;
  type: number;
  metadata?: number;
}): Item => fields as unknown as Item;

const createHarness = (botFields: Partial<mineflayer.Bot> = {}) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const getBot = () => botFields as mineflayer.Bot;

  registerInteractionTools(factory, getBot);

  const executorFor = (name: string) => {
    const call = (mockServer.tool as sinon.SinonStub)
      .getCalls()
      .find(c => c.args[0] === name);
    return call!.args[3] as (args: unknown) => Promise<{ content: { text: string }[] }>;
  };

  return { mockServer, executorFor };
};

const waitForListener = async (emitter: EventEmitter, event: string): Promise<void> => {
  while (emitter.listenerCount(event) === 0) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

const createContainerBlock = (name = 'chest'): Block =>
  ({ name, position: new Vec3(5, 60, 5) }) as unknown as Block;

test('registerInteractionTools registers all interaction tools', (t) => {
  const { mockServer } = createHarness();

  const names = (mockServer.tool as sinon.SinonStub).getCalls().map(c => c.args[0]);

  t.deepEqual(names, [
    'use-item',
    'deactivate-item',
    'fish',
    'wait-for-fish',
    'eat',
    'toss-item',
    'deposit-to-chest',
    'withdraw-from-chest'
  ]);
});

test('use-item activates the held item in the main hand', async (t) => {
  const activateItem = sinon.stub();
  const { executorFor } = createHarness({ activateItem } as Partial<mineflayer.Bot>);

  const result = await executorFor('use-item')({});

  t.true(activateItem.calledOnceWith(false));
  t.true(result.content[0].text.includes('Activated held item'));
});

test('deactivate-item releases the held item', async (t) => {
  const deactivateItem = sinon.stub();
  const { executorFor } = createHarness({ deactivateItem } as Partial<mineflayer.Bot>);

  const result = await executorFor('deactivate-item')({});

  t.true(deactivateItem.calledOnce);
  t.true(result.content[0].text.includes('Deactivated held item'));
});

test('fish requires a fishing rod to be equipped', async (t) => {
  const { executorFor } = createHarness({ heldItem: null } as Partial<mineflayer.Bot>);

  const result = await executorFor('fish')({});

  t.true(result.content[0].text.includes('No fishing rod equipped'));
});

test('fish rejects a non-rod held item', async (t) => {
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'cooked_cod', count: 1, type: 1 })
  } as Partial<mineflayer.Bot>);

  const result = await executorFor('fish')({});

  t.true(result.content[0].text.includes('No fishing rod equipped'));
});

test('fish reports a catch when bot.fish resolves', async (t) => {
  const fish = sinon.stub().resolves();
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'fishing_rod', count: 1, type: 1 }),
    fish
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('fish')({});

  t.true(fish.calledOnce);
  t.true(result.content[0].text.includes('Caught something'));
});

test('fish times out when nothing bites', async (t) => {
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'fishing_rod', count: 1, type: 1 }),
    fish: () => new Promise<void>(() => { /* never resolves */ })
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('fish')({ timeout: 0.01 });

  t.true(result.content[0].text.includes('No bite - timed out'));
});

test('fish surfaces an error from bot.fish', async (t) => {
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'fishing_rod', count: 1, type: 1 }),
    fish: sinon.stub().rejects(new Error('not water'))
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('fish')({});

  t.true(result.content[0].text.includes('not water'));
});

test('wait-for-fish requires a cast bobber', async (t) => {
  const { executorFor } = createHarness({
    entities: {},
    on: sinon.stub(),
    removeListener: sinon.stub()
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('wait-for-fish')({});

  t.true(result.content[0].text.includes('No fishing bobber found'));
});

test('wait-for-fish resolves when the bobber dips', async (t) => {
  const emitter = new EventEmitter();
  const bobber = { name: 'fishing_bobber', velocity: { y: 0 } };
  const mockBot = Object.assign(emitter, {
    entities: { 1: bobber }
  }) as unknown as Partial<mineflayer.Bot>;
  const { executorFor } = createHarness(mockBot);

  const pending = executorFor('wait-for-fish')({ timeout: 5 });
  // The tool subscribes after ToolFactory's async connection check, so wait
  // for the listener to attach before simulating the bite.
  await waitForListener(emitter, 'entityMoved');
  bobber.velocity.y = -0.5;
  emitter.emit('entityMoved', bobber);

  const result = await pending;
  t.true(result.content[0].text.includes('Fish on the hook'));
});

test('wait-for-fish ignores bobber movement that is not a bite', async (t) => {
  const emitter = new EventEmitter();
  const bobber = { name: 'fishing_bobber', velocity: { y: -0.01 } };
  const mockBot = Object.assign(emitter, {
    entities: { 1: bobber }
  }) as unknown as Partial<mineflayer.Bot>;
  const { executorFor } = createHarness(mockBot);

  const pending = executorFor('wait-for-fish')({ timeout: 0.05 });
  await waitForListener(emitter, 'entityMoved');
  emitter.emit('entityMoved', bobber);

  const result = await pending;
  t.true(result.content[0].text.includes('No bite detected within timeout'));
});

test('eat requires an item in hand', async (t) => {
  const { executorFor } = createHarness({ heldItem: null } as Partial<mineflayer.Bot>);

  const result = await executorFor('eat')({});

  t.true(result.content[0].text.includes('No item in hand'));
});

test('eat consumes the held item via bot.consume', async (t) => {
  const consume = sinon.stub().resolves();
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'golden_apple', count: 1, type: 1 }),
    consume
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('eat')({});

  t.true(consume.calledOnce);
  t.true(result.content[0].text.includes('Consumed golden_apple'));
});

test('eat reports why consuming failed', async (t) => {
  const { executorFor } = createHarness({
    heldItem: createMockItem({ name: 'bread', count: 1, type: 1 }),
    consume: sinon.stub().rejects(new Error('food is full'))
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('eat')({});

  t.true(result.content[0].text.includes('Failed to eat: food is full'));
});

test('toss-item reports a missing item', async (t) => {
  const { executorFor } = createHarness({
    inventory: { items: () => [] }
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('toss-item')({ itemName: 'dirt' });

  t.true(result.content[0].text.includes("Couldn't find 'dirt' in inventory"));
});

test('toss-item tosses the whole stack by default', async (t) => {
  const toss = sinon.stub().resolves();
  const { executorFor } = createHarness({
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 12, type: 3, metadata: 0 })] },
    toss
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('toss-item')({ itemName: 'dirt' });

  t.deepEqual(toss.firstCall.args, [3, 0, 12]);
  t.true(result.content[0].text.includes('Tossed 12 x dirt'));
});

test('toss-item tosses the requested count', async (t) => {
  const toss = sinon.stub().resolves();
  const { executorFor } = createHarness({
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 12, type: 3, metadata: 0 })] },
    toss
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('toss-item')({ itemName: 'dirt', count: 4 });

  t.is(toss.firstCall.args[2], 4);
  t.true(result.content[0].text.includes('Tossed 4 x dirt'));
});

test('deposit-to-chest rejects a block that is not a container', async (t) => {
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock('stone'))
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'dirt'
  });

  t.true(result.content[0].text.includes('No container found at (5, 60, 5)'));
});

test('deposit-to-chest accepts a barrel', async (t) => {
  const container = { deposit: sinon.stub().resolves(), close: sinon.stub().resolves() };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock('barrel')),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container),
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 8, type: 3, metadata: 0 })] }
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'dirt'
  });

  t.deepEqual(container.deposit.firstCall.args, [3, 0, 8]);
  t.true(result.content[0].text.includes('Deposited 8 x dirt into barrel'));
});

test('deposit-to-chest clamps the count to the stack it holds', async (t) => {
  const container = { deposit: sinon.stub().resolves(), close: sinon.stub().resolves() };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container),
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 3, type: 3, metadata: 0 })] }
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'dirt', count: 64
  });

  t.is(container.deposit.firstCall.args[2], 3);
  t.true(result.content[0].text.includes('Deposited 3 x dirt'));
});

test('deposit-to-chest closes the container when depositing fails', async (t) => {
  const container = {
    deposit: sinon.stub().rejects(new Error('container is full')),
    close: sinon.stub().resolves()
  };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container),
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 8, type: 3, metadata: 0 })] }
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'dirt'
  });

  t.true(container.close.calledOnce);
  t.true(result.content[0].text.includes('Failed to deposit: container is full'));
});

test('deposit-to-chest releases a window left open by open-container', async (t) => {
  const closeWindow = sinon.stub().resolves();
  const container = { deposit: sinon.stub().resolves(), close: sinon.stub().resolves() };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: { type: 'minecraft:generic_9x3' },
    closeWindow,
    openContainer: sinon.stub().resolves(container),
    inventory: { items: () => [createMockItem({ name: 'dirt', count: 8, type: 3, metadata: 0 })] }
  } as unknown as Partial<mineflayer.Bot>);

  await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'dirt'
  });

  t.true(closeWindow.calledOnce);
});

test('deposit-to-chest reports a missing inventory item without opening the container', async (t) => {
  const openContainer = sinon.stub().resolves({ close: sinon.stub().resolves() });
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    openContainer,
    inventory: { items: () => [] }
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('deposit-to-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'diamond'
  });

  t.false(openContainer.called);
  t.true(result.content[0].text.includes("Couldn't find 'diamond' in inventory"));
});

test('withdraw-from-chest takes items out of the container', async (t) => {
  const container = {
    containerItems: () => [createMockItem({ name: 'iron_ingot', count: 5, type: 7, metadata: 0 })],
    withdraw: sinon.stub().resolves(),
    close: sinon.stub().resolves()
  };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('withdraw-from-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'iron'
  });

  t.deepEqual(container.withdraw.firstCall.args, [7, 0, 5]);
  t.true(result.content[0].text.includes('Withdrew 5 x iron_ingot from chest'));
});

test('withdraw-from-chest reports an item the container does not hold', async (t) => {
  const container = {
    containerItems: () => [],
    withdraw: sinon.stub().resolves(),
    close: sinon.stub().resolves()
  };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('withdraw-from-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'diamond'
  });

  t.false(container.withdraw.called);
  t.true(container.close.calledOnce);
  t.true(result.content[0].text.includes("Couldn't find 'diamond' in chest"));
});

test('withdraw-from-chest clamps the count to what the container holds', async (t) => {
  const container = {
    containerItems: () => [createMockItem({ name: 'coal', count: 2, type: 9, metadata: 0 })],
    withdraw: sinon.stub().resolves(),
    close: sinon.stub().resolves()
  };
  const { executorFor } = createHarness({
    blockAt: sinon.stub().returns(createContainerBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('withdraw-from-chest')({
    chestX: 5, chestY: 60, chestZ: 5, itemName: 'coal', count: 64
  });

  t.is(container.withdraw.firstCall.args[2], 2);
  t.true(result.content[0].text.includes('Withdrew 2 x coal'));
});
