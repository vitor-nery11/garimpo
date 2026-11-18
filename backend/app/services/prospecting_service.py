import re
from urllib.parse import urlparse

import httpx

from app.schemas.lead import SiteDiagnostic
from app.schemas.prospecting import ProspectingCandidateOut

SOCIAL_OR_BIO_DOMAINS = (
    'instagram.com',
    'linktr.ee',
    'linktree.com',
    'bio.link',
    'beacons.ai',
    'wa.me',
    'api.whatsapp.com',
    'facebook.com',
    'fb.com',
    'tiktok.com',
)


def classify_website(url: str | None) -> tuple[SiteDiagnostic, str | None, str | None]:
    """Classify business web presence into sem_site, so_instagram, or possui_site."""
    if not url or not url.strip():
        return 'sem_site', None, None

    cleaned = url.strip()
    if not cleaned.startswith(('http://', 'https://')):
        cleaned = f'https://{cleaned}'

    parsed = urlparse(cleaned)
    host = parsed.netloc.lower().removeprefix('www.')

    if any(domain in host for domain in SOCIAL_OR_BIO_DOMAINS):
        handle: str | None = None
        if 'instagram.com' in host:
            parts = [p for p in parsed.path.split('/') if p]
            if parts:
                handle = f'@{parts[0]}'
        return 'so_instagram', None, handle

    return 'possui_site', cleaned, None


def normalize_brazil_phone(raw_phone: str | None) -> str:
    """Normalize Brazilian phone numbers to digits-only format starting with 55."""
    if not raw_phone:
        return ''
    digits = re.sub(r'\D+', '', raw_phone)
    if not digits:
        return ''
    if digits.startswith('0'):
        digits = digits[1:]
    if not digits.startswith('55') and len(digits) in (10, 11):
        digits = f'55{digits}'
    return digits


class ProspectingService:
    """Fetches local B2B establishments from Google Places API or Serper.dev using async HTTPX."""

    async def search(
        self,
        *,
        city: str,
        niche: str,
        limit: int,
        provider: str,
        api_key: str,
        existing_phones: set[str],
    ) -> list[ProspectingCandidateOut]:
        if not api_key.strip():
            return self._fallback_candidates(city=city, niche=niche, limit=limit, existing_phones=existing_phones)

        if provider == 'serper':
            return await self._search_serper(
                city=city,
                niche=niche,
                limit=limit,
                api_key=api_key,
                existing_phones=existing_phones,
            )

        return await self._search_google_places(
            city=city,
            niche=niche,
            limit=limit,
            api_key=api_key,
            existing_phones=existing_phones,
        )

    async def _search_google_places(
        self,
        *,
        city: str,
        niche: str,
        limit: int,
        api_key: str,
        existing_phones: set[str],
    ) -> list[ProspectingCandidateOut]:
        url = 'https://places.googleapis.com/v1/places:searchText'
        headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': api_key,
            'X-Goog-FieldMask': (
                'places.id,places.displayName,places.formattedAddress,'
                'places.nationalPhoneNumber,places.internationalPhoneNumber,'
                'places.websiteUri,places.rating,places.userRatingCount'
            ),
        }
        payload = {
            'textQuery': f'{niche} em {city}',
            'languageCode': 'pt-BR',
            'maxResultCount': min(limit, 20),
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        candidates: list[ProspectingCandidateOut] = []
        for idx, place in enumerate(data.get('places', [])[:limit]):
            phone = normalize_brazil_phone(
                place.get('internationalPhoneNumber') or place.get('nationalPhoneNumber')
            )
            if not phone:
                continue

            diagnostic, website_url, ig_handle = classify_website(place.get('websiteUri'))
            address = place.get('formattedAddress', '')
            neighborhood = address.split(',')[1].strip() if ',' in address else ''

            candidates.append(
                ProspectingCandidateOut(
                    id=place.get('id') or f'gp-{idx}',
                    company_name=place.get('displayName', {}).get('text', 'Empresa'),
                    niche=niche,
                    city=city,
                    neighborhood=neighborhood,
                    phone=phone,
                    website_url=website_url,
                    instagram_handle=ig_handle,
                    diagnostic=diagnostic,
                    rating=place.get('rating'),
                    reviews_count=place.get('userRatingCount'),
                    has_whatsapp=True,
                    already_queued=phone in existing_phones,
                )
            )
        return candidates

    async def _search_serper(
        self,
        *,
        city: str,
        niche: str,
        limit: int,
        api_key: str,
        existing_phones: set[str],
    ) -> list[ProspectingCandidateOut]:
        url = 'https://google.serper.dev/places'
        headers = {'X-API-KEY': api_key, 'Content-Type': 'application/json'}
        payload = {'q': f'{niche} {city}', 'gl': 'br', 'hl': 'pt-br', 'num': min(limit, 20)}

        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        candidates: list[ProspectingCandidateOut] = []
        for idx, place in enumerate(data.get('places', [])[:limit]):
            phone = normalize_brazil_phone(place.get('phoneNumber'))
            if not phone:
                continue

            diagnostic, website_url, ig_handle = classify_website(place.get('website'))
            address = place.get('address', '')
            neighborhood = address.split(',')[1].strip() if ',' in address else ''

            candidates.append(
                ProspectingCandidateOut(
                    id=str(place.get('cid') or f'serper-{idx}'),
                    company_name=place.get('title', 'Empresa'),
                    niche=niche,
                    city=city,
                    neighborhood=neighborhood,
                    phone=phone,
                    website_url=website_url,
                    instagram_handle=ig_handle,
                    diagnostic=diagnostic,
                    rating=place.get('rating'),
                    reviews_count=place.get('ratingCount'),
                    has_whatsapp=True,
                    already_queued=phone in existing_phones,
                )
            )
        return candidates

    def _fallback_candidates(
        self,
        *,
        city: str,
        niche: str,
        limit: int,
        existing_phones: set[str],
    ) -> list[ProspectingCandidateOut]:
        """Local deterministic candidates when external search API key is not configured."""
        samples = [
            ('Clínica Odonto Sorriso Vivo', 'Moema', '5511988421094', 'https://instagram.com/odontosorrisovivo', 4.8, 143),
            ('Oficina Precision Car', 'Lapa', '5511987012233', None, 4.6, 92),
            ('Instituto Dental Paulista', 'Bela Vista', '5511976543210', 'https://institutodentalpaulista.com.br', 4.9, 310),
            ('Prime House Soluções', 'Centro', '5511998223190', 'https://linktr.ee/primehouse', 4.7, 48),
            ('Ateliê Renovare', 'Pinheiros', '5511974106599', None, 4.9, 84),
        ]
        results: list[ProspectingCandidateOut] = []
        for idx in range(limit):
            base = samples[idx % len(samples)]
            phone = base[2] if idx < len(samples) else f'55119{81000000 + idx * 173}'
            name = base[0] if idx < len(samples) else f'{niche.title()} Modelo {idx + 1}'
            diagnostic, website_url, ig_handle = classify_website(base[3])
            results.append(
                ProspectingCandidateOut(
                    id=f'demo-{idx + 1}',
                    company_name=name,
                    niche=niche,
                    city=city,
                    neighborhood=base[1],
                    phone=phone,
                    website_url=website_url,
                    instagram_handle=ig_handle,
                    diagnostic=diagnostic,
                    rating=base[4],
                    reviews_count=base[5],
                    has_whatsapp=True,
                    already_queued=phone in existing_phones,
                )
            )
        return results
