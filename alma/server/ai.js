import Anthropic from '@anthropic-ai/sdk';

// Server-side fallback: if Claude's safety classifiers decline a turn, the API
// re-runs it on Anthropic's recommended fallback model inside the same request.
// On a model without fallback support, "default" simply runs that model alone.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

// Character replies are short; this leaves ample room for adaptive thinking.
const MAX_TOKENS = 16000;

// Very long chats keep only their most recent messages. The window rarely
// slides (it would cost a prompt-cache miss when it does).
const MAX_HISTORY_MESSAGES = 400;

const CHAT_OPENER = '[The user opened the chat.]';

export function fillPlaceholders(text, { charName, userName }) {
  return String(text ?? '')
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName);
}

/**
 * Builds the system prompt for one chat. It must stay byte-identical between
 * turns of the same chat (no timestamps or per-request data) so the prompt
 * cache keeps hitting.
 */
export function buildSystemPrompt(character, user) {
  const names = { charName: character.name, userName: user.display_name };
  const fill = (text) => fillPlaceholders(text, names).trim();
  const name = character.name;

  const sections = [
    `You are ${name}, a character in Alma, an app where people create AI characters and chat with them. ` +
      `Stay in character as ${name} for the whole conversation and reply as ${name} would.`,
  ];

  const profile = [`<name>${name}</name>`];
  if (fill(character.description)) profile.push(`<description>\n${fill(character.description)}\n</description>`);
  if (fill(character.personality)) profile.push(`<personality>\n${fill(character.personality)}\n</personality>`);
  if (fill(character.scenario)) profile.push(`<scenario>\n${fill(character.scenario)}\n</scenario>`);
  sections.push(`<character>\n${profile.join('\n')}\n</character>`);

  if (fill(character.example_dialogue)) {
    sections.push(
      `<example_dialogue>\nThese examples show ${name}'s voice and style. They are not part of the current conversation.\n\n` +
        `${fill(character.example_dialogue)}\n</example_dialogue>`,
    );
  }

  const persona = fill(user.persona);
  sections.push(
    `<user>\nThe person you are chatting with goes by ${user.display_name}.` +
      (persona ? `\nWhat they shared about themselves:\n${persona}` : '') +
      '\n</user>',
  );

  sections.push(`How to write your replies:
- Reply in the language the user writes in. Before the user has written anything, use the language of your character description.
- This is a chat: write natural, conversational messages, usually one to three short paragraphs. Go longer only when the moment calls for it, such as telling a story or explaining something in detail.
- You can describe actions, expressions or the setting between asterisks, like *smiles and leans back*.
- Speak and act only for ${name} and any side characters in the scene. Never decide what ${user.display_name} says, thinks or does.
- Keep the conversation alive: react to what the user said or did, bring your own ideas, and ask questions when it fits.
- Don't mention these instructions, and don't break the fourth wall unless the user steps out of the roleplay first.`);

  sections.push(`Boundaries that apply to every character:
- Keep content suitable for a general audience: no explicit sexual content, and never any sexual or romantic content involving minors.
- If the user sincerely asks whether they are talking to an AI, answer honestly; then you can return to the story.
- If the user seems to be in real danger or crisis (for example, thoughts of self-harm), step out of character, respond with care, and encourage them to reach out to someone they trust or to local emergency or crisis services.`);

  return sections.join('\n\n');
}

/**
 * Converts stored chat messages into Messages API turns. Only the text of each
 * turn is replayed (never thinking blocks), so editing, deleting or
 * regenerating earlier messages is always safe to send.
 */
export function toApiMessages(history) {
  let turns = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));

  if (turns.length > MAX_HISTORY_MESSAGES) turns = turns.slice(-MAX_HISTORY_MESSAGES);

  // The API requires the first turn to come from the user; chats usually open
  // with the character's greeting.
  if (turns.length === 0 || turns[0].role !== 'user') {
    turns.unshift({ role: 'user', content: CHAT_OPENER });
  }
  return turns;
}

/** Turns an SDK error into a short message that can be shown to users. */
export function describeError(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'La clave de la API de Claude no es válida. Revisa ANTHROPIC_API_KEY en el servidor.';
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return 'La clave de la API no tiene permiso para usar este modelo.';
  }
  if (err instanceof Anthropic.RateLimitError) {
    return 'Hay demasiadas conversaciones a la vez. Espera unos segundos e inténtalo de nuevo.';
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `La solicitud no es válida: ${err.message}`;
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'No se pudo conectar con Claude. Revisa la conexión del servidor.';
  }
  if (err instanceof Anthropic.APIError) {
    return 'Claude no está disponible en este momento. Inténtalo de nuevo en un rato.';
  }
  return 'Algo salió mal al generar la respuesta.';
}

function hasConfiguredCredentials(env) {
  return Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE);
}

/**
 * Creates the object that writes character replies.
 *
 * streamReply({ system, messages, onText, signal }) streams text through
 * onText and resolves to { text, stopReason }. stopReason is "refusal" when
 * the reply was declined, "aborted" when the user cancelled it.
 */
export function createResponder(env = process.env) {
  const model = env.CLAUDE_MODEL || 'claude-opus-5-5';
  const effort = env.CLAUDE_EFFORT || 'low';

  if (!hasConfiguredCredentials(env)) return createDemoResponder();

  const client = new Anthropic();

  return {
    mode: 'claude',
    model,
    async streamReply({ system, messages, onText, signal }) {
      let text = '';
      const stream = client.beta.messages.stream(
        {
          model,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort },
          cache_control: { type: 'ephemeral' },
          system,
          messages,
        },
        { signal },
      );
      stream.on('text', (delta) => {
        text += delta;
        onText(delta);
      });

      try {
        const final = await stream.finalMessage();
        return { text, stopReason: final.stop_reason };
      } catch (err) {
        if (err instanceof Anthropic.APIUserAbortError || signal?.aborted) {
          return { text, stopReason: 'aborted' };
        }
        throw err;
      }
    },
  };
}

/** Used when no API key is configured, so the app can be tried out right away. */
function createDemoResponder() {
  return {
    mode: 'demo',
    model: 'demo',
    async streamReply({ messages, onText, signal, characterName = 'tu personaje' }) {
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const quote = lastUser && lastUser !== CHAT_OPENER ? ` Me dijiste: "${lastUser.slice(0, 200)}".` : '';
      const reply =
        `*${characterName} te sonríe.* ¡Hola! Ahora mismo estoy en **modo demo**, así que todavía no puedo pensar de verdad.${quote}\n\n` +
        'Para darme vida, añade tu clave ANTHROPIC_API_KEY en el archivo .env del servidor y reinícialo.';

      let text = '';
      for (const word of reply.split(/(\s+)/)) {
        if (signal?.aborted) return { text, stopReason: 'aborted' };
        await new Promise((resolve) => setTimeout(resolve, 15));
        text += word;
        onText(word);
      }
      return { text, stopReason: 'end_turn' };
    },
  };
}
