import logging
import re
from urllib.parse import quote_plus, urlparse

import httpx

from app.schemas.lead import SiteDiagnostic
from app.schemas.prospecting import ProspectingCandidateOut

logger = logging.getLogger('garimpo.prospecting')

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


def _extract_neighborhood_from_address(address: str) -> str:
    if not address:
        return ''
    # Typical Brazilian Google Maps address: "Rua X, 123 - Moema, São Paulo - SP, 04000-000"
    if ' - ' in address and ',' in address:
        after_dash = address.split(' - ', 1)[1]
        return after_dash.split(',', 1)[0].strip()
    parts = [p.strip() for p in address.split(',') if p.strip()]
    return parts[1] if len(parts) > 1 else ''


class ProspectingService:
    """Fetches local B2B establishments via Playwright (Google Maps), Google Places API, or Serper.dev."""

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
        if provider == 'playwright':
            return await self._search_playwright(
                city=city,
                niche=niche,
                limit=limit,
                existing_phones=existing_phones,
            )

        if not api_key.strip():
            return self._fallback_candidates(
                city=city, niche=niche, limit=limit, existing_phones=existing_phones
            )

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

    async def _search_playwright(
        self,
        *,
        city: str,
        niche: str,
        limit: int,
        existing_phones: set[str],
    ) -> list[ProspectingCandidateOut]:
        from playwright.async_api import TimeoutError as PlaywrightTimeout
        from playwright.async_api import async_playwright

        query = quote_plus(f'{niche} em {city}')
        maps_url = f'https://www.google.com/maps/search/{query}?hl=pt-BR'
        candidates: list[ProspectingCandidateOut] = []
        seen_phones: set[str] = set()

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=['--no-sandbox', '--disable-dev-shm-usage'],
            )
            context = await browser.new_context(
                locale='pt-BR',
                viewport={'width': 1280, 'height': 900},
            )
            page = await context.new_page()

            try:
                await page.goto(maps_url, wait_until='domcontentloaded', timeout=30000)

                # Dismiss Google consent banner if displayed
                for btn_text in ('Aceitar tudo', 'Accept all'):
                    btn = page.locator(f'button:has-text("{btn_text}")').first
                    if await btn.count() > 0 and await btn.is_visible():
                        await btn.click()
                        break

                feed = page.locator('div[role="feed"]').first
                try:
                    await feed.wait_for(state='visible', timeout=15000)
                except PlaywrightTimeout:
                    logger.warning('Feed de resultados do Google Maps não carregou para: %s', query)
                    return []

                # Scroll results list until we collect enough place links or reach end
                place_urls: list[str] = []
                seen_urls: set[str] = set()
                stagnant_scrolls = 0

                while len(place_urls) < limit and stagnant_scrolls < 5:
                    anchors = await page.locator('a.hfpxzc').all()
                    before_count = len(place_urls)
                    for anchor in anchors:
                        href = await anchor.get_attribute('href')
                        if href and '/maps/place/' in href and href not in seen_urls:
                            seen_urls.add(href)
                            place_urls.append(href)
                            if len(place_urls) >= limit:
                                break

                    if len(place_urls) >= limit:
                        break

                    stagnant_scrolls = stagnant_scrolls + 1 if len(place_urls) == before_count else 0
                    await feed.evaluate('(el) => el.scrollBy(0, el.scrollHeight)')
                    await page.wait_for_timeout(1200)

                # Visit each collected place page to extract phone, website, and rating
                for idx, place_url in enumerate(place_urls[:limit]):
                    try:
                        await page.goto(place_url, wait_until='domcontentloaded', timeout=20000)
                        title_el = page.locator('h1.DUwDvf').first
                        await title_el.wait_for(state='visible', timeout=8000)
                        company_name = (await title_el.inner_text()).strip()

                        phone_raw = ''
                        phone_btn = page.locator('button[data-item-id^="phone:tel:"]').first
                        if await phone_btn.count() > 0:
                            data_id = await phone_btn.get_attribute('data-item-id') or ''
                            phone_raw = data_id.replace('phone:tel:', '') or (
                                await phone_btn.inner_text()
                            )

                        phone = normalize_brazil_phone(phone_raw)
                        if not phone or phone in seen_phones:
                            continue
                        seen_phones.add(phone)

                        website_href: str | None = None
                        web_link = page.locator('a[data-item-id="authority"]').first
                        if await web_link.count() > 0:
                            website_href = await web_link.get_attribute('href')

                        address_text = ''
                        addr_btn = page.locator('button[data-item-id="address"]').first
                        if await addr_btn.count() > 0:
                            address_text = (await addr_btn.inner_text()).strip()

                        rating: float | None = None
                        reviews_count: int | None = None
                        rating_box = page.locator('div.F7nice').first
                        if await rating_box.count() > 0:
                            rating_text = (await rating_box.inner_text()).strip()
                            match_rating = re.search(r'(\d+[.,]\d+)', rating_text)
                            if match_rating:
                                rating = float(match_rating.group(1).replace(',', '.'))
                            match_reviews = re.search(r'\((\d[\d\.]*)\)', rating_text)
                            if match_reviews:
                                reviews_count = int(match_reviews.group(1).replace('.', ''))

                        diagnostic, website_url, ig_handle = classify_website(website_href)

                        candidates.append(
                            ProspectingCandidateOut(
                                id=f'pw-{idx + 1}-{phone[-4:]}',
                                company_name=company_name,
                                niche=niche,
                                city=city,
                                neighborhood=_extract_neighborhood_from_address(address_text),
                                phone=phone,
                                website_url=website_url,
                                instagram_handle=ig_handle,
                                diagnostic=diagnostic,
                                rating=rating,
                                reviews_count=reviews_count,
                                has_whatsapp=True,
                                already_queued=phone in existing_phones,
                            )
                        )
                    except Exception as exc:
                        logger.debug('Erro ao ler card %s: %s', place_url, exc)
                        continue
            finally:
                await context.close()
                await browser.close()

        return candidates

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
