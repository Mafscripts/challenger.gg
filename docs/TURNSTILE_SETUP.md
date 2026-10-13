# Cloudflare Turnstile bij aanmelden

De koppeling staat in de code. Zolang beide sleutels leeg zijn, blijft aanmelden
werken zoals voorheen. Turnstile wordt actief zodra de API beide sleutels heeft.
De Secret Key blijft op de server; de browser ontvangt alleen de publieke Site Key.

## 1. Widget aanmaken

1. Log in op https://dash.cloudflare.com/ en open **Turnstile**.
2. Kies **Add widget** en geef de naam **TopFragg aanmelden**.
3. Voeg `topfragg.gg` en `www.topfragg.gg` toe als hostnames, zonder `https://` of pad.
4. Kies **Managed**. Laat pre-clearance uit.
5. Kies **Create**. Bewaar de Site Key en Secret Key.

## 2. Instellingen op de API-server

Voeg de volgende instellingen toe aan de serveromgeving of de `.env` die de API gebruikt:

```dotenv
TURNSTILE_SITE_KEY="jouw-site-key"
TURNSTILE_SECRET_KEY="jouw-secret-key"
TURNSTILE_ALLOWED_HOSTNAMES="topfragg.gg,www.topfragg.gg"
```

Deel de Secret Key niet in screenshots of chat en zet hem niet in een `VITE_`-variabele.
Alleen een Site Key of alleen een Secret Key blokkeert registratie totdat de
configuratie volledig is. Met beide sleutels actief blijft registratie geblokkeerd
wanneer de verificatie mislukt of Cloudflare tijdelijk niet bereikbaar is.

## 3. Code publiceren en API herstarten

Publiceer de aangepaste frontend en API samen via de normale deployment.
Herstart de API nadat de serverinstellingen zijn toegevoegd. De frontend haalt
de Site Key bij het openen van de registratiepagina op via
`GET /api/auth/registration-config`; hiervoor is geen frontend-omgevingsvariabele nodig.

De registratiehandler valideert elk token bij Cloudflare voordat een account
wordt aangemaakt, controleert de hostname en de actie `register`, en houdt de
bestaande e-mailverificatie en registratielimieten in stand. Dit geldt ook voor
de alternatieve `/register`-route. Na een mislukte registratie haalt de pagina
een nieuw token op zodat opnieuw proberen mogelijk blijft.

## Zelf controleren

- Open aanmelden: de donkere Managed-widget verschijnt en de knop wordt pas actief na verificatie.
- Controleer dat een normale registratie nog naar e-mailverificatie gaat.
- Controleer dat een registratie zonder token wordt geweigerd voordat er een account wordt aangemaakt.
- Controleer dat een verlopen of hergebruikt token wordt geweigerd en opnieuw proberen mogelijk is.
- Controleer dat een widget die niet kan laden een Retry-knop toont.

Voor lokaal testen zijn er aparte testkeys:
https://developers.cloudflare.com/turnstile/troubleshooting/testing/
Gebruik die niet op de live website. Voeg voor lokaal testen de lokale hostname
toe aan `TURNSTILE_ALLOWED_HOSTNAMES` van uitsluitend je lokale API.

Officiële handleidingen:
- https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/
- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
