import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Literal

from google import genai
from google.genai import types as genai_types
from openai import AsyncOpenAI

from app.core.config import get_settings
from app.models.lead import BrainSettings, Lead, Message

logger = logging.getLogger('garimpo.ai_sdr')


@dataclass
class AiDecision:
    action: Literal['reply', 'handoff']
    reply_text: str | None = None
    handoff_summary: str | None = None
    reason: str | None = None
    provider_used: str = 'offline_heuristic'
    model_used: str = 'heuristic'


HANDOFF_TOOL_SCHEMA = {
    'type': 'function',
    'function': {
        'name': 'transferir_para_humano',
        'description': (
            'Acione esta função imediatamente quando o cliente pedir orçamento, valores, '
            'proposta, reunião, ligação ou demonstrar claro interesse comercial.'
        ),
        'parameters': {
            'type': 'object',
            'properties': {
                'resumo_contexto': {
                    'type': 'string',
                    'description': (
                        'Resumo objetivo em 1-2 frases explicando a dor do cliente e o que ele pediu.'
                    ),
                },
                'motivo': {
                    'type': 'string',
                    'description': 'Motivo curto do transbordo (ex: pediu_orcamento).',
                },
            },
            'required': ['resumo_contexto', 'motivo'],
        },
    },
}


def build_system_prompt(lead: Lead, brain: BrainSettings) -> str:
    return (
        f'{brain.persona_prompt}\n\n'
        f'PROBLEMA QUE RESOLVEMOS:\n{brain.problem_solved}\n\n'
        f'OBJEÇÕES COMUNS:\n{brain.common_objections}\n\n'
        f'GATILHOS OBRIGATÓRIOS PARA TRANSFERIR PARA HUMANO:\n{brain.handoff_triggers}\n\n'
        f'DADOS DO LEAD ATUAL:\n'
        f'- Empresa: {lead.company_name}\n'
        f'- Nicho: {lead.niche}\n'
        f'- Cidade: {lead.city} ({lead.neighborhood})\n'
        f'- Diagnóstico do Site: {lead.diagnostic}\n\n'
        'REGRAS IMPORTANTES:\n'
        '1. Responda sempre em português do Brasil, de forma natural e curta (máximo 3 frases).\n'
        '2. Nunca invente preços fechados. Se o cliente pedir valores, orçamento ou reunião, '
        'chame a função transferir_para_humano imediatamente.'
    )


def _build_gemini_contents(history: list[Message]) -> list[genai_types.Content]:
    """Build strictly alternating user/model turns for Gemini multiturn chat."""
    merged: list[tuple[str, list[str]]] = []
    for msg in history[-15:]:
        role = 'user' if msg.sender == 'lead' else 'model'
        if merged and merged[-1][0] == role:
            merged[-1][1].append(msg.text)
        else:
            merged.append((role, [msg.text]))

    if merged and merged[0][0] == 'model':
        merged.insert(
            0,
            (
                'user',
                [
                    '[Início da conversa: você enviou a primeira mensagem de prospecção abaixo para este lead.]'
                ],
            ),
        )

    return [
        genai_types.Content(
            role=role,
            parts=[genai_types.Part.from_text(text='\n'.join(parts))],
        )
        for role, parts in merged
    ]


class AiSdrService:
    """SDR intelligence powered by OpenAI (gpt-4o-mini) or Google Gemini (gemini-2.5-flash) with Function Calling."""

    async def evaluate_conversation(
        self,
        *,
        lead: Lead,
        history: list[Message],
        brain: BrainSettings,
        provider: str,
        api_key: str,
    ) -> AiDecision:
        settings = get_settings()
        effective_key = api_key.strip() or (
            settings.gemini_api_key if provider == 'gemini' else settings.openai_api_key
        )

        # Fallback rule-based trigger detection when API key is absent (dev/offline mode)
        if not effective_key:
            return self._offline_heuristic(lead=lead, history=history, brain=brain)

        system_prompt = build_system_prompt(lead, brain)

        if provider == 'gemini':
            return await self._call_gemini(
                api_key=effective_key,
                model=settings.gemini_model,
                fallback_model=settings.gemini_fallback_model,
                system_prompt=system_prompt,
                history=history,
            )

        return await self._call_openai(
            api_key=effective_key,
            model=settings.openai_model,
            system_prompt=system_prompt,
            history=history,
        )

    async def _call_openai(
        self,
        *,
        api_key: str,
        model: str,
        system_prompt: str,
        history: list[Message],
    ) -> AiDecision:
        client = AsyncOpenAI(api_key=api_key)
        messages: list[dict[str, str]] = [{'role': 'system', 'content': system_prompt}]
        for msg in history[-15:]:
            role = 'user' if msg.sender == 'lead' else 'assistant'
            messages.append({'role': role, 'content': msg.text})

        response = await client.chat.completions.create(
            model=model,
            messages=messages,  # type: ignore[arg-type]
            tools=[HANDOFF_TOOL_SCHEMA],  # type: ignore[list-item]
            tool_choice='auto',
            temperature=0.4,
            max_tokens=260,
        )

        choice = response.choices[0].message
        if choice.tool_calls:
            for tool_call in choice.tool_calls:
                if tool_call.function.name == 'transferir_para_humano':
                    args = json.loads(tool_call.function.arguments or '{}')
                    return AiDecision(
                        action='handoff',
                        handoff_summary=args.get(
                            'resumo_contexto',
                            'Lead demonstrou interesse comercial e solicitou atendimento.',
                        ),
                        reason=args.get('motivo', 'interesse_detectado'),
                        provider_used='openai',
                        model_used=model,
                    )

        return AiDecision(
            action='reply',
            reply_text=(choice.content or '').strip()
            or 'Perfeito! Posso te explicar como funciona em 2 minutinhos?',
            provider_used='openai',
            model_used=model,
        )

    async def _call_gemini(
        self,
        *,
        api_key: str,
        model: str,
        fallback_model: str,
        system_prompt: str,
        history: list[Message],
    ) -> AiDecision:
        # Disable SDK's long internal retries so we can fail over fast to the fallback model
        client = genai.Client(
            api_key=api_key,
            http_options=genai_types.HttpOptions(
                timeout=12000,
                retry_options=genai_types.HttpRetryOptions(attempts=1),
            ),
        )

        handoff_declaration = genai_types.FunctionDeclaration(
            name='transferir_para_humano',
            description=HANDOFF_TOOL_SCHEMA['function']['description'],
            parameters=genai_types.Schema(
                type=genai_types.Type.OBJECT,
                properties={
                    'resumo_contexto': genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description='Resumo objetivo da dor do cliente e o que ele solicitou.',
                    ),
                    'motivo': genai_types.Schema(
                        type=genai_types.Type.STRING,
                        description='Motivo do transbordo.',
                    ),
                },
                required=['resumo_contexto', 'motivo'],
            ),
        )

        contents = _build_gemini_contents(history)
        candidate_models: list[str] = []
        for m in (model, fallback_model, 'gemini-3.8-flash'):
            if m and m not in candidate_models:
                candidate_models.append(m)

        response = None
        used_model = model
        last_error: Exception | None = None

        for candidate in candidate_models:
            use_low_thinking = True
            for attempt in range(2):
                try:
                    cfg_kwargs: dict = {
                        'system_instruction': system_prompt,
                        'tools': [
                            genai_types.Tool(
                                function_declarations=[handoff_declaration]
                            )
                        ],
                        'temperature': 0.4,
                        'max_output_tokens': 512,
                    }
                    if use_low_thinking:
                        cfg_kwargs['thinking_config'] = genai_types.ThinkingConfig(
                            thinking_level=genai_types.ThinkingLevel.LOW
                        )

                    response = await asyncio.wait_for(
                        client.aio.models.generate_content(
                            model=candidate,
                            contents=contents,
                            config=genai_types.GenerateContentConfig(**cfg_kwargs),
                        ),
                        timeout=12.0,
                    )
                    used_model = candidate
                    break
                except Exception as exc:
                    last_error = exc
                    err_str = str(exc).upper()
                    if 'THINKING' in err_str and use_low_thinking:
                        logger.warning(
                            'Gemini %s rejeitou thinking_config (%s). Tentando sem thinking_config...',
                            candidate,
                            exc,
                        )
                        use_low_thinking = False
                        continue
                    is_timeout = isinstance(exc, (TimeoutError, asyncio.TimeoutError))
                    is_transient = is_timeout or any(
                        token in err_str
                        for token in (
                            '503',
                            '504',
                            'UNAVAILABLE',
                            '429',
                            'RESOURCE_EXHAUSTED',
                            'OVERLOADED',
                            'DEADLINE_EXCEEDED',
                        )
                    )
                    is_not_found = '404' in err_str or 'NOT_FOUND' in err_str
                    if is_transient and not is_timeout and attempt == 0:
                        logger.warning(
                            'Gemini %s retornou erro transitório (%s). Tentando novamente...',
                            candidate,
                            exc,
                        )
                        await asyncio.sleep(0.8)
                        continue
                    if is_transient or is_not_found:
                        logger.warning(
                            'Gemini %s lento/indisponível (%s). Trocando para fallback...',
                            candidate,
                            exc,
                        )
                        break
                    raise
            if response is not None:
                break

        if response is None:
            raise last_error or RuntimeError('Nenhum modelo Gemini respondeu.')

        if response.function_calls:
            for fn in response.function_calls:
                if fn.name == 'transferir_para_humano':
                    args = fn.args or {}
                    return AiDecision(
                        action='handoff',
                        handoff_summary=str(
                            args.get(
                                'resumo_contexto',
                                'Lead demonstrou interesse e pediu atendimento humano.',
                            )
                        ),
                        reason=str(args.get('motivo', 'interesse_detectado')),
                        provider_used='gemini',
                        model_used=used_model,
                    )

        return AiDecision(
            action='reply',
            reply_text=(response.text or '').strip()
            or 'Entendi! Posso te mostrar um exemplo prático para o seu segmento?',
            provider_used='gemini',
            model_used=used_model,
        )

    def _offline_heuristic(
        self,
        *,
        lead: Lead,
        history: list[Message],
        brain: BrainSettings,
    ) -> AiDecision:
        last_lead_text = next(
            (m.text.lower() for m in reversed(history) if m.sender == 'lead'), ''
        )
        triggers = [t.strip().lower() for t in brain.handoff_triggers.split(',') if t.strip()]
        if any(trigger in last_lead_text for trigger in triggers):
            return AiDecision(
                action='handoff',
                handoff_summary=(
                    f'{lead.company_name} demonstrou interesse e mencionou termos de '
                    f'orçamento/fechamento na última mensagem.'
                ),
                reason='gatilho_detectado',
                provider_used='offline_heuristic',
                model_used='heuristic',
            )
        return AiDecision(
            action='reply',
            reply_text=(
                f'Entendi! Para empresas de {lead.niche} em {lead.city}, estruturamos uma página '
                'focada em aparecer no Google e levar o cliente direto para o WhatsApp. '
                'Faz sentido te mostrar um exemplo?'
            ),
            provider_used='offline_heuristic',
            model_used='heuristic',
        )
