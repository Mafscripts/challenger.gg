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

## Bewaarde voortgang: Cloudflare voor de volledige website (13 oktober 2026)

De gebruiker wil later verdergaan. Geen automatische opvolging aangevraagd.

- Turnstile is gepubliceerd en de gebruiker heeft de widget op de registratiepagina
  met **Success!** gezien. Volledige registratie en e-mailverificatie zijn nog niet
  bevestigd als getest. De gebruiker doet zelf alle tests.
- Cloudflare Free wordt voorbereid voor `topfragg.gg`; het domein wordt bij IONOS beheerd.
- De twee A-records (`topfragg.gg` en `www`) wijzen naar `142.93.85.140` en staan
  in Cloudflare op Proxied. De drie bestaande CNAME-records (`autodiscover`,
  `_dmarc`, `_domainconnect`) zijn op DNS only gezet. De MX- en TXT-records zijn behouden.
- Twee ontbrekende IONOS-DKIM-records zijn toegevoegd als CNAME met DNS only:
  `s1-ionos._domainkey` naar `s1.dkim.ionos.com` en
  `s2-ionos._domainkey` naar `s2.dkim.ionos.com`.
- Cloudflare heeft `dawn.ns.cloudflare.com` en `terry.ns.cloudflare.com` toegewezen.
  Het omzetten van de nameservers en de activering zijn nog niet bevestigd.
- Domain Guard is actief. Alleen de partner van de gebruiker kan momenteel
  inloggen op het e-mailadres voor de bevestiging. De partner moet de
  deactivatie via **Deactivate Domain Guard Now** in de IONOS-mail bevestigen.
  De gebruiker kent dat e-mailwachtwoord niet; wacht op beschikbaarheid van de partner.
- Controleer vóór de nameserverwissel of DNSSEC uitstaat. De huidige DNSSEC-status is onbekend.

Hervatten: bevestig eerst of de partner Domain Guard heeft gedeactiveerd en
controleer DNSSEC. Stel daarna in IONOS uitsluitend de twee toegewezen Cloudflare-nameservers
in en klik in Cloudflare op **I updated my nameservers**. Controleer de actuele
status bij hervatten; de bovenstaande gegevens beschrijven de laatst gedeelde screenshots.

Daarna volgen HTTPS-configuratie met controle van het servercertificaat,
basis-WAF, één rate-limitingregel voor login en CDN voor statische bestanden.
Persoonlijke en live API-gegevens blijven buiten de cache. Bot Fight Mode blijft
voorlopig uit vanwege de API-integraties. Nameserveractivering alleen bevestigt
niet dat alle beoogde beveiligingsinstellingen al zijn geconfigureerd.
Controleer ook de verwerking van echte bezoekers-IP's achter Cloudflare voordat
IP-bans en limieten worden beoordeeld. Het beperken van verkeer naar de webpoorten
van de server tot Cloudflare komt pas na een werkende koppeling; behoud beheertoegang.
