import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createElevenLabsSession,
  createElevenLabsTools,
} from './elevenlabsSession.js';
import { createVoiceSession } from './session.js';

const AGENT = 'agent_test_cockpit';
const fixture = [
  {
    name: 'scan_nisar_radar',
    description: 'Scan the demonstration radar areas.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        latitude: { type: 'number', minimum: -90, maximum: 90 },
        longitude: { type: 'number', minimum: -180, maximum: 180 },
      },
      required: ['latitude', 'longitude'],
    },
  },
];

test('only known cockpit tools with valid bounded arguments reach the runner', async () => {
  const calls = [];
  const tools = createElevenLabsTools({
    tools: fixture,
    isCurrent: () => true,
    runAction: async (name, args) => {
      calls.push([name, args]);
      return { ok: true, data_mode: 'simulated' };
    },
  });
  for (const params of [
    { name: 'unknown', arguments_json: '{}' },
    { name: 'scan_nisar_radar', arguments_json: '{broken' },
    {
      name: 'scan_nisar_radar',
      arguments_json: JSON.stringify({ latitude: 99, longitude: 0 }),
    },
    {
      name: 'scan_nisar_radar',
      arguments_json: JSON.stringify({
        latitude: 49,
        longitude: -121,
        unexpected: true,
      }),
    },
    { name: 'scan_nisar_radar', arguments_json: 'x'.repeat(32001) },
  ]) {
    assert.equal(JSON.parse(await tools.run_cockpit_tool(params)).ok, false);
  }
  assert.equal(calls.length, 0);
  const result = JSON.parse(
    await tools.run_cockpit_tool({
      name: 'scan_nisar_radar',
      arguments_json: '{"latitude":49.3858,"longitude":-121.4419}',
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.data_mode, 'simulated');
  assert.deepEqual(calls[0], [
    'scan_nisar_radar',
    { latitude: 49.3858, longitude: -121.4419 },
  ]);
});

test('tool discovery supplies exact schemas and refuses work after disconnect', async () => {
  let active = true;
  const tools = createElevenLabsTools({
    tools: fixture,
    isCurrent: () => active,
    runAction: () => assert.fail(),
  });
  assert.equal(
    JSON.parse(tools.describe_cockpit_tool({ name: '' }))[0].name,
    'scan_nisar_radar',
  );
  assert.deepEqual(
    JSON.parse(tools.describe_cockpit_tool({ name: 'scan_nisar_radar' }))
      .parameters,
    fixture[0].parameters,
  );
  active = false;
  assert.throws(() => tools.describe_cockpit_tool({ name: '' }), {
    name: 'AbortError',
  });
  await assert.rejects(
    tools.run_cockpit_tool({ name: 'scan_nisar_radar', arguments_json: '{}' }),
    { name: 'AbortError' },
  );
});

test('stopping during SDK startup disposes a late transport and ignores late callbacks', async () => {
  let resolve;
  let callbacks;
  let closed = 0;
  const events = [];
  const session = createElevenLabsSession({
    agentId: AGENT,
    emit: (event) => events.push(event),
    runAction: () => assert.fail(),
    loadConversation: async () => ({
      startSession: (options) => {
        callbacks = options;
        return new Promise((done) => {
          resolve = done;
        });
      },
    }),
  });
  const starting = session.start();
  await new Promise((done) => setImmediate(done));
  session.stop();
  const before = events.length;
  callbacks.onMessage({ role: 'agent', message: 'late message' });
  callbacks.onConnect();
  resolve({
    endSession: async () => {
      closed++;
    },
  });
  await starting;
  assert.equal(closed, 1);
  assert.equal(events.length, before);
});

test('text sessions are explicitly silent and preserve the shared transcript format', async () => {
  let callbacks;
  let sent;
  const events = [];
  const session = createElevenLabsSession({
    agentId: AGENT,
    emit: (event) => events.push(event),
    runAction: () => assert.fail(),
    loadConversation: async () => ({
      startSession: async (options) => {
        callbacks = options;
        assert.equal(options.textOnly, true);
        assert.equal(options.connectionType, 'websocket');
        options.onConnect();
        return {
          sendUserMessage: (text) => {
            sent = text;
          },
          endSession: async () => {},
        };
      },
    }),
  });
  await session.start({ textOnly: true });
  assert.equal(session.sendText('  Hello  '), true);
  assert.equal(sent, 'Hello');
  callbacks.onMessage({ role: 'agent', message: 'Hello Winston', event_id: 1 });
  const transcript = events.find((event) => event.type === 'transcript');
  assert.equal(transcript.role, 'assistant');
  assert.equal(transcript.final, true);
  assert.equal(
    events.find((event) => event.type === 'completion').spoken,
    false,
  );
  session.stop();
});

test('provider errors before startup resolves cannot leave an active microphone session', async () => {
  let closed = 0;
  const events = [];
  const session = createVoiceSession({
    runner: async () => ({ ok: true }),
    createAdapter: (hooks) =>
      createElevenLabsSession({
        ...hooks,
        agentId: AGENT,
        loadConversation: async () => ({
          startSession: async (options) => {
            options.onError('Connection refused');
            return {
              endSession: async () => {
                closed++;
              },
            };
          },
        }),
      }),
  });
  session.subscribe((event) => events.push(event));
  await session.start();
  assert.equal(session.state, 'error');
  assert.equal(closed, 1);
  assert.equal(session.isActive(), false);
  assert.equal(events.at(-1).detail, 'Connection refused');
  session.destroy();
});

test('interruptions revoke in-flight map actions through the common session', async () => {
  let callbacks;
  let finish;
  let observedSignal;
  const session = createVoiceSession({
    runner: async (_name, _args, { signal }) => {
      observedSignal = signal;
      return new Promise((done) => {
        finish = done;
      });
    },
    createAdapter: (hooks) =>
      createElevenLabsSession({
        ...hooks,
        agentId: AGENT,
        loadConversation: async () => ({
          startSession: async (options) => {
            callbacks = options;
            options.onConnect();
            return { endSession: async () => {} };
          },
        }),
      }),
  });
  await session.start();
  const action = callbacks.clientTools.run_cockpit_tool({
    name: 'zoom_to_globe',
    arguments_json: '{}',
  });
  await new Promise((done) => setImmediate(done));
  assert.ok(observedSignal);
  callbacks.onInterruption();
  assert.equal(observedSignal.aborted, true);
  finish({ ok: true });
  assert.deepEqual(JSON.parse(await action), {
    ok: false,
    cancelled: true,
    error: 'Action interrupted',
  });
  assert.equal(session.isActive(), true);
  session.destroy();
});

test('a missing agent configuration never loads or starts the audio SDK', async () => {
  const session = createElevenLabsSession({
    agentId: '',
    emit: () => {},
    runAction: () => assert.fail(),
    loadConversation: () => assert.fail('No SDK acquisition without an agent'),
  });
  await assert.rejects(session.start(), /Configure the ElevenLabs/);
  session.stop({ removeUi: true });
});

test('ElevenLabs discovery stays aligned with the native standalone tool schemas', async () => {
  const { standaloneVoiceTools } =
    await import('../../server/standalone/voiceTools.js');
  const { default: snapshot } = await import('./elevenlabsTools.json', {
    with: { type: 'json' },
  });
  assert.deepEqual(snapshot, standaloneVoiceTools());
});
