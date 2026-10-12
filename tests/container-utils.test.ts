import test from 'ava';
import sinon from 'sinon';
import { Vec3 } from 'vec3';
import {
  closeOpenWindow,
  findContainerBlock,
  isContainerBlock,
  withContainer
} from '../src/tools/container-utils.js';
import type mineflayer from 'mineflayer';
import type { Block } from 'prismarine-block';

const createMockBlock = (name: string): Block =>
  ({ name, position: new Vec3(1, 2, 3) }) as unknown as Block;

test('isContainerBlock accepts known storage blocks', (t) => {
  t.true(isContainerBlock('chest'));
  t.true(isContainerBlock('trapped_chest'));
  t.true(isContainerBlock('ender_chest'));
  t.true(isContainerBlock('barrel'));
  t.true(isContainerBlock('hopper'));
  t.true(isContainerBlock('dispenser'));
  t.true(isContainerBlock('dropper'));
});

test('isContainerBlock accepts every shulker box colour variant', (t) => {
  t.true(isContainerBlock('shulker_box'));
  t.true(isContainerBlock('red_shulker_box'));
  t.true(isContainerBlock('light_blue_shulker_box'));
});

test('isContainerBlock rejects non-storage blocks', (t) => {
  t.false(isContainerBlock('stone'));
  t.false(isContainerBlock('crafting_table'));
  t.false(isContainerBlock('furnace'));
});

test('findContainerBlock returns the block when it is a container', (t) => {
  const block = createMockBlock('barrel');
  const mockBot = { blockAt: sinon.stub().returns(block) } as Partial<mineflayer.Bot>;

  t.is(findContainerBlock(mockBot as mineflayer.Bot, 1, 2, 3), block);
});

test('findContainerBlock returns null when there is no block', (t) => {
  const mockBot = { blockAt: sinon.stub().returns(null) } as Partial<mineflayer.Bot>;

  t.is(findContainerBlock(mockBot as mineflayer.Bot, 1, 2, 3), null);
});

test('findContainerBlock returns null when the block is not a container', (t) => {
  const mockBot = { blockAt: sinon.stub().returns(createMockBlock('stone')) } as Partial<mineflayer.Bot>;

  t.is(findContainerBlock(mockBot as mineflayer.Bot, 1, 2, 3), null);
});

test('findContainerBlock looks up the requested coordinates', (t) => {
  const blockAt = sinon.stub().returns(createMockBlock('chest'));
  const mockBot = { blockAt } as Partial<mineflayer.Bot>;

  findContainerBlock(mockBot as mineflayer.Bot, 10, -4, 72);

  t.deepEqual(blockAt.firstCall.args[0], new Vec3(10, -4, 72));
});

test('closeOpenWindow returns null when no window is open', async (t) => {
  const closeWindow = sinon.stub().resolves();
  const mockBot = { currentWindow: null, closeWindow } as Partial<mineflayer.Bot>;

  t.is(await closeOpenWindow(mockBot as mineflayer.Bot), null);
  t.false(closeWindow.called);
});

test('closeOpenWindow closes the open window and reports its type', async (t) => {
  const closeWindow = sinon.stub().resolves();
  const openWindow = { type: 'minecraft:generic_9x3' };
  const mockBot = { currentWindow: openWindow, closeWindow } as unknown as Partial<mineflayer.Bot>;

  t.is(await closeOpenWindow(mockBot as mineflayer.Bot), 'minecraft:generic_9x3');
  t.true(closeWindow.calledOnceWith(openWindow as never));
});

test('closeOpenWindow stringifies a numeric window type', async (t) => {
  const mockBot = {
    currentWindow: { type: 2 },
    closeWindow: sinon.stub().resolves()
  } as unknown as Partial<mineflayer.Bot>;

  t.is(await closeOpenWindow(mockBot as mineflayer.Bot), '2');
});

test('closeOpenWindow reports unknown when the window has no type', async (t) => {
  const mockBot = {
    currentWindow: {},
    closeWindow: sinon.stub().resolves()
  } as unknown as Partial<mineflayer.Bot>;

  t.is(await closeOpenWindow(mockBot as mineflayer.Bot), 'unknown');
});

test('closeOpenWindow swallows a close failure', async (t) => {
  const mockBot = {
    currentWindow: { type: 'chest' },
    closeWindow: sinon.stub().rejects(new Error('already closed'))
  } as unknown as Partial<mineflayer.Bot>;

  t.is(await closeOpenWindow(mockBot as mineflayer.Bot), 'chest');
});

test('withContainer closes a stale window before opening the container', async (t) => {
  const order: string[] = [];
  const closeWindow = sinon.stub().callsFake(async () => { order.push('close-stale'); });
  const container = { close: sinon.stub().callsFake(async () => { order.push('close-container'); }) };
  const openContainer = sinon.stub().callsFake(async () => { order.push('open'); return container; });
  const mockBot = {
    currentWindow: { type: 'chest' },
    closeWindow,
    openContainer
  } as unknown as Partial<mineflayer.Bot>;

  await withContainer(mockBot as mineflayer.Bot, createMockBlock('chest'), async () => {
    order.push('operation');
  });

  t.deepEqual(order, ['close-stale', 'open', 'operation', 'close-container']);
});

test('withContainer returns the operation result', async (t) => {
  const container = { close: sinon.stub().resolves() };
  const mockBot = {
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>;

  const result = await withContainer(
    mockBot as mineflayer.Bot,
    createMockBlock('chest'),
    async () => 'done'
  );

  t.is(result, 'done');
  t.true(container.close.calledOnce);
});

test('withContainer closes the container when the operation throws', async (t) => {
  const container = { close: sinon.stub().resolves() };
  const mockBot = {
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>;

  await t.throwsAsync(
    withContainer(mockBot as mineflayer.Bot, createMockBlock('chest'), async () => {
      throw new Error('deposit failed');
    }),
    { message: 'deposit failed' }
  );

  t.true(container.close.calledOnce);
});

test('withContainer ignores a failure while closing the container', async (t) => {
  const container = { close: sinon.stub().rejects(new Error('close failed')) };
  const mockBot = {
    currentWindow: null,
    closeWindow: sinon.stub().resolves(),
    openContainer: sinon.stub().resolves(container)
  } as unknown as Partial<mineflayer.Bot>;

  t.is(
    await withContainer(mockBot as mineflayer.Bot, createMockBlock('chest'), async () => 'ok'),
    'ok'
  );
});
