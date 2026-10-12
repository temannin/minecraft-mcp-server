import test from 'ava';
import sinon from 'sinon';
import { Vec3 } from 'vec3';
import { registerBedTools } from '../src/tools/bed-tools.js';
import { ToolFactory } from '../src/tool-factory.js';
import { BotConnection } from '../src/bot-connection.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type mineflayer from 'mineflayer';
import type { Block } from 'prismarine-block';

const createHarness = (botFields: Partial<mineflayer.Bot> = {}) => {
  const mockServer = { tool: sinon.stub() } as unknown as McpServer;
  const mockConnection = {
    checkConnectionAndReconnect: sinon.stub().resolves({ connected: true })
  } as unknown as BotConnection;
  const factory = new ToolFactory(mockServer, mockConnection);
  const getBot = () => botFields as mineflayer.Bot;

  registerBedTools(factory, getBot);

  const executorFor = (name: string) => {
    const call = (mockServer.tool as sinon.SinonStub)
      .getCalls()
      .find(c => c.args[0] === name);
    return call!.args[3] as (args: unknown) => Promise<{ content: { text: string }[] }>;
  };

  return { mockServer, executorFor };
};

const createBedBlock = (): Block =>
  ({ name: 'red_bed', position: new Vec3(10, 64, -20) }) as unknown as Block;

test('registerBedTools registers sleep-bed tool', (t) => {
  const { mockServer } = createHarness();

  const call = (mockServer.tool as sinon.SinonStub)
    .getCalls()
    .find(c => c.args[0] === 'sleep-bed');

  t.truthy(call);
  t.is(call!.args[1], 'Find a bed block nearby max distance, then make the bot sleep in bed');
});

test('registerBedTools registers wake-up tool', (t) => {
  const { mockServer } = createHarness();

  const call = (mockServer.tool as sinon.SinonStub)
    .getCalls()
    .find(c => c.args[0] === 'wake-up');

  t.truthy(call);
  t.is(call!.args[1], 'Wake the bot up from bed');
});

test('sleep-bed returns a message when no bed is nearby', async (t) => {
  const { executorFor } = createHarness({
    findBlock: sinon.stub().returns(null),
    isABed: sinon.stub().returns(false)
  } as Partial<mineflayer.Bot>);

  const result = await executorFor('sleep-bed')({ maxDistance: 8 });

  t.true(result.content[0].text.includes('No bed found within 8 blocks'));
});

test('sleep-bed sleeps in the bed it finds', async (t) => {
  const bed = createBedBlock();
  const sleep = sinon.stub().resolves();
  const { executorFor } = createHarness({
    findBlock: sinon.stub().returns(bed),
    isABed: sinon.stub().returns(true),
    sleep
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('sleep-bed')({ maxDistance: 16 });

  t.true(sleep.calledOnceWith(bed));
  t.true(result.content[0].text.includes('Successfully sleeping in bed at (10, 64, -20)'));
});

test('sleep-bed passes maxDistance through to findBlock', async (t) => {
  const findBlock = sinon.stub().returns(createBedBlock());
  const { executorFor } = createHarness({
    findBlock,
    isABed: sinon.stub().returns(true),
    sleep: sinon.stub().resolves()
  } as unknown as Partial<mineflayer.Bot>);

  await executorFor('sleep-bed')({ maxDistance: 42 });

  t.is(findBlock.firstCall.args[0].maxDistance, 42);
});

test('sleep-bed defaults maxDistance to 16', async (t) => {
  const findBlock = sinon.stub().returns(null);
  const { executorFor } = createHarness({
    findBlock,
    isABed: sinon.stub().returns(false)
  } as Partial<mineflayer.Bot>);

  const result = await executorFor('sleep-bed')({});

  t.is(findBlock.firstCall.args[0].maxDistance, 16);
  t.true(result.content[0].text.includes('within 16 blocks'));
});

test('sleep-bed reports why sleeping failed', async (t) => {
  const { executorFor } = createHarness({
    findBlock: sinon.stub().returns(createBedBlock()),
    isABed: sinon.stub().returns(true),
    sleep: sinon.stub().rejects(new Error('it is not night'))
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('sleep-bed')({ maxDistance: 16 });

  t.true(result.content[0].text.includes('Failed to sleep: it is not night'));
});

test('sleep-bed matches beds using isABed', async (t) => {
  const isABed = sinon.stub().returns(true);
  const findBlock = sinon.stub().returns(createBedBlock());
  const { executorFor } = createHarness({
    findBlock,
    isABed,
    sleep: sinon.stub().resolves()
  } as unknown as Partial<mineflayer.Bot>);

  await executorFor('sleep-bed')({ maxDistance: 16 });

  const candidate = createBedBlock();
  t.true(findBlock.firstCall.args[0].matching(candidate));
  t.true(isABed.calledWith(candidate));
});

test('wake-up wakes the bot', async (t) => {
  const wake = sinon.stub().resolves();
  const { executorFor } = createHarness({ wake } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('wake-up')({});

  t.true(wake.calledOnce);
  t.true(result.content[0].text.includes('Successfully woke up'));
});

test('wake-up reports why waking failed', async (t) => {
  const { executorFor } = createHarness({
    wake: sinon.stub().rejects(new Error('not sleeping'))
  } as unknown as Partial<mineflayer.Bot>);

  const result = await executorFor('wake-up')({});

  t.true(result.content[0].text.includes('Error waking up: not sleeping'));
});
