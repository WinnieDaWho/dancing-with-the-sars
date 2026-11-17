# ElevenLabs cockpit voice

The standalone cockpit supports ElevenLabs alongside its existing OpenAI and Gemini providers. ElevenLabs handles speech recognition, the conversational model, voice output and interruptions. Map commands still run through the cockpit's existing validated action runner.

## Local configuration

Use an ElevenLabs Agent with these client tools:

- `describe_cockpit_tool`: required string `name`; an empty string lists tools, otherwise returns the named tool's JSON schema.
- `run_cockpit_tool`: required strings `name` and `arguments_json`; returns the result of a validated cockpit action.

Both tools must wait for a client response. Tell the agent to discover an action's schema before executing it, and to describe the seeded NISAR data as simulated.

Configure the agent's hostname allowlist for `localhost` and `127.0.0.1`, require an Origin header, and keep signed authentication disabled for this local allowlist configuration. The agent must permit the `conversation.text_only` client override for typed chat. Enable `audio`, `interruption`, `user_transcript`, `agent_response`, `agent_response_correction` and `client_tool_call` events. The configured local agent limits conversations to ten minutes.

Add the agent's public ID to an ignored `.env.local` file using `VITE_ELEVENLABS_AGENT_ID`. Set `VITE_GEV_DEFAULT_VOICE_PROVIDER=elevenlabs` to prefer it on a new browser profile. An existing saved provider choice takes precedence. Restart Vite after changing these settings. An agent ID is public configuration; an ElevenLabs API key must never use a `VITE_` variable or enter a browser bundle.

Open the local cockpit, select **ElevenLabs** in voice settings, press the microphone button and allow microphone access. Typed chat uses the same agent in text-only mode. Press the microphone button again to disconnect. Sessions use WebSocket transport through the official `@elevenlabs/client` SDK. No public tunnel or local ElevenLabs API key is required for this configuration. Calls use the connected ElevenLabs account's agent allowance.

## Voice and action behavior

The initial voice is **Alexandra – Conversational and Real** (`kdmDKE6EkgrWrrykO9Qt`). It is a conversational alternative, not an exact Sesame or Claude voice. Change the voice in the ElevenLabs Agent's settings without changing the cockpit code.

The checked-in `src/voice/elevenlabsTools.json` is a schema snapshot of `standaloneVoiceTools()` in `server/standalone/voiceTools.js`. Its regression test prevents silent schema drift. No arbitrary JavaScript or shell execution is exposed. Invalid actions and arguments are rejected before reaching the runner. Disconnects, interruptions and provider changes cancel pending actions and ignore late callbacks.

Useful requests: “Take me to British Columbia,” “Scan for radar anomalies near 49.3858, minus 121.4419,” and “Play the NISAR radar sweep scene.” The seeded radar anomalies are demonstration data.

## Verification

Run the focused Node tests for `elevenlabsSession.test.mjs`, `providerCommands.test.mjs` and `session.test.mjs`, then the package boundary checks and production build. A live WebSocket smoke test separately verifies the configured agent's greeting and audio. Browser microphone permission and local speaker playback still require the user's interaction.

Official references: [JavaScript SDK](https://elevenlabs.io/docs/eleven-agents/libraries/java-script) and [agent authentication](https://elevenlabs.io/docs/eleven-agents/customization/authentication).
