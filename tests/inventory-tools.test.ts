import test from 'ava';
import sinon from 'sinon';
import { registerInventoryTools } from '../src/tools/inventory-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import { BotConnection } from '../src/bot-connection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';

test('registerInventoryTools registers list-inventory tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const listInventoryCall = toolCalls.find(call => call.args[0] === 'list-inventory');

  t.truthy(listInventoryCall);
  t.is(listInventoryCall!.args[1], 'List all items in the bot\'s inventory');
});

test('registerInventoryTools registers equip-item tool', (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const mockBot = {} as Partial<mineflayer.Bot>;
  const getBot = () => mockBot as mineflayer.Bot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const equipItemCall = toolCalls.find(call => call.args[0] === 'equip-item');

  t.truthy(equipItemCall);
  t.is(equipItemCall!.args[1], 'Equip a specific item');
});

test('list-inventory returns empty when no items', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    inventory: {
      items: () => []
    }
  } as unknown as mineflayer.Bot;
  const getBot = () => mockBot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const listInventoryCall = toolCalls.find(call => call.args[0] === 'list-inventory');
  const executor = listInventoryCall!.args[3];

  const result = await executor({});

  t.true(result.content[0].text.includes('empty'));
});

test('list-inventory returns items with counts', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    inventory: {
      items: () => [
        { name: 'diamond_pickaxe', count: 1, slot: 0 },
        { name: 'cobblestone', count: 64, slot: 1 }
      ]
    }
  } as unknown as mineflayer.Bot;
  const getBot = () => mockBot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const listInventoryCall = toolCalls.find(call => call.args[0] === 'list-inventory');
  const executor = listInventoryCall!.args[3];

  const result = await executor({});

  t.true(result.content[0].text.includes('diamond_pickaxe'));
  t.true(result.content[0].text.includes('cobblestone'));
  t.true(result.content[0].text.includes('64'));
});

test('equip-item calls bot.equip', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const equipStub = sinon.stub().resolves();
  const mockBot = {
    inventory: {
      items: () => [
        { name: 'diamond_sword', type: 1 }
      ]
    },
    equip: equipStub
  } as unknown as mineflayer.Bot;
  const getBot = () => mockBot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const equipItemCall = toolCalls.find(call => call.args[0] === 'equip-item');
  const executor = equipItemCall!.args[3];

  const result = await executor({ itemName: 'diamond_sword', destination: 'hand' });

  t.true(equipStub.calledOnce);
  t.true(result.content[0].text.includes('Equipped'));
  t.true(result.content[0].text.includes('diamond_sword'));
});

test('equip-item returns message when item not found', async (t) => {
  const mockServer = {
    tool: sinon.stub()
  } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);

  const mockBot = {
    inventory: {
      items: () => []
    }
  } as unknown as mineflayer.Bot;
  const getBot = () => mockBot;

  registerInventoryTools(factory, getBot);

  const toolCalls = (mockServer.tool as sinon.SinonStub).getCalls();
  const equipItemCall = toolCalls.find(call => call.args[0] === 'equip-item');
  const executor = equipItemCall!.args[3];

  const result = await executor({ itemName: 'diamond_sword', destination: 'hand' });

  t.true(result.content[0].text.includes('Couldn\'t find'));
});

const createContainerHarness = (botFields: Partial<mineflayer.Bot>) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const getBot = () => botFields as mineflayer.Bot;

  registerInventoryTools(factory, getBot);

  const executorFor = (name: string) => {
    const call = (mockServer.tool as sinon.SinonStub)
      .getCalls()
      .find(c => c.args[0] === name);
    return call!.args[3] as (args: unknown) => Promise<{ content: { text: string }[] }>;
  };

  return { executorFor };
};

const createChestBlock = (name = 'chest') => ({
  name,
  position: { x: 5, y: 60, z: 5 }
});

test('open-container reports when there is no block at the position', async (t) => {
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(null)
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });

  t.true(result.content[0].text.includes('No block information found at position (5, 60, 5)'));
});

test('open-container lists the contents of the container it opens', async (t) => {
  const container = {
    type: 'minecraft:generic_9x3',
    containerItems: () => [
      { name: 'oak_log', count: 12 },
      { name: 'coal', count: 3 }
    ]
  };
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(createChestBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });
  const text = result.content[0].text;

  t.true(text.includes('Opened container (type: minecraft:generic_9x3) at position (5, 60, 5)'));
  t.true(text.includes('Contents: oak_log x 12, coal x 3'));
});

test('open-container reports an empty container', async (t) => {
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(createChestBlock()),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves({ type: 'chest', containerItems: () => [] })
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });

  t.true(result.content[0].text.includes('Contents: empty'));
});

test('open-container closes a window that was already open', async (t) => {
  const closeWindow = sinon.stub().resolves();
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(createChestBlock()),
    currentWindow: { type: 'minecraft:generic_9x6' },
    closeWindow,
    openContainer: sinon.stub().resolves({ type: 'chest', containerItems: () => [] })
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });

  t.true(closeWindow.calledOnce);
  t.true(result.content[0].text.includes('Closed the previously open minecraft:generic_9x6 window first'));
});

test('open-container notes when the block is not a known storage block', async (t) => {
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(createChestBlock('enchanting_table')),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves({ type: 'enchant', containerItems: () => [] })
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });

  t.true(result.content[0].text.includes('Note: enchanting_table is not a known storage block'));
});

test('open-container omits the storage note for a barrel', async (t) => {
  const { executorFor } = createContainerHarness({
    blockAt: sinon.stub().returns(createChestBlock('barrel')),
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves({ type: 'barrel', containerItems: () => [] })
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('open-container')({ x: 5, y: 60, z: 5 });

  t.false(result.content[0].text.includes('not a known storage block'));
});

test('close-window reports when nothing is open', async (t) => {
  const { executorFor } = createContainerHarness({
    currentWindow: null,
    closeWindow: sinon.stub().resolves()
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('close-window')({});

  t.true(result.content[0].text.includes('The bot does not have a window currently open'));
});

test('close-window closes the open window', async (t) => {
  const closeWindow = sinon.stub().resolves();
  const { executorFor } = createContainerHarness({
    currentWindow: { type: 'minecraft:generic_9x3' },
    closeWindow
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('close-window')({});

  t.true(closeWindow.calledOnce);
  t.true(result.content[0].text.includes('Closed bot window (type: minecraft:generic_9x3)'));
});
