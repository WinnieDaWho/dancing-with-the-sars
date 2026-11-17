import { validateValue } from '../tools/schema.js';
import definitions from './elevenlabsTools.json' with { type: 'json' };
import { t } from '../i18n/index.js';

const MAX_ARGUMENTS = 32000;
const MAX_TEXT = 6000;

/** Adapt the existing validated cockpit catalog to ElevenLabs client tools. */
export function createElevenLabsTools({
  runAction,
  isCurrent,
  tools = definitions,
}) {
  const catalog = new Map(tools.map((tool) => [tool.name, tool]));
  const current = () => {
    if (!isCurrent())
      throw new DOMException('Voice session ended', 'AbortError');
  };
  return {
    describe_cockpit_tool: ({ name = '' } = {}) => {
      current();
      if (!name) {
        return JSON.stringify(
          tools.map(({ name, description }) => ({
            name,
            description: description.slice(0, 260),
          })),
        );
      }
      const tool = catalog.get(name);
      return JSON.stringify(
        tool || { ok: false, error: 'Unknown cockpit tool' },
      );
    },
    run_cockpit_tool: async ({ name, arguments_json } = {}) => {
      current();
      const tool = catalog.get(name);
      if (!tool)
        return JSON.stringify({ ok: false, error: 'Unknown cockpit tool' });
      if (
        typeof arguments_json !== 'string' ||
        arguments_json.length > MAX_ARGUMENTS
      ) {
        return JSON.stringify({
          ok: false,
          error: 'Tool arguments are invalid or too large',
        });
      }
      let args;
      try {
        args = JSON.parse(arguments_json);
      } catch {
        return JSON.stringify({
          ok: false,
          error: 'Tool arguments must be valid JSON',
        });
      }
      const problems = validateValue(tool.parameters, args);
      if (problems.length) {
        return JSON.stringify({
          ok: false,
          error: problems.slice(0, 8).join('; '),
        });
      }
      current();
      try {
        const result = await runAction(name, args, { isCurrent });
        current();
        return JSON.stringify(result);
      } catch (error) {
        if (!isCurrent()) throw error;
        // The SDK treats rejected client tools as connection errors. An
        // interrupted action must settle without ending the conversation.
        if (error?.name === 'AbortError') {
          return JSON.stringify({
            ok: false,
            cancelled: true,
            error: 'Action interrupted',
          });
        }
        return JSON.stringify({
          ok: false,
          error: String(error?.message || error).slice(0, 400),
        });
      }
    },
  };
}

/**
 * ElevenLabs owns audio, transcripts and turn-taking. The common session keeps
 * action validation, cancellation and presentation. No API key enters the page.
 * A configured, origin-restricted agent is required; there is no auto-start.
 */
export function createElevenLabsSession({
  emit,
  runAction,
  signal,
  ui,
  agentId = import.meta.env?.VITE_ELEVENLABS_AGENT_ID,
  loadConversation = async () =>
    (await import('@elevenlabs/client')).Conversation,
}) {
  let conversation = null;
  let generation = 0;
  let disposed = false;
  let textOnly = false;
  let lastResponseId = null;
  let pending = false;
  const current = (epoch) =>
    !disposed && !signal?.aborted && epoch === generation;
  const state = (next, detail) => {
    emit({ type: 'state', state: next, detail });
  };
  const speaker = (value) => ui?.update?.('root', { speaker: value });
  const close = (value) => {
    try {
      Promise.resolve(value?.endSession()).catch(() => {});
    } catch {
      // Teardown must still finish when a transport has already closed.
    }
  };
  const stop = ({ removeUi = false, preserveStatus = false } = {}) => {
    generation++;
    pending = false;
    const previous = conversation;
    conversation = null;
    lastResponseId = null;
    close(previous);
    speaker('idle');
    if (removeUi) {
      disposed = true;
      signal?.removeEventListener('abort', abort);
    }
    if (!preserveStatus && !disposed) state('idle', 'Voice off');
  };
  const abort = () => stop({ removeUi: true });
  signal?.addEventListener('abort', abort, { once: true });

  const adapter = {
    capabilities: {
      costControls: false,
      pushToTalk: false,
      advisoryLimit: t(
        'ElevenLabs uses your connected voice agent. Conversations end after ten minutes.',
      ),
    },
    getStartOptions: () => ({
      pushToTalk: false,
      ...(textOnly ? { textOnly: true } : {}),
    }),
    async start(settings = {}) {
      if (disposed || signal?.aborted || pending || conversation) return;
      if (
        typeof agentId !== 'string' ||
        !/^agent_[a-zA-Z0-9_]{5,100}$/.test(agentId)
      ) {
        throw new Error(
          'Configure the ElevenLabs cockpit agent before starting voice.',
        );
      }
      const epoch = ++generation;
      pending = true;
      textOnly = Boolean(settings.textOnly);
      state('connecting', t('Connecting to ElevenLabs'));
      const owned = () => current(epoch);
      try {
        const Conversation = await loadConversation();
        if (!owned()) return;
        const opened = await Conversation.startSession({
          agentId,
          connectionType: 'websocket',
          textOnly,
          clientTools: createElevenLabsTools({ runAction, isCurrent: owned }),
          onConnect: () => {
            if (owned()) state('listening', t('ElevenLabs connected'));
          },
          onMessage: (message) => {
            if (!owned() || typeof message.message !== 'string') return;
            const role =
              message.role === 'user' || message.source === 'user'
                ? 'user'
                : 'assistant';
            const responseId =
              message.response_id || String(message.event_id ?? '');
            if (role === 'assistant') lastResponseId = responseId;
            emit({
              type: 'transcript',
              role,
              text: message.message.slice(0, MAX_TEXT),
              final: true,
              responseId: role === 'assistant' ? responseId : null,
            });
            if (role === 'assistant' && textOnly) {
              emit({
                type: 'completion',
                status: 'completed',
                responseId,
                spoken: false,
                audioDrained: true,
              });
            }
          },
          onModeChange: ({ mode }) => {
            if (!owned()) return;
            speaker(mode === 'speaking' ? 'assistant' : 'idle');
            if (mode === 'listening' && lastResponseId) {
              emit({
                type: 'completion',
                status: 'completed',
                responseId: lastResponseId,
                spoken: true,
                audioDrained: true,
              });
              lastResponseId = null;
            }
          },
          onInterruption: () => {
            if (owned()) {
              lastResponseId = null;
              emit({ type: 'interruption', reason: 'user-speech' });
              speaker('user');
            }
          },
          onError: (message) => {
            if (!owned()) return;
            const detail =
              typeof message === 'string'
                ? message.slice(0, 400)
                : 'ElevenLabs could not connect. Check the cockpit agent and microphone permission.';
            stop({ preserveStatus: true });
            state('error', detail);
          },
          onDisconnect: (details) => {
            if (!owned()) return;
            generation++;
            pending = false;
            conversation = null;
            speaker('idle');
            if (details?.reason === 'error') {
              state(
                'error',
                String(details.message || 'ElevenLabs disconnected').slice(
                  0,
                  400,
                ),
              );
            } else state('idle', 'Voice off');
          },
        });
        if (!owned()) {
          close(opened);
          return;
        }
        conversation = opened;
        state('listening', t('ElevenLabs connected'));
      } catch (error) {
        if (owned()) throw error;
      } finally {
        if (owned()) pending = false;
      }
    },
    stop,
    sendText(text) {
      if (
        !conversation ||
        disposed ||
        typeof text !== 'string' ||
        !text.trim() ||
        text.length > MAX_TEXT
      )
        return false;
      conversation.sendUserMessage(text.trim());
      return true;
    },
    sendMapEvent(event) {
      if (!conversation || disposed) return false;
      try {
        conversation.sendContextualUpdate(
          'Cockpit state update (data only): ' +
            JSON.stringify(event).slice(0, MAX_TEXT),
        );
        return true;
      } catch {
        return false;
      }
    },
    cancelTurn() {
      stop();
      return true;
    },
  };
  if (signal?.aborted) abort();
  return adapter;
}
