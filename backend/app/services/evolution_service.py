import httpx

from app.core.config import get_settings
from app.schemas.settings import WhatsAppStatusOut


class EvolutionService:
    """Async HTTPX client for Evolution API v2 (QR Code, WhatsApp number check, and messaging)."""

    def __init__(self) -> None:
        settings = get_settings()
        self.base_url = settings.evolution_api_url.rstrip('/')
        self.api_key = settings.evolution_api_key
        self.instance = settings.evolution_instance_name

    def _headers(self) -> dict[str, str]:
        return {'apikey': self.api_key, 'Content-Type': 'application/json'}

    async def get_connection_state(self) -> WhatsAppStatusOut:
        url = f'{self.base_url}/instance/connectionState/{self.instance}'
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(url, headers=self._headers())
                if resp.status_code == 200:
                    data = resp.json()
                    state = data.get('instance', {}).get('state', 'close')
                    return WhatsAppStatusOut(
                        connected=(state == 'open'),
                        state=state,
                        instance_name=self.instance,
                    )
        except Exception:
            pass
        return WhatsAppStatusOut(
            connected=False,
            state='unreachable',
            instance_name=self.instance,
        )

    async def connect_qr_code(self) -> WhatsAppStatusOut:
        """Create instance if needed and request QR Code pairing payload."""
        create_url = f'{self.base_url}/instance/create'
        connect_url = f'{self.base_url}/instance/connect/{self.instance}'
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                await client.post(
                    create_url,
                    headers=self._headers(),
                    json={
                        'instanceName': self.instance,
                        'integration': 'WHATSAPP-BAILEYS',
                        'qrcode': True,
                    },
                )
                resp = await client.get(connect_url, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                return WhatsAppStatusOut(
                    connected=False,
                    state='connecting',
                    instance_name=self.instance,
                    qr_code_base64=data.get('base64') or data.get('code'),
                )
        except Exception:
            return WhatsAppStatusOut(
                connected=False,
                state='error',
                instance_name=self.instance,
            )

    async def logout_instance(self) -> bool:
        url = f'{self.base_url}/instance/logout/{self.instance}'
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.delete(url, headers=self._headers())
                return resp.status_code in (200, 204)
        except Exception:
            return False

    async def check_whatsapp_numbers(self, phones: list[str]) -> dict[str, bool]:
        """Verify which captured numbers have an active WhatsApp account."""
        if not phones:
            return {}
        url = f'{self.base_url}/chat/whatsappNumbers/{self.instance}'
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(
                    url, headers=self._headers(), json={'numbers': phones}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    return {
                        str(item.get('number', '')).split('@')[0]: bool(item.get('exists'))
                        for item in data
                        if isinstance(item, dict)
                    }
        except Exception:
            pass
        return {phone: True for phone in phones}

    async def send_text_message(self, phone: str, text: str) -> bool:
        """Send a WhatsApp text message through Evolution API."""
        url = f'{self.base_url}/message/sendText/{self.instance}'
        payload = {'number': phone, 'text': text, 'delay': 1200}
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)
                return resp.status_code in (200, 201)
        except Exception:
            return False

    async def send_hot_lead_alert(
        self,
        *,
        alert_phone: str,
        company_name: str,
        lead_phone: str,
        summary: str,
    ) -> bool:
        """Notify the owner's personal WhatsApp immediately when AI detects a hot lead."""
        if not alert_phone.strip():
            return False
        clean_alert = ''.join(ch for ch in alert_phone if ch.isdigit())
        message = (
            f'🔥 *LEAD QUENTE NO GARIMPO*\n\n'
            f'*Empresa:* {company_name}\n'
            f'*WhatsApp:* https://wa.me/{lead_phone}\n'
            f'*Resumo da IA:* {summary}\n\n'
            f'A IA foi pausada automaticamente para você assumir.'
        )
        return await self.send_text_message(clean_alert, message)
