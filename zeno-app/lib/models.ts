// Auto-generated from live NVIDIA NIM catalog test (2026-07-20)
// Catalog: 118 total, 75 candidates, 27 passed chat test, 9 support tools

export type Model = {
  id: string;
  provider: string;
  label: string;
  supportsTools: boolean;
};

export const MODELS: Model[] = [
  // Abacus AI
  { id: 'abacusai/dracarys-llama-3.1-70b-instruct', provider: 'nvidia', label: 'Dracarys Llama 3.1 70B', supportsTools: false },

  // Google
  { id: 'google/gemma-2-2b-it', provider: 'nvidia', label: 'Gemma 2 2B', supportsTools: false },
  { id: 'google/gemma-3n-e2b-it', provider: 'nvidia', label: 'Gemma 3N E2B', supportsTools: false },
  { id: 'google/gemma-3n-e4b-it', provider: 'nvidia', label: 'Gemma 3N E4B', supportsTools: false },

  // Meta
  { id: 'meta/llama-3.1-70b-instruct', provider: 'nvidia', label: 'Llama 3.1 70B', supportsTools: true },
  { id: 'meta/llama-3.1-8b-instruct', provider: 'nvidia', label: 'Llama 3.1 8B', supportsTools: true },
  { id: 'meta/llama-3.2-3b-instruct', provider: 'nvidia', label: 'Llama 3.2 3B', supportsTools: false },

  // Mistral
  { id: 'mistralai/mistral-nemotron', provider: 'nvidia', label: 'Mistral Nemotron', supportsTools: false },
  { id: 'mistralai/mistral-small-4-119b-2603', provider: 'nvidia', label: 'Mistral Small 4 119B', supportsTools: true },
  { id: 'mistralai/mixtral-8x7b-instruct-v0.1', provider: 'nvidia', label: 'Mixtral 8x7B Instruct', supportsTools: false },

  // NVIDIA
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1', provider: 'nvidia', label: 'Llama 3.3 Nemotron Super 49B', supportsTools: true },
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', provider: 'nvidia', label: 'Llama 3.3 Nemotron Super 49B v1.5', supportsTools: false },
  { id: 'nvidia/nemotron-3-nano-30b-a3b', provider: 'nvidia', label: 'Nemotron 3 Nano 30B', supportsTools: false },
  { id: 'nvidia/nemotron-3-super-120b-a12b', provider: 'nvidia', label: 'Nemotron 3 Super 120B', supportsTools: false },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', provider: 'nvidia', label: 'Nemotron 3 Ultra 550B', supportsTools: true },
  { id: 'nvidia/nemotron-mini-4b-instruct', provider: 'nvidia', label: 'Nemotron Mini 4B', supportsTools: false },
  { id: 'nvidia/nemotron-nano-12b-v2-vl', provider: 'nvidia', label: 'Nemotron Nano 12B VL', supportsTools: true },
  { id: 'nvidia/nvidia-nemotron-nano-9b-v2', provider: 'nvidia', label: 'Nemotron Nano 9B', supportsTools: false },

  // OpenAI
  { id: 'openai/gpt-oss-120b', provider: 'nvidia', label: 'GPT-OSS 120B', supportsTools: true },
  { id: 'openai/gpt-oss-20b', provider: 'nvidia', label: 'GPT-OSS 20B', supportsTools: true },

  // Poolside
  { id: 'poolside/laguna-xs-2.1', provider: 'nvidia', label: 'Laguna XS 2.1', supportsTools: true },

  // Qwen
  { id: 'qwen/qwen3-next-80b-a3b-instruct', provider: 'nvidia', label: 'Qwen3 Next 80B', supportsTools: false },

  // Sarvam AI
  { id: 'sarvamai/sarvam-m', provider: 'nvidia', label: 'Sarvam M', supportsTools: false },

  // Stepfun
  { id: 'stepfun-ai/step-3.5-flash', provider: 'nvidia', label: 'Step 3.5 Flash', supportsTools: false },
  { id: 'stepfun-ai/step-3.7-flash', provider: 'nvidia', label: 'Step 3.7 Flash', supportsTools: false },

  // Thinking Machines
  { id: 'thinkingmachines/inkling', provider: 'nvidia', label: 'Inkling', supportsTools: false },

  // Upstage
  { id: 'upstage/solar-10.7b-instruct', provider: 'nvidia', label: 'Solar 10.7B', supportsTools: false },
];
