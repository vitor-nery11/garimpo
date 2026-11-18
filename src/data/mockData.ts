import type {
  BrainConfig,
  ConnectionConfig,
  DailyStats,
  Lead,
  ProspectingCandidate,
} from '../types/garimpo';

export const INITIAL_DAILY_STATS: DailyStats = {
  leadsExtractedToday: 0,
  messagesSentToday: 0,
  repliesReceivedToday: 0,
};

export const INITIAL_LEADS: Lead[] = [];

export const PROSPECTING_CATALOG: ProspectingCandidate[] = [];

export const INITIAL_BRAIN_CONFIG: BrainConfig = {
  personaPrompt:
    'Você é um consultor de posicionamento digital da Garimpo Digital. Fale de forma humana, direta e educada pelo WhatsApp, com mensagens curtas (máx. 3 linhas). Nunca pareça robô e nunca envie textão.',
  problemSolved:
    'Ajudamos empresas locais bem avaliadas no Google Maps que ainda não têm site próprio (ou usam apenas Instagram/Linktree) a capturar clientes prontos para comprar nas buscas locais e direcionar agendamentos direto para o WhatsApp.',
  commonObjections:
    '- "Já tenho Instagram": Explique que no Google o cliente já está procurando o serviço naquela hora com intenção de compra.\n- "Não tenho tempo agora": Diga que entregamos tudo pronto em até 7 dias sem tomar o tempo da equipe.\n- "É caro?": Não dê preço fechado no bot; valide o interesse e faça o transbordo.',
  handoffTriggers:
    'preço, valor, quanto custa, orçamento, proposta, reunião, ligar, falar com alguém, como funciona o pagamento, prazo de entrega',
  templates: [
    {
      id: 'tpl-1',
      label: 'Variação 1 — Abordagem Google Maps',
      content:
        'Olá! Tudo bem? Vi a {nome_empresa} aqui em {cidade} e notei que vocês têm ótimas avaliações no Google, mas ainda estão sem site oficial no perfil. Vocês costumam captar clientes só por indicação e redes sociais hoje?',
    },
    {
      id: 'tpl-2',
      label: 'Variação 2 — Gancho Instagram / Linktree',
      content:
        'Oi, equipe da {nome_empresa}! Estava pesquisando opções de {nicho} em {cidade} e achei o perfil de vocês. Vi que direcionam tudo pelo Instagram — vocês já testaram captar quem busca direto no Google?',
    },
    {
      id: 'tpl-3',
      label: 'Variação 3 — Pergunta Direta de Expansão',
      content:
        'Bom dia! Aqui é da Garimpo Digital. Analisei a presença local de algumas empresas de {nicho} em {cidade} e a {nome_empresa} se destacou pela nota no Maps. Vocês estão abertos a receber mais pedidos de orçamento vindos do Google este mês?',
    },
  ],
  allowedStartTime: '08:30',
  allowedEndTime: '18:00',
  maxDailyMessages: 60,
  minIntervalSec: 60,
  maxIntervalSec: 240,
};

export const INITIAL_CONNECTION_CONFIG: ConnectionConfig = {
  whatsappConnected: false,
  whatsappPhone: '',
  whatsappDeviceName: 'garimpo_prospeccao',
  lastSyncAt: 'Não conectado',
  alertPhone: '5573988323477',
  searchProvider: 'playwright',
  searchApiKey: '',
  aiProvider: 'gemini',
  aiApiKey: '',
};
