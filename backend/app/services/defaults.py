from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.lead import BrainSettings, ConnectionSettings

DEFAULT_TEMPLATES = [
    {
        'id': 'tpl-1',
        'label': 'Variação 1 — Abordagem Google Maps',
        'content': (
            'Olá! Tudo bem? Vi a {nome_empresa} aqui em {cidade} e notei que vocês têm ótimas '
            'avaliações no Google, mas ainda estão sem site oficial no perfil. Vocês costumam '
            'captar clientes só por indicação e redes sociais hoje?'
        ),
    },
    {
        'id': 'tpl-2',
        'label': 'Variação 2 — Gancho Instagram / Linktree',
        'content': (
            'Oi, equipe da {nome_empresa}! Estava pesquisando opções de {nicho} em {cidade} e '
            'achei o perfil de vocês. Vi que direcionam tudo pelo Instagram — vocês já testaram '
            'captar quem busca direto no Google?'
        ),
    },
    {
        'id': 'tpl-3',
        'label': 'Variação 3 — Pergunta Direta de Expansão',
        'content': (
            'Bom dia! Aqui é da Garimpo Digital. Analisei a presença local de algumas empresas '
            'de {nicho} em {cidade} e a {nome_empresa} se destacou pela nota no Maps. Vocês '
            'estão abertos a receber mais pedidos de orçamento vindos do Google este mês?'
        ),
    },
]


async def get_or_create_brain_settings(db: AsyncSession) -> BrainSettings:
    result = await db.execute(select(BrainSettings).where(BrainSettings.id == 1))
    brain = result.scalar_one_or_none()
    if brain is None:
        brain = BrainSettings(
            id=1,
            persona_prompt=(
                'Você é um consultor de posicionamento digital da Garimpo Digital. '
                'Fale de forma humana, direta e educada pelo WhatsApp, com mensagens curtas (máx. 3 linhas). '
                'Nunca pareça robô e nunca envie textão.'
            ),
            problem_solved=(
                'Ajudamos empresas locais bem avaliadas no Google Maps que ainda não têm site próprio '
                '(ou usam apenas Instagram/Linktree) a capturar clientes prontos para comprar nas buscas '
                'locais e direcionar agendamentos direto para o WhatsApp.'
            ),
            common_objections=(
                '- "Já tenho Instagram": Explique que no Google o cliente já está procurando o serviço naquela hora.\n'
                '- "Não tenho tempo agora": Diga que entregamos tudo pronto em até 7 dias.\n'
                '- "É caro?": Não dê preço fechado no bot; valide o interesse e faça o transbordo.'
            ),
            handoff_triggers=(
                'preço, valor, quanto custa, orçamento, proposta, reunião, ligar, '
                'falar com alguém, como funciona o pagamento, prazo de entrega'
            ),
            templates=DEFAULT_TEMPLATES,
            allowed_start_time='08:30',
            allowed_end_time='18:00',
            max_daily_messages=60,
            min_interval_sec=60,
            max_interval_sec=240,
        )
        db.add(brain)
        await db.commit()
        await db.refresh(brain)
    return brain


async def get_or_create_connection_settings(db: AsyncSession) -> ConnectionSettings:
    settings = get_settings()
    result = await db.execute(select(ConnectionSettings).where(ConnectionSettings.id == 1))
    conn = result.scalar_one_or_none()
    if conn is None:
        conn = ConnectionSettings(
            id=1,
            alert_phone=settings.alert_whatsapp_phone,
            search_provider='google_places',
            search_api_key=settings.google_places_api_key,
            ai_provider='openai',
            ai_api_key=settings.openai_api_key,
        )
        db.add(conn)
        await db.commit()
        await db.refresh(conn)
    return conn


def is_within_business_hours(start_hhmm: str, end_hhmm: str, tz_name: str = 'America/Sao_Paulo') -> bool:
    try:
        now = datetime.now(ZoneInfo(tz_name))
        sh, sm = map(int, start_hhmm.split(':'))
        eh, em = map(int, end_hhmm.split(':'))
        current_min = now.hour * 60 + now.minute
        start_min = sh * 60 + sm
        end_min = eh * 60 + em
        return start_min <= current_min <= end_min
    except Exception:
        return True
