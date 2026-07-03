import Anthropic from '@anthropic-ai/sdk';

// Haiku keeps the button-to-confirmation latency low and costs a fraction of a
// cent per command; the parsing task is simple enough that a bigger model adds
// nothing (see plans/voice-entry-2026-07-03/PLAN.md).
const MODEL = 'claude-haiku-4-5';

export const TASK_CATEGORIES = ['Work', 'Admin', 'Personal'] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type VoiceIntent =
  | { kind: 'task'; title: string; category: TaskCategory; deadline: string | null }
  | { kind: 'expense'; amount: number; category: string; note: string | null }
  | { kind: 'unclear'; reason: string };

const SYSTEM_PROMPT = `You parse short voice-transcribed commands for a personal life-tracking app and translate each one into exactly one tool call.

Commands arrive in English or Hebrew and may contain speech-to-text errors; infer the intended meaning.

Rules:
- An expense mentions spending money: an amount (shekels/שקל/ils unless stated otherwise — record the bare number) and what it was for. Map what it was for onto the closest known expense category from the list provided; only pass a new category name when nothing fits. Category names must be in English. Anything descriptive beyond amount + category goes into note.
- A task is something to do later. The title should be a clean imperative phrase without filler like "add a task to". Map "work"/עבודה context to Work, bureaucracy (bank, bills, government, appointments) to Admin, everything else to Personal. Deadlines: resolve relative dates ("tomorrow", "מחר", "Friday") against today's date given in the message, as an ISO 8601 datetime; use null when no deadline is mentioned.
- If the command is not clearly a task or an expense, or a required detail (like an expense amount) is missing, call unclear instead of guessing.`;

const TOOLS: Anthropic.Messages.ToolUnion[] = [
  {
    name: 'create_task',
    description: 'Create a to-do task. Call when the command asks to add/remember something to do.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Clean imperative task title, in the language the user spoke' },
        category: { type: 'string', enum: [...TASK_CATEGORIES] },
        deadline: {
          anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }],
          description: 'ISO 8601 deadline resolved against today, or null',
        },
      },
      required: ['title', 'category', 'deadline'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_expense',
    description: 'Log money spent. Call when the command mentions spending an amount on something.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Positive amount spent, bare number without currency' },
        category: { type: 'string', description: 'English category name, preferring one of the known categories' },
        note: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          description: 'Extra detail beyond amount + category, or null',
        },
      },
      required: ['amount', 'category', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'unclear',
    description: 'Call when the command is not clearly a task or expense, or is missing a required detail.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Short human-readable reason, phrased for the user' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
];

// Lazy singleton so a missing ANTHROPIC_API_KEY fails the request, not server boot.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function parseVoiceCommand(text: string, knownCategories: string[]): Promise<VoiceIntent> {
  const today = new Date().toISOString();

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    tools: TOOLS,
    tool_choice: { type: 'any', disable_parallel_tool_use: true },
    messages: [
      {
        role: 'user',
        content:
          `Today's date/time: ${today}\n` +
          `Known expense categories: ${knownCategories.join(', ') || '(none yet)'}\n` +
          `Command: "${text}"`,
      },
    ],
  });

  const block = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!block) {
    return { kind: 'unclear', reason: 'Could not interpret the command' };
  }

  // strict: true guarantees the input matches the schema, but validate the
  // pieces that guard SQL constraints anyway — a CHECK violation surfaces as a 500.
  const input = block.input as Record<string, unknown>;
  switch (block.name) {
    case 'create_task': {
      const title = typeof input.title === 'string' ? input.title.trim() : '';
      const category = TASK_CATEGORIES.includes(input.category as TaskCategory)
        ? (input.category as TaskCategory)
        : 'Personal';
      const deadline = typeof input.deadline === 'string' && input.deadline ? input.deadline : null;
      if (!title) return { kind: 'unclear', reason: 'Could not tell what the task is' };
      return { kind: 'task', title, category, deadline };
    }
    case 'create_expense': {
      const amount = typeof input.amount === 'number' ? input.amount : NaN;
      const category = typeof input.category === 'string' ? input.category.trim() : '';
      const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null;
      if (!Number.isFinite(amount) || amount <= 0) {
        return { kind: 'unclear', reason: 'Could not tell how much was spent' };
      }
      if (!category) return { kind: 'unclear', reason: 'Could not tell what the expense was for' };
      return { kind: 'expense', amount, category, note };
    }
    default: {
      const reason =
        typeof input.reason === 'string' && input.reason ? input.reason : 'Could not interpret the command';
      return { kind: 'unclear', reason };
    }
  }
}
